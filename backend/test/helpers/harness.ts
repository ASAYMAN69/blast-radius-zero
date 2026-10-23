/**
 * Test harness: a temporary database, a temporary work root, the stand-in
 * provider and the scripted inference client. No network, no real database,
 * no shared state between tests.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Config } from '../../src/config.ts';
import { createMockClient } from '../../src/inference/mock.ts';
import { silentLogger } from '../../src/log.ts';
import { createBwrapProvider } from '../../src/sandbox/bwrap.ts';
import { startServer, type RunningServer } from '../../src/server.ts';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    isProduction: false,
    host: '0.0.0.0',
    port: 0,
    dbPath: path.join(tmpdir(), 'brz-test', 'brz.db'),
    workRoot: path.join(tmpdir(), 'brz-test', 'runs'),
    inference: {
      mode: 'mock',
      endpoint: null,
      model: null,
      apiKey: null,
      timeoutMs: 1_000,
      maxRetries: 0,
      fallbacks: [],
    },
    sandboxProvider: 'bwrap',
    sandboxLimits: {
      wallClockMs: 30_000,
      memoryBytes: 134_217_728,
      cpuSeconds: 60,
      maxProcesses: 64,
      maxFileBytes: 1_048_576,
      maxOutputBytes: 65_536,
      maxOpenFiles: 256,
    },
    runLimits: {
      maxToolCalls: 12,
      maxRepairs: 2,
      maxTotalTokens: 24_000,
      runWallClockMs: 30_000,
    },
    runTokenBudget: 12_000,
    egress: { allowlist: [], maxBytes: 262_144 },
    ...overrides,
  };
}

export interface TestServer {
  readonly running: RunningServer;
  readonly tempDir: string;
  close(): Promise<void>;
}

export async function startTestServer(overrides: Partial<Config> = {}): Promise<TestServer> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'brz-test-'));
  const config = testConfig({
    dbPath: path.join(tempDir, 'brz.db'),
    workRoot: path.join(tempDir, 'runs'),
    ...overrides,
  });
  const running = await startServer({
    config,
    provider: createBwrapProvider(),
    createInference: () => createMockClient(),
    log: silentLogger,
  });

  return {
    running,
    tempDir,
    async close(): Promise<void> {
      await running.close();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Record<string, string | string[] | undefined>;
}

export function requestJson(
  address: string,
  port: number,
  method: string,
  requestPath: string,
  body?: unknown,
  options: { contentType?: string | null } = {},
): Promise<JsonResponse> {
  return new Promise<JsonResponse>((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (payload !== null) {
      headers['content-type'] = options.contentType ?? 'application/json';
      headers['content-length'] = String(payload.byteLength);
    } else if (options.contentType !== undefined && options.contentType !== null) {
      headers['content-type'] = options.contentType;
    }

    const request = httpRequest(
      { host: address, port, method, path: requestPath, headers },
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
              reject(new Error('The response was not JSON.'));
              return;
            }
          }
          resolve({ status: response.statusCode ?? 0, body: parsed, headers: response.headers });
        });
      },
    );
    request.on('error', reject);
    if (payload !== null) request.write(payload);
    request.end();
  });
}
