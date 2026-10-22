/**
 * The OpenAI-compatible chat-completion shapes the control plane uses.
 *
 * Only the subset Phase 1 needs. Streaming is OFF in Phase 1 (§7.3), so the
 * response is a single JSON object.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface ChatMessage {
  readonly role: ChatRole;
  /** `null` on an assistant message that only contains tool calls. */
  readonly content: string | null;
  readonly tool_calls?: readonly ChatToolCall[];
  /** Required on a `tool` message: which call it answers. */
  readonly tool_call_id?: string;
  /** Optional tool name on a `tool` message. */
  readonly name?: string;
}

export interface ChatToolDefinition {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ChatToolDefinition[];
  readonly tool_choice?: 'auto' | 'none';
  readonly temperature?: number;
}

export interface ChatUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

export interface ChatChoice {
  readonly index?: number;
  readonly message: ChatMessage;
  readonly finish_reason?: string | null;
}

export interface ChatResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices: readonly ChatChoice[];
  readonly usage?: ChatUsage;
}

/** The seam the agent loop talks to. `live` and `mock` both implement it. */
export interface InferenceClient {
  readonly mode: 'live' | 'mock';
  complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>;
}
