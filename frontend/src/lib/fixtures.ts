import { ApiError } from './api';
import type { BrzApi } from './api';
import { newRunId, newSandboxId } from './ids';
import type {
  BlastRadiusReport,
  BlastRadiusVerdict,
  CancelRunResponse,
  CommandRecord,
  ContainmentVerification,
  EgressAttempt,
  GetReportResponse,
  GetRunResponse,
  ListEventsResponse,
  ListFixturesResponse,
  ListRunsResponse,
  ListWorkloadsResponse,
  Measured,
  ResourceEnforcementMode,
  RunDetail,
  RunEvent,
  RunEventType,
  RunPhase,
  RunStatus,
  SubmitRunRequest,
  SubmitRunResponse,
  TestOutcome,
  TimelineEntry,
  WorkloadDescriptor,
  WorkloadFixture,
  WrittenFile,
} from './types';

/**
 * The offline fixture set.
 *
 * The control plane is being built in parallel with this console, so the
 * console has to be complete and credible before a server exists. These four
 * runs are the demo dataset:
 *
 *   1. `success`       — the demo scenario: the agent fixes the bug, the suite
 *                        goes green, the probe's fetch is denied.
 *   2. `model-failure` — the model could not fix the bug. The suite is still
 *                        red, the repair budget is spent, and the report says so.
 *   3. `resource-cap`  — the sandbox was killed by the memory cap. The report
 *                        carries the kill reason and the peak against the cap.
 *   4. `egress-denied` — the containment moment. The agent's own code tried to
 *                        reach the network and was refused, twice, with the
 *                        reasons recorded.
 *
 * The values are realistic and internally consistent: the report's
 * `eventCount` matches the event stream, the denial count matches the
 * `network.attempts` array, and the resource peak never exceeds the cap.
 *
 * Nothing here is presented as a live measurement. The console labels fixture
 * mode for what it is.
 */

// ── shared project fixture ──────────────────────────────────────────────────

const CALCULATOR_SOURCE = `def sum_range(start, end):
    """Return the sum of the integers from start to end, inclusive."""
    return sum(range(start, end))
`;

const CALCULATOR_FIXED = `def sum_range(start, end):
    """Return the sum of the integers from start to end, inclusive."""
    return sum(range(start, end + 1))
`;

const TEST_SOURCE = `import unittest
from calculator import sum_range


class TestSumRange(unittest.TestCase):
    def test_inclusive(self):
        self.assertEqual(sum_range(1, 5), 15)

    def test_single(self):
        self.assertEqual(sum_range(3, 3), 3)
`;

const DEMO_TASK =
  "The project's test suite is failing. Read the code, find the bug, fix it, and make the whole suite pass. Then run `python3 -m unittest discover -s tests -v` again to confirm.";

const TEST_COMMAND = 'python3 -m unittest discover -s tests -v';
const SELFTEST_COMMAND = 'python3 -m brz_selftest';

export const PROJECT_FIXTURE: WorkloadFixture = {
  id: 'shr-sum-range',
  workload: 'self-healing-runner',
  name: 'Inclusive range sum',
  description:
    'A one-file calculator whose range sum excludes its upper bound. Two tests, so a hard-coded answer fails.',
  task: DEMO_TASK,
  files: [
    { path: 'calculator.py', content: CALCULATOR_SOURCE },
    { path: 'tests/test_calculator.py', content: TEST_SOURCE },
  ],
  allowedCommands: [TEST_COMMAND, SELFTEST_COMMAND],
  testCommand: TEST_COMMAND,
};

export const WORKLOAD: WorkloadDescriptor = {
  id: 'self-healing-runner',
  name: 'Self-Healing Runner',
  description:
    'A single-file Python bug fix with a stdlib unittest suite. The agent reads the code, runs the real suite, repairs the cause, and the sandbox decides whether it worked.',
  sourceKinds: ['fixture', 'files'],
  limits: {
    memoryBytes: [67_108_864, 134_217_728, 268_435_456],
    cpuSeconds: [30, 60, 120],
    wallClockMs: [60_000, 120_000, 300_000],
  },
  tools: [
    {
      name: 'list_files',
      description: 'List the files in the project.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false },
    },
    {
      name: 'read_file',
      description: 'Read one file. Always read a file before changing it.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'write_file',
      description: 'Create or overwrite one file. Write the whole file.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
    {
      name: 'run_tests',
      description:
        "Run the project's declared test command inside the sandbox. Only a command the project declares is accepted.",
      parameters: { type: 'object', properties: { command: { type: 'string' } }, additionalProperties: false },
    },
  ],
  successCriterion:
    'The verification test run exits 0 and every declared test passes. The sandbox decides, not the model.',
};

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * The fixture clock is anchored a little in the past, not to a hard-coded
 * date, so the sample runs always look like recent history rather than
 * timestamps from the future.
 */
const EPOCH = Date.now() - 90_000;

function iso(offsetMs: number): string {
  return new Date(EPOCH + offsetMs).toISOString();
}

function measured<T>(value: T): Measured<T> {
  return { state: 'measured', value };
}

function notMeasured<T>(reason: string): Measured<T> {
  return { state: 'not-measured', value: null, reason };
}

interface EventSeed {
  readonly type: RunEventType;
  readonly phase: RunPhase;
  readonly label: string;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly at: number;
}

function buildEvents(runId: string, seeds: readonly EventSeed[]): RunEvent[] {
  return seeds.map((seed, index) => ({
    seq: index + 1,
    runId,
    at: iso(seed.at),
    type: seed.type,
    phase: seed.phase,
    label: seed.label,
    detail: seed.detail ?? {},
  }));
}

const CONTAINMENT_MEASUREMENT: Omit<ContainmentVerification, 'measuredAt'> = {
  directNetworkReachable: false,
  directNetworkProbe: { attempted: true, errno: 'ENETUNREACH', message: 'Network is unreachable' },
  environmentKeys: ['HOME', 'LANG', 'PATH', 'PWD'],
  secretMaterialVisible: false,
  visibleRootEntries: ['bin', 'dev', 'etc', 'lib', 'lib64', 'proc', 'sbin', 'tmp', 'usr', 'work'],
  writableOutsideWorkDir: false,
  processNamespaceIsolated: true,
  brokerReachable: true,
  namespaces: ['user', 'mount', 'pid', 'ipc', 'uts', 'cgroup', 'net'],
  projectDirectoryVisible: false,
  provider: 'bwrap',
};

const NAMESPACES = ['user', 'mount', 'pid', 'ipc', 'uts', 'cgroup', 'net'] as const;

interface ReportSeed {
  readonly runId: string;
  readonly sandboxId: string;
  readonly offset: number;
  readonly verdict: BlastRadiusVerdict;
  readonly standin?: boolean;
  readonly headline: string;
  readonly goal: string;
  readonly sourceRef: string;
  readonly filesWritten: readonly WrittenFile[];
  readonly commands: readonly CommandRecord[];
  readonly finalTestRun: TestOutcome | null;
  readonly modelExplanation: string;
  readonly modelClaim: string;
  readonly attempts: readonly EgressAttempt[];
  readonly allowlist: readonly string[];
  readonly memoryPeakBytes: number;
  readonly memoryCapBytes: number;
  readonly cpuSeconds: Measured<number>;
  readonly cpuCapSeconds: number;
  readonly maxProcessesObserved: number;
  readonly processCap: number;
  readonly outputBytes: number;
  readonly wallClockMs: number;
  readonly wallClockCapMs: number;
  readonly enforcement: ResourceEnforcementMode;
  readonly killReason: BlastRadiusReport['resources']['killReason'];
  readonly capFired: boolean;
  readonly lifecycle: {
    readonly createdAt: number;
    readonly destroyedAt: number;
    readonly verifiedGone: boolean;
    readonly workDirRemoved: boolean;
    readonly cgroupRemoved: boolean;
    readonly teardownEvidence: string;
    readonly leakedResources: readonly string[];
  };
  readonly artifacts: BlastRadiusReport['evidence']['artifacts'];
  readonly stdout: string;
  readonly stderr: string;
  readonly timeline: readonly TimelineEntry[];
  readonly eventCount: number;
  readonly eventDigest: string;
}

function buildReport(seed: ReportSeed): BlastRadiusReport {
  const denied = seed.attempts.filter((attempt) => attempt.verdict === 'denied').length;
  const allowed = seed.attempts.filter((attempt) => attempt.verdict === 'allowed').length;

  return {
    reportVersion: '1.0',
    runId: seed.runId,
    generatedAt: iso(seed.offset + seed.lifecycle.destroyedAt + 90),
    verdict: seed.verdict,
    headline: seed.headline,
    task: {
      workload: 'self-healing-runner',
      goal: seed.goal,
      sourceKind: 'fixture',
      sourceRef: seed.sourceRef,
    },
    code: {
      filesWritten: seed.filesWritten,
      commands: seed.commands,
      finalTestRun: seed.finalTestRun,
      modelExplanation: seed.modelExplanation,
      modelClaim: seed.modelClaim,
    },
    containment: seed.standin
      ? {
          processIsolation: notMeasured(
            'the containment probe never ran — the stand-in provider does not measure namespaces or isolation',
          ),
          secretHygiene: notMeasured(
            'the containment probe never ran — the stand-in provider does not measure the environment or the project directory',
          ),
          resourceLimits: notMeasured(
            'the containment probe never ran — the stand-in provider applies rlimits but does not measure them against the caps',
          ),
          lifecycle: notMeasured(
            'the containment probe never ran — the stand-in provider does not record lifecycle measurements',
          ),
          measurement: null,
        }
      : {
          processIsolation: measured({
            namespaces: NAMESPACES,
            visibleRootEntries: CONTAINMENT_MEASUREMENT.visibleRootEntries,
            writableOutsideWorkDir: false,
            processNamespaceIsolated: true,
            directNetworkReachable: false,
          }),
          secretHygiene: measured({
            environmentKeys: CONTAINMENT_MEASUREMENT.environmentKeys,
            credentialShapedKeys: [],
            secretMaterialVisible: false,
            projectDirectoryVisible: false,
          }),
          resourceLimits: measured({
            enforcement: seed.enforcement,
            memoryCapBytes: seed.memoryCapBytes,
            cpuCapSeconds: seed.cpuCapSeconds,
            processCap: seed.processCap,
            fileSizeCapBytes: 1_048_576,
            capFired: seed.capFired,
          }),
          lifecycle: measured({
            sandboxId: seed.sandboxId,
            provider: seed.standin ? 'standin' : 'bwrap',
            createdAt: iso(seed.lifecycle.createdAt),
            destroyedAt: iso(seed.lifecycle.destroyedAt),
            verifiedGone: seed.lifecycle.verifiedGone,
            workDirRemoved: seed.lifecycle.workDirRemoved,
            cgroupRemoved: seed.lifecycle.cgroupRemoved,
          }),
          measurement: { ...CONTAINMENT_MEASUREMENT, measuredAt: iso(seed.offset + seed.lifecycle.createdAt + 220) },
        },
    resources: {
      wallClockMs: measured(seed.wallClockMs),
      wallClockCapMs: seed.wallClockCapMs,
      memoryPeakBytes: measured(seed.memoryPeakBytes),
      memoryCapBytes: seed.memoryCapBytes,
      cpuSeconds: seed.cpuSeconds,
      cpuCapSeconds: seed.cpuCapSeconds,
      maxProcessesObserved: measured(seed.maxProcessesObserved),
      processCap: seed.processCap,
      outputBytes: measured(seed.outputBytes),
      enforcement: seed.enforcement,
      killReason: seed.killReason,
    },
    network: seed.standin
      ? {
          directAccess: 'blocked',
          directMechanism: 'none — the stand-in runs as a plain child process on the host',
          probe: notMeasured('the containment probe never ran — the stand-in provider does not measure egress'),
          attempts: [],
          deniedCount: 0,
          allowedCount: 0,
          allowlist: [],
        }
      : {
          directAccess: 'blocked',
          directMechanism: 'unshare-net (no interfaces, no route)',
          probe: measured({
            reachable: false,
            errno: 'ENETUNREACH',
            message: 'Network is unreachable',
            brokerReachable: true,
          }),
          attempts: seed.attempts,
          deniedCount: denied,
          allowedCount: allowed,
          allowlist: seed.allowlist,
        },
    lifecycle: {
      sandboxId: seed.sandboxId,
      provider: seed.standin ? 'standin' : 'bwrap',
      createdAt: iso(seed.lifecycle.createdAt),
      destroyedAt: iso(seed.lifecycle.destroyedAt),
      teardownVerified: seed.lifecycle.verifiedGone,
      teardownEvidence: seed.lifecycle.teardownEvidence,
      workDirRemoved: seed.lifecycle.workDirRemoved,
      cgroupRemoved: seed.lifecycle.cgroupRemoved,
      leakedResources: seed.lifecycle.leakedResources,
    },
    evidence: {
      eventCount: seed.eventCount,
      eventDigest: seed.eventDigest,
      artifacts: seed.artifacts,
      stdout: seed.stdout,
      stderr: seed.stderr,
    },
    timeline: seed.timeline,
  };
}

function command(
  argv: readonly string[],
  exitCode: number | null,
  durationMs: number,
  outcome: CommandRecord['outcome'],
  extra: Partial<CommandRecord> = {},
): CommandRecord {
  return {
    argv,
    cwd: '/work',
    exitCode,
    signal: null,
    durationMs,
    outcome,
    killReason: null,
    refusalReason: null,
    ...extra,
  };
}

// ── fixture 1: the demo scenario, green ─────────────────────────────────────

const SUCCESS_RUN_ID = 'run_01JQ7YB3K4M2ZC0X9W6R8VN5TF';
const SUCCESS_SANDBOX_ID = 'sbx_01JQ7YB3KD8ZP4H';
const SUCCESS_OFFSET = 0;

const SUCCESS_TEST_OUTPUT = `test_inclusive (tests.test_calculator.TestSumRange) ... ok
test_single (tests.test_calculator.TestSumRange) ... ok

----------------------------------------------------------------------
Ran 2 tests in 0.001s

OK
`;

const FAILING_TEST_OUTPUT = `test_inclusive (tests.test_calculator.TestSumRange) ... FAIL
test_single (tests.test_calculator.TestSumRange) ... ok

======================================================================
FAIL: test_inclusive (tests.test_calculator.TestSumRange)
----------------------------------------------------------------------
Traceback (most recent call last):
  File "/work/tests/test_calculator.py", line 7, in test_inclusive
    self.assertEqual(sum_range(1, 5), 15)
AssertionError: 10 != 15

----------------------------------------------------------------------
Ran 2 tests in 0.001s

FAILED (failures=1)
`;

const SUCCESS_EXPLANATION = `\`sum_range\` used \`range(start, end)\`, which excludes \`end\`, but the docstring and the tests both specify an inclusive range. The first test expected 15 for (1, 5) and got 10.

**What I changed**

| File | Change |
| --- | --- |
| \`calculator.py\` | \`sum(range(start, end))\` → \`sum(range(start, end + 1))\` |

Both tests now pass. The second test, \`sum_range(3, 3) == 3\`, still holds, so the fix is a real inclusive range rather than a special case.`;

const SUCCESS_EVENTS: readonly EventSeed[] = [
  { type: 'run.queued', phase: 'queued', label: 'Run accepted', detail: { queue: 1 }, at: 0 },
  { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 120 },
  {
    type: 'sandbox.created',
    phase: 'sandbox_starting',
    label: 'Sandbox created',
    detail: { provider: 'bwrap', enforcement: 'cgroup+rlimit', memoryCapBytes: 134_217_728 },
    at: 340,
  },
  {
    type: 'sandbox.probe',
    phase: 'containment_probe',
    label: 'Containment probe',
    detail: {
      directEgress: 'blocked',
      errno: 'ENETUNREACH',
      credentialShapedKeys: 0,
      visibleRootEntries: 10,
      environmentKeys: 4,
    },
    at: 560,
  },
  {
    type: 'egress.attempt',
    phase: 'containment_probe',
    label: 'Broker fetch denied',
    detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted' },
    at: 640,
  },
  {
    type: 'agent.plan',
    phase: 'planning',
    label: 'Agent planned',
    detail: { summary: 'Read the source, run the failing suite, fix the cause.' },
    at: 900,
  },
  { type: 'tool.call', phase: 'executing', label: 'list_files', detail: { tool: 'list_files' }, at: 1010 },
  { type: 'tool.result', phase: 'executing', label: 'list_files → 2 files', detail: { tool: 'list_files', ok: true }, at: 1080 },
  { type: 'tool.call', phase: 'executing', label: 'read_file calculator.py', detail: { tool: 'read_file', path: 'calculator.py' }, at: 1180 },
  { type: 'tool.result', phase: 'executing', label: 'read_file → 214 bytes', detail: { tool: 'read_file', ok: true, bytes: 214 }, at: 1250 },
  { type: 'tool.call', phase: 'executing', label: 'read_file tests/test_calculator.py', detail: { tool: 'read_file', path: 'tests/test_calculator.py' }, at: 1330 },
  { type: 'tool.result', phase: 'executing', label: 'read_file → 268 bytes', detail: { tool: 'read_file', ok: true, bytes: 268 }, at: 1400 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1480 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 412 }, at: 1892 },
  {
    type: 'agent.plan',
    phase: 'planning',
    label: 'Repair attempt 1 of 2',
    detail: { summary: 'The range is exclusive; the tests want it inclusive.' },
    at: 1980,
  },
  { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 2100 },
  { type: 'tool.result', phase: 'executing', label: 'write_file → 214 bytes', detail: { tool: 'write_file', ok: true, bytes: 214 }, at: 2170 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2260 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 2660 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests (verification)', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2750 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 3150 },
  { type: 'agent.message', phase: 'reporting', label: 'Agent explained', detail: { bytes: SUCCESS_EXPLANATION.length }, at: 3250 },
  { type: 'resource.sample', phase: 'reporting', label: 'Resource sample', detail: { memoryBytes: 41_246_720, cpuMs: 310, processes: 3 }, at: 3300 },
  {
    type: 'sandbox.destroyed',
    phase: 'teardown',
    label: 'Sandbox destroyed',
    detail: { verifiedGone: true, workDirRemoved: true, cgroupRemoved: true },
    at: 3310,
  },
  {
    type: 'run.completed',
    phase: 'done',
    label: 'Run succeeded',
    detail: { verdict: 'contained-with-denials', testsPassed: 2, testsTotal: 2 },
    at: 3320,
  },
];

const SUCCESS_REPORT = buildReport({
  runId: SUCCESS_RUN_ID,
  sandboxId: SUCCESS_SANDBOX_ID,
  offset: SUCCESS_OFFSET,
  verdict: 'contained-with-denials',
  headline:
    'Contained. 1 file changed, 2/2 tests green, 0 bytes left the sandbox, 1 network attempt denied, sandbox destroyed.',
  goal: DEMO_TASK,
  sourceRef: 'shr-sum-range',
  filesWritten: [
    { path: 'calculator.py', bytes: 214, sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41', origin: 'agent' },
  ],
  commands: [
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 1, 412, 'non-zero-exit'),
    command(['python3', '-m', 'brz_selftest'], 0, 187, 'ok'),
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 0, 398, 'ok'),
  ],
  finalTestRun: {
    command: TEST_COMMAND,
    exitCode: 0,
    passed: 2,
    total: 2,
    failedTests: [],
    output: SUCCESS_TEST_OUTPUT,
  },
  modelExplanation: SUCCESS_EXPLANATION,
  modelClaim: 'I updated `calculator.py` so the range includes `end`.',
  attempts: [
    {
      at: iso(SUCCESS_OFFSET + 640),
      capability: 'fetch',
      url: null,
      host: 'api.github.com',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'containment-probe',
      bytes: null,
      durationMs: 1,
    },
  ],
  allowlist: [],
  memoryPeakBytes: 41_246_720,
  memoryCapBytes: 134_217_728,
  cpuSeconds: measured(0.31),
  cpuCapSeconds: 60,
  maxProcessesObserved: 3,
  processCap: 64,
  outputBytes: 4821,
  wallClockMs: 3284,
  wallClockCapMs: 120_000,
  enforcement: 'cgroup+rlimit',
  killReason: null,
  capFired: false,
  lifecycle: {
    createdAt: 302,
    destroyedAt: 3211,
    verifiedGone: true,
    workDirRemoved: true,
    cgroupRemoved: true,
    teardownEvidence:
      'bwrap exited 0; cgroup brz-run_01JQ7YB3K4M2ZC0X9W6R8VN5TF removed (rmdir ok); work dir removed',
    leakedResources: [],
  },
  artifacts: [
    {
      label: 'final calculator.py',
      kind: 'text',
      content: CALCULATOR_FIXED,
      bytes: 214,
      sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41',
    },
    {
      label: 'first test run output',
      kind: 'text',
      content: FAILING_TEST_OUTPUT,
      bytes: 1093,
      sha256: '77de0a4c9b2f6e18d3c5a7b9e0f2d4c6a8b1e3f5d7c9a2b4e6f8d0c2a4b6e8f03b9',
    },
  ],
  stdout: SUCCESS_TEST_OUTPUT,
  stderr: '',
  timeline: [
    { at: iso(302), label: 'Sandbox created', kind: 'sandbox', detail: 'bwrap + cgroup v2, 128 MiB / 60 s / 64 pids' },
    {
      at: iso(560),
      label: 'Containment probe',
      kind: 'sandbox',
      detail: 'direct egress blocked (ENETUNREACH); 0 credential keys; 1 broker fetch denied',
    },
    { at: iso(900), label: 'Agent planned', kind: 'agent', detail: 'read the source, run the tests' },
    { at: iso(1892), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — AssertionError: 10 != 15' },
    { at: iso(2170), label: 'calculator.py rewritten', kind: 'tool', detail: '214 bytes' },
    { at: iso(2660), label: TEST_COMMAND, kind: 'tool', detail: 'exit 0 — 2 tests passed' },
    { at: iso(3250), label: 'Agent explained', kind: 'agent', detail: 'the range was exclusive; made it inclusive' },
    { at: iso(3211), label: 'Sandbox destroyed', kind: 'lifecycle', detail: 'verified gone; cgroup removed; work dir deleted' },
  ],
  eventCount: SUCCESS_EVENTS.length,
  eventDigest: 'sha256:4c1f9a2b7e5d0c38a6b1f4e9d2c7a0b5e8f3d1c6a9b2e5f8d0c3a6b9e2f5d8c88ad',
});

// ── fixture 2: the model could not fix it ───────────────────────────────────

const FAILURE_RUN_ID = 'run_01JQ7YB1A9F3PTQ2M8LKD4XZR7';
const FAILURE_SANDBOX_ID = 'sbx_01JQ7YB1KQ3MTZ8A';
const FAILURE_OFFSET = -4_200_000;

const FAILURE_EVENTS: readonly EventSeed[] = [
  { type: 'run.queued', phase: 'queued', label: 'Run accepted', at: 0 },
  { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 90 },
  { type: 'sandbox.created', phase: 'sandbox_starting', label: 'Sandbox created', detail: { provider: 'bwrap' }, at: 280 },
  { type: 'sandbox.probe', phase: 'containment_probe', label: 'Containment probe', detail: { directEgress: 'blocked', errno: 'ENETUNREACH' }, at: 470 },
  { type: 'egress.attempt', phase: 'containment_probe', label: 'Broker fetch denied', detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted' }, at: 540 },
  { type: 'agent.plan', phase: 'planning', label: 'Agent planned', detail: { summary: 'Run the suite and read the failure.' }, at: 780 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 900 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 388 }, at: 1288 },
  { type: 'agent.plan', phase: 'planning', label: 'Repair attempt 1 of 2', detail: { summary: 'Try an inclusive range.' }, at: 1360 },
  { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 1450 },
  { type: 'tool.result', phase: 'executing', label: 'write_file → 210 bytes', detail: { tool: 'write_file', ok: true, bytes: 210 }, at: 1510 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1590 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 401 }, at: 1991 },
  { type: 'agent.plan', phase: 'planning', label: 'Repair attempt 2 of 2', detail: { summary: 'Try widening the loop bounds.' }, at: 2060 },
  { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 2150 },
  { type: 'tool.result', phase: 'executing', label: 'write_file → 212 bytes', detail: { tool: 'write_file', ok: true, bytes: 212 }, at: 2210 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2290 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 377 }, at: 2667 },
  { type: 'agent.message', phase: 'reporting', label: 'Agent explained', detail: { bytes: 180 }, at: 2760 },
  { type: 'resource.sample', phase: 'reporting', label: 'Resource sample', detail: { memoryBytes: 38_273_024, cpuMs: 290, processes: 3 }, at: 2820 },
  { type: 'sandbox.destroyed', phase: 'teardown', label: 'Sandbox destroyed', detail: { verifiedGone: true, workDirRemoved: true, cgroupRemoved: true }, at: 2830 },
  {
    type: 'run.failed',
    phase: 'done',
    label: 'Run failed — repair budget exhausted',
    detail: { errorCode: 'repair_budget_exhausted', testsPassed: 1, testsTotal: 2 },
    at: 2840,
  },
];

const FAILURE_REPORT = buildReport({
  runId: FAILURE_RUN_ID,
  sandboxId: FAILURE_SANDBOX_ID,
  offset: FAILURE_OFFSET,
  verdict: 'contained-with-denials',
  headline:
    'Contained. 3 files changed, 1/2 tests green, 0 bytes left the sandbox, 1 network attempt denied, sandbox destroyed.',
  goal: DEMO_TASK,
  sourceRef: 'shr-sum-range',
  filesWritten: [
    { path: 'calculator.py', bytes: 210, sha256: '11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809', origin: 'agent' },
    { path: 'calculator.py', bytes: 212, sha256: '22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a', origin: 'agent' },
  ],
  commands: [
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 1, 388, 'non-zero-exit'),
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 1, 401, 'non-zero-exit'),
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 1, 377, 'non-zero-exit'),
  ],
  finalTestRun: {
    command: TEST_COMMAND,
    exitCode: 1,
    passed: 1,
    total: 2,
    failedTests: [
      {
        test: 'tests.test_calculator.TestSumRange.test_inclusive',
        message: 'AssertionError: 10 != 15',
        traceback:
          '  File "/work/tests/test_calculator.py", line 7, in test_inclusive\n    self.assertEqual(sum_range(1, 5), 15)\nAssertionError: 10 != 15',
      },
    ],
    output: FAILING_TEST_OUTPUT,
  },
  modelExplanation:
    'I could not make the suite pass. The first test expects 15 for (1, 5) and the function still returns 10 after two attempts, so the inclusive-range change did not take effect as I expected. The sandbox reports the suite is still red.',
  modelClaim: 'I rewrote `calculator.py` twice and believe the range is now inclusive.',
  attempts: [
    {
      at: iso(FAILURE_OFFSET + 540),
      capability: 'fetch',
      url: null,
      host: 'api.github.com',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'containment-probe',
      bytes: null,
      durationMs: 1,
    },
  ],
  allowlist: [],
  memoryPeakBytes: 38_273_024,
  memoryCapBytes: 134_217_728,
  cpuSeconds: measured(0.29),
  cpuCapSeconds: 60,
  maxProcessesObserved: 3,
  processCap: 64,
  outputBytes: 6120,
  wallClockMs: 2841,
  wallClockCapMs: 120_000,
  enforcement: 'cgroup+rlimit',
  killReason: null,
  capFired: false,
  lifecycle: {
    createdAt: 240,
    destroyedAt: 2830,
    verifiedGone: true,
    workDirRemoved: true,
    cgroupRemoved: true,
    teardownEvidence: 'bwrap exited 0; cgroup removed (rmdir ok); work dir removed',
    leakedResources: [],
  },
  artifacts: [
    {
      label: 'final calculator.py',
      kind: 'text',
      content: `def sum_range(start, end):
    """Return the sum of the integers from start to end, inclusive."""
    return sum(range(start, end))
`,
      bytes: 212,
      sha256: '22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a',
    },
  ],
  stdout: FAILING_TEST_OUTPUT,
  stderr: '',
  timeline: [
    { at: iso(240), label: 'Sandbox created', kind: 'sandbox', detail: 'bwrap + cgroup v2' },
    { at: iso(470), label: 'Containment probe', kind: 'sandbox', detail: 'direct egress blocked (ENETUNREACH)' },
    { at: iso(1288), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — AssertionError: 10 != 15' },
    { at: iso(1991), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — still 10 != 15' },
    { at: iso(2667), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — repair budget spent' },
    { at: iso(2760), label: 'Agent explained', kind: 'agent', detail: 'the suite is still red' },
    { at: iso(2830), label: 'Sandbox destroyed', kind: 'lifecycle', detail: 'verified gone' },
  ],
  eventCount: FAILURE_EVENTS.length,
  eventDigest: 'sha256:9d2c7a1b4e6f0c38a5b9d2e7f0a3c6b9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f401',
});

// ── fixture 3: the memory cap fired ─────────────────────────────────────────

const CAP_RUN_ID = 'run_01JQ7YAV7C2D5NR8KJFW0BHQE4';
const CAP_SANDBOX_ID = 'sbx_01JQ7YAV2X9P4RDC';
const CAP_OFFSET = -6_600_000;

const CAP_EVENTS: readonly EventSeed[] = [
  { type: 'run.queued', phase: 'queued', label: 'Run accepted', at: 0 },
  { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 110 },
  {
    type: 'sandbox.created',
    phase: 'sandbox_starting',
    label: 'Sandbox created',
    detail: { provider: 'bwrap', enforcement: 'cgroup+rlimit', memoryCapBytes: 134_217_728 },
    at: 300,
  },
  { type: 'sandbox.probe', phase: 'containment_probe', label: 'Containment probe', detail: { directEgress: 'blocked', errno: 'ENETUNREACH' }, at: 520 },
  { type: 'egress.attempt', phase: 'containment_probe', label: 'Broker fetch denied', detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted' }, at: 590 },
  { type: 'agent.plan', phase: 'planning', label: 'Agent planned', detail: { summary: 'Read the source and run the suite.' }, at: 820 },
  { type: 'tool.call', phase: 'executing', label: 'read_file calculator.py', detail: { tool: 'read_file', path: 'calculator.py' }, at: 940 },
  { type: 'tool.result', phase: 'executing', label: 'read_file → 214 bytes', detail: { tool: 'read_file', ok: true, bytes: 214 }, at: 1000 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1080 },
  {
    type: 'tool.result',
    phase: 'executing',
    label: 'run_tests → killed (exit 137)',
    detail: { tool: 'run_tests', ok: false, exitCode: 137, killReason: 'memory-cap', durationMs: 1840 },
    at: 2920,
  },
  {
    type: 'resource.sample',
    phase: 'executing',
    label: 'Resource sample — cap fired',
    detail: { memoryBytes: 134_217_728, oomKill: 1, cpuMs: 61_400, processes: 4 },
    at: 2940,
  },
  {
    type: 'sandbox.destroyed',
    phase: 'teardown',
    label: 'Sandbox destroyed',
    detail: { verifiedGone: true, workDirRemoved: true, cgroupRemoved: true },
    at: 2960,
  },
  {
    type: 'run.failed',
    phase: 'done',
    label: 'Run failed — sandbox killed by the memory cap',
    detail: { errorCode: 'sandbox_error', killReason: 'memory-cap' },
    at: 2970,
  },
];

const CAP_REPORT = buildReport({
  runId: CAP_RUN_ID,
  sandboxId: CAP_SANDBOX_ID,
  offset: CAP_OFFSET,
  verdict: 'contained-with-denials',
  headline:
    'Contained. The sandbox was killed by the memory cap at 128 MiB, 0 bytes left the sandbox, 1 network attempt denied, sandbox destroyed.',
  goal: DEMO_TASK,
  sourceRef: 'shr-sum-range',
  filesWritten: [],
  commands: [
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 137, 1840, 'killed', {
      signal: 'SIGKILL',
      killReason: 'memory-cap',
    }),
  ],
  finalTestRun: null,
  modelExplanation:
    'The run did not finish. The test command was killed by the sandbox memory limit before it produced any output, so no repair was attempted.',
  modelClaim: 'I was about to rewrite the range expression when the sandbox was killed.',
  attempts: [
    {
      at: iso(CAP_OFFSET + 590),
      capability: 'fetch',
      url: null,
      host: 'api.github.com',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'containment-probe',
      bytes: null,
      durationMs: 1,
    },
  ],
  allowlist: [],
  memoryPeakBytes: 134_217_728,
  memoryCapBytes: 134_217_728,
  // The sandbox was OOM-killed and the cgroup was torn down at once, so the
  // CPU accounting was never read back. The report says "not measured" with
  // a reason — it never claims a zero it did not observe.
  cpuSeconds: notMeasured('the cgroup was removed at teardown before cpu.stat could be read back'),
  cpuCapSeconds: 60,
  maxProcessesObserved: 4,
  processCap: 64,
  outputBytes: 0,
  wallClockMs: 2971,
  wallClockCapMs: 120_000,
  enforcement: 'cgroup+rlimit',
  killReason: 'memory-cap',
  capFired: true,
  lifecycle: {
    createdAt: 260,
    destroyedAt: 2960,
    verifiedGone: true,
    workDirRemoved: true,
    cgroupRemoved: true,
    teardownEvidence: 'bwrap exited 137; cgroup removed after memory.events reported oom_kill 1; work dir removed',
    leakedResources: [],
  },
  artifacts: [],
  stdout: '',
  stderr: 'Killed: memory cgroup limit reached (oom_kill 1)',
  timeline: [
    { at: iso(260), label: 'Sandbox created', kind: 'sandbox', detail: 'bwrap + cgroup v2, 128 MiB cap' },
    { at: iso(520), label: 'Containment probe', kind: 'sandbox', detail: 'direct egress blocked (ENETUNREACH)' },
    { at: iso(2920), label: TEST_COMMAND, kind: 'tool', detail: 'killed by the memory cap — exit 137' },
    { at: iso(2940), label: 'Memory cap fired', kind: 'resource', detail: 'peak 128 MiB against a 128 MiB cap' },
    { at: iso(2960), label: 'Sandbox destroyed', kind: 'lifecycle', detail: 'verified gone; cgroup removed' },
  ],
  eventCount: CAP_EVENTS.length,
  eventDigest: 'sha256:5b8e2d0f7a3c6b19e4d7a0c3f6b9e2d5a8c1f4b7e0d3a6c9f2b5e8d1a4c7f0b322',
});


// ── fixture 0: the stand-in world — what the system returns TODAY ────────────
//
// The only provider that exists right now is the non-sealed stand-in. It runs
// as a plain child process on the host: no namespaces, no cgroup, no network
// namespace, no scrubbed environment. Its report is `incomplete` because it
// measures nothing, and every containment fact is `not-measured` with a reason.
//
// This is the case that is actually on screen. It is also the case the HEAD
// asked to be first-class: `incomplete` must read as honesty ("this build
// does not claim what it has not measured"), not as a failure, and
// `not-measured` must look structurally different from a real zero.

const STANDIN_RUN_ID = 'run_01JQ7YB7STND000000000000';
const STANDIN_SANDBOX_ID = 'sbx_01JQ7YB7STND0000';
const STANDIN_OFFSET = -8_400_000;

const STANDIN_TEST_OUTPUT = `test_inclusive (tests.test_calculator.TestSumRange) ... ok
test_single (tests.test_calculator.TestSumRange) ... ok

----------------------------------------------------------------------
Ran 2 tests in 0.001s

OK
`;

const STANDIN_EXPLANATION = `\`sum_range\` used \`range(start, end)\`, which excludes \`end\`. I changed it to \`range(start, end + 1)\` so the range is inclusive.

Both tests pass. This run used the stand-in provider, so containment was not measured.`;

const STANDIN_EVENTS: readonly EventSeed[] = [
  { type: 'run.queued', phase: 'queued', label: 'Run accepted', at: 0 },
  { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 90 },
  { type: 'sandbox.created', phase: 'sandbox_starting', label: 'Sandbox created', detail: { provider: 'standin', enforcement: 'rlimit-only' }, at: 220 },
  { type: 'agent.plan', phase: 'planning', label: 'Agent planned', detail: { summary: 'Read the source, run the failing suite, fix the cause.' }, at: 480 },
  { type: 'tool.call', phase: 'executing', label: 'read_file calculator.py', detail: { tool: 'read_file', path: 'calculator.py' }, at: 600 },
  { type: 'tool.result', phase: 'executing', label: 'read_file → 214 bytes', detail: { tool: 'read_file', ok: true, bytes: 214 }, at: 660 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 740 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 390 }, at: 1130 },
  { type: 'agent.plan', phase: 'planning', label: 'Repair attempt 1 of 2', detail: { summary: 'The range is exclusive; make it inclusive.' }, at: 1210 },
  { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 1300 },
  { type: 'tool.result', phase: 'executing', label: 'write_file → 214 bytes', detail: { tool: 'write_file', ok: true, bytes: 214 }, at: 1360 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1450 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 1845 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests (verification)', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1930 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 2325 },
  { type: 'agent.message', phase: 'reporting', label: 'Agent explained', detail: { bytes: STANDIN_EXPLANATION.length }, at: 2420 },
  { type: 'resource.sample', phase: 'reporting', label: 'Resource sample', detail: { memoryBytes: 39_845_888, cpuMs: 260, processes: 3 }, at: 2470 },
  { type: 'sandbox.destroyed', phase: 'teardown', label: 'Sandbox destroyed', detail: { verifiedGone: true, workDirRemoved: true, cgroupRemoved: false }, at: 2480 },
  { type: 'run.completed', phase: 'done', label: 'Run succeeded', detail: { verdict: 'incomplete', testsPassed: 2, testsTotal: 2 }, at: 2490 },
];

const STANDIN_REPORT = buildReport({
  runId: STANDIN_RUN_ID,
  sandboxId: STANDIN_SANDBOX_ID,
  offset: STANDIN_OFFSET,
  verdict: 'incomplete',
  standin: true,
  headline:
    'Containment not measured. 1 file changed, 2/2 tests passed, egress not measured (0 attempts recorded), sandbox destroyed.',
  goal: DEMO_TASK,
  sourceRef: 'shr-sum-range',
  filesWritten: [
    { path: 'calculator.py', bytes: 214, sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41', origin: 'agent' },
  ],
  commands: [
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 0, 390, 'ok'),
  ],
  finalTestRun: {
    command: TEST_COMMAND,
    exitCode: 0,
    passed: 2,
    total: 2,
    failedTests: [],
    output: STANDIN_TEST_OUTPUT,
  },
  modelExplanation: STANDIN_EXPLANATION,
  modelClaim: 'I updated `calculator.py` so the range includes `end`.',
  attempts: [],
  allowlist: [],
  memoryPeakBytes: 39_845_888,
  memoryCapBytes: 134_217_728,
  cpuSeconds: measured(0.26),
  cpuCapSeconds: 60,
  maxProcessesObserved: 3,
  processCap: 64,
  outputBytes: 4_102,
  wallClockMs: 2_491,
  wallClockCapMs: 120_000,
  enforcement: 'rlimit-only',
  killReason: null,
  capFired: false,
  lifecycle: {
    createdAt: 180,
    destroyedAt: 2480,
    verifiedGone: true,
    workDirRemoved: true,
    cgroupRemoved: false,
    teardownEvidence:
      'stand-in exited 0; cgroup was never created (stand-in has none); work dir removed',
    leakedResources: [],
  },
  artifacts: [
    {
      label: 'final calculator.py',
      kind: 'text',
      content: CALCULATOR_FIXED,
      bytes: 214,
      sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41',
    },
  ],
  stdout: STANDIN_TEST_OUTPUT,
  stderr: '',
  timeline: [
    { at: iso(180), label: 'Sandbox created', kind: 'sandbox', detail: 'stand-in (no namespaces, no cgroup, rlimits only)' },
    { at: iso(480), label: 'Agent planned', kind: 'agent', detail: 'read the source, run the tests' },
    { at: iso(1130), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — AssertionError: 10 != 15' },
    { at: iso(1360), label: 'calculator.py rewritten', kind: 'tool', detail: '214 bytes' },
    { at: iso(1845), label: TEST_COMMAND, kind: 'tool', detail: 'exit 0 — 2 tests passed' },
    { at: iso(2420), label: 'Agent explained', kind: 'agent', detail: 'the range was exclusive; made it inclusive' },
    { at: iso(2480), label: 'Sandbox destroyed', kind: 'lifecycle', detail: 'verified gone; work dir deleted; no cgroup existed' },
  ],
  eventCount: STANDIN_EVENTS.length,
  eventDigest: 'sha256:1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809',
});

// ── fixture 4: the containment moment — the agent tried, and was refused ─────

const EGRESS_RUN_ID = 'run_01JQ7YBX3M6WSD0TQ2K9ZR5NPA';
const EGRESS_SANDBOX_ID = 'sbx_01JQ7YBX7TLM0Q3E';
const EGRESS_OFFSET = -1_800_000;

const SELFTEST_OUTPUT = `containment probe (inside the sandbox)
  direct egress   : blocked (ENETUNREACH)
  environment     : HOME LANG PATH PWD
  root entries    : bin dev etc lib lib64 proc sbin tmp usr work
  broker socket   : reachable
  brokered fetch  : DENIED — host_not_allowlisted (api.github.com)
`;

const EGRESS_EVENTS: readonly EventSeed[] = [
  { type: 'run.queued', phase: 'queued', label: 'Run accepted', at: 0 },
  { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 100 },
  { type: 'sandbox.created', phase: 'sandbox_starting', label: 'Sandbox created', detail: { provider: 'bwrap', enforcement: 'cgroup+rlimit' }, at: 310 },
  {
    type: 'sandbox.probe',
    phase: 'containment_probe',
    label: 'Containment probe',
    detail: { directEgress: 'blocked', errno: 'ENETUNREACH', credentialShapedKeys: 0, deniedEgress: 1 },
    at: 540,
  },
  {
    type: 'egress.attempt',
    phase: 'containment_probe',
    label: 'Broker fetch denied',
    detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted' },
    at: 610,
  },
  { type: 'agent.plan', phase: 'planning', label: 'Agent planned', detail: { summary: 'Check the sandbox, then read the source and run the suite.' }, at: 880 },
  { type: 'tool.call', phase: 'executing', label: 'list_files', detail: { tool: 'list_files' }, at: 990 },
  { type: 'tool.result', phase: 'executing', label: 'list_files → 3 files', detail: { tool: 'list_files', ok: true }, at: 1050 },
  { type: 'tool.call', phase: 'executing', label: 'read_file calculator.py', detail: { tool: 'read_file', path: 'calculator.py' }, at: 1140 },
  { type: 'tool.result', phase: 'executing', label: 'read_file → 214 bytes', detail: { tool: 'read_file', ok: true, bytes: 214 }, at: 1210 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests (self-test)', detail: { tool: 'run_tests', command: SELFTEST_COMMAND }, at: 1300 },
  {
    type: 'tool.result',
    phase: 'executing',
    label: 'run_tests → exit 0, fetch denied',
    detail: { tool: 'run_tests', ok: true, exitCode: 0, denied: 1, durationMs: 187 },
    at: 1487,
  },
  {
    type: 'egress.attempt',
    phase: 'executing',
    label: 'Agent fetch denied',
    detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted', origin: 'agent' },
    at: 1500,
  },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1600 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1, durationMs: 405 }, at: 2005 },
  { type: 'agent.plan', phase: 'planning', label: 'Repair attempt 1 of 2', detail: { summary: 'The range is exclusive; make it inclusive.' }, at: 2090 },
  { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 2200 },
  { type: 'tool.result', phase: 'executing', label: 'write_file → 214 bytes', detail: { tool: 'write_file', ok: true, bytes: 214 }, at: 2260 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2350 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 2755 },
  { type: 'tool.call', phase: 'executing', label: 'run_tests (verification)', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2840 },
  { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 3240 },
  { type: 'agent.message', phase: 'reporting', label: 'Agent explained', detail: { bytes: 320 }, at: 3340 },
  { type: 'resource.sample', phase: 'reporting', label: 'Resource sample', detail: { memoryBytes: 42_991_616, cpuMs: 340, processes: 3 }, at: 3390 },
  { type: 'sandbox.destroyed', phase: 'teardown', label: 'Sandbox destroyed', detail: { verifiedGone: true, workDirRemoved: true, cgroupRemoved: true }, at: 3400 },
  {
    type: 'run.completed',
    phase: 'done',
    label: 'Run succeeded',
    detail: { verdict: 'contained-with-denials', testsPassed: 2, testsTotal: 2, deniedEgress: 2 },
    at: 3410,
  },
];

const EGRESS_REPORT = buildReport({
  runId: EGRESS_RUN_ID,
  sandboxId: EGRESS_SANDBOX_ID,
  offset: EGRESS_OFFSET,
  verdict: 'contained-with-denials',
  headline:
    'Contained. 1 file changed, 2/2 tests green, 0 bytes left the sandbox, 2 network attempts denied, sandbox destroyed.',
  goal: DEMO_TASK,
  sourceRef: 'shr-sum-range',
  filesWritten: [
    { path: 'calculator.py', bytes: 214, sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41', origin: 'agent' },
  ],
  commands: [
    command(['python3', '-m', 'brz_selftest'], 0, 187, 'ok'),
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 1, 405, 'non-zero-exit'),
    command(['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-v'], 0, 391, 'ok'),
  ],
  finalTestRun: {
    command: TEST_COMMAND,
    exitCode: 0,
    passed: 2,
    total: 2,
    failedTests: [],
    output: SUCCESS_TEST_OUTPUT,
  },
  modelExplanation: `The sandbox's own self-test confirmed it has no network: the direct probe failed with \`ENETUNREACH\` and the broker refused a fetch of \`api.github.com\` because the host is not allowlisted. I carried on with the repair.

**What I changed**

| File | Change |
| --- | --- |
| \`calculator.py\` | \`sum(range(start, end))\` → \`sum(range(start, end + 1))\` |

Both tests pass. The refusal is expected — the egress allowlist is empty, so every fetch is denied.`,
  modelClaim: 'I updated `calculator.py` so the range includes `end`.',
  attempts: [
    {
      at: iso(EGRESS_OFFSET + 610),
      capability: 'fetch',
      url: null,
      host: 'api.github.com',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'containment-probe',
      bytes: null,
      durationMs: 1,
    },
    {
      at: iso(EGRESS_OFFSET + 1500),
      capability: 'fetch',
      url: null,
      host: 'api.github.com',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'agent',
      bytes: null,
      durationMs: 2,
    },
  ],
  allowlist: [],
  memoryPeakBytes: 42_991_616,
  memoryCapBytes: 134_217_728,
  cpuSeconds: measured(0.34),
  cpuCapSeconds: 60,
  maxProcessesObserved: 3,
  processCap: 64,
  outputBytes: 7310,
  wallClockMs: 3412,
  wallClockCapMs: 120_000,
  enforcement: 'cgroup+rlimit',
  killReason: null,
  capFired: false,
  lifecycle: {
    createdAt: 270,
    destroyedAt: 3400,
    verifiedGone: true,
    workDirRemoved: true,
    cgroupRemoved: true,
    teardownEvidence: 'bwrap exited 0; cgroup removed (rmdir ok); work dir removed',
    leakedResources: [],
  },
  artifacts: [
    {
      label: 'sandbox self-test output',
      kind: 'text',
      content: SELFTEST_OUTPUT,
      bytes: 312,
      sha256: '0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
    },
    {
      label: 'final calculator.py',
      kind: 'text',
      content: CALCULATOR_FIXED,
      bytes: 214,
      sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41',
    },
  ],
  stdout: SUCCESS_TEST_OUTPUT,
  stderr: '',
  timeline: [
    { at: iso(270), label: 'Sandbox created', kind: 'sandbox', detail: 'bwrap + cgroup v2, 128 MiB / 60 s / 64 pids' },
    { at: iso(540), label: 'Containment probe', kind: 'sandbox', detail: 'direct egress blocked (ENETUNREACH); 0 credential keys' },
    { at: iso(610), label: 'Broker fetch denied', kind: 'egress', detail: 'api.github.com — host_not_allowlisted' },
    { at: iso(1487), label: 'Sandbox self-test', kind: 'tool', detail: 'the agent’s own code confirmed the box is sealed' },
    { at: iso(1500), label: 'Agent fetch denied', kind: 'egress', detail: 'api.github.com — host_not_allowlisted' },
    { at: iso(2005), label: TEST_COMMAND, kind: 'tool', detail: 'exit 1 — AssertionError: 10 != 15' },
    { at: iso(2755), label: TEST_COMMAND, kind: 'tool', detail: 'exit 0 — 2 tests passed' },
    { at: iso(3340), label: 'Agent explained', kind: 'agent', detail: 'the range was exclusive; made it inclusive' },
    { at: iso(3400), label: 'Sandbox destroyed', kind: 'lifecycle', detail: 'verified gone; cgroup removed; work dir deleted' },
  ],
  eventCount: EGRESS_EVENTS.length,
  eventDigest: 'sha256:7c1b4e8a0d2f5b39c6a9e2d7f0b4c8a1e5d9b3f7c2a6e0d4b8f1c5a9e3d7b0c4',
});

// ── the dataset ─────────────────────────────────────────────────────────────

export interface FixtureRun {
  readonly run: RunDetail;
  readonly events: readonly RunEvent[];
  readonly report: BlastRadiusReport | null;
}

function runDetail(seed: {
  readonly runId: string;
  readonly sandboxId: string;
  readonly offset: number;
  readonly status: RunStatus;
  readonly verdict: BlastRadiusVerdict;
  readonly durationMs: number;
  readonly testPassed: boolean | null;
  readonly testTotal: number | null;
  readonly errorCode: string | null;
  readonly explanation: string;
  readonly toolCalls: number;
  readonly iterations: number;
  readonly totalTokens: number;
  readonly deniedEgressAttempts: number;
}): RunDetail {
  return {
    runId: seed.runId,
    status: seed.status,
    phase: 'done',
    workload: 'self-healing-runner',
    goal: DEMO_TASK,
    createdAt: iso(seed.offset),
    finishedAt: iso(seed.offset + seed.durationMs),
    durationMs: seed.durationMs,
    verdict: seed.verdict,
    testPassed: seed.testPassed,
    testTotal: seed.testTotal,
    errorCode: seed.errorCode,
    updatedAt: iso(seed.offset + seed.durationMs),
    sourceKind: 'fixture',
    sourceRef: 'shr-sum-range',
    provider: 'bwrap',
    sandboxId: seed.sandboxId,
    modelExplanation: seed.explanation,
    iterations: seed.iterations,
    toolCalls: seed.toolCalls,
    totalTokens: seed.totalTokens,
    deniedEgressAttempts: seed.deniedEgressAttempts,
  };
}

export const FIXTURE_RUNS: readonly FixtureRun[] = [
  {
    run: runDetail({
      runId: SUCCESS_RUN_ID,
      sandboxId: SUCCESS_SANDBOX_ID,
      offset: SUCCESS_OFFSET,
      status: 'succeeded',
      verdict: 'contained-with-denials',
      durationMs: 3284,
      testPassed: true,
      testTotal: 2,
      errorCode: null,
      explanation: SUCCESS_EXPLANATION,
      toolCalls: 8,
      iterations: 5,
      totalTokens: 1840,
      deniedEgressAttempts: 1,
    }),
    events: buildEvents(SUCCESS_RUN_ID, SUCCESS_EVENTS),
    report: SUCCESS_REPORT,
  },
  {
    run: runDetail({
      runId: EGRESS_RUN_ID,
      sandboxId: EGRESS_SANDBOX_ID,
      offset: EGRESS_OFFSET,
      status: 'succeeded',
      verdict: 'contained-with-denials',
      durationMs: 3412,
      testPassed: true,
      testTotal: 2,
      errorCode: null,
      explanation: EGRESS_REPORT.code.modelExplanation,
      toolCalls: 9,
      iterations: 6,
      totalTokens: 2110,
      deniedEgressAttempts: 2,
    }),
    events: buildEvents(EGRESS_RUN_ID, EGRESS_EVENTS),
    report: EGRESS_REPORT,
  },
  {
    run: runDetail({
      runId: FAILURE_RUN_ID,
      sandboxId: FAILURE_SANDBOX_ID,
      offset: FAILURE_OFFSET,
      status: 'failed',
      verdict: 'contained-with-denials',
      durationMs: 2841,
      testPassed: false,
      testTotal: 2,
      errorCode: 'repair_budget_exhausted',
      explanation: FAILURE_REPORT.code.modelExplanation,
      toolCalls: 6,
      iterations: 7,
      totalTokens: 2460,
      deniedEgressAttempts: 1,
    }),
    events: buildEvents(FAILURE_RUN_ID, FAILURE_EVENTS),
    report: FAILURE_REPORT,
  },
  {
    run: runDetail({
      runId: CAP_RUN_ID,
      sandboxId: CAP_SANDBOX_ID,
      offset: CAP_OFFSET,
      status: 'failed',
      verdict: 'contained-with-denials',
      durationMs: 2971,
      testPassed: null,
      testTotal: null,
      errorCode: 'sandbox_error',
      explanation: CAP_REPORT.code.modelExplanation,
      toolCalls: 3,
      iterations: 3,
      totalTokens: 810,
      deniedEgressAttempts: 1,
    }),
    events: buildEvents(CAP_RUN_ID, CAP_EVENTS),
    report: CAP_REPORT,
  },
  {
    run: runDetail({
      runId: STANDIN_RUN_ID,
      sandboxId: STANDIN_SANDBOX_ID,
      offset: STANDIN_OFFSET,
      status: 'succeeded',
      verdict: 'incomplete',
      durationMs: 2491,
      testPassed: true,
      testTotal: 2,
      errorCode: null,
      explanation: STANDIN_REPORT.code.modelExplanation,
      toolCalls: 7,
      iterations: 4,
      totalTokens: 1520,
      deniedEgressAttempts: 0,
    }),
    events: buildEvents(STANDIN_RUN_ID, STANDIN_EVENTS),
    report: STANDIN_REPORT,
  },
];

// ── the fixture transport ───────────────────────────────────────────────────

interface SimulatedRun {
  run: RunDetail;
  events: RunEvent[];
  report: BlastRadiusReport | null;
  cursor: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** The scripted event stream for a run submitted in fixture mode. */
function scriptedEvents(runId: string, startedAt: string): RunEvent[] {
  const seeds: EventSeed[] = [
    { type: 'run.queued', phase: 'queued', label: 'Run accepted', at: 0 },
    { type: 'run.started', phase: 'sandbox_starting', label: 'Run started', at: 120 },
    {
      type: 'sandbox.created',
      phase: 'sandbox_starting',
      label: 'Sandbox created',
      detail: { provider: 'bwrap', enforcement: 'cgroup+rlimit' },
      at: 320,
    },
    {
      type: 'sandbox.probe',
      phase: 'containment_probe',
      label: 'Containment probe',
      detail: { directEgress: 'blocked', errno: 'ENETUNREACH', credentialShapedKeys: 0 },
      at: 540,
    },
    {
      type: 'egress.attempt',
      phase: 'containment_probe',
      label: 'Broker fetch denied',
      detail: { capability: 'fetch', host: 'api.github.com', verdict: 'denied', reason: 'host_not_allowlisted' },
      at: 610,
    },
    { type: 'agent.plan', phase: 'planning', label: 'Agent planned', at: 880 },
    { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 980 },
    { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 1', detail: { tool: 'run_tests', ok: false, exitCode: 1 }, at: 1390 },
    { type: 'agent.plan', phase: 'planning', label: 'Repair attempt 1 of 2', at: 1480 },
    { type: 'tool.call', phase: 'executing', label: 'write_file calculator.py', detail: { tool: 'write_file', path: 'calculator.py' }, at: 1580 },
    { type: 'tool.result', phase: 'executing', label: 'write_file → 214 bytes', detail: { tool: 'write_file', ok: true, bytes: 214 }, at: 1650 },
    { type: 'tool.call', phase: 'executing', label: 'run_tests', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 1740 },
    { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 2140 },
    { type: 'tool.call', phase: 'executing', label: 'run_tests (verification)', detail: { tool: 'run_tests', command: TEST_COMMAND }, at: 2230 },
    { type: 'tool.result', phase: 'executing', label: 'run_tests → exit 0, 2/2 passed', detail: { tool: 'run_tests', ok: true, exitCode: 0, passed: 2, total: 2 }, at: 2625 },
    { type: 'agent.message', phase: 'reporting', label: 'Agent explained', at: 2720 },
    { type: 'resource.sample', phase: 'reporting', label: 'Resource sample', detail: { memoryBytes: 41_246_720 }, at: 2770 },
    { type: 'sandbox.destroyed', phase: 'teardown', label: 'Sandbox destroyed', detail: { verifiedGone: true }, at: 2780 },
    { type: 'run.completed', phase: 'done', label: 'Run succeeded', detail: { verdict: 'contained-with-denials' }, at: 2790 },
  ];
  const start = Date.parse(startedAt);
  return seeds.map((seed, index) => ({
    seq: index + 1,
    runId,
    at: new Date(start + seed.at).toISOString(),
    type: seed.type,
    phase: seed.phase,
    label: seed.label,
    detail: seed.detail ?? {},
  }));
}

function scriptedReport(runId: string, sandboxId: string, startedAt: string): BlastRadiusReport {
  const base = Date.parse(startedAt);
  return {
    ...SUCCESS_REPORT,
    runId,
    generatedAt: new Date(base + 2880).toISOString(),
    code: {
      ...SUCCESS_REPORT.code,
      filesWritten: [
        {
          path: 'calculator.py',
          bytes: 214,
          sha256: '9f2c4e1a7b0d3c8e5f61a2d4b7c9e0f3a5d8b1c4e7f0a3d6b9c2e5f8a1d4b7c0a41',
          origin: 'agent',
        },
      ],
    },
    containment: {
      ...SUCCESS_REPORT.containment,
      lifecycle: measured({
        sandboxId,
        provider: 'bwrap',
        createdAt: new Date(base + 320).toISOString(),
        destroyedAt: new Date(base + 2780).toISOString(),
        verifiedGone: true,
        workDirRemoved: true,
        cgroupRemoved: true,
      }),
    },
    lifecycle: {
      ...SUCCESS_REPORT.lifecycle,
      sandboxId,
      createdAt: new Date(base + 320).toISOString(),
      destroyedAt: new Date(base + 2780).toISOString(),
    },
    evidence: { ...SUCCESS_REPORT.evidence, eventCount: 19 },
  };
}

/**
 * The fixture transport. It implements the same operations as the HTTP client,
 * so every component above it is unaware of whether a server answered.
 */
export class FixtureApi implements BrzApi {
  readonly kind = 'fixtures' as const;

  private readonly seeded: Map<string, FixtureRun>;
  private readonly simulated: Map<string, SimulatedRun>;

  constructor(seeded: readonly FixtureRun[] = FIXTURE_RUNS) {
    this.seeded = new Map(seeded.map((entry) => [entry.run.runId, entry]));
    this.simulated = new Map();
  }

  async listRuns(): Promise<ListRunsResponse> {
    await sleep(60);
    const runs = [
      ...Array.from(this.simulated.values()).map((entry) => entry.run),
      ...Array.from(this.seeded.values()).map((entry) => entry.run),
    ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return { runs, nextCursor: null };
  }

  async getRun(runId: string): Promise<GetRunResponse> {
    await sleep(40);
    const run = this.find(runId);
    if (run === null) {
      throw new ApiError('api', 'run_not_found', 'No such run.', 404, null);
    }
    return { run };
  }

  async submitRun(request: SubmitRunRequest): Promise<SubmitRunResponse> {
    await sleep(120);
    const runId = newRunId();
    const sandboxId = newSandboxId();
    const createdAt = new Date().toISOString();
    const events = scriptedEvents(runId, createdAt);
    const run: RunDetail = {
      runId,
      status: 'queued',
      phase: 'queued',
      workload: request.workload,
      goal: request.task,
      createdAt,
      finishedAt: null,
      durationMs: null,
      verdict: null,
      testPassed: null,
      testTotal: null,
      errorCode: null,
      updatedAt: createdAt,
      sourceKind: request.source.kind,
      sourceRef: request.source.kind === 'fixture' ? request.source.fixtureId : 'operator-files',
      provider: 'bwrap',
      sandboxId,
      modelExplanation: null,
      iterations: 0,
      toolCalls: 0,
      totalTokens: 0,
      deniedEgressAttempts: 0,
    };
    this.simulated.set(runId, {
      run,
      events,
      report: null,
      cursor: 0,
    });
    return { runId, status: 'queued', createdAt };
  }

  async listEvents(runId: string, after?: number): Promise<ListEventsResponse> {
    const simulated = this.simulated.get(runId);
    if (simulated !== undefined) {
      // A live run: release the next slice of the script on every poll.
      if (!prefersReducedMotion()) await sleep(420);
      const batch = simulated.events.slice(simulated.cursor, simulated.cursor + 2);
      simulated.cursor += batch.length;
      const finished = simulated.cursor >= simulated.events.length;
      const lastEvent = batch[batch.length - 1];
      if (lastEvent !== undefined) {
        const phase = finished ? 'done' : lastEvent.phase;
        const status: RunStatus = finished ? 'succeeded' : 'running';
        simulated.run = {
          ...simulated.run,
          status,
          phase,
          updatedAt: new Date().toISOString(),
        };
      }
      if (finished) {
        const report = scriptedReport(runId, simulated.run.sandboxId ?? 'sbx_0000000000000000', simulated.run.createdAt);
        simulated.report = report;
        simulated.run = {
          ...simulated.run,
          status: 'succeeded',
          phase: 'done',
          verdict: report.verdict,
          testPassed: true,
          testTotal: 2,
          durationMs: 2880,
          finishedAt: report.generatedAt,
          updatedAt: report.generatedAt,
          modelExplanation: report.code.modelExplanation,
          iterations: 5,
          toolCalls: 8,
          totalTokens: 1840,
          deniedEgressAttempts: 1,
        };
      }
      return {
        events: batch,
        nextCursor: finished ? null : (batch[batch.length - 1]?.seq ?? null),
        runStatus: simulated.run.status,
        runPhase: simulated.run.phase,
      };
    }

    const seeded = this.seeded.get(runId);
    if (seeded === undefined) {
      throw new ApiError('api', 'run_not_found', 'No such run.', 404, null);
    }
    const from = after === undefined ? 0 : seeded.events.findIndex((event) => event.seq > after);
    const start = from < 0 ? seeded.events.length : from;
    return {
      events: seeded.events.slice(start),
      nextCursor: null,
      runStatus: seeded.run.status,
      runPhase: seeded.run.phase,
    };
  }

  async getReport(runId: string): Promise<GetReportResponse> {
    const simulated = this.simulated.get(runId);
    if (simulated !== undefined) {
      if (simulated.report === null) {
        throw new ApiError('api', 'report_not_ready', 'The report is not ready yet.', 409, null);
      }
      return { report: simulated.report };
    }
    const seeded = this.seeded.get(runId);
    if (seeded === undefined) {
      throw new ApiError('api', 'run_not_found', 'No such run.', 404, null);
    }
    if (seeded.report === null) {
      throw new ApiError('api', 'report_not_ready', 'The report is not ready yet.', 409, null);
    }
    return { report: seeded.report };
  }

  async cancelRun(runId: string): Promise<CancelRunResponse> {
    const simulated = this.simulated.get(runId);
    if (simulated !== undefined) {
      simulated.run = { ...simulated.run, status: 'cancelled', phase: 'done', updatedAt: new Date().toISOString() };
      return { runId, status: 'cancelled' };
    }
    const seeded = this.seeded.get(runId);
    if (seeded === undefined) {
      throw new ApiError('api', 'run_not_found', 'No such run.', 404, null);
    }
    throw new ApiError('api', 'run_not_cancellable', 'That run has already finished.', 409, null);
  }

  async listWorkloads(): Promise<ListWorkloadsResponse> {
    await sleep(40);
    return { workloads: [WORKLOAD] };
  }

  async listFixtures(): Promise<ListFixturesResponse> {
    await sleep(40);
    return { workload: 'self-healing-runner', fixtures: [PROJECT_FIXTURE] };
  }

  private find(runId: string): RunDetail | null {
    const simulated = this.simulated.get(runId);
    if (simulated !== undefined) return simulated.run;
    const seeded = this.seeded.get(runId);
    return seeded === undefined ? null : seeded.run;
  }
}
