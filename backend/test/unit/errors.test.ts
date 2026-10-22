/**
 * Error hygiene (§8.2). The wire carries a stable machine code and a generic
 * message; the provider, SQL and stack text stay in the log.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { API_ERROR_MESSAGES, API_ERROR_STATUS } from '../../src/contracts/api.ts';
import { ApiError, statusFor, toErrorBody } from '../../src/http/errors.ts';

const EXPECTED_STATUS: Readonly<Record<string, number>> = {
  invalid_request: 400,
  invalid_workload: 400,
  invalid_source: 400,
  invalid_path: 400,
  invalid_command: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  not_found: 404,
  run_not_found: 404,
  report_not_ready: 409,
  run_not_cancellable: 409,
  too_many_runs: 429,
  internal_error: 500,
  sandbox_error: 502,
  provider_unavailable: 502,
  not_ready: 503,
  timeout: 504,
};

describe('the error envelope', () => {
  it('maps every code to the status the design freezes', () => {
    for (const [code, status] of Object.entries(EXPECTED_STATUS)) {
      assert.equal(API_ERROR_STATUS[code], status, `status for ${code}`);
    }
    assert.deepEqual(Object.keys(API_ERROR_STATUS).sort(), Object.keys(EXPECTED_STATUS).sort());
  });

  it('has a generic message for every code', () => {
    for (const code of Object.keys(API_ERROR_STATUS)) {
      const message = API_ERROR_MESSAGES[code];
      assert.ok(typeof message === 'string' && message.length > 0, `message for ${code}`);
    }
  });

  it('never leaks internal text in a message', () => {
    for (const [code, message] of Object.entries(API_ERROR_MESSAGES)) {
      assert.ok(!message.includes('SELECT'), `${code} mentions SQL`);
      assert.ok(!message.includes('Error:'), `${code} mentions an exception`);
      assert.ok(!/https?:\/\//.test(message), `${code} mentions a URL`);
    }
  });

  it('builds an ApiError with the mapped status and message', () => {
    const error = new ApiError('report_not_ready');
    assert.equal(error.status, 409);
    assert.equal(error.code, 'report_not_ready');
    assert.equal(error.message, 'The report is not ready yet.');
  });

  it('turns an unknown code into a 500 internal error', () => {
    const error = new ApiError('not_a_real_code');
    assert.equal(error.status, 500);
    assert.equal(error.code, 'internal_error');
  });

  it('carries field details when they are given', () => {
    const error = new ApiError('invalid_request', [{ field: 'task', issue: 'Must be a string.' }]);
    assert.deepEqual(error.details, [{ field: 'task', issue: 'Must be a string.' }]);
  });

  it('produces a wire body with the request id and nothing else', () => {
    const body = toErrorBody(new ApiError('not_found'), 'req_123');
    assert.equal(body.error.code, 'not_found');
    assert.equal(body.error.message, 'Not found.');
    assert.equal(body.error.requestId, 'req_123');
    assert.equal('details' in body.error, false);
  });

  it('maps an unexpected throw to a generic 500', () => {
    const body = toErrorBody(new Error('connection refused at /var/lib/brz/brz.db'), 'req_1');
    assert.equal(body.error.code, 'internal_error');
    assert.equal(body.error.message, 'Something went wrong on our side.');
    assert.ok(!JSON.stringify(body).includes('brz.db'));
    assert.equal(statusFor(new Error('boom')), 500);
  });
});
