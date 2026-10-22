/**
 * The agent loop (§7): plan → execute → explain, with hard caps.
 *
 * Caps, in the order they are checked:
 *   - the tool-call cap (default 12);
 *   - the token budget (default 24 000);
 *   - the repair budget (default 2 repairs, i.e. at most 3 test runs);
 *   - the run's AbortSignal (client cancel, run timeout, shutdown).
 *
 * The loop never decides success. It stops; the run manager verifies in the
 * sandbox and only then sets the run's status.
 */

import type { RunEventType, RunPhase } from '../contracts/events.ts';
import type { TestOutcome } from '../contracts/report.ts';
import type { WorkloadFixture } from '../contracts/workload.ts';
import type { InferenceClient } from '../inference/types.ts';
import type { ChatMessage, ChatResponse, ChatToolCall } from '../inference/types.ts';
import { InferenceAbortedError, InferenceError } from '../inference/client.ts';
import type { Logger } from '../log.ts';
import { buildStartingMessage, buildSystemPrompt } from './prompt.ts';
import type { ToolCallOutcome, ToolDispatcher } from './tools.ts';
import { TOOL_DEFINITIONS, isGreen, toTestOutcome } from './workload.ts';

export interface AgentLimits {
  readonly maxToolCalls: number;
  readonly maxRepairs: number;
  readonly maxTotalTokens: number;
}

export type AgentStopReason =
  | 'final-message'
  | 'iteration-cap'
  | 'budget-exhausted'
  | 'repair-budget-exhausted'
  | 'model-error'
  | 'model-timeout'
  | 'cancelled';

export interface AgentLoopResult {
  readonly stopReason: AgentStopReason;
  /** The run-level error code this stop maps to, or `null` for a normal stop. */
  readonly errorCode: string | null;
  /** The final assistant message, verbatim. */
  readonly explanation: string | null;
  /** The agent's claim about what it did, before verification. */
  readonly modelClaim: string | null;
  readonly iterations: number;
  readonly toolCalls: number;
  readonly totalTokens: number;
  readonly repairAttempts: number;
  /** The last real test run the agent performed, or `null`. */
  readonly lastTestOutcome: TestOutcome | null;
  readonly lastTestGreen: boolean;
}

export type EmitEvent = (
  type: RunEventType,
  phase: RunPhase,
  label: string,
  detail?: Readonly<Record<string, unknown>>,
) => void;

export interface AgentLoopOptions {
  readonly client: InferenceClient;
  readonly dispatcher: ToolDispatcher;
  readonly fixture: WorkloadFixture;
  readonly goal: string;
  readonly limits: AgentLimits;
  readonly signal: AbortSignal;
  readonly emit: EmitEvent;
  /** Persists one tool call under its per-run ordinal. */
  readonly recordToolCall: (seq: number, outcome: ToolCallOutcome) => void;
  readonly logger?: Logger;
}

function redactForEvent(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    output[key] = /token|key|secret|password|authorization/i.test(key) ? '[redacted]' : entry;
  }
  return output;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { client, dispatcher, fixture, goal, limits, signal, emit, recordToolCall } = options;
  const logger = options.logger;

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(goal) },
    { role: 'user', content: buildStartingMessage(fixture.files) },
  ];

  let iterations = 0;
  let toolCalls = 0;
  let totalTokens = 0;
  let repairsUsed = 0;
  let previousTestFailed = false;
  let modelClaim: string | null = null;
  let lastTestOutcome: TestOutcome | null = null;
  let lastTestGreen = false;

  emit('agent.plan', 'planning', 'Agent planned', {
    workload: fixture.workload,
    goal,
    tools: TOOL_DEFINITIONS.map((tool) => tool.name),
  });

  const finish = (
    stopReason: AgentStopReason,
    errorCode: string | null,
    explanation: string | null,
  ): AgentLoopResult => ({
    stopReason,
    errorCode,
    explanation,
    modelClaim,
    iterations,
    toolCalls,
    totalTokens,
    repairAttempts: repairsUsed,
    lastTestOutcome,
    lastTestGreen,
  });

  while (true) {
    if (signal.aborted) return finish('cancelled', 'cancelled', null);
    if (toolCalls >= limits.maxToolCalls) {
      return finish('iteration-cap', 'iteration_cap', modelClaim);
    }
    if (totalTokens >= limits.maxTotalTokens) {
      return finish('budget-exhausted', 'budget_exhausted', modelClaim);
    }

    iterations += 1;

    let response: ChatResponse;
    try {
      response = await client.complete(
        { messages, tools: [...TOOL_DEFINITIONS].map((tool) => ({
          type: 'function' as const,
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })), tool_choice: 'auto' },
        signal,
      );
    } catch (error) {
      if (signal.aborted || error instanceof InferenceAbortedError) {
        return finish('cancelled', 'cancelled', null);
      }
      if (error instanceof InferenceError) {
        logger?.warn('agent loop stopped on inference error', {
          code: error.code,
          detail: error.detail,
        });
        return error.code === 'timeout'
          ? finish('model-timeout', 'model_timeout', modelClaim)
          : finish('model-error', 'model_error', modelClaim);
      }
      throw error;
    }

    const choice = response.choices[0];
    if (choice === undefined) {
      return finish('model-error', 'model_error', modelClaim);
    }
    const message = choice.message;
    const assistantText = typeof message.content === 'string' ? message.content.trim() : '';
    const calls: readonly ChatToolCall[] = message.tool_calls ?? [];

    const promptChars = messages.reduce((total, entry) => total + (entry.content?.length ?? 0), 0);
    const completionChars =
      assistantText.length + calls.reduce((total, call) => total + call.function.arguments.length, 0);
    totalTokens +=
      response.usage?.total_tokens !== undefined
        ? response.usage.total_tokens
        : Math.ceil((promptChars + completionChars) / 4);

    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });

    if (assistantText.length > 0) {
      emit('agent.message', calls.length > 0 ? 'executing' : 'planning', 'Agent message', {
        text: assistantText,
        toolCalls: calls.length,
      });
    }

    if (calls.length === 0) {
      if (assistantText.length > 0) {
        emit('agent.message', 'planning', 'Agent explained', { text: assistantText });
        return finish('final-message', null, assistantText);
      }
      // An empty final message is not an answer; treat it as an iteration cap
      // rather than looping forever.
      return finish('iteration-cap', 'iteration_cap', modelClaim);
    }

    if (assistantText.length > 0) modelClaim = assistantText;

    for (const call of calls) {
      if (signal.aborted) return finish('cancelled', 'cancelled', modelClaim);
      if (toolCalls >= limits.maxToolCalls) {
        return finish('iteration-cap', 'iteration_cap', modelClaim);
      }
      if (totalTokens >= limits.maxTotalTokens) {
        return finish('budget-exhausted', 'budget_exhausted', modelClaim);
      }

      const toolName = call.function.name;
      const rawArguments = call.function.arguments;

      let parsedArguments: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(rawArguments === '' ? '{}' : rawArguments);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          parsedArguments = parsed as Record<string, unknown>;
        }
      } catch {
        parsedArguments = {};
      }

      const requestedCommand =
        typeof parsedArguments['command'] === 'string' ? parsedArguments['command'].trim() : null;
      const isTestRun = toolName === 'run_tests' && (requestedCommand ?? fixture.testCommand) === fixture.testCommand;

      /*
       * The repair budget is checked BEFORE the test command runs. The first
       * failing run is not a repair; each subsequent run is. Three test runs
       * total (the initial one plus two repairs) is the ceiling.
       */
      if (isTestRun && previousTestFailed) {
        if (repairsUsed >= limits.maxRepairs) {
          emit('agent.message', 'executing', 'Repair budget exhausted', {
            repairsUsed,
            maxRepairs: limits.maxRepairs,
          });
          return finish('repair-budget-exhausted', 'repair_budget_exhausted', modelClaim);
        }
        repairsUsed += 1;
      }

      toolCalls += 1;
      emit('tool.call', 'executing', toolName, {
        name: toolName,
        arguments: redactForEvent(parsedArguments),
      });

      const outcome = await dispatcher.dispatch(toolName, rawArguments);
      recordToolCall(toolCalls, outcome);
      emit('tool.result', 'executing', `${toolName}: ${outcome.ok ? 'ok' : 'error'}`, {
        name: toolName,
        ok: outcome.ok,
        errorCode: outcome.record.errorCode,
        exitCode: outcome.record.exitCode,
        durationMs: outcome.record.durationMs,
        outcome: outcome.evidence.outcome,
      });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: toolName,
        content: outcome.modelText,
      });

      if (isTestRun) {
        lastTestOutcome = toTestOutcome(
          fixture.testCommand,
          outcome.evidence.stdout,
          outcome.evidence.stderr,
          outcome.evidence.exitCode,
        );
        lastTestGreen = isGreen(lastTestOutcome);
        previousTestFailed = outcome.evidence.outcome !== 'ok';
      }
    }
  }
}
