/**
 * BRZ — the API contract, mirrored by hand.
 *
 * This file is a **hand-copied mirror** of `backend/src/contracts/*.ts`
 * (docs/architecture/02-phase1-design.md §8, §6.3, §8.7). It is not imported
 * from the backend: there is no shared package, because the backend cannot
 * have a build step and a third workspace package would be a file two agents
 * would both own.
 *
 * The design document is the source of truth. When a field changes there, it
 * changes here. A CI job compares the exported type names of the two sides.
 *
 * Nothing in this file may be loosened. The discriminated unions exist so the
 * UI cannot accidentally render a fabricated value — `Measured<T>` in
 * particular makes "not measured" impossible to write as `0`.
 */

// ── sandbox (the subset the report and the API reference) ────────────────────

/** Opaque, externally-visible identifier for one sandbox instance. */
export type SandboxId = string;

/** Which tier backs a sandbox. Nothing above the interface may branch on this. */
export type SandboxProviderKind = 'bwrap' | 'vultr-vm';

/**
 * How the caps were actually enforced. Recorded verbatim in the report so a
 * reader can tell "the cap was reached" from "the cap was never applied".
 */
export type ResourceEnforcementMode = 'cgroup+rlimit' | 'rlimit-only' | 'provider-native';

/** Why a sandboxed process died, if it did. */
export type SandboxKillReason =
  | 'wall-clock-timeout'
  | 'memory-cap'
  | 'cpu-cap'
  | 'process-cap'
  | 'file-size-cap'
  | 'cancelled'
  | 'sandbox-destroyed'
  | 'provider-error';

export type SandboxErrorCode =
  | 'sandbox_create_failed'
  | 'sandbox_not_found'
  | 'sandbox_destroy_failed'
  | 'invalid_path'
  | 'invalid_command'
  | 'command_not_allowed'
  | 'cgroup_unavailable'
  | 'provider_unavailable'
  | 'provider_error';

/**
 * A *measurement* of the containment properties, taken from inside the sandbox.
 * Every field is an observation produced by running something in the sandbox.
 */
export interface ContainmentVerification {
  readonly directNetworkReachable: boolean;
  readonly directNetworkProbe: {
    readonly attempted: boolean;
    readonly errno: string | null;
    readonly message: string;
  };
  readonly environmentKeys: readonly string[];
  readonly secretMaterialVisible: boolean;
  readonly visibleRootEntries: readonly string[];
  readonly writableOutsideWorkDir: boolean;
  readonly processNamespaceIsolated: boolean;
  readonly brokerReachable: boolean;
  readonly measuredAt: string;
  readonly provider: SandboxProviderKind;
}

// ── broker (the wire protocol) ──────────────────────────────────────────────

export type BrokerCapability = 'fetch' | 'file_out' | 'credential';

export type BrokerProtocol = 'brz-broker/1';

export type BrokerErrorCode =
  | 'unauthorized'
  | 'unknown_capability'
  | 'capability_disabled'
  | 'egress_denied'
  | 'invalid_url'
  | 'path_not_allowed'
  | 'credential_not_allowed'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error';

export interface BrokerError {
  readonly code: BrokerErrorCode;
  readonly message: string;
}

// ── report ──────────────────────────────────────────────────────────────────

/**
 * A value that is either genuinely measured, or explicitly not measured.
 *
 * There is no third state. In particular there is no way to express
 * "not measured" as `0` — the `value` of a not-measured entry is `null`,
 * and the `reason` says why.
 */
export type Measured<T> =
  | { readonly state: 'measured'; readonly value: T }
  | { readonly state: 'not-measured'; readonly value: null; readonly reason: string };

export type BlastRadiusVerdict =
  | 'contained'
  | 'contained-with-denials'
  | 'violated'
  | 'incomplete';

export interface BlastRadiusReport {
  readonly reportVersion: '1.0';
  readonly runId: string;
  readonly generatedAt: string;
  readonly verdict: BlastRadiusVerdict;
  readonly headline: string;
  readonly task: {
    readonly workload: string;
    readonly goal: string;
    readonly sourceKind: 'fixture' | 'files';
    readonly sourceRef: string;
  };
  readonly code: CodeExecutionSummary;
  readonly containment: ContainmentSection;
  readonly resources: ResourceUsageSection;
  readonly network: NetworkSection;
  readonly lifecycle: LifecycleSection;
  readonly evidence: EvidenceSection;
  readonly timeline: readonly TimelineEntry[];
}

export interface WrittenFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly origin: 'workload-seed' | 'agent';
}

export interface CommandRecord {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly outcome: 'ok' | 'non-zero-exit' | 'killed' | 'timed-out' | 'refused';
  readonly killReason: SandboxKillReason | null;
  readonly refusalReason: string | null;
}

export interface FailedTest {
  readonly test: string;
  readonly message: string;
  readonly traceback: string | null;
}

export interface TestOutcome {
  readonly command: string;
  readonly exitCode: number | null;
  readonly passed: number;
  readonly total: number;
  readonly failedTests: readonly FailedTest[];
  readonly output: string;
}

export interface CodeExecutionSummary {
  readonly filesWritten: readonly WrittenFile[];
  readonly commands: readonly CommandRecord[];
  readonly finalTestRun: TestOutcome | null;
  readonly modelExplanation: string;
  readonly modelClaim: string;
}

export interface ContainmentSection {
  readonly processIsolation: Measured<IsolationFact>;
  readonly secretHygiene: Measured<SecretHygieneFact>;
  readonly resourceLimits: Measured<ResourceLimitFact>;
  readonly lifecycle: Measured<LifecycleFact>;
  readonly measurement: ContainmentVerification | null;
}

export interface IsolationFact {
  readonly namespaces: readonly string[];
  readonly visibleRootEntries: readonly string[];
  readonly writableOutsideWorkDir: boolean;
  readonly processNamespaceIsolated: boolean;
  readonly directNetworkReachable: boolean;
}

export interface SecretHygieneFact {
  readonly environmentKeys: readonly string[];
  readonly credentialShapedKeys: readonly string[];
  readonly secretMaterialVisible: boolean;
  readonly projectDirectoryVisible: boolean;
}

export interface ResourceLimitFact {
  readonly enforcement: ResourceEnforcementMode;
  readonly memoryCapBytes: number;
  readonly cpuCapSeconds: number;
  readonly processCap: number;
  readonly fileSizeCapBytes: number;
  readonly capFired: boolean;
}

export interface LifecycleFact {
  readonly sandboxId: string;
  readonly provider: SandboxProviderKind;
  readonly createdAt: string;
  readonly destroyedAt: string | null;
  readonly verifiedGone: boolean;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
}

export interface ResourceUsageSection {
  readonly wallClockMs: Measured<number>;
  readonly wallClockCapMs: number;
  readonly memoryPeakBytes: Measured<number>;
  readonly memoryCapBytes: number;
  readonly cpuSeconds: Measured<number>;
  readonly cpuCapSeconds: number;
  readonly maxProcessesObserved: Measured<number>;
  readonly processCap: number;
  readonly outputBytes: Measured<number>;
  readonly enforcement: ResourceEnforcementMode;
  readonly killReason: SandboxKillReason | null;
}

export interface EgressAttempt {
  readonly at: string;
  readonly capability: 'fetch' | 'file_out' | 'credential';
  readonly url: string | null;
  readonly host: string | null;
  readonly verdict: 'allowed' | 'denied';
  readonly reason: string;
  readonly origin: 'agent' | 'containment-probe';
  readonly bytes: number | null;
  readonly durationMs: number | null;
}

export interface NetworkSection {
  readonly directAccess: 'blocked';
  readonly directMechanism: string;
  readonly probe: Measured<NetworkProbeFact>;
  readonly attempts: readonly EgressAttempt[];
  readonly deniedCount: number;
  readonly allowedCount: number;
  readonly allowlist: readonly string[];
}

export interface NetworkProbeFact {
  readonly reachable: boolean;
  readonly errno: string | null;
  readonly message: string;
  readonly brokerReachable: boolean;
}

export interface LifecycleSection {
  readonly sandboxId: string;
  readonly provider: SandboxProviderKind;
  readonly createdAt: string;
  readonly destroyedAt: string | null;
  readonly teardownVerified: boolean;
  readonly teardownEvidence: string;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
  readonly leakedResources: readonly string[];
}

export interface Artifact {
  readonly label: string;
  readonly kind: 'text' | 'file';
  readonly content: string | null;
  readonly bytes: number;
  readonly sha256: string;
}

export interface EvidenceSection {
  readonly eventCount: number;
  readonly eventDigest: string;
  readonly artifacts: readonly Artifact[];
  readonly stdout: string;
  readonly stderr: string;
}

export interface TimelineEntry {
  readonly at: string;
  readonly label: string;
  readonly kind: 'sandbox' | 'agent' | 'tool' | 'egress' | 'resource' | 'lifecycle';
  readonly detail: string;
}

// ── events ──────────────────────────────────────────────────────────────────

/** Per-run monotonic sequence number. `after` in the events query is this. */
export type EventSeq = number;

/** The run's lifecycle state. `queued` → `running` → a terminal status. */
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** The position within a run. `done` is the terminal phase of a finished run. */
export type RunPhase =
  | 'queued'
  | 'sandbox_starting'
  | 'containment_probe'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'reporting'
  | 'teardown'
  | 'done';

export type RunEventType =
  | 'run.queued'
  | 'run.started'
  | 'sandbox.created'
  | 'sandbox.probe'
  | 'agent.plan'
  | 'agent.message'
  | 'tool.call'
  | 'tool.result'
  | 'egress.attempt'
  | 'resource.sample'
  | 'sandbox.destroyed'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

export interface RunEvent {
  readonly seq: EventSeq;
  readonly runId: string;
  readonly at: string;
  readonly type: RunEventType;
  readonly phase: RunPhase;
  readonly label: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

// ── workload ────────────────────────────────────────────────────────────────

export interface WorkloadToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface WorkloadDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceKinds: readonly ('fixture' | 'files')[];
  readonly limits: {
    readonly memoryBytes: readonly number[];
    readonly cpuSeconds: readonly number[];
    readonly wallClockMs: readonly number[];
  };
  readonly tools: readonly WorkloadToolDescriptor[];
  readonly successCriterion: string;
}

export interface WorkloadFixture {
  readonly id: string;
  readonly workload: string;
  readonly name: string;
  readonly description: string;
  readonly task: string;
  readonly files: readonly { readonly path: string; readonly content: string }[];
  readonly allowedCommands: readonly string[];
  readonly testCommand: string;
}

// ── api ─────────────────────────────────────────────────────────────────────

export interface ApiErrorDetail {
  readonly field: string;
  readonly issue: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ApiErrorDetail[];
  };
}

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
  readonly nextCursor: string | null;
}

export interface RunDetail extends RunSummary {
  readonly updatedAt: string;
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly provider: 'bwrap' | 'vultr-vm';
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

export interface ListEventsQuery {
  readonly after?: number;
  readonly limit?: number;
}

export interface ListEventsResponse {
  readonly events: readonly RunEvent[];
  readonly nextCursor: number | null;
  readonly runStatus: RunStatus;
  readonly runPhase: RunPhase;
}

export interface GetReportResponse {
  readonly report: BlastRadiusReport;
}

export interface CancelRunResponse {
  readonly runId: string;
  readonly status: RunStatus;
}

export interface ListWorkloadsResponse {
  readonly workloads: readonly WorkloadDescriptor[];
}

export interface ListFixturesResponse {
  readonly workload: WorkloadId;
  readonly fixtures: readonly WorkloadFixture[];
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly version: string;
  readonly inferenceMode: 'live' | 'mock';
  readonly database: {
    readonly state: 'ready' | 'not-migrated' | 'error';
    readonly schemaVersion: number | null;
  };
  readonly provider: 'bwrap' | 'vultr-vm';
  readonly cgroupV2: boolean;
  readonly uptimeSeconds: number;
}

/**
 * The per-status generic messages. Mirrored from the backend so the console
 * can show a sensible generic sentence even when a proxy in front of the
 * control plane answers without the standard envelope.
 */
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
