/**
 * The run manager: acceptance, concurrency, cancellation and the terminal
 * state machine (§7.5, §7.7).
 */

import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { migrate } from '../../src/db/migrate.ts';
import { openDatabase } from '../../src/db/sqlite.ts';
import { createStores, type Stores } from '../../src/db/store/index.ts';
import { createMockClient } from '../../src/inference/mock.ts';
import { ApiError } from '../../src/http/errors.ts';
import { silentLogger } from '../../src/log.ts';
import { RunManager } from '../../src/runs/manager.ts';
import { createStandinProvider } from '../../src/runs/standinProvider.ts';
import { DEMO_FIXTURE_ID, DEMO_TASK, WORKLOAD_ID } from '../../src/agent/workload.ts';
import { testConfig } from '../helpers/harness.ts';
import type { RunStatus } from '../../src/contracts/events.ts';

interface Harness {
  readonly manager: RunManager;
  readonly stores: Stores;
  readonly workRoot: string;
  close(): Promise<void>;
}

async function newHarness(): Promise<Harness> {
  const db = openDatabase(':memory:');
  migrate(db);
  const stores = createStores(db);
  const workRoot = await mkdtemp(path.join(tmpdir(), 'brz-manager-'));
  const config = testConfig({ workRoot, dbPath: ':memory:' });
  const manager = new RunManager({
    config,
    stores,
    provider: createStandinProvider(),
    createInference: () => createMockClient(),
    logger: silentLogger,
  });
  return {
    manager,
    stores,
    workRoot,
    async close(): Promise<void> {
      await manager.shutdown();
      await rm(workRoot, { recursive: true, force: true });
      db.close();
    },
  };
}

async function waitForTerminal(
  stores: Stores,
  runId: string,
  timeoutMs = 30_000,
): Promise<RunStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = stores.runs.get(runId);
    if (run !== null && (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled')) {
      return run.status;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the run did not reach a terminal state');
}

function submitArgs(): {
  workload: typeof WORKLOAD_ID;
  task: string;
  source: { kind: 'fixture'; fixtureId: string };
} {
  return {
    workload: WORKLOAD_ID,
    task: DEMO_TASK,
    source: { kind: 'fixture', fixtureId: DEMO_FIXTURE_ID },
  };
}

describe('the run manager', () => {
  it('accepts a run, records it durably, and finishes it green', async () => {
    const harness = await newHarness();
    try {
      const accepted = harness.manager.submit(submitArgs());
      assert.equal(accepted.status, 'queued');
      assert.ok(accepted.runId.startsWith('run_'));

      const queued = harness.stores.runs.get(accepted.runId);
      assert.ok(queued !== null);
      assert.equal(queued.status, 'queued');
      assert.equal(queued.provider, 'standin');
      // The broker token is never stored in the clear.
      assert.ok(!JSON.stringify(queued).includes('token'));

      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'succeeded');

      const finished = harness.stores.runs.get(accepted.runId);
      assert.equal(finished?.testPassed, true);
      assert.equal(finished?.testTotal, 2);
      assert.equal(finished?.errorCode, null);
      assert.equal(finished?.verdict, 'incomplete');
      assert.ok((finished?.wallClockMs ?? 0) > 0);

      const report = harness.stores.reports.get(accepted.runId);
      assert.ok(report !== null);
      assert.equal(report.verdict, 'incomplete');
      assert.equal(report.containment.processIsolation.state, 'not-measured');
      assert.equal(report.lifecycle.leakedResources.length, 0);
    } finally {
      await harness.close();
    }
  });

  it('refuses a second concurrent run with too_many_runs', async () => {
    const harness = await newHarness();
    try {
      harness.manager.submit(submitArgs());
      assert.throws(
        () => harness.manager.submit(submitArgs()),
        (error: unknown) => error instanceof ApiError && error.code === 'too_many_runs',
      );
    } finally {
      await harness.close();
    }
  });

  it('cancels a live run and ends it cancelled', async () => {
    const harness = await newHarness();
    try {
      const accepted = harness.manager.submit(submitArgs());
      const response = harness.manager.cancel(accepted.runId);
      assert.equal(response.runId, accepted.runId);

      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'cancelled');
      const finished = harness.stores.runs.get(accepted.runId);
      assert.equal(finished?.errorCode, 'cancelled');
    } finally {
      await harness.close();
    }
  });

  it('refuses to cancel a finished run and an unknown run', async () => {
    const harness = await newHarness();
    try {
      assert.throws(
        () => harness.manager.cancel('run_01AAAAAAAAAAAAAAAAAAAAAAAA'),
        (error: unknown) => error instanceof ApiError && error.code === 'run_not_found',
      );

      const accepted = harness.manager.submit(submitArgs());
      await waitForTerminal(harness.stores, accepted.runId);
      assert.throws(
        () => harness.manager.cancel(accepted.runId),
        (error: unknown) => error instanceof ApiError && error.code === 'run_not_cancellable',
      );
    } finally {
      await harness.close();
    }
  });

  it('refuses an unknown fixture and an unsafe file path', async () => {
    const harness = await newHarness();
    try {
      assert.throws(
        () =>
          harness.manager.submit({
            workload: WORKLOAD_ID,
            task: 'x',
            source: { kind: 'fixture', fixtureId: 'not-a-fixture' },
          }),
        (error: unknown) => error instanceof ApiError && error.code === 'invalid_source',
      );

      assert.throws(
        () =>
          harness.manager.submit({
            workload: WORKLOAD_ID,
            task: 'x',
            source: { kind: 'files', files: [{ path: '../escape.py', content: 'x' }] },
          }),
        (error: unknown) => error instanceof ApiError && error.code === 'invalid_path',
      );
    } finally {
      await harness.close();
    }
  });
});
