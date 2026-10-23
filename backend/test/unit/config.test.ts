/**
 * Config validation (§10.8). The config module fails closed: a missing or
 * unsafe value stops the process with a message that names the VARIABLE and
 * never its value.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConfigError, parseConfig } from '../../src/config.ts';

describe('parseConfig', () => {
  it('does not require provider values in mock mode', () => {
    const config = parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock' });
    assert.equal(config.inference.mode, 'mock');
    assert.equal(config.inference.endpoint, null);
    assert.equal(config.inference.model, null);
    assert.equal(config.inference.apiKey, null);
  });

  it('requires the provider values in live mode and names the variable', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'test' }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('OPENAI_API_KEY'),
    );
  });

  it('refuses mock mode in production', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'production',
          BRZ_INFERENCE_MODE: 'mock',
          OPENAI_API_KEY: 'k',
          OPENAI_ENDPOINT: 'https://provider.invalid/v1',
          OPENAI_MODEL: 'm',
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('production'),
    );
  });

  it('requires HTTPS for the endpoint in production', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'production',
          OPENAI_API_KEY: 'k',
          OPENAI_ENDPOINT: 'http://provider.invalid/v1',
          OPENAI_MODEL: 'm',
        }),
      (error: unknown) => error instanceof ConfigError && error.message.includes('HTTPS'),
    );
  });

  it('allows a plain HTTP endpoint in development', () => {
    const config = parseConfig({
      NODE_ENV: 'development',
      OPENAI_API_KEY: 'k',
      OPENAI_ENDPOINT: 'http://provider.invalid/v1',
      OPENAI_MODEL: 'm',
    });
    assert.equal(config.inference.endpoint, 'http://provider.invalid/v1');
  });

  it('normalises the endpoint and never keeps a trailing slash', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'k',
      OPENAI_ENDPOINT: 'https://provider.invalid/v1/',
      OPENAI_MODEL: 'm',
    });
    assert.equal(config.inference.endpoint, 'https://provider.invalid/v1');
  });

  it('rejects a non-numeric port and names the variable', () => {
    assert.throws(
      () => parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock', PORT: 'eight' }),
      (error: unknown) => error instanceof ConfigError && error.message.includes('PORT'),
    );
  });

  it('rejects an unknown sandbox provider', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          BRZ_SANDBOX_PROVIDER: 'nope',
        }),
      (error: unknown) => error instanceof ConfigError,
    );
  });

  it('defaults to the sealed bwrap tier', () => {
    const config = parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock' });
    assert.equal(config.sandboxProvider, 'bwrap');
  });

  it('parses the egress allowlist into bare hostnames', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      BRZ_INFERENCE_MODE: 'mock',
      BRZ_EGRESS_ALLOWLIST: 'Example.COM, api.example.org ',
    });
    assert.deepEqual([...config.egress.allowlist], ['example.com', 'api.example.org']);
  });

  it('refuses an allowlist entry that is not a bare hostname', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          BRZ_EGRESS_ALLOWLIST: 'https://example.com',
        }),
      (error: unknown) => error instanceof ConfigError,
    );
  });

  it('names the variable, never its value, when a required value is missing', () => {
    const secret = 'sk-not-to-be-printed';
    try {
      parseConfig({
        NODE_ENV: 'test',
        OPENAI_API_KEY: secret,
        OPENAI_ENDPOINT: 'https://provider.invalid/v1',
      });
      assert.fail('the config should have failed');
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.ok(error.message.includes('OPENAI_MODEL'));
      assert.ok(!error.message.includes(secret));
    }
  });
});

describe('the fallback chain configuration', () => {
  it('has no fallbacks when OPENAI_FALLBACKS is absent or empty', () => {
    assert.deepEqual(
      [...parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock' }).inference.fallbacks],
      [],
    );
    assert.deepEqual(
      [
        ...parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          OPENAI_FALLBACKS: '[]',
        }).inference.fallbacks,
      ],
      [],
    );
  });

  it('parses a fallback entry and inherits the primary model and key', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'primary-key',
      OPENAI_ENDPOINT: 'https://primary.invalid/v1',
      OPENAI_MODEL: 'a-model',
      OPENAI_FALLBACKS: JSON.stringify([
        { endpoint: 'https://fallback.invalid/v1' },
        { endpoint: 'https://second.invalid/v1', model: 'other-model' },
      ]),
    });

    assert.equal(config.inference.fallbacks.length, 2);
    assert.equal(config.inference.fallbacks[0]?.endpoint, 'https://fallback.invalid/v1');
    assert.equal(config.inference.fallbacks[0]?.model, 'a-model');
    assert.equal(config.inference.fallbacks[0]?.apiKey, 'primary-key');
    assert.equal(config.inference.fallbacks[0]?.label, 'fallback-1');
    assert.equal(config.inference.fallbacks[1]?.model, 'other-model');
    assert.equal(config.inference.fallbacks[1]?.label, 'fallback-2');
  });

  it('fails closed on malformed JSON, without echoing the value', () => {
    const secret = 'sk-fallback-secret';
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          OPENAI_API_KEY: 'primary-key',
          OPENAI_ENDPOINT: 'https://primary.invalid/v1',
          OPENAI_MODEL: 'a-model',
          OPENAI_FALLBACKS: `[{"endpoint":"https://fallback.invalid/v1","apiKey":"${secret}"}`,
        }),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.message.includes('OPENAI_FALLBACKS') &&
        !error.message.includes(secret),
    );
  });

  it('fails closed on a bad endpoint, without echoing the key', () => {
    const secret = 'sk-fallback-secret';
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          OPENAI_API_KEY: 'primary-key',
          OPENAI_ENDPOINT: 'https://primary.invalid/v1',
          OPENAI_MODEL: 'a-model',
          OPENAI_FALLBACKS: JSON.stringify([
            { endpoint: 'not-a-url', apiKey: secret },
          ]),
        }),
      (error: unknown) =>
        error instanceof ConfigError &&
        error.message.includes('OPENAI_FALLBACKS[0].endpoint') &&
        !error.message.includes(secret),
    );
  });

  it('requires HTTPS for a fallback in production', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'production',
          OPENAI_API_KEY: 'primary-key',
          OPENAI_ENDPOINT: 'https://primary.invalid/v1',
          OPENAI_MODEL: 'a-model',
          OPENAI_FALLBACKS: JSON.stringify([{ endpoint: 'http://fallback.invalid/v1' }]),
        }),
      (error: unknown) => error instanceof ConfigError,
    );
  });

  it('keeps a fallback key of its own when it has one', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'primary-key',
      OPENAI_ENDPOINT: 'https://primary.invalid/v1',
      OPENAI_MODEL: 'a-model',
      OPENAI_FALLBACKS: JSON.stringify([
        { endpoint: 'https://fallback.invalid/v1', apiKey: 'own-key' },
      ]),
    });
    assert.equal(config.inference.fallbacks[0]?.apiKey, 'own-key');
  });

  it('refuses a fallback array that is not an array', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          OPENAI_FALLBACKS: '{"endpoint":"https://fallback.invalid/v1"}',
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('OPENAI_FALLBACKS'),
    );
  });
});

describe('the run token budget', () => {
  it('defaults to 12000 tokens', () => {
    const config = parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock' });
    assert.equal(config.runTokenBudget, 12_000);
  });

  it('is 0 when it is disabled', () => {
    const config = parseConfig({
      NODE_ENV: 'test',
      BRZ_INFERENCE_MODE: 'mock',
      BRZ_RUN_TOKEN_BUDGET: '0',
    });
    assert.equal(config.runTokenBudget, 0);
  });

  it('rejects a non-numeric budget and names the variable', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          BRZ_RUN_TOKEN_BUDGET: 'lots',
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('BRZ_RUN_TOKEN_BUDGET'),
    );
  });
});
