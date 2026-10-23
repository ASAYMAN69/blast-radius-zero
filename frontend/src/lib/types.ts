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

// ── sandbox (the seam the control plane is built on) ────────────────────────

/** Opaque, externally-visible identifier for one sandbox instance. */
export type SandboxId = string;

/**
 * Which tier backs a sandbox. Nothing above the interface may branch on this.
 *
 * DEVIATION, mirrored from the backend (brief 04): the union carries a third
 * member, `'standin'`. The design doc requires a stand-in provider to exist
 * (§10.2) and requires its report to be `incomplete` (§14, decision 39), but
 * the frozen union had no label for it. Labelling the stand-in `'bwrap'` would
 * be a false claim about which tier ran, in a product whose value is truthful
 * reports. Brief 06 removes the stand-in and the member can be deleted.
 */
export type SandboxProviderKind = 'bwrap' | 'vultr-vm' | 'standin';

/**
 * How the caps were actually enforced. Recorded verbatim in the report so a
 * reader can tell "the cap was reached" from "the cap was never applied".
 */
export type ResourceEnforcementMode = 'cgroup+rlimit' | 'rlimit-only' | 'provider-native';

/**
 * Hard caps applied to every sandboxed execution.
 *
 * These are *limits*, not targets. The provider must enforce every one of them
 * by a real mechanism and must report which mechanism was used. A limit that
 * is not enforced must not be reported as enforced.
 */
export interface SandboxLimits {
  readonly wallClockMs: number;
  readonly memoryBytes: number;
  readonly cpuSeconds: number;
  readonly maxProcesses: number;
  readonly maxFileBytes: number;
  readonly maxOutputBytes: number;
  readonly maxOpenFiles: number;
}

/** A file the control plane writes into the sandbox before the agent starts. */
export interface SandboxFile {
  readonly path: string;
  readonly content: string;
  readonly mode?: number;
}

/** A command to run inside the sandbox. */
export interface SandboxCommand {
  readonly argv: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
}

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

/** The outcome of one sandboxed command. */
export interface SandboxExecResult {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly killReason: SandboxKillReason | null;
}

/** The result of tearing a sandbox down. */
export interface SandboxDestroyResult {
  readonly ok: boolean;
  readonly destroyedAt: string;
  readonly verifiedGone: boolean;
  readonly leftoverResources: readonly string[];
  readonly error: string | null;
}

/**
 * The only channel between a sandbox and the control plane.
 *
 * The token is minted per run and checks every request. It authorises exactly
 * one run and nothing else.
 */
export interface BrokerChannel {
  readonly transport: 'unix-socket' | 'https';
  readonly endpoint: string;
  readonly token: string;
}

/**
 * The network posture of a sandbox.
 *
 * `direct` is typed as the literal `'blocked'`. A provider cannot widen it to
 * `'allowed'` without changing this file — the no-network guarantee is a
 * *type-level* property, not a convention.
 */
export interface SandboxNetworkPolicy {
  readonly direct: 'blocked';
  readonly directMechanism: string;
  readonly broker: BrokerChannel;
  readonly allowlistedHosts: readonly string[];
}

/** A live sandbox. Every method is safe to call after `destroy()`. */
export interface SandboxSession {
  readonly id: SandboxId;
  readonly provider: SandboxProviderKind;
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly enforcement: ResourceEnforcementMode;
  readonly network: SandboxNetworkPolicy;
  readonly createdAt: string;
  writeFiles(files: readonly SandboxFile[]): Promise<void>;
  exec(command: SandboxCommand): Promise<SandboxExecResult>;
  verify(): Promise<ContainmentVerification>;
  destroy(): Promise<SandboxDestroyResult>;
}

/** What the provider needs in order to create a sandbox. */
export interface SandboxCreateSpec {
  readonly runId: string;
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly broker: BrokerChannel;
  readonly allowlistedHosts: readonly string[];
  readonly files: readonly SandboxFile[];
  readonly envAllowlist: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

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
  /**
   * The namespace kinds actually in effect inside the sandbox, read from
   * `/proc/self/ns/*` from inside it. `null` means NOT MEASURED.
   */
  readonly namespaces: readonly string[] | null;
  /**
   * Was the operator's project directory visible inside the sandbox?
   * `null` means NOT MEASURED.
   */
  readonly projectDirectoryVisible: boolean | null;
  readonly measuredAt: string;
  readonly provider: SandboxProviderKind;
}

/** What a provider can do. Read by the run manager to decide what to offer. */
export interface SandboxProviderCapabilities {
  readonly cgroupV2: boolean;
  readonly rlimits: boolean;
  /** Always `false`. A provider that can offer direct network is not a BRZ provider. */
  readonly directNetwork: false;
  readonly brokerTransport: readonly BrokerChannel['transport'][];
  readonly fileWrite: boolean;
  readonly maxParallelSandboxes: number;
}

/** The seam. */
export interface SandboxProvider {
  readonly kind: SandboxProviderKind;
  readonly supports: SandboxProviderCapabilities;
  create(spec: SandboxCreateSpec): Promise<SandboxSession>;
  destroy(session: SandboxSession): Promise<SandboxDestroyResult>;
}

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

// ── broker (the wire protocol) ──────────────────────────────────────────────

export type BrokerCapability = 'fetch' | 'file_out' | 'credential';

export type BrokerProtocol = 'brz-broker/1';

export interface BrokerRequest {
  readonly protocol: BrokerProtocol;
  readonly requestId: string;
  readonly runId: string;
  readonly capability: BrokerCapability;
  readonly token: string;
  readonly issuedAt: string;
  readonly payload: BrokerRequestPayload;
}

export type BrokerRequestPayload =
  | {
      readonly kind: 'fetch';
      readonly url: string;
      readonly method?: 'GET' | 'HEAD';
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'file_out';
      readonly path: string;
      readonly maxBytes: number;
    }
  | {
      readonly kind: 'credential';
      readonly credentialId: string;
    };

export interface BrokerResponse {
  readonly protocol: BrokerProtocol;
  readonly requestId: string;
  readonly ok: boolean;
  readonly at: string;
  readonly result?: BrokerResult;
  readonly error?: BrokerError;
}

export type BrokerResult =
  | {
      readonly kind: 'fetch';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly bytes: number;
      readonly truncated: boolean;
    }
  | {
      readonly kind: 'file_out';
      readonly content: string;
      readonly bytes: number;
      readonly sha256: string;
    }
  | {
      readonly kind: 'credential';
      readonly credentialId: string;
      readonly value: string;
      readonly expiresAt: string;
    };

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
  readonly provider: SandboxProviderKind;
  readonly cgroupV2: boolean;
  readonly uptimeSeconds: number;
}

/**
 * The full error code list, with its HTTP status.
 *
 * Mirrored from the backend so the console can reason about a code it does
 * not recognise without inventing a status for it.
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
