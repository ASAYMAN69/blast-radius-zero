/**
 * The fallback provider chain (brief 08).
 *
 * A single provider means one shared rate limit decides whether the most
 * valuable artifact in the project works. The chain walks a list of providers
 * and rotates on the three conditions that are somebody else's fault:
 *
 *   - `rate_limited` — the provider is throttling us;
 *   - `timeout`      — the provider did not answer in time;
 *   - `upstream_5xx` — the provider is broken.
 *
 * It does **not** rotate on any other 4xx: a rejected request is our bug, and
 * rotating would hide it behind a different provider's answer.
 *
 * With no fallbacks configured, the chain is the primary client and the
 * behaviour is byte-for-byte what it was before this file existed.
 *
 * Accounting: the provider that actually served a call is reported through
 * `onProvider`, so the run can record it on its event stream. A rotation is
 * reported the same way, with the reason it happened. No key, and no endpoint,
 * is ever included in either.
 */

import type { FallbackProviderConfig } from '../config.ts';
import type { Logger } from '../log.ts';
import { InferenceAbortedError, InferenceError, createLiveClient } from './client.ts';
import type { ChatRequest, ChatResponse, InferenceClient } from './types.ts';

/** What the chain reports about the provider that served a call. */
export interface ProviderEvent {
  /** A stable, non-secret label: `primary`, `fallback-1`, … */
  readonly provider: string;
  /** The model id, when the provider has one. Never a key. */
  readonly model: string | null;
  /** 0 is the primary; 1 and up are fallbacks, in chain order. */
  readonly index: number;
  /** True when this provider took over from another one. */
  readonly rotated: boolean;
  /** The error code that caused the rotation. `null` for the first provider. */
  readonly reason: string | null;
}

export interface ChainHooks {
  /** Called when the serving provider changes, including the first call. */
  readonly onProvider?: (event: ProviderEvent) => void;
}

export interface ChainedClientOptions {
  /** The provider that is always tried first. */
  readonly primary: InferenceClient;
  /**
   * The label the primary is reported under. `primary` for a live provider,
   * `scripted` for the deterministic offline transcript — which is not a
   * provider at all, and must not look like one.
   */
  readonly primaryLabel?: string;
  readonly primaryModel: string | null;
  /** The rest of the chain, in order. Empty means "no fallbacks". */
  readonly fallbacks: readonly FallbackProviderConfig[];
  readonly timeoutMs: number;
  readonly hooks?: ChainHooks;
  readonly logger?: Logger;
  /** Injected in tests, so no network call is ever made. */
  readonly createFallbackClient?: (entry: FallbackProviderConfig) => InferenceClient;
}

/** The three conditions that are the provider's fault, not ours. */
function isRotatable(error: InferenceError): boolean {
  return (
    error.code === 'rate_limited' || error.code === 'timeout' || error.code === 'upstream_5xx'
  );
}

function defaultFallbackClient(
  entry: FallbackProviderConfig,
  timeoutMs: number,
  logger?: Logger,
): InferenceClient {
  /*
   * A fallback client does not retry in place: the chain's rotation IS the
   * retry. `maxRetries: 0` keeps the two mechanisms from stacking.
   */
  return createLiveClient({
    endpoint: entry.endpoint,
    model: entry.model ?? '',
    apiKey: entry.apiKey ?? '',
    timeoutMs,
    maxRetries: 0,
    ...(logger === undefined ? {} : { logger }),
  });
}

/**
 * A client that walks a chain of providers.
 *
 * The primary is always tried first, every time. A fallback is only reached
 * when the provider before it was throttling, timing out or broken.
 */
export function createChainedClient(options: ChainedClientOptions): InferenceClient {
  const { primary, fallbacks, timeoutMs } = options;
  const logger = options.logger;
  const hooks = options.hooks;

  const providers: {
    label: string;
    model: string | null;
    /** Built on first use: a provider we never reach is never contacted. */
    client: () => InferenceClient;
  }[] = [
    {
      label: options.primaryLabel ?? 'primary',
      model: options.primaryModel,
      client: () => primary,
    },
  ];

  for (const entry of fallbacks) {
    if (entry.apiKey === null || entry.model === null) {
      // Mock mode, or a half-configured entry. It cannot serve a call.
      logger?.warn('inference fallback skipped', { provider: entry.label });
      continue;
    }
    const factory = options.createFallbackClient ?? ((fallback: FallbackProviderConfig) =>
      defaultFallbackClient(fallback, timeoutMs, logger));
    providers.push({ label: entry.label, model: entry.model, client: () => factory(entry) });
  }

  let servingIndex = -1;
  const built = new Map<number, InferenceClient>();

  const clientFor = (index: number): InferenceClient => {
    const existing = built.get(index);
    if (existing !== undefined) return existing;
    const provider = providers[index];
    if (provider === undefined) {
      throw new InferenceError('not_configured', 'The inference chain is empty.');
    }
    const created = provider.client();
    built.set(index, created);
    return created;
  };

  const report = (index: number, rotated: boolean, reason: string | null): void => {
    const provider = providers[index];
    if (provider === undefined) return;
    hooks?.onProvider?.({
      provider: provider.label,
      model: provider.model,
      index,
      rotated,
      reason,
    });
  };

  return {
    mode: primary.mode,

    async complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
      let index = 0;

      while (index < providers.length) {
        const provider = providers[index];
        if (provider === undefined) {
          throw new InferenceError('not_configured', 'The inference chain is empty.');
        }

        try {
          const response = await clientFor(index).complete(request, signal);
          if (index !== servingIndex) {
            servingIndex = index;
            report(index, index > 0, null);
          }
          return response;
        } catch (error) {
          if (error instanceof InferenceAbortedError) throw error;
          if (!(error instanceof InferenceError)) throw error;
          if (!isRotatable(error)) {
            // A 4xx that is not a throttle is our bug: do not hide it.
            throw error;
          }

          const next = index + 1;
          if (next >= providers.length) {
            // The chain is exhausted. The caller sees the ordinary typed error.
            throw error;
          }

          logger?.warn('inference provider rotated', {
            from: provider.label,
            to: providers[next]?.label ?? 'unknown',
            reason: error.code,
          });
          index = next;
          // The rotation is its own event; the next successful call by this
          // provider must not produce a second one.
          servingIndex = index;
          report(index, true, error.code);
        }
      }

      throw new InferenceError('not_configured', 'The inference chain is empty.');
    },
  };
}
