/**
 * The one Phase 1 workload: `self-healing-runner`, specialised to a single-file
 * Python bug fix with a stdlib `unittest` suite (§2).
 *
 * The workload owns: the descriptor, the fixtures, the success rule, and the
 * `unittest` output parser. Nothing else may hardcode the fixture.
 */

import type {
  WorkloadDescriptor,
  WorkloadFixture,
  WorkloadToolDescriptor,
} from '../contracts/workload.ts';
import type { FailedTest, TestOutcome } from '../contracts/report.ts';

export const WORKLOAD_ID = 'self-healing-runner';
export const DEMO_FIXTURE_ID = 'shr-sum-range';

/** The frozen demo task text (§12.2). */
export const DEMO_TASK =
  "The project's test suite is failing. Read the code, find the bug, fix it, and make the whole suite " +
  'pass. Then run `python3 -m unittest discover -s tests -v` again to confirm.';

export const TEST_COMMAND = 'python3 -m unittest discover -s tests -v';
export const SELFTEST_COMMAND = 'python3 -m brz_selftest';

const BUGGY_CALCULATOR = `def sum_range(start, end):
    """Return the sum of the integers from start to end, inclusive."""
    return sum(range(start, end))
`;

const TEST_CALCULATOR = `import unittest

from calculator import sum_range


class TestSumRange(unittest.TestCase):
    def test_inclusive(self):
        self.assertEqual(sum_range(1, 5), 15)

    def test_single(self):
        self.assertEqual(sum_range(3, 3), 3)


if __name__ == '__main__':
    unittest.main()
`;

/**
 * The agent-observable half of the containment moment (§2.5): a stdlib-only
 * self-test that prints what the sandbox can see and, when a broker channel is
 * present, performs one brokered fetch that the allowlist must deny.
 *
 * The fetch target is the frozen probe target from §12.3. It is fixture data,
 * not configuration — the control plane never fetches it.
 */
const BRZ_SELFTEST = `"""BRZ containment self-test — standard library only.

Prints one JSON line describing what this process can observe, then, if a broker
channel is present, asks the broker for a URL that is not on the allowlist.
The denial is the expected result.
"""
import json
import os
import socket
import sys

PROBE_HOST = "api.github.com"
PROBE_URL = "https://api.github.com/repos/brz-demo/project/releases"
WORK_DIR = os.getcwd()
BROKER_SOCKET = os.path.join(WORK_DIR, ".brz", "broker.sock")
TOKEN_FILE = os.path.join(WORK_DIR, ".brz", "token")


def direct_egress():
    result = {"attempted": False, "reachable": False, "errno": None, "message": ""}
    try:
        result["attempted"] = True
        sock = socket.create_connection(("1.1.1.1", 443), timeout=2)
        sock.close()
        result["reachable"] = True
        result["message"] = "connected"
    except OSError as exc:
        result["errno"] = getattr(exc, "errno", None)
        result["message"] = exc.strerror or str(exc)
    return result


def broker_fetch():
    if not os.path.exists(BROKER_SOCKET):
        return {"attempted": False, "reason": "no-broker-channel"}
    try:
        token = open(TOKEN_FILE, "r", encoding="utf-8").read().strip()
    except OSError:
        return {"attempted": False, "reason": "no-broker-token"}

    request = {
        "protocol": "brz-broker/1",
        "requestId": "probe",
        "runId": os.environ.get("BRZ_RUN_ID", "unknown"),
        "capability": "fetch",
        "token": token,
        "issuedAt": "",
        "payload": {"kind": "fetch", "url": PROBE_URL, "method": "GET"},
    }
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect(BROKER_SOCKET)
        sock.sendall((json.dumps(request) + "\\n").encode("utf-8"))
        chunks = []
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
            if chunk.endswith(b"\\n"):
                break
        sock.close()
        response = json.loads(b"".join(chunks).decode("utf-8") or "{}")
        error = response.get("error") or {}
        return {
            "attempted": True,
            "ok": bool(response.get("ok")),
            "code": error.get("code"),
            "reason": error.get("message"),
        }
    except OSError as exc:
        return {"attempted": True, "error": type(exc).__name__}


def main():
    report = {
        "environmentKeys": sorted(os.environ.keys()),
        "visibleRootEntries": sorted(os.listdir("/")),
        "directNetwork": direct_egress(),
        "broker": broker_fetch(),
        "workDirEntries": sorted(os.listdir(WORK_DIR)) if os.path.isdir(WORK_DIR) else [],
    }
    sys.stdout.write(json.dumps(report, sort_keys=True) + "\\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

export const TOOL_DEFINITIONS: readonly WorkloadToolDescriptor[] = [
  {
    name: 'list_files',
    description: 'List the files in the project.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Optional subdirectory to list.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read one file. Always read a file before changing it.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root.' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite one file. Write the whole file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root.' },
        content: { type: 'string', description: 'The complete new contents of the file.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_tests',
    description:
      "Run the project's test command inside the sandbox. You may ONLY run a command the project " +
      'declares; any other command is refused before it runs.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The declared command to run. Omit for the default.' },
      },
      additionalProperties: false,
    },
  },
];

export const SELF_HEALING_RUNNER: WorkloadDescriptor = {
  id: WORKLOAD_ID,
  name: 'Self-Healing Runner',
  description:
    'A single-file Python project with a failing stdlib unittest suite. The agent reads the code, ' +
    'runs the tests inside an isolated sandbox, fixes the cause, and proves it by re-running the suite.',
  sourceKinds: ['fixture', 'files'],
  limits: {
    memoryBytes: [67_108_864, 134_217_728, 268_435_456],
    cpuSeconds: [30, 60, 120],
    wallClockMs: [60_000, 120_000, 300_000],
  },
  tools: TOOL_DEFINITIONS,
  successCriterion:
    'The project\'s unittest suite passes: `python3 -m unittest discover -s tests -v` exits 0 with ' +
    'every test green. The verdict is decided by the sandbox, not by the model.',
};

export const SHR_SUM_RANGE: WorkloadFixture = {
  id: DEMO_FIXTURE_ID,
  workload: WORKLOAD_ID,
  name: 'Sum a range, inclusively',
  description:
    '`sum_range(start, end)` promises an inclusive sum but its test suite fails with ' +
    '`AssertionError: 10 != 15`. One off-by-one, one file, two tests.',
  task: DEMO_TASK,
  files: [
    { path: 'calculator.py', content: BUGGY_CALCULATOR },
    { path: 'tests/test_calculator.py', content: TEST_CALCULATOR },
    { path: 'brz_selftest.py', content: BRZ_SELFTEST },
  ],
  allowedCommands: [TEST_COMMAND, SELFTEST_COMMAND],
  testCommand: TEST_COMMAND,
};

const FIXTURES: readonly WorkloadFixture[] = [SHR_SUM_RANGE];

export function listWorkloads(): readonly WorkloadDescriptor[] {
  return [SELF_HEALING_RUNNER];
}

export function listFixtures(workloadId: string = WORKLOAD_ID): readonly WorkloadFixture[] {
  return FIXTURES.filter((fixture) => fixture.workload === workloadId);
}

export function getFixture(fixtureId: string): WorkloadFixture | null {
  return FIXTURES.find((fixture) => fixture.id === fixtureId) ?? null;
}

export function isKnownWorkload(value: string): boolean {
  return value === WORKLOAD_ID;
}

// ── the success rule ────────────────────────────────────────────────────────

const FAILURE_HEADER = /^(FAIL|ERROR): (\S+)(?: \([^)]*\))?\s*$/;

interface ParsedRun {
  readonly passed: number;
  readonly total: number;
  readonly failedTests: readonly FailedTest[];
}

/**
 * Parse CPython `unittest -v` output.
 *
 * `Ran N tests` gives the total; each `FAIL:`/`ERROR:` block is a failed test.
 * `passed = total - failures`, and a run is green iff the exit code is 0 AND
 * every test passed — an unparsable run is never treated as green.
 */
export function parseUnittestOutput(stdout: string, stderr: string): ParsedRun {
  const combined = [stdout, stderr].filter((part) => part.length > 0).join('\n');
  const lines = combined.split('\n');
  const isSeparator = (line: string): boolean => /^-{20,}\s*$/.test(line);

  const failedTests: FailedTest[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const match = FAILURE_HEADER.exec(line);
    if (match === null) continue;

    const test = match[2] ?? 'unknown';
    const block: string[] = [];
    let cursor = index + 1;
    // The header is followed by a separator line; the block runs to the next
    // separator or the next failure header.
    while (cursor < lines.length) {
      const current = lines[cursor] ?? '';
      if (FAILURE_HEADER.test(current)) break;
      if (isSeparator(current)) {
        if (block.length > 0) break;
        cursor += 1;
        continue;
      }
      if (current.trim().length > 0) block.push(current);
      cursor += 1;
    }

    // The final non-empty line of a unittest traceback is the exception line.
    let message = '';
    for (let back = block.length - 1; back >= 0; back -= 1) {
      const candidate = (block[back] ?? '').trim();
      if (candidate.length > 0) {
        message = candidate;
        break;
      }
    }
    failedTests.push({
      test,
      message,
      traceback: block.join('\n').trim() || null,
    });
    index = cursor - 1;
  }

  let total = 0;
  const ranMatch = /Ran (\d+) tests?/.exec(combined);
  if (ranMatch !== null) {
    total = Number.parseInt(ranMatch[1] ?? '0', 10);
  }
  if (total === 0) total = failedTests.length;

  const passed = Math.max(0, total - failedTests.length);

  return { passed, total, failedTests };
}

export function toTestOutcome(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number | null,
): TestOutcome {
  const parsed = parseUnittestOutput(stdout, stderr);
  return {
    command,
    exitCode,
    passed: parsed.passed,
    total: parsed.total,
    failedTests: parsed.failedTests,
    output: [stdout, stderr].filter((part) => part.length > 0).join('\n'),
  };
}

/** The single success rule: the suite actually passed. */
export function isGreen(outcome: TestOutcome | null): boolean {
  return outcome !== null && outcome.exitCode === 0 && outcome.total > 0 && outcome.passed === outcome.total;
}
