import type { InferenceClient } from '../inference/types.ts';
import type { ChatRequest } from '../inference/types.ts';
import type { Stores } from '../db/store/index.ts';

export interface SessionLoopInput {
  readonly stores: Stores;
  readonly sessionInternal: number;
  readonly userContent: string;
  readonly inference: InferenceClient;
  readonly maxTokens: number;
}

export interface SessionLoopResult {
  readonly assistantContent: string;
  readonly runId: string | null;
}

/**
 * A multi-turn loop: append the user message, build context from the session's
 * compacted summary + recent messages, call the model, store the assistant
 * reply. Returns the assistant content.
 */
export async function runSessionTurn(input: SessionLoopInput): Promise<string> {
  const { stores, sessionInternal, userContent, inference } = input;
  void userContent;

  // build context (the user message was appended by the route)
  const session = stores.sessions.getByInternal(sessionInternal);
  const compacted = session?.compactedSummary ?? null;
  const msgs = stores.messages.list(sessionInternal);

  const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  if (compacted) {
    chatMessages.push({ role: 'system', content: `Summary of earlier conversation:\n${compacted}` });
  }
  for (const m of msgs) {
    chatMessages.push({ role: m.role, content: m.content });
  }

  // trim: if total content exceeds ~8000 tokens (estimated), drop oldest non-system messages
  const estimate = (s: string) => Math.ceil(s.length / 4);
  let total = chatMessages.reduce((a, m) => a + estimate(m.content), 0);
  while (total > 8000 && chatMessages.length > 2) {
    // remove the oldest non-system message
    const idx = chatMessages.findIndex((m) => m.role !== 'system');
    if (idx === -1) break;
    const removed = chatMessages.splice(idx, 1)[0];
    if (removed) total -= estimate(removed.content);
  }

  const request: ChatRequest = { messages: chatMessages as any };
  const response = await inference.complete(request, new AbortController().signal);
  const assistant = response.choices?.[0]?.message?.content ?? '';

  stores.messages.add(sessionInternal, 'assistant', assistant);
  stores.sessions.touchByInternal?.(sessionInternal);
  return assistant;
}
