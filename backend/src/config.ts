/**
 * One config module, read once at startup. Everything is env.
 *
 * Rules (§10.8, brief 04 requirement 1):
 *  - a missing required value fails closed, and the message names the
 *    VARIABLE, never its value;
 *  - `OPENAI_ENDPOINT` must use HTTPS in production;
 *  - `NODE_ENV=production` + `BRZ_INFERENCE_MODE=mock` refuses to start;
 *  - there is no default provider, model, host or key.
 *
 * Every default below is a port, a limit or a path — never a credential and
 * never a provider.
 */

import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SandboxLimits, SandboxProviderKind } from './contracts/sandbox.ts';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type InferenceMode = 'live' | 'mock';

export interface InferenceConfig {
  readonly mode: InferenceMode;
  /** Base URL, no trailing slash. `null` in mock mode when not supplied. */
  readonly endpoint: string | null;
  /** Model id from env. `null` in mock mode when not supplied. */
  readonly model: string | null;
  /** Credential. Never logged, never serialised, never sent to the sandbox. */
  readonly apiKey: string | null;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export interface RunLimitsConfig {
  readonly maxToolCalls: number;
  readonly maxRepairs: number;
  readonly maxTotalTokens: number;
  readonly runWallClockMs: number;
}

export interface EgressConfig {
  readonly allowlist: readonly string[];
  readonly maxBytes: number;
}

export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly isProduction: boolean;
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly workRoot: string;
  readonly inference: InferenceConfig;
  readonly sandboxProvider: SandboxProviderKind;
  readonly sandboxLimits: SandboxLimits;
  readonly runLimits: RunLimitsConfig;
  readonly egress: EgressConfig;
}

const DEFAULT_PORT = 8787;
const DEFAULT_INFERENCE_TIMEOUT_MS = 60_000;
const DEFAULT_INFERENCE_MAX_RETRIES = 2;
const DEFAULT_MAX_TOOL_CALLS = 12;
const DEFAULT_MAX_REPAIRS = 2;
const DEFAULT_MAX_TOTAL_TOKENS = 24_000;
const DEFAULT_RUN_WALL_CLOCK_MS = 120_000;
const DEFAULT_SANDBOX_MEMORY_BYTES = 134_217_728;
const DEFAULT_SANDBOX_CPU_SECONDS = 60;
const DEFAULT_SANDBOX_MAX_PROCESSES = 64;
const DEFAULT_SANDBOX_MAX_FILE_BYTES = 1_048_576;
const DEFAULT_SANDBOX_MAX_OUTPUT_BYTES = 65_536;
const DEFAULT_SANDBOX_MAX_OPEN_FILES = 256;
const DEFAULT_EGRESS_MAX_BYTES = 262_144;

/**
 * The wildcard bind address, and the only literal host in the backend.
 * It is the documented default of `HOST` (§10.8) and a bind address, not a
 * destination — overriding it is an env change, not a code change.
 */
const WILDCARD_HOST = '0.0.0.0';

function readOptional(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw === undefined) return null;
  const value = raw.trim();
  return value.length === 0 ? null : value;
}

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptional(env, name);
  if (value === null) {
    throw new ConfigError(
      `Missing required environment variable: ${name}. ` +
        `Set it in the repository-root .env (see .env.example). The value is never printed.`,
    );
  }
  return value;
}

function readInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = readOptional(env, name);
  if (raw === null) return fallback;
  if (!/^-?\d+$/.test(raw)) {
    throw new ConfigError(`${name} must be an integer, received a non-numeric value.`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${name} must be an integer in [${min}, ${max}].`);
  }
  return parsed;
}

function parseNodeEnv(env: NodeJS.ProcessEnv): Config['nodeEnv'] {
  const raw = readOptional(env, 'NODE_ENV');
  if (raw === null) return 'development';
  if (raw === 'production' || raw === 'development' || raw === 'test') return raw;
  throw new ConfigError('NODE_ENV must be one of: production, development, test.');
}

function parseInferenceMode(env: NodeJS.ProcessEnv, isProduction: boolean): InferenceMode {
  const raw = readOptional(env, 'BRZ_INFERENCE_MODE');
  const parsed: 'live' | 'mock' | 'invalid' =
    raw === null ? 'live' : raw === 'mock' ? 'mock' : raw === 'live' ? 'live' : 'invalid';

  if (parsed === 'invalid') {
    throw new ConfigError('BRZ_INFERENCE_MODE must be either "live" or "mock".');
  }
  if (isProduction && parsed === 'mock') {
    // The mock must never be reachable in production (§10.8, rule 3).
    throw new ConfigError(
      'NODE_ENV=production refuses BRZ_INFERENCE_MODE=mock. The deterministic offline mode is a development and test affordance only.',
    );
  }
  return parsed;
}

function parseEndpoint(raw: string, isProduction: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError('OPENAI_ENDPOINT must be an absolute URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('OPENAI_ENDPOINT must use the HTTPS scheme.');
  }
  if (isProduction && url.protocol !== 'https:') {
    throw new ConfigError('OPENAI_ENDPOINT must use HTTPS when NODE_ENV=production.');
  }
  // Normalise: drop the trailing slash so `${endpoint}/chat/completions` is well formed.
  return url.toString().replace(/\/+$/, '');
}

function parseSandboxProvider(env: NodeJS.ProcessEnv): SandboxProviderKind {
  const raw = readOptional(env, 'BRZ_SANDBOX_PROVIDER');

  if (raw === null) {
    /*
     * BRIEF 04 ONLY. The design's default is `bwrap` (§10.8), but the sealed
     * tier is brief 06 and does not exist yet. Defaulting to a provider that
     * is not implemented would mean the control plane cannot start at all, so
     * this build defaults to the NON-SEALED stand-in and says so at startup.
     * Brief 06 flips this default to `bwrap` and deletes the stand-in.
     */
    return 'standin';
  }
  if (raw === 'standin') return 'standin';
  /*
   * Every other value is a sealed tier, and the sealed tiers land in brief 06.
   * The names are deliberately not spelled out here: a provider is chosen by
   * env, never by a literal in the source (§10.8, C1).
   */
  throw new ConfigError(
    'BRZ_SANDBOX_PROVIDER requests a sealed tier that is not available in this build. ' +
      'This build provides the non-sealed stand-in only. Unset the variable to use it.',
  );
}

function parseAllowlist(env: NodeJS.ProcessEnv): readonly string[] {
  const raw = readOptional(env, 'BRZ_EGRESS_ALLOWLIST');
  if (raw === null) return [];
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    if (entry.includes('/') || entry.includes(':') || /\s/.test(entry)) {
      throw new ConfigError(
        'BRZ_EGRESS_ALLOWLIST must be a comma-separated list of bare hostnames (no scheme, no port, no path).',
      );
    }
  }
  return [...new Set(entries)];
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = parseNodeEnv(env);
  const isProduction = nodeEnv === 'production';
  const mode = parseInferenceMode(env, isProduction);

  /*
   * In live mode the three provider values are required: there is no fallback
   * provider, model or host. In mock mode they are not required — the whole
   * point of the offline mode is to run with no provider at all — but if they
   * are present they are validated the same way.
   */
  let apiKey: string | null = null;
  let endpoint: string | null = null;
  let model: string | null = null;

  if (mode === 'live') {
    apiKey = requireValue(env, 'OPENAI_API_KEY');
    endpoint = parseEndpoint(requireValue(env, 'OPENAI_ENDPOINT'), isProduction);
    model = requireValue(env, 'OPENAI_MODEL');
  } else {
    apiKey = readOptional(env, 'OPENAI_API_KEY');
    model = readOptional(env, 'OPENAI_MODEL');
    const rawEndpoint = readOptional(env, 'OPENAI_ENDPOINT');
    endpoint = rawEndpoint === null ? null : parseEndpoint(rawEndpoint, isProduction);
  }

  const port = readInt(env, 'PORT', DEFAULT_PORT, 1, 65_535);
  const host = readOptional(env, 'HOST') ?? WILDCARD_HOST;

  const dbPath = readOptional(env, 'BRZ_DB_PATH') ?? path.join(tmpdir(), 'brz', 'brz.db');
  const workRoot = readOptional(env, 'BRZ_WORK_ROOT') ?? path.join(tmpdir(), 'brz', 'runs');

  const runWallClockMs = readInt(
    env,
    'BRZ_RUN_WALL_CLOCK_MS',
    DEFAULT_RUN_WALL_CLOCK_MS,
    1_000,
    3_600_000,
  );

  const sandboxLimits: SandboxLimits = {
    wallClockMs: runWallClockMs,
    memoryBytes: readInt(env, 'BRZ_SANDBOX_MEMORY_BYTES', DEFAULT_SANDBOX_MEMORY_BYTES, 16_777_216, 4_294_967_296),
    cpuSeconds: readInt(env, 'BRZ_SANDBOX_CPU_SECONDS', DEFAULT_SANDBOX_CPU_SECONDS, 1, 3_600),
    maxProcesses: readInt(env, 'BRZ_SANDBOX_MAX_PROCESSES', DEFAULT_SANDBOX_MAX_PROCESSES, 1, 4_096),
    maxFileBytes: readInt(env, 'BRZ_SANDBOX_MAX_FILE_BYTES', DEFAULT_SANDBOX_MAX_FILE_BYTES, 4_096, 1_073_741_824),
    maxOutputBytes: readInt(env, 'BRZ_SANDBOX_MAX_OUTPUT_BYTES', DEFAULT_SANDBOX_MAX_OUTPUT_BYTES, 1_024, 16_777_216),
    maxOpenFiles: readInt(env, 'BRZ_SANDBOX_MAX_OPEN_FILES', DEFAULT_SANDBOX_MAX_OPEN_FILES, 16, 65_536),
  };

  return {
    nodeEnv,
    isProduction,
    host,
    port,
    dbPath,
    workRoot,
    inference: {
      mode,
      endpoint,
      model,
      apiKey,
      timeoutMs: readInt(env, 'OPENAI_TIMEOUT_MS', DEFAULT_INFERENCE_TIMEOUT_MS, 1_000, 600_000),
      maxRetries: readInt(env, 'OPENAI_MAX_RETRIES', DEFAULT_INFERENCE_MAX_RETRIES, 0, 10),
    },
    sandboxProvider: parseSandboxProvider(env),
    sandboxLimits,
    runLimits: {
      maxToolCalls: readInt(env, 'BRZ_MAX_TOOL_CALLS', DEFAULT_MAX_TOOL_CALLS, 1, 200),
      maxRepairs: readInt(env, 'BRZ_MAX_REPAIRS', DEFAULT_MAX_REPAIRS, 0, 10),
      maxTotalTokens: readInt(env, 'BRZ_MAX_TOTAL_TOKENS', DEFAULT_MAX_TOTAL_TOKENS, 1_000, 1_000_000),
      runWallClockMs,
    },
    egress: {
      allowlist: parseAllowlist(env),
      maxBytes: readInt(env, 'BRZ_EGRESS_MAX_BYTES', DEFAULT_EGRESS_MAX_BYTES, 1_024, 16_777_216),
    },
  };
}
