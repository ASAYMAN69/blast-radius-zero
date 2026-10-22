/**
 * The HTTP surface, end to end, against a temporary database.
 *
 * The run is driven through the real routes with the scripted inference client
 * and the non-sealed stand-in, so the whole spine is exercised: submit → poll
 * → run detail → report.
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import type {
  GetReportResponse,
  GetRunResponse,
  ListEventsResponse,
  ListRunsResponse,
  SubmitRunResponse,
} from '../../src/contracts/api.ts';
import { DEMO_FIXTURE_ID, DEMO_TASK, WORKLOAD_ID } from '../../src/agent/workload.ts';
import { requestJson, startTestServer, type TestServer } from '../helpers/harness.ts';

describe('the HTTP API', () => {
  let server: TestServer;
  let address: string;
  let port: number;

  before(async () => {
    server = await startTestServer();
    address = server.running.address;
    port = server.running.port;
  });

  after(async () => {
    await server.close();
  });

  it('answers /healthz with the inference mode and the database state', async () => {
    const response = await requestJson(address, port, 'GET', '/healthz');
    assert.equal(response.status, 200);
    const body = response.body as {
      status: string;
      inferenceMode: string;
      database: { state: string; schemaVersion: number | null };
      provider: string;
    };
    assert.equal(body.status, 'ok');
    assert.equal(body.inferenceMode, 'mock');
    assert.equal(body.database.state, 'ready');
    assert.ok((body.database.schemaVersion ?? 0) > 0);
    assert.equal(body.provider, 'standin');
    assert.ok(response.headers['x-request-id'] !== undefined);
  });

  it('lists the workload and its fixtures', async () => {
    const workloads = await requestJson(address, port, 'GET', '/api/v1/workloads');
    assert.equal(workloads.status, 200);
    const workloadBody = workloads.body as { workloads: { id: string; tools: unknown[] }[] };
    assert.equal(workloadBody.workloads[0]?.id, WORKLOAD_ID);
    assert.equal(workloadBody.workloads[0]?.tools.length, 4);

    const fixtures = await requestJson(address, port, 'GET', '/api/v1/fixtures');
    assert.equal(fixtures.status, 200);
    const fixtureBody = fixtures.body as { workload: string; fixtures: { id: string }[] };
    assert.equal(fixtureBody.workload, WORKLOAD_ID);
    assert.equal(fixtureBody.fixtures[0]?.id, DEMO_FIXTURE_ID);
  });

  it('rejects an unknown workload with invalid_workload', async () => {
    const response = await requestJson(address, port, 'POST', '/api/v1/runs', {
      workload: 'not-a-workload',
      task: 'do it',
      source: { kind: 'fixture', fixtureId: DEMO_FIXTURE_ID },
    });
    assert.equal(response.status, 400);
    const body = response.body as { error: { code: string; message: string; requestId: string } };
    assert.equal(body.error.code, 'invalid_workload');
    assert.equal(body.error.message, 'That workload is not available.');
    assert.ok(body.error.requestId.length > 0);
  });

  it('rejects an unsafe source path with invalid_path', async () => {
    const response = await requestJson(address, port, 'POST', '/api/v1/runs', {
      workload: WORKLOAD_ID,
      task: 'do it',
      source: { kind: 'files', files: [{ path: '../escape.py', content: 'x' }] },
    });
    assert.equal(response.status, 400);
    const body = response.body as { error: { code: string } };
    assert.equal(body.error.code, 'invalid_path');
  });

  it('rejects a body that is not JSON with unsupported_media_type', async () => {
    const response = await requestJson(address, port, 'POST', '/api/v1/runs', undefined, {
      contentType: 'text/plain',
    });    assert.equal(response.status, 415);
    const body = response.body as { error: { code: string } };
    assert.equal(body.error.code, 'unsupported_media_type');
  });

  it('returns 404 for an unknown run and for a malformed run id', async () => {
    const unknown = await requestJson(address, port, 'GET', '/api/v1/runs/run_01AAAAAAAAAAAAAAAAAAAAAAAA');
    assert.equal(unknown.status, 404);
    const body = unknown.body as { error: { code: string } };
    assert.equal(body.error.code, 'run_not_found');

    const malformed = await requestJson(address, port, 'GET', '/api/v1/runs/not-a-run-id');
    assert.equal(malformed.status, 404);
  });

  it('runs a task end to end and serves its events, its detail and its report', async () => {
    const submit = await requestJson(address, port, 'POST', '/api/v1/runs', {
      workload: WORKLOAD_ID,
      task: DEMO_TASK,
      source: { kind: 'fixture', fixtureId: DEMO_FIXTURE_ID },
    });
    assert.equal(submit.status, 202);
    const accepted = submit.body as SubmitRunResponse;
    assert.equal(accepted.status, 'queued');
    assert.ok(accepted.runId.startsWith('run_'));

    // The report is not ready while the run is in flight.
    const early = await requestJson(address, port, 'GET', `/api/v1/runs/${accepted.runId}/report`);
    assert.equal(early.status, 409);
    const earlyBody = early.body as { error: { code: string } };
    assert.equal(earlyBody.error.code, 'report_not_ready');

    // Poll the event stream until the run is terminal.
    let after_ = 0;
    let status = 'queued';
    let eventCount = 0;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const events = await requestJson(
        address,
        port,
        'GET',
        `/api/v1/runs/${accepted.runId}/events?after=${after_}`,
      );
      assert.equal(events.status, 200);
      const body = events.body as ListEventsResponse;
      eventCount += body.events.length;
      status = body.runStatus;
      if (body.nextCursor === null) break;
      after_ = body.nextCursor;
      if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
        // Drain the rest.
        const tail = await requestJson(
          address,
          port,
          'GET',
          `/api/v1/runs/${accepted.runId}/events?after=${after_}`,
        );
        eventCount += (tail.body as ListEventsResponse).events.length;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(status, 'succeeded');
    assert.ok(eventCount > 5);

    const detail = await requestJson(address, port, 'GET', `/api/v1/runs/${accepted.runId}`);
    assert.equal(detail.status, 200);
    const run = (detail.body as GetRunResponse).run;
    assert.equal(run.status, 'succeeded');
    assert.equal(run.testPassed, true);
    assert.equal(run.testTotal, 2);
    assert.equal(run.provider, 'standin');
    assert.ok(run.sandboxId !== null && run.sandboxId.startsWith('sbx_'));
    assert.ok((run.modelExplanation ?? '').length > 0);
    assert.equal(run.errorCode, null);

    const reportResponse = await requestJson(address, port, 'GET', `/api/v1/runs/${accepted.runId}/report`);
    assert.equal(reportResponse.status, 200);
    const report = (reportResponse.body as GetReportResponse).report;
    assert.equal(report.verdict, 'incomplete');
    assert.equal(report.code.finalTestRun?.passed, 2);
    assert.equal(report.containment.processIsolation.state, 'not-measured');
    assert.ok(report.lifecycle.teardownVerified);

    const list = await requestJson(address, port, 'GET', '/api/v1/runs');
    assert.equal(list.status, 200);
    const listBody = list.body as ListRunsResponse;
    assert.equal(listBody.runs[0]?.runId, accepted.runId);
  });

  it('refuses to cancel a finished run', async () => {
    const runs = await requestJson(address, port, 'GET', '/api/v1/runs');
    const listBody = runs.body as ListRunsResponse;
    const runId = listBody.runs[0]?.runId;
    assert.ok(runId !== undefined);
    const response = await requestJson(address, port, 'POST', `/api/v1/runs/${runId}/cancel`);
    assert.equal(response.status, 409);
    const body = response.body as { error: { code: string } };
    assert.equal(body.error.code, 'run_not_cancellable');
  });

  it('answers 404 for an unknown route', async () => {
    const response = await requestJson(address, port, 'GET', '/api/v1/nope');
    assert.equal(response.status, 404);
    const body = response.body as { error: { code: string } };
    assert.equal(body.error.code, 'not_found');
  });
});
