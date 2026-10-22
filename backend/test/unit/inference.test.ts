/**
 * The inference client's typed errors and retry rule (§7.3).
 *
 * The provider's raw text must never leave the client as a user-facing
 * message, and only 429/5xx are retried.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createLiveClient, InferenceError } from '../../src/inference/client.ts';
import type { ChatRequest } from '../../src/inference/types.ts';

const REQUEST: ChatRequest = { messages: [{ role: 'user', content: 'hello' }] };

describe('the live inference client', () => {
  it('returns the parsed completion', async () => {
    const impl = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' } }],
          usage: { total_tokens: 7 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'a-key',
      timeoutMs: 1_000,
      maxRetries: 0,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });
    const response = await inference.complete(REQUEST, new AbortController().signal);
    assert.equal(response.choices[0]?.message.content, 'hi');
  });

  it('retries a 5xx and then succeeds', async () => {
    let calls = 0;
    const impl = (async (): Promise<Response> => {
      calls += 1;
      if (calls < 3) return new Response('upstream is down', { status: 503 });
      return new Response(
        JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'a-key',
      timeoutMs: 1_000,
      maxRetries: 2,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });
    const response = await inference.complete(REQUEST, new AbortController().signal);
    assert.equal(response.choices[0]?.message.content, 'ok');
    assert.equal(calls, 3);
  });

  it('gives up with upstream_5xx after the retries are spent', async () => {
    let calls = 0;
    const impl = (async (): Promise<Response> => {
      calls += 1;
      return new Response('upstream is down', { status: 500 });
    }) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'a-key',
      timeoutMs: 1_000,
      maxRetries: 1,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    await assert.rejects(
      () => inference.complete(REQUEST, new AbortController().signal),
      (error: unknown) => error instanceof InferenceError && error.code === 'upstream_5xx',
    );
    assert.equal(calls, 2);
  });

  it('reports a 429 as rate_limited and does not leak the provider text', async () => {
    const impl = (async (): Promise<Response> =>
      new Response('{"error":{"message":"slow down, key sk-secret"}}', { status: 429 })) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'sk-secret',
      timeoutMs: 1_000,
      maxRetries: 0,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    await assert.rejects(
      () => inference.complete(REQUEST, new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof InferenceError);
        assert.equal(error.code, 'rate_limited');
        assert.ok(!error.message.includes('slow down'));
        assert.ok(!error.message.includes('sk-secret'));
        return true;
      },
    );
  });

  it('does not retry a 4xx other than 429', async () => {
    let calls = 0;
    const impl = (async (): Promise<Response> => {
      calls += 1;
      return new Response('{"error":"bad request"}', { status: 400 });
    }) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'a-key',
      timeoutMs: 1_000,
      maxRetries: 3,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    await assert.rejects(
      () => inference.complete(REQUEST, new AbortController().signal),
      (error: unknown) => error instanceof InferenceError && error.code === 'upstream_4xx',
    );
    assert.equal(calls, 1);
  });

  it('reports a malformed response', async () => {
    const impl = (async (): Promise<Response> =>
      new Response('not json at all', { status: 200 })) as unknown as typeof fetch;

    const inference = createLiveClient({
      endpoint: 'https://provider.invalid/v1',
      model: 'a-model',
      apiKey: 'a-key',
      timeoutMs: 1_000,
      maxRetries: 0,
      fetchImpl: impl,
      sleepImpl: async () => {},
    });

    await assert.rejects(
      () => inference.complete(REQUEST, new AbortController().signal),
      (error: unknown) => error instanceof InferenceError && error.code === 'malformed_response',
    );
  });
});
