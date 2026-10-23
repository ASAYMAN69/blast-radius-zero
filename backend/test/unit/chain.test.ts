/**
 * The fallback provider chain (brief 08).
 *
 * The rules under test: rotate on a throttle, a timeout or a 5xx; do NOT
 * rotate on any other 4xx; and when the chain is exhausted the caller sees the
 * ordinary typed error.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { InferenceError } from '../../src/inference/client.ts';
import { createChainedClient, type ProviderEvent } from '../../src/inference/chain.ts';
import type { FallbackProviderConfig } from '../../src/config.ts';
import type { ChatRequest, ChatResponse, InferenceClient } from '../../src/inference/types.ts';
import type { LogFields, Logger } from '../../src/log.ts';

const REQUEST: ChatRequest = { messages: [{ role: 'user', content: 'hello' }] };

const FALLBACK: FallbackProviderConfig = {
  label: 'fallback-1',
  endpoint: 'https://fallback.invalid/v1',
  model: 'a-model',
  apiKey: 'fallback-key',
};

function okResponse(content = 'from the fallback'): ChatResponse {
  return {
    id: 'r',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { total_tokens: 12 },
  };
}

function failingClient(error: Error): InferenceClient {
  return {
    mode: 'live',
    async complete(): Promise<ChatResponse> {
      throw error;
    },
  };
}

function okClient(content = 'from the fallback'): InferenceClient {
  return {
    mode: 'live',
    async complete(): Promise<ChatResponse> {
      return okResponse(content);
    },
  };
}

function recordingLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const write = (level: string, message: string, fields?: LogFields): void => {
    lines.push(`${level} ${message} ${JSON.stringify(fields ?? {})}`);
  };
  return {
    lines,
    logger: {
      info: (message, fields) => write('info', message, fields),
      warn: (message, fields) => write('warn', message, fields),
      error: (message, _error, fields) => write('error', message, fields),
    },
  };
}

describe('the fallback chain', () => {
  it('rotates to the next provider on a rate limit', async () => {
    const events: ProviderEvent[] = [];
    let fallbackCalls = 0;

    const chain = createChainedClient({
      primary: failingClient(new InferenceError('rate_limited', 'The provider is throttling us.')),
      primaryModel: 'a-model',
      fallbacks: [FALLBACK],
      timeoutMs: 1_000,
      hooks: { onProvider: (event) => events.push(event) },
      createFallbackClient: () => ({
        mode: 'live',
        async complete(): Promise<ChatResponse> {
          fallbackCalls += 1;
          return okResponse();
        },
      }),
    });

    const response = await chain.complete(REQUEST, new AbortController().signal);
    assert.equal(response.choices[0]?.message.content, 'from the fallback');
    assert.equal(fallbackCalls, 1);

    // The rotation is reported, with the reason.
    const rotation = events.find((event) => event.rotated);
    assert.ok(rotation !== undefined);
    assert.equal(rotation.provider, 'fallback-1');
    assert.equal(rotation.reason, 'rate_limited');
    assert.equal(rotation.index, 1);
  });

  it('rotates on a timeout and on a 5xx', async () => {
    for (const code of ['timeout', 'upstream_5xx'] as const) {
      let fallbackCalls = 0;
      const chain = createChainedClient({
        primary: failingClient(new InferenceError(code, 'The provider is unavailable.')),
        primaryModel: 'a-model',
        fallbacks: [FALLBACK],
        timeoutMs: 1_000,
        createFallbackClient: () => ({
          mode: 'live',
          async complete(): Promise<ChatResponse> {
            fallbackCalls += 1;
            return okResponse();
          },
        }),
      });
      const response = await chain.complete(REQUEST, new AbortController().signal);
      assert.equal(response.choices[0]?.message.content, 'from the fallback');
      assert.equal(fallbackCalls, 1, `expected a rotation for ${code}`);
    }
  });

  it('does NOT rotate on a 4xx that is not a throttle', async () => {
    let fallbackCreated = 0;
    const chain = createChainedClient({
      primary: failingClient(new InferenceError('upstream_4xx', 'The request was rejected.')),
      primaryModel: 'a-model',
      fallbacks: [FALLBACK],
      timeoutMs: 1_000,
      createFallbackClient: () => {
        fallbackCreated += 1;
        return okClient();
      },
    });

    await assert.rejects(
      () => chain.complete(REQUEST, new AbortController().signal),
      (error: unknown) => error instanceof InferenceError && error.code === 'upstream_4xx',
    );
    assert.equal(fallbackCreated, 0, 'a rejected request is our bug and must not rotate');
  });

  it('reports the ordinary typed error when the chain is exhausted', async () => {
    let fallbackCalls = 0;
    const chain = createChainedClient({
      primary: failingClient(new InferenceError('rate_limited', 'Throttled.')),
      primaryModel: 'a-model',
      fallbacks: [FALLBACK],
      timeoutMs: 1_000,
      createFallbackClient: () => ({
        mode: 'live',
        async complete(): Promise<ChatResponse> {
          fallbackCalls += 1;
          throw new InferenceError('rate_limited', 'Throttled too.');
        },
      }),
    });

    await assert.rejects(
      () => chain.complete(REQUEST, new AbortController().signal),
      (error: unknown) => error instanceof InferenceError && error.code === 'rate_limited',
    );
    assert.equal(fallbackCalls, 1);
  });

  it('reports the provider that served the call, and reports it once', async () => {
    const events: ProviderEvent[] = [];
    const chain = createChainedClient({
      primary: okClient('from the primary'),
      primaryModel: 'a-model',
      fallbacks: [],
      timeoutMs: 1_000,
      hooks: { onProvider: (event) => events.push(event) },
    });

    await chain.complete(REQUEST, new AbortController().signal);
    await chain.complete(REQUEST, new AbortController().signal);

    assert.equal(events.length, 1);
    assert.equal(events[0]?.provider, 'primary');
    assert.equal(events[0]?.rotated, false);
    assert.equal(events[0]?.reason, null);
  });

  it('never writes a key into the log', async () => {
    const { logger, lines } = recordingLogger();
    const chain = createChainedClient({
      primary: failingClient(new InferenceError('rate_limited', 'Throttled.')),
      primaryModel: 'a-model',
      fallbacks: [FALLBACK],
      timeoutMs: 1_000,
      logger,
      createFallbackClient: () => okClient(),
    });

    await chain.complete(REQUEST, new AbortController().signal);
    const log = lines.join('\n');
    assert.ok(log.includes('inference provider rotated'), log);
    assert.ok(!log.includes('fallback-key'), log);
    assert.ok(!log.includes(FALLBACK.endpoint), log);
  });

  it('behaves exactly like the primary when there are no fallbacks', async () => {
    const events: ProviderEvent[] = [];
    const chain = createChainedClient({
      primary: okClient('unchanged'),
      primaryModel: 'a-model',
      fallbacks: [],
      timeoutMs: 1_000,
      hooks: { onProvider: (event) => events.push(event) },
    });

    const response = await chain.complete(REQUEST, new AbortController().signal);
    assert.equal(response.choices[0]?.message.content, 'unchanged');
    assert.equal(events.length, 1);
  });
});
