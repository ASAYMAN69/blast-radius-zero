/**
 * The `SandboxProvider` seam — frozen by `docs/architecture/02-phase1-design.md` §4.
 *
 * Nothing above this interface may know where code executes. The local tier is
 * `bwrap` + cgroup v2 (brief 06); the production tier is a throwaway Vultr VM
 * (brief 06). Brief 04 provides only the non-sealed stand-in, at
 * `backend/src/runs/standinProvider.ts`.
 *
 * DEVIATION FROM THE DESIGN DOC (reported in the brief-04 summary):
 * `SandboxProviderKind` carries a third member, `'standin'`. The design doc
 * requires a stand-in provider to exist (§10.2) and requires its report to be
 * `verdict: 'incomplete'` (§14, decision 39) — but the frozen union had no
 * label for it. Labelling the stand-in `'bwrap'` would be a false claim about
 * which tier ran, in a product whose value is truthful reports, so the union is
 * widened additively. Brief 06 removes the stand-in; the member can then be
 * deleted.
 *
 * AMENDMENT (brief 08, accepted by the HEAD): `ContainmentVerification` gained
 * exactly two fields — `namespaces` and `projectDirectoryVisible` — both
 * nullable, both meaning "not measured" when `null`. The frozen probe type
 * could not fill the frozen report types (`IsolationFact.namespaces`,
 * `SecretHygieneFact.projectDirectoryVisible`), so a *sealed* run could never
 * leave `incomplete`. Nothing else in this file changed, and FRONTEND's mirror
 * of the two report types already carries them.
 */

/** Opaque, externally-visible identifier for one sandbox instance. */
export type SandboxId = string;

/**
 * Which tier backs a sandbox. Nothing above the interface may branch on this.
 *
 * `'standin'` is brief-04-only: a plain child process with rlimits, no
 * namespaces and no cgroup. It is NOT containment. Brief 06 replaces it.
 */
export type SandboxProviderKind = 'bwrap' | 'vultr-vm';

/**
 * Hard caps applied to every sandboxed execution.
 *
 * These are *limits*, not targets. The provider MUST enforce every one of them
 * by a real mechanism (cgroup v2, rlimit, provider-native) and MUST report
 * which mechanism was used. A limit that is not enforced MUST NOT be reported
 * as enforced.
 */
export interface SandboxLimits {
  /** Wall-clock ceiling for a single `exec`. Enforced by a timer AND rlimits. */
  readonly wallClockMs: number;
  /** Address-space ceiling in bytes. Enforced by cgroup v2 `memory.max`. */
  readonly memoryBytes: number;
  /** CPU-time ceiling in seconds. Enforced by cgroup v2 `cpu.max` AND `RLIMIT_CPU`. */
  readonly cpuSeconds: number;
  /** Maximum processes in the sandbox. Enforced by cgroup v2 `pids.max`. */
  readonly maxProcesses: number;
  /** Maximum size of any single file written. Enforced by `RLIMIT_FSIZE`. */
  readonly maxFileBytes: number;
  /** Maximum bytes of stdout+stderr collected from one `exec`. */
  readonly maxOutputBytes: number;
  /** Maximum number of open file descriptors. Enforced by `RLIMIT_NOFILE`. */
  readonly maxOpenFiles: number;
}

/**
 * How the caps were actually enforced. Recorded verbatim in the report so a
 * reader can tell "the cap was reached" from "the cap was never applied".
 */
export type ResourceEnforcementMode =
  /** cgroup v2 was available and writable: memory/cpu/pids came from the cgroup. */
  | 'cgroup+rlimit'
  /** cgroup v2 was unavailable or not writable: only rlimits were applied. */
  | 'rlimit-only'
  /** The provider enforces caps natively (the Vultr VM tier). */
  | 'provider-native';

/** A file the control plane writes into the sandbox before the agent starts. */
export interface SandboxFile {
  /** POSIX path, relative, no leading `/`, no `..`, no NUL. */
  readonly path: string;
  readonly content: string;
  /** Permission bits. Default 0o644. */
  readonly mode?: number;
}

/** A command to run inside the sandbox. */
export interface SandboxCommand {
  /** Argument vector. NOT a shell string — no shell is involved. */
  readonly argv: readonly string[];
  /** Working directory, relative to the sandbox work dir. Default `'.'`. */
  readonly cwd?: string;
  /** Overrides `SandboxLimits.wallClockMs` for this command. */
  readonly timeoutMs?: number;
  /** Extra environment variables. The provider MUST apply its own allowlist on top. */
  readonly env?: Readonly<Record<string, string>>;
  /** Written to the command's stdin, then stdin is closed. */
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
  /** Process exit code, or `null` if the process was killed by a signal. */
  readonly exitCode: number | null;
  /** Terminating signal name, or `null`. */
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True if stdout+stderr exceeded `SandboxLimits.maxOutputBytes`. */
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  /** Set when the process was killed by a cap rather than exiting normally. */
  readonly killReason: SandboxKillReason | null;
}

/** The result of tearing a sandbox down. */
export interface SandboxDestroyResult {
  readonly ok: boolean;
  readonly destroyedAt: string;
  /**
   * True only if the provider *checked* that the sandbox is gone
   * (process exited, cgroup removed, work dir deleted, instance deleted).
   * A provider that cannot check MUST report `false`.
   */
  readonly verifiedGone: boolean;
  /** Human-readable list of anything that survived teardown. */
  readonly leftoverResources: readonly string[];
  /** Generic failure description. Never contains provider raw error text. */
  readonly error: string | null;
}

/**
 * The only channel between a sandbox and the control plane.
 *
 * The token is minted per run, delivered to the sandbox out of band, and
 * checked on every request. It authorises exactly one run and nothing else.
 */
export interface BrokerChannel {
  readonly transport: 'unix-socket' | 'https';
  /**
   * `unix-socket`: an absolute path *as seen from inside the sandbox*.
   * `https`: an absolute URL to the control plane's broker endpoint.
   */
  readonly endpoint: string;
  /** Per-run bearer token. */
  readonly token: string;
}

/**
 * The network posture of a sandbox.
 *
 * `direct` is typed as the literal `'blocked'`. A provider cannot widen it to
 * `'allowed'` without changing this file — the no-network guarantee is a
 * *type-level* property, not a convention. `verify()` must MEASURE it.
 */
export interface SandboxNetworkPolicy {
  readonly direct: 'blocked';
  /** Human-readable description of the mechanism, e.g. `'unshare-net (no interfaces)'`. */
  readonly directMechanism: string;
  readonly broker: BrokerChannel;
  /** Hostnames the broker may fetch on this sandbox's behalf. Empty in Phase 1 by default. */
  readonly allowlistedHosts: readonly string[];
}

/** A live sandbox. Every method is safe to call after `destroy()` (it becomes a no-op). */
export interface SandboxSession {
  readonly id: SandboxId;
  readonly provider: SandboxProviderKind;
  /** Absolute path of the writable work directory *inside* the sandbox. Always `/work`. */
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly enforcement: ResourceEnforcementMode;
  readonly network: SandboxNetworkPolicy;
  readonly createdAt: string;
  /** Write files into the sandbox. Overwrites existing files. Throws on an invalid path. */
  writeFiles(files: readonly SandboxFile[]): Promise<void>;
  /** Run a command inside the sandbox under the session's caps. */
  exec(command: SandboxCommand): Promise<SandboxExecResult>;
  /** MEASURE the containment properties. Never a claim — an observation. */
  verify(): Promise<ContainmentVerification>;
  /** Tear down. Idempotent. */
  destroy(): Promise<SandboxDestroyResult>;
}

/** What the provider needs in order to create a sandbox. */
export interface SandboxCreateSpec {
  /** The run this sandbox belongs to. Used for correlation and labelling. */
  readonly runId: string;
  /** Absolute host path of the per-run working directory to expose at `/work`. */
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly broker: BrokerChannel;
  readonly allowlistedHosts: readonly string[];
  /** Files to seed before the agent starts. */
  readonly files: readonly SandboxFile[];
  /**
   * The ONLY environment variable names permitted inside the sandbox.
   * The provider MUST NOT pass anything else — not the parent env, not secrets.
   */
  readonly envAllowlist: readonly string[];
  /** Free-form provider labels. Never contains secrets. */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * A *measurement* of the containment properties, taken from inside the sandbox.
 *
 * Every field is an observation produced by running something in the sandbox
 * and reporting what happened. `false` means "we checked and it was false";
 * absence of the measurement is represented by the caller not populating the
 * field, never by a plausible default.
 */
export interface ContainmentVerification {
  /** Did a TCP connection out of the sandbox succeed? */
  readonly directNetworkReachable: boolean;
  /** The raw result of the direct-egress probe. */
  readonly directNetworkProbe: {
    readonly attempted: boolean;
    /** POSIX errno name, e.g. `'ENETUNREACH'`. `null` if the probe did not run. */
    readonly errno: string | null;
    readonly message: string;
  };
  /** The environment variable names visible inside the sandbox. */
  readonly environmentKeys: readonly string[];
  /** Did any credential-shaped key or file appear inside the sandbox? */
  readonly secretMaterialVisible: boolean;
  /** The top-level entries visible at `/` inside the sandbox. */
  readonly visibleRootEntries: readonly string[];
  /** Is anything outside the work dir writable from inside the sandbox? */
  readonly writableOutsideWorkDir: boolean;
  /** Does the sandbox see only its own processes? */
  readonly processNamespaceIsolated: boolean;
  /** Could the sandbox reach the broker socket? */
  readonly brokerReachable: boolean;
  /**
   * The namespace kinds actually in effect inside the sandbox, read from
   * `/proc/self/ns/*` from **inside** it — e.g. `['user', 'mount', 'pid',
   * 'net', 'ipc', 'uts']`.
   *
   * `null` means **NOT MEASURED**. It never means "no namespaces", and it is
   * never a declared list the provider was configured with: the probe reports
   * what it observed, or nothing at all. An empty array would be a fabricated
   * measurement, which is exactly what this product exists to prevent.
   */
  readonly namespaces: readonly string[] | null;
  /**
   * Was the operator's project directory — the one that may hold a `.env` —
   * visible inside the sandbox?
   *
   * `null` means **NOT MEASURED**. It never means `false`: a provider that did
   * not look must not report that the directory was absent.
   */
  readonly projectDirectoryVisible: boolean | null;
  readonly measuredAt: string;
  readonly provider: SandboxProviderKind;
}

/** What a provider can do. Read by the run manager to decide what to offer. */
export interface SandboxProviderCapabilities {
  /** Is a writable cgroup v2 hierarchy available on this host? */
  readonly cgroupV2: boolean;
  /** Are rlimits enforceable? */
  readonly rlimits: boolean;
  /** Always `false`. A provider that can offer direct network is not a BRZ provider. */
  readonly directNetwork: false;
  /** Which broker transports this provider can offer. */
  readonly brokerTransport: readonly BrokerChannel['transport'][];
  /** Can the provider write files into the sandbox before start? */
  readonly fileWrite: boolean;
  /** How many sandboxes may exist at once. */
  readonly maxParallelSandboxes: number;
}

/**
 * The seam.
 *
 * Rules that hold for every implementation:
 *  1. `create()` MUST NOT return until the sandbox is ready to run a command.
 *  2. `exec()` MUST enforce every limit in `SandboxLimits` by a real mechanism
 *     and MUST report the mechanism in `enforcement`.
 *  3. `verify()` MUST MEASURE. Returning a hard-coded `false` for
 *     `directNetworkReachable` is a defect, not a safe default.
 *  4. `destroy()` MUST be idempotent and MUST report `verifiedGone` honestly.
 *  5. No method may return provider-specific error text to a caller that will
 *     show it to a user. Providers throw typed errors (§4.5).
 */
export interface SandboxProvider {
  readonly kind: SandboxProviderKind;
  readonly supports: SandboxProviderCapabilities;
  create(spec: SandboxCreateSpec): Promise<SandboxSession>;
  destroy(session: SandboxSession): Promise<SandboxDestroyResult>;
}

// ── provider errors (§4.5) ───────────────────────────────────────────────────

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

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  /** Server-log only, never returned to a client. */
  readonly detail: string | null;

  constructor(code: SandboxErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
