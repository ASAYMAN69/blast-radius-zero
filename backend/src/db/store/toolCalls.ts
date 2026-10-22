/**
 * The `tool_calls` table.
 *
 * `id` is a surrogate key and is NEVER exposed: the API addresses a tool call
 * by its per-run `seq` (§9.3). The redactor runs before every insert.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import { redactToJson } from '../redact.ts';
import type { SandboxKillReason } from '../../contracts/sandbox.ts';

export type ToolCallOutcome = 'ok' | 'non-zero-exit' | 'killed' | 'timed-out' | 'refused';

export interface AppendToolCallInput {
  readonly runId: string;
  readonly seq: number;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly bytes: number | null;
  readonly outcome: ToolCallOutcome;
  readonly killReason: SandboxKillReason | null;
}

export interface ToolCallRow {
  readonly seq: number;
  readonly toolName: string;
  readonly argumentsJson: string;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly bytes: number | null;
  readonly outcome: ToolCallOutcome;
}

interface RawToolCallRow {
  seq: number;
  tool_name: string;
  arguments_json: string;
  ok: number;
  error_code: string | null;
  error_message: string | null;
  exit_code: number | null;
  signal: string | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
  bytes: number | null;
  outcome: string;
}

function mapToolCall(row: RawToolCallRow): ToolCallRow {
  return {
    seq: row.seq,
    toolName: row.tool_name,
    argumentsJson: row.arguments_json,
    ok: row.ok === 1,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    exitCode: row.exit_code,
    signal: row.signal,
    durationMs: row.duration_ms,
    stdout: row.stdout,
    stderr: row.stderr,
    bytes: row.bytes,
    outcome: row.outcome as ToolCallOutcome,
  };
}

export interface ToolCallStore {
  append(input: AppendToolCallInput): void;
  list(runId: string): readonly ToolCallRow[];
}

export function createToolCallStore(db: Database): ToolCallStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendToolCallInput): void {
      /*
       * The kill reason is part of the record's evidence but the frozen schema
       * has no column for it. It is folded into `error_message` so it survives,
       * and the report's `CommandRecord.killReason` is derived from the record.
       * (Schema change would be a DBMASTER decision; none is needed.)
       */
      const errorMessage =
        input.killReason === null
          ? input.errorMessage
          : `${input.errorMessage ?? 'Command was killed.'} [killReason=${input.killReason}]`;

      stmt(
        `INSERT INTO tool_calls (
           run_id, seq, tool_name, arguments_json, ok, error_code, error_message,
           exit_code, signal, duration_ms, stdout, stderr, bytes, outcome
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.seq,
        input.toolName,
        redactToJson(input.arguments),
        input.ok ? 1 : 0,
        input.errorCode,
        errorMessage,
        input.exitCode,
        input.signal,
        Math.max(0, Math.round(input.durationMs)),
        input.stdout,
        input.stderr,
        input.bytes,
        input.outcome,
      );
    },

    list(runId: string): readonly ToolCallRow[] {
      const rows = stmt(
        `SELECT seq, tool_name, arguments_json, ok, error_code, error_message,
                exit_code, signal, duration_ms, stdout, stderr, bytes, outcome
           FROM tool_calls
          WHERE run_id = ?
          ORDER BY seq ASC`,
      ).all(runId) as unknown as RawToolCallRow[];
      return rows.map(mapToolCall);
    },
  };
}
