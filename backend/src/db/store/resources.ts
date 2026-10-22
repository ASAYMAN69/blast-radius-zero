/**
 * The `resource_samples` table.
 *
 * A `null` column means "not measured" and stays `null` — the report turns it
 * into `Measured<T>.state = 'not-measured'`, never into a zero.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';

export interface AppendResourceSampleInput {
  readonly runId: string;
  readonly at: string;
  readonly wallClockMs: number;
  readonly memoryBytes: number | null;
  readonly cpuMs: number | null;
  readonly processCount: number | null;
}

export interface ResourceSampleRow {
  readonly at: string;
  readonly wallClockMs: number;
  readonly memoryBytes: number | null;
  readonly cpuMs: number | null;
  readonly processCount: number | null;
}

export interface ResourceAggregate {
  /** `null` when no sample carried the measurement. */
  readonly memoryPeakBytes: number | null;
  readonly cpuMs: number | null;
  readonly maxProcesses: number | null;
  readonly wallClockMs: number | null;
}

interface RawSampleRow {
  at: string;
  wall_clock_ms: number;
  memory_bytes: number | null;
  cpu_ms: number | null;
  process_count: number | null;
}

export interface ResourceStore {
  append(input: AppendResourceSampleInput): void;
  list(runId: string): readonly ResourceSampleRow[];
  last(runId: string): ResourceSampleRow | null;
  aggregate(runId: string): ResourceAggregate;
}

export function createResourceStore(db: Database): ResourceStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendResourceSampleInput): void {
      stmt(
        `INSERT INTO resource_samples
           (run_id, at, wall_clock_ms, memory_bytes, cpu_ms, process_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.at,
        Math.max(0, Math.round(input.wallClockMs)),
        input.memoryBytes,
        input.cpuMs,
        input.processCount,
      );
    },

    list(runId: string): readonly ResourceSampleRow[] {
      const rows = stmt(
        `SELECT at, wall_clock_ms, memory_bytes, cpu_ms, process_count
           FROM resource_samples
          WHERE run_id = ?
          ORDER BY id ASC`,
      ).all(runId) as unknown as RawSampleRow[];
      return rows.map((row) => ({
        at: row.at,
        wallClockMs: row.wall_clock_ms,
        memoryBytes: row.memory_bytes,
        cpuMs: row.cpu_ms,
        processCount: row.process_count,
      }));
    },

    last(runId: string): ResourceSampleRow | null {
      const row = stmt(
        `SELECT at, wall_clock_ms, memory_bytes, cpu_ms, process_count
           FROM resource_samples
          WHERE run_id = ?
          ORDER BY id DESC
          LIMIT 1`,
      ).get(runId) as RawSampleRow | undefined;
      return row === undefined
        ? null
        : {
            at: row.at,
            wallClockMs: row.wall_clock_ms,
            memoryBytes: row.memory_bytes,
            cpuMs: row.cpu_ms,
            processCount: row.process_count,
          };
    },

    aggregate(runId: string): ResourceAggregate {
      // MAX() ignores NULL, so a column with no measurement stays NULL.
      const row = stmt(
        `SELECT MAX(memory_bytes) AS memory_peak,
                MAX(cpu_ms)       AS cpu_ms,
                MAX(process_count) AS processes,
                MAX(wall_clock_ms) AS wall_clock
           FROM resource_samples
          WHERE run_id = ?`,
      ).get(runId) as
        | {
            memory_peak: number | null;
            cpu_ms: number | null;
            processes: number | null;
            wall_clock: number | null;
          }
        | undefined;
      return {
        memoryPeakBytes: row?.memory_peak ?? null,
        cpuMs: row?.cpu_ms ?? null,
        maxProcesses: row?.processes ?? null,
        wallClockMs: row?.wall_clock ?? null,
      };
    },
  };
}
