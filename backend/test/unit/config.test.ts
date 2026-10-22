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

  it('rejects a sealed sandbox provider in this build', () => {
    assert.throws(
      () =>
        parseConfig({
          NODE_ENV: 'test',
          BRZ_INFERENCE_MODE: 'mock',
          BRZ_SANDBOX_PROVIDER: 'bwrap',
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.toLowerCase().includes('sealed tier'),
    );
  });

  it('defaults to the non-sealed stand-in and says so in the code', () => {
    const config = parseConfig({ NODE_ENV: 'test', BRZ_INFERENCE_MODE: 'mock' });
    assert.equal(config.sandboxProvider, 'standin');
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
