/**
 * Blast-radius report assembly (§6.6).
 *
 * The report is built from PERSISTED RECORDS, never from in-memory guesses:
 *
 *   filesWritten   ← artifacts written by the manager (`seed:` / `write:`)
 *   commands       ← `sandbox_lifecycle` rows with action `exec`
 *   finalTestRun   ← the `verification-run` artifact (JSON TestOutcome)
 *   containment    ← the probe recorded on `sandbox_lifecycle`
 *   resources      ← `resource_samples` aggregate + the run's wall clock
 *   network        ← `egress_attempts`
 *   lifecycle      ← `sandbox_lifecycle` create/destroy rows
 *   evidence       ← `run_events` + `artifacts`
 *   timeline       ← `run_events`, projected
 *
 * A field with no backing record becomes `Measured.state = 'not-measured'`
 * with a reason naming the missing record. A `0` is only ever written when it
 * was actually measured as zero (§6.2, §6.6).
 */

import type { Config } from '../config.ts';
import type { RunEvent, RunEventType } from '../contracts/events.ts';
import type {
  Artifact,
  BlastRadiusReport,
  BlastRadiusVerdict,
  CommandRecord,
  ContainmentSection,
  EgressAttempt,
  EvidenceSection,
  IsolationFact,
  LifecycleFact,
  LifecycleSection,
  Measured,
  NetworkProbeFact,
  NetworkSection,
  ResourceLimitFact,
  ResourceUsageSection,
  SecretHygieneFact,
  TestOutcome,
  TimelineEntry,
  WrittenFile,
} from '../contracts/report.ts';
import type {
  ContainmentVerification,
  ResourceEnforcementMode,
  SandboxKillReason,
  SandboxProviderKind,
} from '../contracts/sandbox.ts';
import type { RunRow } from '../db/store/runs.ts';
import type { Stores } from '../db/store/index.ts';
import type { ArtifactRow } from '../db/store/artifacts.ts';
import type { DestroyRecord, LifecycleRow } from '../db/store/sandbox.ts';
import type { ToolCallRow } from '../db/store/toolCalls.ts';
import { digestJson } from './ids.ts';

/** Artifact labels the manager owns. Both report assembly and the manager use them. */
export const SEED_ARTIFACT_PREFIX = 'seed:';
export const WRITE_ARTIFACT_PREFIX = 'write:';
export const VERIFICATION_ARTIFACT = 'verification-run';

/**
 * The `detail` JSON of a `sandbox_lifecycle` `create` row. It is the only
 * persisted record of the enforcement mechanism and the network mechanism, both
 * of which the report needs after the session object is gone.
 */
export interface SandboxCreateDetail {
  readonly enforcement: ResourceEnforcementMode;
  readonly directMechanism: string;
  readonly workDir: string;
  readonly provider: SandboxProviderKind;
}

/**
 * The `detail` JSON of a `sandbox_lifecycle` `exec` row. It is the command
 * record (§6.3 `CommandRecord`) plus the reason a refused command never ran.
 */
export type SandboxExecDetail = CommandRecord;

function measured<T>(value: T): Measured<T> {
  return { state: 'measured', value };
}

function notMeasured<T>(reason: string): Measured<T> {
  return { state: 'not-measured', value: null, reason };
}

function readJsonObject(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed record is a missing record; the report says so.
  }
  return null;
}

function readCreateDetail(lifecycle: readonly LifecycleRow[]): SandboxCreateDetail | null {
  const row = lifecycle.find((entry) => entry.action === 'create');
  if (row === undefined) return null;
  const parsed = readJsonObject(row.detail);
  if (parsed === null) return null;

  const enforcement = parsed['enforcement'];
  const directMechanism = parsed['directMechanism'];
  const workDir = parsed['workDir'];
  const provider = parsed['provider'];
  if (
    enforcement !== 'cgroup+rlimit' &&
    enforcement !== 'rlimit-only' &&
    enforcement !== 'provider-native'
  ) {
    return null;
  }
  return {
    enforcement,
    directMechanism: typeof directMechanism === 'string' ? directMechanism : 'not reported',
    workDir: typeof workDir === 'string' ? workDir : '',
    // The row was written by this process from a live session's own kind; a
    // stored string is the only representation the schema has.
    provider: (typeof provider === 'string' ? provider : 'bwrap') as SandboxProviderKind,
  };
}

function readExecDetail(row: LifecycleRow): SandboxExecDetail | null {
  const parsed = readJsonObject(row.detail);
  if (parsed === null) return null;

  const argv = parsed['argv'];
  const cwd = parsed['cwd'];
  const exitCode = parsed['exitCode'];
  const signal = parsed['signal'];
  const durationMs = parsed['durationMs'];
  const outcome = parsed['outcome'];
  const killReason = parsed['killReason'];
  const refusalReason = parsed['refusalReason'];

  if (!Array.isArray(argv) || argv.some((entry) => typeof entry !== 'string')) return null;
  if (typeof cwd !== 'string') return null;
  if (exitCode !== null && typeof exitCode !== 'number') return null;
  if (signal !== null && typeof signal !== 'string') return null;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null;
  if (
    outcome !== 'ok' &&
    outcome !== 'non-zero-exit' &&
    outcome !== 'killed' &&
    outcome !== 'timed-out' &&
    outcome !== 'refused'
  ) {
    return null;
  }

  const killReasons: readonly (SandboxKillReason | null)[] = [
    null,
    'wall-clock-timeout',
    'memory-cap',
    'cpu-cap',
    'process-cap',
    'file-size-cap',
    'cancelled',
    'sandbox-destroyed',
    'provider-error',
  ];
  const resolvedKillReason = killReasons.includes(killReason as SandboxKillReason | null)
    ? (killReason as SandboxKillReason | null)
    : null;

  return {
    argv: argv as string[],
    cwd,
    exitCode: exitCode as number | null,
    signal: signal as string | null,
    durationMs,
    outcome,
    killReason: resolvedKillReason,
    refusalReason: typeof refusalReason === 'string' ? refusalReason : null,
  };
}

function readVerification(artifacts: readonly ArtifactRow[]): TestOutcome | null {
  const row = [...artifacts].reverse().find((artifact) => artifact.label === VERIFICATION_ARTIFACT);
  if (row === undefined || row.content === null) return null;
  const parsed = readJsonObject(row.content);
  if (parsed === null) return null;

  const command = parsed['command'];
  const exitCode = parsed['exitCode'];
  const passed = parsed['passed'];
  const total = parsed['total'];
  const failedTests = parsed['failedTests'];
  const output = parsed['output'];
  if (typeof command !== 'string') return null;
  if (exitCode !== null && typeof exitCode !== 'number') return null;
  if (typeof passed !== 'number' || typeof total !== 'number') return null;
  if (!Array.isArray(failedTests) || typeof output !== 'string') return null;

  const failed = failedTests.map((entry) => {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      test: typeof record['test'] === 'string' ? record['test'] : 'unknown',
      message: typeof record['message'] === 'string' ? record['message'] : '',
      traceback: typeof record['traceback'] === 'string' ? record['traceback'] : null,
    };
  });

  return {
    command,
    exitCode: exitCode as number | null,
    passed,
    total,
    failedTests: failed,
    output,
  };
}

function filesWritten(
  artifacts: readonly ArtifactRow[],
): readonly WrittenFile[] {
  const byPath = new Map<string, WrittenFile>();
  const order: string[] = [];

  for (const artifact of artifacts) {
    let origin: WrittenFile['origin'] | null = null;
    let filePath: string | null = null;
    if (artifact.label.startsWith(SEED_ARTIFACT_PREFIX)) {
      origin = 'workload-seed';
      filePath = artifact.label.slice(SEED_ARTIFACT_PREFIX.length);
    } else if (artifact.label.startsWith(WRITE_ARTIFACT_PREFIX)) {
      origin = 'agent';
      filePath = artifact.label.slice(WRITE_ARTIFACT_PREFIX.length);
    }
    if (origin === null || filePath === null || filePath.length === 0) continue;

    if (!byPath.has(filePath)) order.push(filePath);
    // The last write to a path wins: the report shows what was left behind.
    byPath.set(filePath, {
      path: filePath,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      origin,
    });
  }

  return order
    .map((filePath) => byPath.get(filePath))
    .filter((entry): entry is WrittenFile => entry !== undefined);
}

function commands(lifecycle: readonly LifecycleRow[], toolCalls: readonly ToolCallRow[]): readonly CommandRecord[] {
  const fromLifecycle = lifecycle
    .filter((row) => row.action === 'exec')
    .map(readExecDetail)
    .filter((entry): entry is SandboxExecDetail => entry !== null);

  if (fromLifecycle.length > 0) return fromLifecycle;

  /*
   * Fallback for a run recorded before the manager wrote exec detail rows: the
   * tool call still carries the exit code and outcome. The argv is only known
   * when the model passed one; an omitted command is the project default, and
   * we do not invent it here.
   */
  return toolCalls
    .filter((row) => row.toolName === 'run_tests')
    .map((row) => {
      const args = readJsonObject(row.argumentsJson);
      const command = typeof args?.['command'] === 'string' ? args['command'] : '';
      return {
        argv: command.length === 0 ? [] : command.split(/\s+/),
        cwd: '',
        exitCode: row.exitCode,
        signal: row.signal,
        durationMs: row.durationMs,
        outcome: row.outcome,
        killReason: killReasonFrom(row.errorMessage),
        refusalReason: row.outcome === 'refused' ? row.errorMessage : null,
      };
    });
}

function killReasonFrom(errorMessage: string | null): SandboxKillReason | null {
  if (errorMessage === null) return null;
  const match = /\[killReason=([a-z-]+)\]/.exec(errorMessage);
  const value = match?.[1] ?? null;
  const allowed: readonly SandboxKillReason[] = [
    'wall-clock-timeout',
    'memory-cap',
    'cpu-cap',
    'process-cap',
    'file-size-cap',
    'cancelled',
    'sandbox-destroyed',
    'provider-error',
  ];
  return allowed.includes(value as SandboxKillReason) ? (value as SandboxKillReason) : null;
}

function optionalStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((entry) => typeof entry !== 'string')) return null;
  return value as string[];
}

function containmentSection(
  provider: SandboxProviderKind,
  probe: ContainmentVerification | null,
  lifecycle: readonly LifecycleRow[],
  createDetail: SandboxCreateDetail | null,
  destroy: DestroyRecord | null,
  caps: Config['sandboxLimits'],
  capFired: boolean,
): ContainmentSection {

  if (probe === null) {
    const reason = 'No containment probe record was stored on sandbox_lifecycle.';
    return {
      processIsolation: notMeasured(reason),
      secretHygiene: notMeasured(reason),
      resourceLimits: notMeasured(reason),
      lifecycle: notMeasured(reason),
      measurement: null,
    };
  }

  /*
   * The two nullable probe fields (brief 08) are read straight from the
   * contract. `null` means NOT MEASURED, so the fact stays `not-measured` with
   * a reason that names the field — never a fabricated `false` and never a
   * fabricated `[]`. `?? null` also covers a probe row written before brief 08,
   * whose JSON simply has no such key.
   */
  const rawNamespaces = probe.namespaces ?? null;
  const namespaces = optionalStringArray(rawNamespaces);

  const processIsolation: Measured<IsolationFact> =
    namespaces === null
      ? notMeasured(
          'The containment probe did not measure the namespace kinds in effect (ContainmentVerification.namespaces is null — "not measured", not "no namespaces").',
        )
      : measured({
          namespaces,
          visibleRootEntries: probe.visibleRootEntries,
          writableOutsideWorkDir: probe.writableOutsideWorkDir,
          processNamespaceIsolated: probe.processNamespaceIsolated,
          directNetworkReachable: probe.directNetworkReachable,
        });

  const projectDirectoryVisible = probe.projectDirectoryVisible ?? null;
  const credentialShapedKeys = probe.environmentKeys.filter((key) =>
    /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key),
  );
  const secretHygiene: Measured<SecretHygieneFact> =
    projectDirectoryVisible === null
      ? notMeasured(
          'The containment probe did not measure whether the operator project directory was visible (ContainmentVerification.projectDirectoryVisible is null — "not measured", not "not visible").',
        )
      : measured({
          environmentKeys: probe.environmentKeys,
          credentialShapedKeys,
          secretMaterialVisible: probe.secretMaterialVisible,
          projectDirectoryVisible,
        });

  const resourceLimits: Measured<ResourceLimitFact> = measured({
    enforcement: createDetail?.enforcement ?? 'rlimit-only',
    memoryCapBytes: caps.memoryBytes,
    cpuCapSeconds: caps.cpuSeconds,
    processCap: caps.maxProcesses,
    fileSizeCapBytes: caps.maxFileBytes,
    capFired,
  });

  const lifecycleFact: Measured<LifecycleFact> =
    destroy === null || createDetail === null
      ? notMeasured('No sandbox create + destroy pair was recorded on sandbox_lifecycle.')
      : measured({
          sandboxId: destroySandboxId(lifecycle) ?? '',
          provider,
          createdAt: createDetailRow(lifecycle)?.at ?? '',
          destroyedAt: destroy.at,
          verifiedGone: destroy.verifiedGone,
          workDirRemoved: destroy.workDirRemoved,
          cgroupRemoved: destroy.cgroupRemoved,
        });

  return {
    processIsolation,
    secretHygiene,
    resourceLimits,
    lifecycle: lifecycleFact,
    measurement: probe,
  };
}

function createDetailRow(lifecycle: readonly LifecycleRow[]): LifecycleRow | null {
  return lifecycle.find((entry) => entry.action === 'create') ?? null;
}

function destroySandboxId(lifecycle: readonly LifecycleRow[]): string | null {
  return createDetailRow(lifecycle)?.sandboxId ?? null;
}

function factViolated(section: ContainmentSection): boolean {
  const isolation = section.processIsolation;
  if (isolation.state === 'measured') {
    const value = isolation.value;
    if (value.directNetworkReachable) return true;
    if (value.writableOutsideWorkDir) return true;
    if (!value.processNamespaceIsolated) return true;
  }
  const secrets = section.secretHygiene;
  if (secrets.state === 'measured') {
    if (secrets.value.secretMaterialVisible) return true;
    if (secrets.value.projectDirectoryVisible) return true;
  }
  const lifecycle = section.lifecycle;
  if (lifecycle.state === 'measured') {
    if (!lifecycle.value.verifiedGone) return true;
    if (!lifecycle.value.workDirRemoved) return true;
  }
  return false;
}

function factUnmeasured(section: ContainmentSection): boolean {
  return (
    section.processIsolation.state === 'not-measured' ||
    section.secretHygiene.state === 'not-measured' ||
    section.resourceLimits.state === 'not-measured' ||
    section.lifecycle.state === 'not-measured'
  );
}

/** §6.4, in code. `violated` outranks `incomplete`, which outranks the contained states. */
export function computeVerdict(
  containment: ContainmentSection,
  deniedCount: number,
): BlastRadiusVerdict {
  if (factViolated(containment)) return 'violated';
  if (factUnmeasured(containment)) return 'incomplete';
  if (deniedCount > 0) return 'contained-with-denials';
  return 'contained';
}

function networkSection(
  config: Config,
  probe: ContainmentVerification | null,
  attempts: readonly EgressAttempt[],
  createDetail: SandboxCreateDetail | null,
): NetworkSection {
  const probeFact: Measured<NetworkProbeFact> =
    probe === null
      ? notMeasured('No direct-egress probe result was stored on sandbox_lifecycle.')
      : measured({
          reachable: !probe.directNetworkReachable,
          errno: probe.directNetworkProbe.errno,
          message: probe.directNetworkProbe.message,
          brokerReachable: probe.brokerReachable,
        });

  const deniedCount = attempts.filter((attempt) => attempt.verdict === 'denied').length;
  const allowedCount = attempts.filter((attempt) => attempt.verdict === 'allowed').length;

  return {
    /*
     * The type is the literal `'blocked'` (§4.1). For the stand-in that literal
     * is a type-level claim the provider cannot back up, so the mechanism text
     * says so explicitly and the verdict is forced to `incomplete`.
     */
    directAccess: 'blocked',
    directMechanism:
      createDetail?.directMechanism ??
      'not reported by the provider',
    probe: probeFact,
    attempts,
    deniedCount,
    allowedCount,
    allowlist: config.egress.allowlist,
  };
}

function resourcesSection(
  run: RunRow,
  stores: Stores,
  createDetail: SandboxCreateDetail | null,
  toolCalls: readonly ToolCallRow[],
  caps: Config['sandboxLimits'],
): ResourceUsageSection {
  const aggregate = stores.resources.aggregate(run.id);
  const outputBytes = toolCalls.reduce(
    (total, row) =>
      total + Buffer.byteLength(row.stdout, 'utf8') + Buffer.byteLength(row.stderr, 'utf8'),
    0,
  );

  let killReason: SandboxKillReason | null = null;
  for (const row of toolCalls) {
    const candidate = killReasonFrom(row.errorMessage);
    if (candidate !== null) killReason = candidate;
  }

  return {
    wallClockMs:
      run.wallClockMs === null
        ? aggregate.wallClockMs === null
          ? notMeasured('No wall-clock measurement was recorded on the run or its resource samples.')
          : measured(aggregate.wallClockMs)
        : measured(run.wallClockMs),
    wallClockCapMs: caps.wallClockMs,
    memoryPeakBytes:
      aggregate.memoryPeakBytes === null
        ? notMeasured('No resource sample recorded a memory reading (no cgroup read-back was available).')
        : measured(aggregate.memoryPeakBytes),
    memoryCapBytes: caps.memoryBytes,
    cpuSeconds:
      aggregate.cpuMs === null
        ? notMeasured('No resource sample recorded a CPU-time reading (no cgroup read-back was available).')
        : measured(aggregate.cpuMs / 1000),
    cpuCapSeconds: caps.cpuSeconds,
    maxProcessesObserved:
      aggregate.maxProcesses === null
        ? notMeasured('No resource sample recorded a process count (no cgroup read-back was available).')
        : measured(aggregate.maxProcesses),
    processCap: caps.maxProcesses,
    outputBytes: measured(outputBytes),
    /*
     * The enforcement mode is persisted by the provider at create time. When
     * the record is missing, `rlimit-only` is the conservative reading: it never
     * claims a cgroup or provider-native cap that was not recorded.
     */
    enforcement: createDetail?.enforcement ?? 'rlimit-only',
    killReason,
  };
}

function lifecycleSection(
  run: RunRow,
  lifecycle: readonly LifecycleRow[],
  destroy: DestroyRecord | null,
): LifecycleSection {
  const create = createDetailRow(lifecycle);
  const sandboxId = run.sandboxId ?? create?.sandboxId ?? '';

  if (destroy === null) {
    return {
      sandboxId,
      provider: run.provider,
      createdAt: create?.at ?? '',
      destroyedAt: null,
      teardownVerified: false,
      teardownEvidence: 'No teardown record was stored on sandbox_lifecycle.',
      workDirRemoved: false,
      cgroupRemoved: false,
      leakedResources: [],
    };
  }

  const evidence = [
    destroy.verifiedGone ? 'sandbox verified gone' : 'sandbox NOT verified gone',
    destroy.workDirRemoved ? 'work dir removed' : 'work dir NOT removed',
    destroy.cgroupRemoved ? 'cgroup removed' : 'no cgroup recorded',
  ].join('; ');

  return {
    sandboxId,
    provider: run.provider,
    createdAt: create?.at ?? '',
    destroyedAt: destroy.at,
    teardownVerified: destroy.verifiedGone,
    teardownEvidence: destroy.error === null ? evidence : `${evidence}; ${destroy.error}`,
    workDirRemoved: destroy.workDirRemoved,
    cgroupRemoved: destroy.cgroupRemoved,
    leakedResources: destroy.leftoverResources,
  };
}

function eventKind(type: RunEventType): TimelineEntry['kind'] {
  switch (type) {
    case 'sandbox.created':
    case 'sandbox.probe':
      return 'sandbox';
    case 'agent.plan':
    case 'agent.message':
    case 'provider.rotated':
      return 'agent';
    case 'tool.call':
    case 'tool.result':
      return 'tool';
    case 'egress.attempt':
      return 'egress';
    case 'resource.sample':
      return 'resource';
    case 'sandbox.destroyed':
    case 'run.queued':
    case 'run.started':
    case 'run.completed':
    case 'run.failed':
    case 'run.cancelled':
      return 'lifecycle';
  }
}

/** One deterministic line per event. Large values (file contents) are skipped. */
function summariseEventDetail(detail: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value);
    parts.push(`${key}=${text.length > 120 ? `${text.slice(0, 120)}…` : text}`);
  }
  const joined = parts.join(', ');
  return joined.length > 300 ? `${joined.slice(0, 300)}…` : joined;
}

function timeline(events: readonly RunEvent[]): readonly TimelineEntry[] {
  return events.map((event) => {
    const detail = summariseEventDetail(event.detail);
    return {
      at: event.at,
      label: event.label,
      kind: eventKind(event.type),
      detail: detail.length === 0 ? event.type : detail,
    };
  });
}

function headline(
  verdict: BlastRadiusVerdict,
  written: readonly WrittenFile[],
  finalTestRun: TestOutcome | null,
  deniedCount: number,
  destroyedAt: string | null,
  egressMeasured: boolean,
  tokenUsage: TokenUsage | null,
): string {
  const agentFiles = written.filter((file) => file.origin === 'agent').length;
  const fileText = `${agentFiles} file${agentFiles === 1 ? '' : 's'} changed`;
  const testText =
    finalTestRun === null
      ? 'no verification run'
      : `${finalTestRun.passed}/${finalTestRun.total} tests passed`;
  /*
   * "No egress was attempted" and "egress was not measured" are different
   * facts (§6.1). When the probe never ran, the headline says so instead of
   * claiming a tidy zero.
   */
  const denialText = egressMeasured
    ? `${deniedCount} network attempt${deniedCount === 1 ? '' : 's'} denied`
    : `egress not measured (${deniedCount} attempt${deniedCount === 1 ? '' : 's'} recorded)`;
  const sandboxText = destroyedAt === null ? 'sandbox not destroyed' : 'sandbox destroyed';
  const summary = `${fileText}, ${testText}, ${denialText}, ${sandboxText}.`;

  /*
   * A run stopped by its token budget is a designed outcome, and the headline
   * has to say so: the reader must not mistake it for a crash, and must see
   * the usage that was reached against the budget that stopped it.
   */
  if (tokenUsage !== null && tokenUsage.exhausted) {
    const budgetText =
      tokenUsage.budget > 0
        ? `${tokenUsage.tokens} tokens used against a budget of ${tokenUsage.budget}`
        : `${tokenUsage.tokens} tokens used`;
    return `Token budget exhausted — ${budgetText}. ${summary}`;
  }

  switch (verdict) {
    case 'violated':
      return `VIOLATED — a measured containment requirement failed. ${summary}`;
    case 'incomplete':
      return `Containment not measured. ${summary}`;
    case 'contained-with-denials':
      return `Contained. ${summary}`;
    case 'contained':
      return `Contained. ${summary}`;
  }
}

export interface AssembleReportInput {
  readonly run: RunRow;
  readonly stores: Stores;
  readonly config: Config;
  readonly generatedAt?: string;
}

/**
 * The run's token usage against its budget. `budget` is the run budget, and
 * `tokens` is what the run actually reached — a real measurement, never an
 * estimate of an estimate.
 */
interface TokenUsage {
  readonly tokens: number;
  readonly budget: number;
  readonly exhausted: boolean;
}

function tokenUsageFor(run: RunRow, config: Config): TokenUsage | null {
  if (config.runTokenBudget <= 0) return null;
  return {
    tokens: run.totalTokens,
    budget: config.runTokenBudget,
    exhausted: run.errorCode === 'token_budget_exhausted',
  };
}

/** Pure: everything comes from `stores` and the run row. */
export function assembleReport(input: AssembleReportInput): BlastRadiusReport {
  const { run, stores, config } = input;
  const lifecycle = stores.sandbox.list(run.id);
  const probe = stores.sandbox.getProbe(run.id);
  const destroy = stores.sandbox.getDestroy(run.id);
  const createDetail = readCreateDetail(lifecycle);
  const toolCalls = stores.toolCalls.list(run.id);
  const artifacts = stores.artifacts.list(run.id);
  const artifactRows: readonly Artifact[] = artifacts.map((row) => ({
    label: row.label,
    kind: row.kind,
    content: row.content,
    bytes: row.bytes,
    sha256: row.sha256,
  }));
  const egressRows = stores.egress.list(run.id);
  const attempts: readonly EgressAttempt[] = egressRows.map((row) => ({
    at: row.at,
    capability: row.capability,
    url: row.url,
    host: row.host,
    verdict: row.verdict,
    reason: row.reason,
    origin: row.origin,
    bytes: row.bytes,
    durationMs: row.durationMs,
  }));

  const capFired = toolCalls.some((row) => {
    const reason = killReasonFrom(row.errorMessage);
    return (
      reason === 'memory-cap' ||
      reason === 'cpu-cap' ||
      reason === 'process-cap' ||
      reason === 'file-size-cap'
    );
  });

  const containment = containmentSection(
    run.provider,
    probe,
    lifecycle,
    createDetail,
    destroy,
    config.sandboxLimits,
    capFired,
  );
  const written = filesWritten(artifacts);
  const finalTestRun = readVerification(artifacts);
  const deniedCount = attempts.filter((attempt) => attempt.verdict === 'denied').length;
  const verdict = computeVerdict(containment, deniedCount);
  const events = stores.events.listAll(run.id);
  const network = networkSection(config, probe, attempts, createDetail);
  const lifecycleReport = lifecycleSection(run, lifecycle, destroy);

  const evidence: EvidenceSection = {
    eventCount: events.length,
    eventDigest: digestJson(events),
    artifacts: artifactRows,
    stdout: toolCalls.map((row) => row.stdout).filter((text) => text.length > 0).join('\n'),
    stderr: toolCalls.map((row) => row.stderr).filter((text) => text.length > 0).join('\n'),
  };

  return {
    reportVersion: '1.0',
    runId: run.id,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    verdict,
    headline: headline(
      verdict,
      written,
      finalTestRun,
      deniedCount,
      lifecycleReport.destroyedAt,
      network.probe.state === 'measured',
      tokenUsageFor(run, config),
    ),
    task: {
      workload: run.workload,
      goal: run.goal,
      sourceKind: run.sourceKind,
      sourceRef: run.sourceRef,
    },
    code: {
      filesWritten: written,
      commands: commands(lifecycle, toolCalls),
      finalTestRun,
      modelExplanation: run.modelExplanation ?? '',
      /*
       * The claim is what the agent said while it worked. When it never
       * narrated one, its closing message IS its claim about what it did; an
       * empty string here would read as a broken panel in the console.
       */
      modelClaim: run.modelClaim ?? run.modelExplanation ?? '',
    },
    containment,
    resources: resourcesSection(run, stores, createDetail, toolCalls, config.sandboxLimits),
    network,
    lifecycle: lifecycleReport,
    evidence,
    timeline: timeline(events),
  };
}
