/**
 * The `run_events` table. The sequence is the global AUTOINCREMENT primary key,
 * which is monotonic per run and is the `after` cursor the console polls with.
 *
 * Phase 1 runs one run at a time per control plane (`maxParallelSandboxes`), so
 * a single run's sequence is also contiguous. The cursor is a cursor, not a
 * count, so a global gap would never cause a missed event.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import type { RunEvent, RunEventType, RunPhase } from '../../contracts/events.ts';

export interface AppendEventInput {
  readonly runId: string;
  readonly at: string;
  readonly type: RunEventType;
  readonly phase: RunPhase;
  readonly label: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

interface RawEventRow {
  seq: number;
  run_id: string;
  at: string;
  type: string;
  phase: string;
  label: string;
  detail_json: string;
}

function mapEvent(row: RawEventRow): RunEvent {
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.detail_json);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      detail = parsed as Record<string, unknown>;
    }
  } catch {
    detail = {};
  }
  return {
    seq: row.seq,
    runId: row.run_id,
    at: row.at,
    type: row.type as RunEventType,
    phase: row.phase as RunPhase,
    label: row.label,
    detail,
  };
}

export interface EventStore {
  append(input: AppendEventInput): RunEvent;
  list(runId: string, after: number, limit: number): readonly RunEvent[];
  listAll(runId: string): readonly RunEvent[];
  count(runId: string): number;
}

export function createEventStore(db: Database): EventStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendEventInput): RunEvent {
      const result = stmt(
        `INSERT INTO run_events (run_id, at, type, phase, label, detail_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.at,
        input.type,
        input.phase,
        input.label,
        JSON.stringify(input.detail ?? {}),
      );
      const seq = Number(result.lastInsertRowid);
      return {
        seq,
        runId: input.runId,
        at: input.at,
        type: input.type,
        phase: input.phase,
        label: input.label,
        detail: input.detail ?? {},
      };
    },

    list(runId: string, after: number, limit: number): readonly RunEvent[] {
      const rows = stmt(
        `SELECT seq, run_id, at, type, phase, label, detail_json
           FROM run_events
          WHERE run_id = ? AND seq > ?
          ORDER BY seq ASC
          LIMIT ?`,
      ).all(runId, after, limit) as unknown as RawEventRow[];
      return rows.map(mapEvent);
    },

    listAll(runId: string): readonly RunEvent[] {
      const rows = stmt(
        `SELECT seq, run_id, at, type, phase, label, detail_json
           FROM run_events
          WHERE run_id = ?
          ORDER BY seq ASC`,
      ).all(runId) as unknown as RawEventRow[];
      return rows.map(mapEvent);
    },

    count(runId: string): number {
      const row = stmt('SELECT COUNT(*) AS count FROM run_events WHERE run_id = ?').get(runId) as
        | { count: number }
        | undefined;
      return row?.count ?? 0;
    },
  };
}
