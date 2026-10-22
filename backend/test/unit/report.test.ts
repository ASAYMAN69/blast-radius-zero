/**
 * Report assembly (§6.2, §6.4, §6.6, §10.2).
 *
 * Two things are checked here:
 *  - a field with no backing record is `not-measured` with a reason, never a
 *    fabricated zero;
 *  - a report produced by the non-sealed stand-in says `incomplete`, whatever
 *    else it contains.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { migrate } from '../../src/db/migrate.ts';
import { openDatabase } from '../../src/db/sqlite.ts';
import { createStores, type Stores } from '../../src/db/store/index.ts';
import { assembleReport, computeVerdict } from '../../src/runs/report.ts';
import type { ContainmentSection, Measured } from '../../src/contracts/report.ts';
import { testConfig } from '../helpers/harness.ts';
import { SHR_SUM_RANGE, TEST_COMMAND } from '../../src/agent/workload.ts';

function newStores(): Stores {
  const db = openDatabase(':memory:');
  migrate(db);
  return createStores(db);
}

function measured<T>(value: T): Measured<T> {
  return { state: 'measured', value };
}

function notMeasured<T>(reason: string): Measured<T> {
  return { state: 'not-measured', value: null, reason };
}

function goodContainment(): ContainmentSection {
  return {
    processIsolation: measured({
      namespaces: ['pid', 'net'],
      visibleRootEntries: ['bin', 'work'],
      writableOutsideWorkDir: false,
      processNamespaceIsolated: true,
      directNetworkReachable: false,
    }),
    secretHygiene: measured({
      environmentKeys: ['HOME', 'PATH'],
      credentialShapedKeys: [],
      secretMaterialVisible: false,
      projectDirectoryVisible: false,
    }),
    resourceLimits: measured({
      enforcement: 'cgroup+rlimit',
      memoryCapBytes: 1,
      cpuCapSeconds: 1,
      processCap: 1,
      fileSizeCapBytes: 1,
      capFired: false,
    }),
    lifecycle: measured({
      sandboxId: 'sbx_1',
      provider: 'bwrap',
      createdAt: '2026-01-01T00:00:00.000Z',
      destroyedAt: '2026-01-01T00:00:01.000Z',
      verifiedGone: true,
      workDirRemoved: true,
      cgroupRemoved: true,
    }),
    measurement: null,
  };
}

describe('the verdict rule', () => {
  it('is contained when nothing was violated and nothing was denied', () => {
    assert.equal(computeVerdict(goodContainment(), 0), 'contained');
  });

  it('is contained-with-denials when a capability request was denied', () => {
    assert.equal(computeVerdict(goodContainment(), 1), 'contained-with-denials');
  });

  it('is violated when a measured fact is false', () => {
    const base = goodContainment();
    const isolation = base.processIsolation;
    assert.equal(isolation.state, 'measured');
    if (isolation.state !== 'measured') return;
    const section: ContainmentSection = {
      ...base,
      processIsolation: measured({ ...isolation.value, directNetworkReachable: true }),
    };
    assert.equal(computeVerdict(section, 0), 'violated');
  });

  it('is incomplete when a fact was not measured', () => {
    const section: ContainmentSection = {
      ...goodContainment(),
      secretHygiene: notMeasured('No probe record.'),
    };
    assert.equal(computeVerdict(section, 0), 'incomplete');
  });

  it('is incomplete, not contained, when a denial was recorded but nothing was measured', () => {
    const section: ContainmentSection = {
      ...goodContainment(),
      lifecycle: notMeasured('No teardown record.'),
    };
    assert.equal(computeVerdict(section, 3), 'incomplete');
  });
});

describe('report assembly', () => {
  it('assembles a report from the persisted records of a stand-in run', () => {
    const stores = newStores();
    const runId = 'run_01AAAAAAAAAAAAAAAAAAAAAAAA';
    const createdAt = '2026-01-01T00:00:00.000Z';

    stores.runs.create({
      id: runId,
      workload: SHR_SUM_RANGE.workload,
      goal: 'fix the range',
      sourceKind: 'fixture',
      sourceRef: SHR_SUM_RANGE.id,
      provider: 'standin',
      brokerTokenHash: 'hash',
      createdAt,
    });

    stores.events.append({
      runId,
      at: createdAt,
      type: 'run.queued',
      phase: 'queued',
      label: 'Run queued',
      detail: {},
    });
    stores.events.append({
      runId,
      at: createdAt,
      type: 'tool.result',
      phase: 'executing',
      label: 'run_tests: ok',
      detail: { exitCode: 0 },
    });

    stores.toolCalls.append({
      runId,
      seq: 1,
      toolName: 'run_tests',
      arguments: { command: TEST_COMMAND },
      ok: true,
      errorCode: null,
      errorMessage: null,
      exitCode: 0,
      signal: null,
      durationMs: 100,
      stdout: 'Ran 2 tests\nOK\n',
      stderr: '',
      bytes: 16,
      outcome: 'ok',
      killReason: null,
    });

    stores.artifacts.append({
      runId,
      label: 'seed:calculator.py',
      kind: 'file',
      content: 'def sum_range(start, end):\n    return sum(range(start, end))\n',
      bytes: 52,
      sha256: 'a'.repeat(64),
      createdAt,
    });
    stores.artifacts.append({
      runId,
      label: 'write:calculator.py',
      kind: 'file',
      content: 'def sum_range(start, end):\n    return sum(range(start, end + 1))\n',
      bytes: 60,
      sha256: 'b'.repeat(64),
      createdAt,
    });
    stores.artifacts.append({
      runId,
      label: 'verification-run',
      kind: 'text',
      content: JSON.stringify({
        command: TEST_COMMAND,
        exitCode: 0,
        passed: 2,
        total: 2,
        failedTests: [],
        output: 'Ran 2 tests\nOK\n',
      }),
      bytes: 80,
      sha256: 'c'.repeat(64),
      createdAt,
    });

    stores.sandbox.append({
      runId,
      at: createdAt,
      action: 'create',
      provider: 'standin',
      sandboxId: 'sbx_1',
      ok: true,
      detail: JSON.stringify({
        enforcement: 'rlimit-only',
        directMechanism: 'NONE — the stand-in has host network access',
        workDir: '/work',
        provider: 'standin',
      }),
    });
    stores.sandbox.append({
      runId,
      at: createdAt,
      action: 'destroy',
      provider: 'standin',
      sandboxId: 'sbx_1',
      ok: true,
      detail: JSON.stringify({
        verifiedGone: true,
        workDirRemoved: true,
        cgroupRemoved: false,
        leftoverResources: [],
        error: null,
      }),
    });

    stores.egress.append({
      runId,
      at: createdAt,
      capability: 'fetch',
      url: 'https://example.invalid/thing',
      host: 'example.invalid',
      verdict: 'denied',
      reason: 'host_not_allowlisted',
      origin: 'containment-probe',
      bytes: null,
      durationMs: 1,
    });

    stores.resources.append({
      runId,
      at: createdAt,
      wallClockMs: 1200,
      memoryBytes: null,
      cpuMs: null,
      processCount: null,
    });

    const run = stores.runs.get(runId);
    assert.ok(run !== null);
    const report = assembleReport({
      run,
      stores,
      config: testConfig(),
      generatedAt: '2026-01-01T00:00:02.000Z',
    });

    // The stand-in must never claim containment.
    assert.equal(report.verdict, 'incomplete');
    assert.equal(report.containment.processIsolation.state, 'not-measured');
    assert.equal(report.containment.secretHygiene.state, 'not-measured');
    assert.equal(report.containment.resourceLimits.state, 'not-measured');
    assert.equal(report.containment.lifecycle.state, 'not-measured');
    assert.equal(report.containment.measurement, null);
    for (const fact of [
      report.containment.processIsolation,
      report.containment.secretHygiene,
      report.containment.resourceLimits,
      report.containment.lifecycle,
    ]) {
      assert.ok(fact.reason.length > 0, 'a not-measured fact must carry a reason');
    }

    // A denial was recorded, and the verdict is still `incomplete`.
    assert.equal(report.network.deniedCount, 1);
    assert.equal(report.network.allowedCount, 0);
    assert.equal(report.network.attempts[0]?.reason, 'host_not_allowlisted');

    // Files: the final state of each path. The agent's rewrite of
    // calculator.py replaces the seed, and is attributed to the agent.
    assert.equal(report.code.filesWritten.length, 1);
    assert.equal(report.code.filesWritten[0]?.path, 'calculator.py');
    assert.equal(report.code.filesWritten[0]?.origin, 'agent');
    assert.equal(report.code.filesWritten[0]?.sha256, 'b'.repeat(64));
    // Both versions are still in the evidence.
    assert.equal(report.evidence.artifacts.length, 3);

    // The command record and the verification run.
    assert.equal(report.code.commands.length, 1);
    assert.equal(report.code.commands[0]?.exitCode, 0);
    assert.equal(report.code.finalTestRun?.passed, 2);
    assert.equal(report.code.finalTestRun?.total, 2);

    // Resources: what was not measured says so.
    assert.equal(report.resources.memoryPeakBytes.state, 'not-measured');
    assert.equal(report.resources.cpuSeconds.state, 'not-measured');
    assert.equal(report.resources.maxProcessesObserved.state, 'not-measured');
    assert.equal(report.resources.outputBytes.state, 'measured');

    // Evidence and timeline.
    assert.equal(report.evidence.eventCount, 2);
    assert.ok(report.evidence.eventDigest.startsWith('sha256:'));
    assert.equal(report.timeline.length, 2);
    assert.equal(report.runId, runId);
    assert.equal(report.reportVersion, '1.0');
  });
});
