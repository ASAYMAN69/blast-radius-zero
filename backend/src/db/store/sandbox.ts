/**
 * The `sandbox_lifecycle` table: create / write / exec / destroy / probe.
 *
 * The containment probe result is stored as JSON on the `probe` action
 * (`measurement_json`). The report's containment facts come from this persisted
 * record, never from memory (§9.3).
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import type {
  ContainmentVerification,
  SandboxProviderKind,
} from '../../contracts/sandbox.ts';

export type LifecycleAction = 'create' | 'write' | 'exec' | 'destroy' | 'probe';

export interface AppendLifecycleInput {
  readonly runId: string;
  readonly at: string;
  readonly action: LifecycleAction;
  readonly provider: SandboxProviderKind;
  readonly sandboxId: string | null;
  readonly ok: boolean;
  /** Generic, safe text. Never provider raw error text. */
  readonly detail: string | null;
  readonly measurement?: ContainmentVerification | null;
}

export interface LifecycleRow {
  readonly at: string;
  readonly action: LifecycleAction;
  readonly provider: SandboxProviderKind;
  readonly sandboxId: string | null;
  readonly ok: boolean;
  readonly detail: string | null;
  readonly measurement: ContainmentVerification | null;
}

export interface DestroyRecord {
  readonly at: string;
  readonly ok: boolean;
  readonly verifiedGone: boolean;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
  readonly leftoverResources: readonly string[];
  readonly error: string | null;
}

interface RawLifecycleRow {
  at: string;
  action: string;
  provider: string;
  sandbox_id: string | null;
  ok: number;
  detail: string | null;
  measurement_json: string | null;
}

function parseMeasurement(json: string | null): ContainmentVerification | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as ContainmentVerification;
  } catch {
    return null;
  }
}

function mapLifecycle(row: RawLifecycleRow): LifecycleRow {
  return {
    at: row.at,
    action: row.action as LifecycleAction,
    provider: row.provider as SandboxProviderKind,
    sandboxId: row.sandbox_id,
    ok: row.ok === 1,
    detail: row.detail,
    measurement: parseMeasurement(row.measurement_json),
  };
}

export interface SandboxLifecycleStore {
  append(input: AppendLifecycleInput): void;
  list(runId: string): readonly LifecycleRow[];
  /** The latest containment probe, or `null` when no probe was recorded. */
  getProbe(runId: string): ContainmentVerification | null;
  /** The teardown record, or `null` when no destroy was recorded. */
  getDestroy(runId: string): DestroyRecord | null;
}

export function createSandboxLifecycleStore(db: Database): SandboxLifecycleStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendLifecycleInput): void {
      stmt(
        `INSERT INTO sandbox_lifecycle
           (run_id, at, action, provider, sandbox_id, ok, detail, measurement_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.at,
        input.action,
        input.provider,
        input.sandboxId,
        input.ok ? 1 : 0,
        input.detail,
        input.measurement === undefined || input.measurement === null
          ? null
          : JSON.stringify(input.measurement),
      );
    },

    list(runId: string): readonly LifecycleRow[] {
      const rows = stmt(
        `SELECT at, action, provider, sandbox_id, ok, detail, measurement_json
           FROM sandbox_lifecycle
          WHERE run_id = ?
          ORDER BY id ASC`,
      ).all(runId) as unknown as RawLifecycleRow[];
      return rows.map(mapLifecycle);
    },

    getProbe(runId: string): ContainmentVerification | null {
      const row = stmt(
        `SELECT measurement_json
           FROM sandbox_lifecycle
          WHERE run_id = ? AND action = 'probe' AND measurement_json IS NOT NULL
          ORDER BY id DESC
          LIMIT 1`,
      ).get(runId) as { measurement_json: string | null } | undefined;
      return row === undefined ? null : parseMeasurement(row.measurement_json);
    },

    getDestroy(runId: string): DestroyRecord | null {
      const row = stmt(
        `SELECT at, ok, detail
           FROM sandbox_lifecycle
          WHERE run_id = ? AND action = 'destroy'
          ORDER BY id DESC
          LIMIT 1`,
      ).get(runId) as { at: string; ok: number; detail: string | null } | undefined;
      if (row === undefined) return null;

      let parsed: Partial<DestroyRecord> = {};
      if (row.detail !== null) {
        try {
          parsed = JSON.parse(row.detail) as Partial<DestroyRecord>;
        } catch {
          parsed = {};
        }
      }
      return {
        at: row.at,
        ok: row.ok === 1,
        verifiedGone: parsed.verifiedGone === true,
        workDirRemoved: parsed.workDirRemoved === true,
        cgroupRemoved: parsed.cgroupRemoved === true,
        leftoverResources: Array.isArray(parsed.leftoverResources) ? parsed.leftoverResources : [],
        error: typeof parsed.error === 'string' ? parsed.error : null,
      };
    },
  };
}
