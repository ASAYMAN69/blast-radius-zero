/**
 * The HTTP API contract — frozen by `docs/architecture/02-phase1-design.md` §8.
 */

import type { BlastRadiusReport } from './report.ts';
import type { RunEvent, RunPhase, RunStatus } from './events.ts';
import type { WorkloadDescriptor, WorkloadFixture } from './workload.ts';
import type { SandboxProviderKind } from './sandbox.ts';

export type { RunPhase, RunStatus } from './events.ts';

// ── error envelope (§8.2) ────────────────────────────────────────────────────

export interface ApiErrorDetail {
  /** The request field at fault. */
  readonly field: string;
  /** A short, non-sensitive description. */
  readonly issue: string;
}

export interface ApiErrorBody {
  readonly error: {
    /** Stable machine code. The UI shows this small and monospaced. */
    readonly code: string;
    /** Generic, per-status, human-readable. Never contains provider or SQL text. */
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ApiErrorDetail[];
  };
}

/**
 * The full error code list, with its HTTP status. Frozen (§8.2).
 *
 * This is the one place the mapping lives; `http/errors.ts` reads it.
 */
export const API_ERROR_STATUS: Readonly<Record<string, number>> = {
  invalid_request: 400,
  invalid_workload: 400,
  invalid_source: 400,
  invalid_path: 400,
  invalid_command: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  not_found: 404,
  run_not_found: 404,
  report_not_ready: 409,
  run_not_cancellable: 409,
  too_many_runs: 429,
  internal_error: 500,
  sandbox_error: 502,
  provider_unavailable: 502,
  not_ready: 503,
  timeout: 504,
};

/** The per-status generic messages are fixed (§8.2). */
export const API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'The request was not valid.',
  invalid_workload: 'That workload is not available.',
  invalid_source: 'The project source was not valid.',
  invalid_path: 'One of the file paths was not allowed.',
  invalid_command: 'That command is not allowed for this workload.',
  payload_too_large: 'The request was too large.',
  unsupported_media_type: 'Send JSON.',
  not_found: 'Not found.',
  run_not_found: 'No such run.',
  report_not_ready: 'The report is not ready yet.',
  run_not_cancellable: 'That run has already finished.',
  too_many_runs: 'The control plane is busy. Try again shortly.',
  internal_error: 'Something went wrong on our side.',
  sandbox_error: 'The sandbox could not be started.',
  provider_unavailable: 'The provider is unavailable.',
  not_ready: 'The service is starting up.',
  timeout: 'That took too long.',
};

// ── POST /api/v1/runs ───────────────────────────────────────────────────────

export type WorkloadId = 'self-healing-runner';

export interface FixtureSource {
  readonly kind: 'fixture';
  readonly fixtureId: string;
}

export interface FilesSource {
  readonly kind: 'files';
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export type RunSource = FixtureSource | FilesSource;

export interface SubmitRunRequest {
  readonly workload: WorkloadId;
  /** The operator's goal, 1–2000 characters. */
  readonly task: string;
  readonly source: RunSource;
}

export interface SubmitRunResponse {
  readonly runId: string;
  readonly status: RunStatus;
  readonly createdAt: string;
}

// ── GET /api/v1/runs ────────────────────────────────────────────────────────

export interface RunSummary {
  readonly runId: string;
  readonly status: RunStatus;
  readonly phase: RunPhase;
  readonly workload: WorkloadId;
  readonly goal: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly verdict: BlastRadiusReport['verdict'] | null;
  readonly testPassed: boolean | null;
  readonly testTotal: number | null;
  readonly errorCode: string | null;
}

export interface ListRunsResponse {
  readonly runs: readonly RunSummary[];
  /** Opaque cursor for the next page. `null` when there are no more. */
  readonly nextCursor: string | null;
}

// ── GET /api/v1/runs/{runId} ────────────────────────────────────────────────

/**
 * DEVIATION (brief 04): `provider` is `SandboxProviderKind`, not the literal
 * union `'bwrap' | 'vultr-vm'`. The design doc requires a stand-in provider
 * whose report is `incomplete` (§10.2) but gives it no label; labelling it
 * `'bwrap'` would be a false claim about the tier that ran. The union gains
 * `'standin'` additively and brief 06 removes it.
 */
export interface RunDetail extends RunSummary {
  readonly updatedAt: string;
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly provider: SandboxProviderKind;
  readonly sandboxId: string | null;
  readonly modelExplanation: string | null;
  readonly iterations: number;
  readonly toolCalls: number;
  readonly totalTokens: number;
  readonly deniedEgressAttempts: number;
}

export interface GetRunResponse {
  readonly run: RunDetail;
}

// ── GET /api/v1/runs/{runId}/events ─────────────────────────────────────────

export interface ListEventsQuery {
  /** Return events with `seq` strictly greater than this. Omit for the beginning. */
  readonly after?: number;
  /** Maximum events to return. Default 200, max 500. */
  readonly limit?: number;
}

export interface ListEventsResponse {
  readonly events: readonly RunEvent[];
  /** The `seq` to pass as `after` next time. `null` when the stream is exhausted. */
  readonly nextCursor: number | null;
  readonly runStatus: RunStatus;
  readonly runPhase: RunPhase;
}

// ── GET /api/v1/runs/{runId}/report ─────────────────────────────────────────

export interface GetReportResponse {
  readonly report: BlastRadiusReport;
}

// ── POST /api/v1/runs/{runId}/cancel ───────────────────────────────────────

export interface CancelRunResponse {
  readonly runId: string;
  readonly status: RunStatus;
}

// ── GET /api/v1/workloads ───────────────────────────────────────────────────

export interface ListWorkloadsResponse {
  readonly workloads: readonly WorkloadDescriptor[];
}

// ── GET /api/v1/fixtures ────────────────────────────────────────────────────

export interface ListFixturesResponse {
  readonly workload: WorkloadId;
  readonly fixtures: readonly WorkloadFixture[];
}

// ── GET /healthz ───────────────────────────────────────────────────────────

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly version: string;
  /** `live` or `mock`. Never the provider name — that would leak configuration. */
  readonly inferenceMode: 'live' | 'mock';
  readonly database: {
    readonly state: 'ready' | 'not-migrated' | 'error';
    readonly schemaVersion: number | null;
  };
  /** Same additive widening as `RunDetail.provider` (brief 04). */
  readonly provider: SandboxProviderKind;
  readonly cgroupV2: boolean;
  readonly uptimeSeconds: number;
}
