/**
 * The `runs` table (§9.5). One typed function per row; no ORM.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import type { RunPhase, RunStatus } from '../../contracts/events.ts';
import type { BlastRadiusVerdict } from '../../contracts/report.ts';
import type { SandboxProviderKind } from '../../contracts/sandbox.ts';

export interface RunRow {
  readonly id: string;
  readonly status: RunStatus;
  readonly phase: RunPhase;
  readonly workload: string;
  readonly goal: string;
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly provider: SandboxProviderKind;
  readonly sandboxId: string | null;
  readonly verdict: BlastRadiusVerdict | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly modelClaim: string | null;
  readonly modelExplanation: string | null;
  /** `null` means "not measured" — never `false` (§9.3). */
  readonly testPassed: boolean | null;
  readonly testTotal: number | null;
  readonly testFailures: number | null;
  readonly iterations: number;
  readonly toolCalls: number;
  readonly totalTokens: number;
  readonly deniedAttempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly wallClockMs: number | null;
}

export interface CreateRunInput {
  readonly id: string;
  readonly workload: string;
  readonly goal: string;
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly provider: SandboxProviderKind;
  readonly brokerTokenHash: string;
  readonly createdAt: string;
}

export interface RunPatch {
  readonly status?: RunStatus;
  readonly phase?: RunPhase;
  readonly sandboxId?: string | null;
  readonly verdict?: BlastRadiusVerdict | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly modelClaim?: string | null;
  readonly modelExplanation?: string | null;
  readonly testPassed?: boolean | null;
  readonly testTotal?: number | null;
  readonly testFailures?: number | null;
  readonly iterations?: number;
  readonly toolCalls?: number;
  readonly totalTokens?: number;
  readonly deniedAttempts?: number;
  readonly startedAt?: string | null;
  readonly finishedAt?: string | null;
  readonly wallClockMs?: number | null;
}

export interface RunCursor {
  readonly createdAt: string;
  readonly id: string;
}

interface RawRunRow {
  id: string;
  status: string;
  phase: string;
  workload: string;
  goal: string;
  source_kind: string;
  source_ref: string;
  provider: string;
  sandbox_id: string | null;
  verdict: string | null;
  error_code: string | null;
  error_message: string | null;
  model_claim: string | null;
  model_explanation: string | null;
  test_passed: number | null;
  test_total: number | null;
  test_failures: number | null;
  iterations: number;
  tool_calls: number;
  total_tokens: number;
  denied_attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  wall_clock_ms: number | null;
}

function mapRun(row: RawRunRow): RunRow {
  return {
    id: row.id,
    status: row.status as RunStatus,
    phase: row.phase as RunPhase,
    workload: row.workload,
    goal: row.goal,
    sourceKind: row.source_kind as 'fixture' | 'files',
    sourceRef: row.source_ref,
    provider: row.provider as SandboxProviderKind,
    sandboxId: row.sandbox_id,
    verdict: row.verdict as BlastRadiusVerdict | null,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    modelClaim: row.model_claim,
    modelExplanation: row.model_explanation,
    testPassed: row.test_passed === null ? null : row.test_passed === 1,
    testTotal: row.test_total,
    testFailures: row.test_failures,
    iterations: row.iterations,
    toolCalls: row.tool_calls,
    totalTokens: row.total_tokens,
    deniedAttempts: row.denied_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    wallClockMs: row.wall_clock_ms,
  };
}

/** Column name → patch key. Fixed, so no key from a caller ever reaches SQL. */
const PATCH_COLUMNS: Readonly<Record<keyof RunPatch, string>> = {
  status: 'status',
  phase: 'phase',
  sandboxId: 'sandbox_id',
  verdict: 'verdict',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  modelClaim: 'model_claim',
  modelExplanation: 'model_explanation',
  testPassed: 'test_passed',
  testTotal: 'test_total',
  testFailures: 'test_failures',
  iterations: 'iterations',
  toolCalls: 'tool_calls',
  totalTokens: 'total_tokens',
  deniedAttempts: 'denied_attempts',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  wallClockMs: 'wall_clock_ms',
};

function toSqlValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

export interface RunStore {
  create(input: CreateRunInput): RunRow;
  get(runId: string): RunRow | null;
  list(cursor: RunCursor | null, limit: number): readonly RunRow[];
  update(runId: string, patch: RunPatch): void;
  /** Runs that were left queued/running by a previous process. */
  listActive(): readonly RunRow[];
}

export function createRunStore(db: Database): RunStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    create(input: CreateRunInput): RunRow {
      const now = input.createdAt;
      stmt(
        `INSERT INTO runs (
           id, status, phase, workload, goal, source_kind, source_ref, provider,
           broker_token_hash, created_at, updated_at
         ) VALUES (?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.workload,
        input.goal,
        input.sourceKind,
        input.sourceRef,
        input.provider,
        input.brokerTokenHash,
        now,
        now,
      );
      const row = stmt('SELECT * FROM runs WHERE id = ?').get(input.id) as RawRunRow | undefined;
      if (row === undefined) throw new Error('Run insert did not return a row.');
      return mapRun(row);
    },

    get(runId: string): RunRow | null {
      const row = stmt('SELECT * FROM runs WHERE id = ?').get(runId) as RawRunRow | undefined;
      return row === undefined ? null : mapRun(row);
    },

    list(cursor: RunCursor | null, limit: number): readonly RunRow[] {
      const rows =
        cursor === null
          ? (stmt(
              'SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?',
            ).all(limit) as unknown as RawRunRow[])
          : (stmt(
              `SELECT * FROM runs
                WHERE (created_at, id) < (?, ?)
                ORDER BY created_at DESC, id DESC
                LIMIT ?`,
            ).all(cursor.createdAt, cursor.id, limit) as unknown as RawRunRow[]);
      return rows.map(mapRun);
    },

    update(runId: string, patch: RunPatch): void {
      const entries = Object.entries(patch) as [keyof RunPatch, unknown][];
      if (entries.length === 0) return;

      const assignments: string[] = [];
      const values: (string | number | null)[] = [];
      for (const [key, value] of entries) {
        const column = PATCH_COLUMNS[key];
        if (column === undefined) continue;
        assignments.push(`${column} = ?`);
        values.push(toSqlValue(value));
      }
      if (assignments.length === 0) return;
      assignments.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(runId);

      stmt(`UPDATE runs SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    },

    listActive(): readonly RunRow[] {
      const rows = stmt(
        `SELECT * FROM runs
          WHERE status IN ('queued', 'running')
          ORDER BY created_at ASC`,
      ).all() as unknown as RawRunRow[];
      return rows.map(mapRun);
    },
  };
}
