/**
 * The §12 demo scenario, one command.
 *
 *   npm run demo --workspace backend          # live provider from ../.env
 *   npm run demo:offline --workspace backend  # scripted, no network
 *
 * It starts the control plane on an ephemeral port with a TEMPORARY database
 * (the developer's real database is never touched), submits the frozen demo
 * task against the `shr-sum-range` fixture, polls the event stream, prints the
 * full report, and exits non-zero if its assertions fail.
 *
 * Under the non-sealed stand-in (brief 04) the containment assertions D3–D12
 * cannot be satisfied by construction. The demo asserts what is true in this
 * build instead — the run is terminal and green, the report carries no
 * fabricated zeros, every containment fact is `not-measured`, and the verdict
 * is `incomplete`. Claiming `contained` here would be the one unforgivable bug.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GetReportResponse, GetRunResponse, ListEventsResponse, SubmitRunResponse } from '../contracts/api.ts';
import type { RunEvent, RunStatus } from '../contracts/events.ts';
import type { BlastRadiusReport, Measured } from '../contracts/report.ts';
import { parseConfig, type Config } from '../config.ts';
import { silentLogger } from '../log.ts';
import { DEMO_FIXTURE_ID, DEMO_TASK, WORKLOAD_ID } from '../agent/workload.ts';
import { createProvider, startServer, type RunningServer } from '../server.ts';

interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

function requestJson(
  address: string,
  port: number,
  method: string,
  requestPath: string,
  body?: unknown,
): Promise<JsonResponse> {
  return new Promise<JsonResponse>((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const request = httpRequest(
      {
        host: address,
        port,
        method,
        path: requestPath,
        headers:
          payload === null
            ? { accept: 'application/json' }
            : {
                accept: 'application/json',
                'content-type': 'application/json',
                'content-length': payload.byteLength,
              },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = null;
          if (text.length > 0) {
            try {
              parsed = JSON.parse(text);
            } catch {
              reject(new Error(`The server returned a non-JSON response (status ${response.statusCode ?? 0}).`));
              return;
            }
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    request.on('error', reject);
    if (payload !== null) request.write(payload);
    request.end();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTerminal(status: RunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function measuredChecks(value: unknown, at: string, failures: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => measuredChecks(entry, `${at}[${index}]`, failures));
    return;
  }
  if (!isRecord(value)) return;

  const state = value['state'];
  if (state === 'measured') {
    if (value['value'] === null || value['value'] === undefined) {
      failures.push(`${at} is marked measured but has no value.`);
    }
  } else if (state === 'not-measured') {
    if (value['value'] !== null) {
      failures.push(`${at} is marked not-measured but carries a value.`);
    }
    if (typeof value['reason'] !== 'string' || value['reason'].length === 0) {
      failures.push(`${at} is marked not-measured without a reason.`);
    }
  } else if (state !== undefined) {
    failures.push(`${at} has an unknown Measured state.`);
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === 'value' && (state === 'measured' || state === 'not-measured')) continue;
    measuredChecks(entry, `${at}.${key}`, failures);
  }
}

function notMeasured<T>(value: Measured<T>): boolean {
  return value.state === 'not-measured';
}

function checkReport(report: BlastRadiusReport, runStatus: RunStatus): string[] {
  const failures: string[] = [];

  // D1: terminal state.
  if (!isTerminal(runStatus)) failures.push(`D1: the run is not terminal (${runStatus}).`);

  // D2: the sandbox's verification run is the truth.
  if (report.code.finalTestRun === null) {
    failures.push('D2: there is no verification run.');
  } else {
    if (report.code.finalTestRun.exitCode !== 0) {
      failures.push(`D2: the verification run exited ${report.code.finalTestRun.exitCode}.`);
    }
    if (
      report.code.finalTestRun.passed !== report.code.finalTestRun.total ||
      report.code.finalTestRun.total !== 2
    ) {
      failures.push(
        `D2: expected 2/2 tests green, got ${report.code.finalTestRun.passed}/${report.code.finalTestRun.total}.`,
      );
    }
  }

  // D13: never a fabricated zero.
  measuredChecks(report, 'report', failures);

  /*
   * Brief 04 runs on the non-sealed stand-in. It cannot measure containment, so
   * the only honest verdict is `incomplete`. D3–D12 are brief 06's assertions.
   */
  if (report.verdict !== 'incomplete') {
    failures.push(`The stand-in produced verdict "${report.verdict}"; it must be "incomplete".`);
  }
  const containment = report.containment;
  if (
    !notMeasured(containment.processIsolation) ||
    !notMeasured(containment.secretHygiene) ||
    !notMeasured(containment.resourceLimits) ||
    !notMeasured(containment.lifecycle)
  ) {
    failures.push('A containment fact is not marked not-measured under the stand-in.');
  }
  if (containment.measurement !== null) {
    failures.push('The stand-in reported a containment measurement it cannot make.');
  }
  if (!notMeasured(report.network.probe)) {
    failures.push('The direct-egress probe is not marked not-measured under the stand-in.');
  }
  if (report.task.workload !== WORKLOAD_ID) {
    failures.push(`The report's workload is ${report.task.workload}, expected ${WORKLOAD_ID}.`);
  }
  if (report.network.deniedCount !== report.network.attempts.filter((a) => a.verdict === 'denied').length) {
    failures.push('network.deniedCount does not match the recorded attempts.');
  }
  if (report.lifecycle.leakedResources.length > 0) {
    failures.push(`The teardown leaked: ${report.lifecycle.leakedResources.join(', ')}.`);
  }

  return failures;
}

async function pollRun(
  address: string,
  port: number,
  runId: string,
): Promise<{ status: RunStatus; phase: string; events: readonly RunEvent[] }> {
  let after = 0;
  const events: RunEvent[] = [];
  const deadline = Date.now() + 10 * 60_000;

  while (Date.now() < deadline) {
    const response = await requestJson(
      address,
      port,
      'GET',
      `/api/v1/runs/${runId}/events?after=${after}&limit=200`,
    );
    if (response.status !== 200) {
      throw new Error(`The events poll returned status ${response.status}.`);
    }
    const body = response.body as ListEventsResponse;

    for (const event of body.events) {
      events.push(event);
      console.log(`[${String(event.seq).padStart(3, ' ')}] ${event.label}`);
    }

    if (body.nextCursor === null) {
      return { status: body.runStatus, phase: body.runPhase, events };
    }
    after = body.nextCursor;
    if (isTerminal(body.runStatus) && body.events.length === 0) {
      return { status: body.runStatus, phase: body.runPhase, events };
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The run did not reach a terminal state before the demo deadline.');
}

async function submit(address: string, port: number): Promise<string> {
  const response = await requestJson(address, port, 'POST', '/api/v1/runs', {
    workload: WORKLOAD_ID,
    task: DEMO_TASK,
    source: { kind: 'fixture', fixtureId: DEMO_FIXTURE_ID },
  });
  if (response.status !== 202) {
    throw new Error(`POST /api/v1/runs returned ${response.status}, expected 202.`);
  }
  const body = response.body as SubmitRunResponse;
  return body.runId;
}

async function oneAttempt(
  running: RunningServer,
  attempt: number,
): Promise<{ failures: string[]; runStatus: RunStatus | null }> {
  console.log(`\n=== Attempt ${attempt}: submitting the frozen demo task ===`);
  const runId = await submit(running.address, running.port);
  console.log(`run ${runId}\n`);

  const polled = await pollRun(running.address, running.port, runId);

  const runResponse = await requestJson(running.address, running.port, 'GET', `/api/v1/runs/${runId}`);
  if (runResponse.status !== 200) throw new Error(`GET /api/v1/runs/{id} returned ${runResponse.status}.`);
  const run = (runResponse.body as GetRunResponse).run;

  const reportResponse = await requestJson(
    running.address,
    running.port,
    'GET',
    `/api/v1/runs/${runId}/report`,
  );
  if (reportResponse.status !== 200) {
    throw new Error(`GET /api/v1/runs/{id}/report returned ${reportResponse.status}.`);
  }
  const report = (reportResponse.body as GetReportResponse).report;

  console.log('\n--- blast-radius report ---');
  console.log(JSON.stringify(report, null, 2));

  console.log('\n--- summary ---');
  console.log(`run:        ${run.runId}`);
  console.log(`status:     ${run.status} (${run.phase})${run.errorCode === null ? '' : ` — ${run.errorCode}`}`);
  console.log(`verdict:    ${report.verdict}`);
  console.log(`headline:   ${report.headline}`);
  console.log(`files:      ${report.code.filesWritten.length} written (${report.code.filesWritten.filter((f) => f.origin === 'agent').length} by the agent)`);
  console.log(
    `tests:      ${report.code.finalTestRun === null ? 'not measured' : `${report.code.finalTestRun.passed}/${report.code.finalTestRun.total} passed`}`,
  );
  console.log(`commands:   ${report.code.commands.length}`);
  console.log(`network:    ${report.network.deniedCount} denied, ${report.network.allowedCount} allowed, probe ${report.network.probe.state}`);
  console.log(`lifecycle:  destroyed=${report.lifecycle.destroyedAt ?? 'never'} teardownVerified=${String(report.lifecycle.teardownVerified)}`);
  console.log(`containment: ${report.containment.processIsolation.state} (the non-sealed stand-in cannot measure it)`);

  return { failures: checkReport(report, polled.status), runStatus: polled.status };
}

async function main(): Promise<void> {
  const base = parseConfig();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'brz-demo-'));
  const config: Config = {
    ...base,
    port: 0,
    dbPath: path.join(tempDir, 'brz.db'),
    workRoot: path.join(tempDir, 'runs'),
  };

  console.log(`BRZ demo — inference mode: ${config.inference.mode}; provider: ${config.sandboxProvider}`);
  console.log(`temporary state: ${tempDir}`);
  if (config.sandboxProvider === 'standin') {
    console.log(`NOTE: the stand-in is NOT containment. Its report must read "incomplete".`);
  }

  const provider = createProvider(config.sandboxProvider);
  const running = await startServer({ config, provider, log: silentLogger });
  console.log(`control plane listening on ${running.address}:${running.port}\n`);

  let exitCode = 0;
  const maxAttempts = config.inference.mode === 'mock' ? 1 : 3;
  try {
    let succeeded = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await oneAttempt(running, attempt);
      if (result.failures.length === 0) {
        console.log(`\nAll demo assertions passed on attempt ${attempt}.`);
        succeeded = true;
        break;
      }
      console.error(`\nAssertion failures on attempt ${attempt}:`);
      for (const failure of result.failures) console.error(`  - ${failure}`);
      if (attempt < maxAttempts) {
        console.error('Retrying the whole run (the model may fix it on the next attempt).');
      }
    }
    if (!succeeded) exitCode = 1;
  } finally {
    await running.close();
    await rm(tempDir, { recursive: true, force: true });
  }

  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The demo failed.');
  process.exitCode = 1;
});
