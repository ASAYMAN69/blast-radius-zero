/**
 * The `egress_attempts` table: every broker request, allowed or denied.
 * A denial is the most valuable thing in the report (§5.5).
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import type { BrokerCapability } from '../../contracts/broker.ts';

export interface AppendEgressAttemptInput {
  readonly runId: string;
  readonly at: string;
  readonly capability: BrokerCapability;
  readonly url: string | null;
  readonly host: string | null;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly origin: 'agent' | 'containment-probe';
  readonly bytes: number | null;
  readonly durationMs: number | null;
}

export interface EgressAttemptRow {
  readonly at: string;
  readonly capability: BrokerCapability;
  readonly url: string | null;
  readonly host: string | null;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly origin: 'agent' | 'containment-probe';
  readonly bytes: number | null;
  readonly durationMs: number | null;
}

interface RawEgressRow {
  at: string;
  capability: string;
  url: string | null;
  host: string | null;
  verdict: string;
  reason: string;
  origin: string;
  bytes: number | null;
  duration_ms: number | null;
}

export interface EgressStore {
  append(input: AppendEgressAttemptInput): void;
  list(runId: string): readonly EgressAttemptRow[];
}

export function createEgressStore(db: Database): EgressStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendEgressAttemptInput): void {
      stmt(
        `INSERT INTO egress_attempts
           (run_id, at, capability, url, host, verdict, reason, origin, bytes, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.at,
        input.capability,
        input.url,
        input.host,
        input.verdict,
        input.reason,
        input.origin,
        input.bytes,
        input.durationMs,
      );
    },

    list(runId: string): readonly EgressAttemptRow[] {
      const rows = stmt(
        `SELECT at, capability, url, host, verdict, reason, origin, bytes, duration_ms
           FROM egress_attempts
          WHERE run_id = ?
          ORDER BY at ASC, id ASC`,
      ).all(runId) as unknown as RawEgressRow[];
      return rows.map((row) => ({
        at: row.at,
        capability: row.capability as BrokerCapability,
        url: row.url,
        host: row.host,
        verdict: row.verdict as 'allowed' | 'denied',
        reason: row.reason,
        origin: row.origin as 'agent' | 'containment-probe',
        bytes: row.bytes,
        durationMs: row.duration_ms,
      }));
    },
  };
}
