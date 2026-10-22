/**
 * The OpenAI-compatible inference client (§7.3).
 *
 *  - the model, endpoint and key come from env and nowhere else;
 *  - the timeout and retry settings are honoured;
 *  - errors are typed, and the provider's raw text is kept in `detail` for the
 *    server log only — it never reaches a response or an event;
 *  - non-streaming, by decision (§7.3).
 */

import type { Logger } from '../log.ts';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  InferenceClient,
} from './types.ts';

export type InferenceErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'upstream_4xx'
  | 'upstream_5xx'
  | 'malformed_response'
  | 'network_error'
  | 'not_configured';

export class InferenceError extends Error {
  readonly code: InferenceErrorCode;
  /** Server-log only, never returned to a client. */
  readonly detail: string | null;

  constructor(code: InferenceErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'InferenceError';
    this.code = code;
    this.detail = detail ?? null;
  }
}

/** Thrown when the run's own AbortSignal fires. Not a provider failure. */
export class InferenceAbortedError extends Error {
  constructor(message = 'The inference request was cancelled.') {
    super(message);
    this.name = 'InferenceAbortedError';
  }
}

export interface LiveClientOptions {
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Logger;
  /** Injected in tests so backoff does not slow the suite down. */
  readonly sleepImpl?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const RETRY_BASE_DELAY_MS = 250;

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new InferenceAbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new InferenceAbortedError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function backoffMs(attempt: number): number {
  // Exponential with full jitter, capped at 4 s.
  const ceiling = Math.min(4_000, RETRY_BASE_DELAY_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record['role'] !== 'string') return false;
  const content = record['content'];
  return content === null || content === undefined || typeof content === 'string';
}

function parseResponse(text: string): ChatResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InferenceError('malformed_response', 'The model provider returned a response that was not JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InferenceError('malformed_response', 'The model provider returned an unexpected response shape.');
  }
  const record = parsed as Record<string, unknown>;
  const choices = record['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new InferenceError('malformed_response', 'The model provider returned no choices.');
  }
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.['message'];
  if (!isMessage(message)) {
    throw new InferenceError('malformed_response', 'The model provider returned a choice with no message.');
  }
  return parsed as ChatResponse;
}

export function createLiveClient(options: LiveClientOptions): InferenceClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const url = `${options.endpoint}/chat/completions`;
  const logger = options.logger;

  /** Provider text is not secret, but the key would be if it were ever echoed. */
  const scrub = (text: string): string => {
    const clipped = text.length > 2_000 ? `${text.slice(0, 2_000)}…[truncated]` : text;
    return clipped.split(options.apiKey).join('[redacted]');
  };

  const readDetail = async (response: Response): Promise<string> => {
    try {
      return scrub(await response.text());
    } catch {
      return '[unreadable body]';
    }
  };

  const attemptOnce = async (body: Record<string, unknown>, signal: AbortSignal): Promise<ChatResponse> => {
    const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
    const combined = AbortSignal.any([signal, timeoutSignal]);

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (error) {
      if (signal.aborted) throw new InferenceAbortedError();
      if (timeoutSignal.aborted) {
        throw new InferenceError('timeout', 'The model provider did not respond before the timeout.');
      }
      logger?.warn('inference transport failure', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      throw new InferenceError('network_error', 'The model provider could not be reached.');
    }

    if (response.status === 429) {
      const detail = await readDetail(response);
      logger?.warn('inference rate limited', { status: 429, detail });
      throw new InferenceError('rate_limited', 'The model provider is rate limiting requests.', detail);
    }
    if (response.status >= 500) {
      const detail = await readDetail(response);
      logger?.warn('inference upstream error', { status: response.status, detail });
      throw new InferenceError('upstream_5xx', 'The model provider returned a server error.', detail);
    }
    if (!response.ok) {
      const detail = await readDetail(response);
      logger?.warn('inference request rejected', { status: response.status, detail });
      throw new InferenceError('upstream_4xx', 'The model provider rejected the request.', detail);
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      if (signal.aborted) throw new InferenceAbortedError();
      if (timeoutSignal.aborted) {
        throw new InferenceError('timeout', 'The model provider did not finish responding before the timeout.');
      }
      throw new InferenceError('network_error', 'The model response was interrupted.');
    }

    try {
      return parseResponse(text);
    } catch (error) {
      if (error instanceof InferenceError) {
        logger?.error('inference malformed response', undefined, { detail: scrub(text) });
      }
      throw error;
    }
  };

  return {
    mode: 'live',

    async complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: request.messages,
        stream: false,
      };
      if (request.tools !== undefined && request.tools.length > 0) {
        body['tools'] = request.tools;
        body['tool_choice'] = request.tool_choice ?? 'auto';
      }
      if (request.temperature !== undefined) body['temperature'] = request.temperature;

      let lastError: InferenceError | null = null;
      for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
        if (signal.aborted) throw new InferenceAbortedError();
        try {
          return await attemptOnce(body, signal);
        } catch (error) {
          if (error instanceof InferenceAbortedError) throw error;
          if (!(error instanceof InferenceError)) throw error;
          lastError = error;
          const retryable = error.code === 'rate_limited' || error.code === 'upstream_5xx';
          if (!retryable || attempt === options.maxRetries) throw error;
          logger?.info('inference retry', { attempt: attempt + 1, code: error.code });
          await sleep(backoffMs(attempt), signal);
        }
      }
      throw lastError ?? new InferenceError('network_error', 'The model provider could not be reached.');
    },
  };
}
