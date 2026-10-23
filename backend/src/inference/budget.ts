/**
 * A hard token budget for one run (brief 08).
 *
 * The budget covers the whole run: prompt and completion tokens summed over
 * every model call. The wrapper counts the usage the provider reports and
 * hands the running total to the owner, which decides what to do about it.
 *
 * The counting is honest: when a provider reports its usage, that is the
 * number used. When it does not, the same four-characters-per-token estimate
 * the agent loop uses is applied, and it is an estimate — not a measurement —
 * so it is only ever used for the *stop* decision, never written into the
 * report as a measured fact.
 */

import type { Logger } from '../log.ts';
import type { ChatRequest, ChatResponse, InferenceClient } from './types.ts';

export interface BudgetedClientOptions {
  readonly client: InferenceClient;
  /** The run's budget in tokens. `0` disables the budget entirely. */
  readonly budget: number;
  /** Called after every call with the run's cumulative token usage. */
  readonly onUsage: (cumulative: number) => void;
  readonly logger?: Logger;
}

/** The same estimate the agent loop uses when a provider reports no usage. */
function estimateTokens(request: ChatRequest, response: ChatResponse): number {
  const promptChars = request.messages.reduce(
    (total, message) => total + (message.content?.length ?? 0),
    0,
  );
  const completionChars = response.choices.reduce((total, choice) => {
    const content = choice.message.content?.length ?? 0;
    const calls = (choice.message.tool_calls ?? []).reduce(
      (sum, call) => sum + call.function.arguments.length,
      0,
    );
    return total + content + calls;
  }, 0);
  return Math.ceil((promptChars + completionChars) / 4);
}

export function createBudgetedClient(options: BudgetedClientOptions): InferenceClient {
  let cumulative = 0;

  return {
    mode: options.client.mode,

    async complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
      const response = await options.client.complete(request, signal);

      const reported = response.usage?.total_tokens;
      const used =
        reported !== undefined && Number.isFinite(reported) && reported > 0
          ? reported
          : estimateTokens(request, response);

      cumulative += used;
      options.onUsage(cumulative);

      if (options.budget > 0 && cumulative > options.budget) {
        options.logger?.warn('run token budget reached', {
          cumulative,
          budget: options.budget,
        });
      }

      return response;
    },
  };
}
