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
import { InferenceError } from '../../src/inference/client.ts';
import type { ChatResponse, InferenceClient } from '../../src/inference/types.ts';
import { ApiError } from '../../src/http/errors.ts';
import { silentLogger } from '../../src/log.ts';
import { RunManager } from '../../src/runs/manager.ts';
import { createBwrapProvider } from '../../src/sandbox/bwrap.ts';
import { DEMO_FIXTURE_ID, DEMO_TASK, WORKLOAD_ID } from '../../src/agent/workload.ts';
import { testConfig } from '../helpers/harness.ts';
import type { Config, FallbackProviderConfig } from '../../src/config.ts';
import type { RunStatus } from '../../src/contracts/events.ts';

interface Harness {
  readonly manager: RunManager;
  readonly stores: Stores;
  readonly workRoot: string;
  close(): Promise<void>;
}

async function newHarness(
  options: {
    readonly createInference?: () => InferenceClient;
    readonly createFallbackClient?: (entry: FallbackProviderConfig) => InferenceClient;
    readonly config?: Partial<Config>;
  } = {},
): Promise<Harness> {
  const db = openDatabase(':memory:');
  migrate(db);
  const stores = createStores(db);
  const workRoot = await mkdtemp(path.join(tmpdir(), 'brz-manager-'));
  const config = testConfig({
    workRoot,
    dbPath: ':memory:',
    ...options.config,
  });
  const manager = new RunManager({
    config,
    stores,
    provider: createBwrapProvider(),
    createInference: options.createInference ?? (() => createMockClient()),
    ...(options.createFallbackClient === undefined
      ? {}
      : { createFallbackClient: options.createFallbackClient }),
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
      assert.equal(queued.provider, 'bwrap');
      // The broker token is never stored in the clear.
      assert.ok(!JSON.stringify(queued).includes('token'));

      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'succeeded');

      const finished = harness.stores.runs.get(accepted.runId);
      assert.equal(finished?.testPassed, true);
      assert.equal(finished?.testTotal, 2);
      assert.equal(finished?.errorCode, null);
      assert.ok(finished?.verdict === 'contained' || finished?.verdict === 'contained-with-denials');
      assert.ok((finished?.wallClockMs ?? 0) > 0);

      const report = harness.stores.reports.get(accepted.runId);
      assert.ok(report !== null);
      assert.ok(report.verdict === 'contained' || report.verdict === 'contained-with-denials');
      assert.equal(report.containment.processIsolation.state, 'measured');
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

describe('the run token budget', () => {
  it('stops the run at the budget and says so in the report', async () => {
    // A provider that reports more usage than the budget allows.
    const greedy: InferenceClient = {
      mode: 'live',
      async complete(): Promise<ChatResponse> {
        return {
          id: 'r',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'I am done.' }, finish_reason: 'stop' },
          ],
          usage: { total_tokens: 5_000 },
        };
      },
    };

    const harness = await newHarness({
      createInference: () => greedy,
      config: { runTokenBudget: 1_000 },
    });
    try {
      const accepted = harness.manager.submit(submitArgs());
      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'failed');

      const run = harness.stores.runs.get(accepted.runId);
      assert.equal(run?.errorCode, 'token_budget_exhausted');
      assert.equal(run?.totalTokens, 5_000);

      const report = harness.stores.reports.get(accepted.runId);
      assert.ok(report !== null);
      assert.ok(
        report.headline.includes('Token budget exhausted'),
        `headline was: ${report.headline}`,
      );
      assert.ok(report.headline.includes('5000 tokens used against a budget of 1000'), report.headline);

      // The usage that was reached is on the event stream, and so in the report.
      const events = harness.stores.events.listAll(accepted.runId);
      const sample = events.find((event) => event.type === 'resource.sample');
      assert.ok(sample !== undefined);
      assert.equal(sample.detail['tokens'], 5_000);
      assert.equal(sample.detail['tokenBudget'], 1_000);
    } finally {
      await harness.close();
    }
  });

  it('does not stop a run that stays inside the budget', async () => {
    const harness = await newHarness({ config: { runTokenBudget: 100_000 } });
    try {
      const accepted = harness.manager.submit(submitArgs());
      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'succeeded');
      const run = harness.stores.runs.get(accepted.runId);
      assert.equal(run?.errorCode, null);
    } finally {
      await harness.close();
    }
  });
});

describe('a provider that cannot serve the run', () => {
  it('ends the run as model_error when the chain is exhausted', async () => {
    const throttled: InferenceClient = {
      mode: 'live',
      async complete(): Promise<ChatResponse> {
        throw new InferenceError('rate_limited', 'The provider is throttling us.');
      },
    };

    const harness = await newHarness({ createInference: () => throttled });
    try {
      const accepted = harness.manager.submit(submitArgs());
      const status = await waitForTerminal(harness.stores, accepted.runId);
      assert.equal(status, 'failed');
      const run = harness.stores.runs.get(accepted.runId);
      assert.equal(run?.errorCode, 'model_error');
      // The sandbox is still destroyed: a failed run never leaks a sandbox.
      assert.equal(harness.stores.sandbox.getDestroy(accepted.runId)?.verifiedGone, true);
    } finally {
      await harness.close();
    }
  });
});

describe('the fallback chain, end to end', () => {
  it('rotates to the fallback and records the rotation on the event stream', async () => {
    const throttled: InferenceClient = {
      mode: 'live',
      async complete(): Promise<ChatResponse> {
        throw new InferenceError('rate_limited', 'The provider is throttling us.');
      },
    };

    const harness = await newHarness({
      createInference: () => throttled,
      config: {
        inference: {
          mode: 'live',
          endpoint: 'https://primary.invalid/v1',
          model: 'a-model',
          apiKey: 'primary-key',
          timeoutMs: 1_000,
          maxRetries: 0,
          fallbacks: [
            {
              label: 'fallback-1',
              endpoint: 'https://fallback.invalid/v1',
              model: 'a-model',
              apiKey: 'fallback-key',
            },
          ],
        },
      },
      createFallbackClient: () => ({
        mode: 'live',
        async complete(): Promise<ChatResponse> {
          return {
            id: 'r',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Fixed it.' },
                finish_reason: 'stop',
              },
            ],
            usage: { total_tokens: 20 },
          };
        },
      }),
    });

    try {
      const accepted = harness.manager.submit(submitArgs());
      const status = await waitForTerminal(harness.stores, accepted.runId);
      // The fake fallback answers with a final message and never fixes the
      // code, so the sandbox's verification run is red: the run fails, and it
      // fails honestly. What this test is about is the rotation accounting.
      assert.equal(status, 'failed');
      assert.equal(harness.stores.runs.get(accepted.runId)?.errorCode, 'tests_not_green');

      const events = harness.stores.events.listAll(accepted.runId);
      const rotation = events.find((event) => event.detail['rotated'] === true);
      assert.ok(rotation !== undefined, 'the rotation must be on the event stream');
      assert.equal(rotation.detail['provider'], 'fallback-1');
      assert.equal(rotation.detail['reason'], 'rate_limited');

      // The report shows which provider served the run.
      const report = harness.stores.reports.get(accepted.runId);
      assert.ok(report !== null);
      const timeline = report.timeline.map((entry) => entry.detail);
      assert.ok(
        timeline.some((detail) => detail.includes('provider=fallback-1')),
        `timeline was: ${timeline.join(' | ')}`,
      );

      // No key appears anywhere in the event stream.
      const serialised = JSON.stringify(events);
      assert.ok(!serialised.includes('fallback-key'), serialised);
      assert.ok(!serialised.includes('primary-key'), serialised);
    } finally {
      await harness.close();
    }
  });
});
