/**
 * The blast-radius report — frozen by
 * `docs/architecture/02-phase1-design.md` §6.
 *
 * This is the artifact the project exists to produce. The `Measured<T>` rule is
 * the load-bearing type: "not measured" is structurally impossible to write as
 * `0`.
 */

import type {
  ContainmentVerification,
  ResourceEnforcementMode,
  SandboxKillReason,
  SandboxProviderKind,
} from './sandbox.ts';

/**
 * A value that is either genuinely measured, or explicitly not measured.
 *
 * There is no third state. In particular there is no way to express
 * "not measured" as `0` — the `value` of a not-measured entry is `null`,
 * and the `reason` says why. This is the type that enforces
 * "never fabricate a zero" at compile time.
 */
export type Measured<T> =
  | { readonly state: 'measured'; readonly value: T }
  | { readonly state: 'not-measured'; readonly value: null; readonly reason: string };

export type BlastRadiusVerdict =
  /** Every containment requirement was measured and satisfied, and no egress was allowed. */
  | 'contained'
  /** Every containment requirement was measured and satisfied, and at least one egress attempt was denied. */
  | 'contained-with-denials'
  /** A containment requirement was measured and FAILED. */
  | 'violated'
  /** At least one containment requirement was not measured. */
  | 'incomplete';

export interface BlastRadiusReport {
  readonly reportVersion: '1.0';
  readonly runId: string;
  readonly generatedAt: string;
  readonly verdict: BlastRadiusVerdict;
  /** One line, written for a human. Appears at the top of the UI panel. */
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

// ── what ran ────────────────────────────────────────────────────────────────

export interface WrittenFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  /** Who caused the write. */
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
  /** Present when `outcome` is `'refused'` — the control plane declined to run it. */
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
  /** The final verification run. This decides the run's success. */
  readonly finalTestRun: TestOutcome | null;
  /** The agent's closing explanation, verbatim. */
  readonly modelExplanation: string;
  /** The agent's own claim about what it did, before verification. */
  readonly modelClaim: string;
}

// ── containment ─────────────────────────────────────────────────────────────

export interface ContainmentSection {
  readonly processIsolation: Measured<IsolationFact>;
  readonly secretHygiene: Measured<SecretHygieneFact>;
  readonly resourceLimits: Measured<ResourceLimitFact>;
  readonly lifecycle: Measured<LifecycleFact>;
  /** The raw measurement from the sandbox. Null only if the probe never ran. */
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
  /** Every environment variable name visible inside the sandbox. */
  readonly environmentKeys: readonly string[];
  /** Did any credential-shaped name appear? (`*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`) */
  readonly credentialShapedKeys: readonly string[];
  /** True if any credential-shaped key or file was visible. Must be false. */
  readonly secretMaterialVisible: boolean;
  /** True if the operator's project directory (which may hold a `.env`) was inside the sandbox. */
  readonly projectDirectoryVisible: boolean;
}

export interface ResourceLimitFact {
  readonly enforcement: ResourceEnforcementMode;
  readonly memoryCapBytes: number;
  readonly cpuCapSeconds: number;
  readonly processCap: number;
  readonly fileSizeCapBytes: number;
  /** True when the cap actually fired (i.e. the sandbox was killed for exceeding it). */
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

// ── resources ───────────────────────────────────────────────────────────────

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
  /** The mechanism by which the caps were enforced. Same vocabulary as `ResourceEnforcementMode`. */
  readonly enforcement: ResourceEnforcementMode;
  /** Non-null when the sandbox was killed by a cap. */
  readonly killReason: SandboxKillReason | null;
}

// ── network ─────────────────────────────────────────────────────────────────

export interface EgressAttempt {
  readonly at: string;
  readonly capability: 'fetch' | 'file_out' | 'credential';
  readonly url: string | null;
  readonly host: string | null;
  readonly verdict: 'allowed' | 'denied';
  /** Machine-readable reason. `host_not_allowlisted`, `invalid_token`, … */
  readonly reason: string;
  /** Who caused the attempt. */
  readonly origin: 'agent' | 'containment-probe';
  readonly bytes: number | null;
  readonly durationMs: number | null;
}

export interface NetworkSection {
  /** Always `'blocked'`. The type makes it so. */
  readonly directAccess: 'blocked';
  readonly directMechanism: string;
  /** The measured probe. */
  readonly probe: Measured<NetworkProbeFact>;
  /** Every broker request, allowed or denied. */
  readonly attempts: readonly EgressAttempt[];
  readonly deniedCount: number;
  readonly allowedCount: number;
  /** The allowlist in force. Empty means "everything is denied". */
  readonly allowlist: readonly string[];
}

export interface NetworkProbeFact {
  readonly reachable: boolean;
  readonly errno: string | null;
  readonly message: string;
  /** The only endpoint the sandbox could reach, if any. */
  readonly brokerReachable: boolean;
}

// ── lifecycle ───────────────────────────────────────────────────────────────

export interface LifecycleSection {
  readonly sandboxId: string;
  readonly provider: SandboxProviderKind;
  readonly createdAt: string;
  readonly destroyedAt: string | null;
  readonly teardownVerified: boolean;
  readonly teardownEvidence: string;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
  /** Anything that survived teardown. Must be empty in a healthy run. */
  readonly leakedResources: readonly string[];
}

// ── evidence ────────────────────────────────────────────────────────────────

export interface Artifact {
  readonly label: string;
  readonly kind: 'text' | 'file';
  readonly content: string | null;
  readonly bytes: number;
  readonly sha256: string;
}

export interface EvidenceSection {
  readonly eventCount: number;
  /** SHA-256 over the canonical JSON of the event stream. */
  readonly eventDigest: string;
  readonly artifacts: readonly Artifact[];
  readonly stdout: string;
  readonly stderr: string;
}

// ── timeline ────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  readonly at: string;
  readonly label: string;
  readonly kind: 'sandbox' | 'agent' | 'tool' | 'egress' | 'resource' | 'lifecycle';
  readonly detail: string;
}
