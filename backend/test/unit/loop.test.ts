/**
 * The agent loop's stopping conditions (§7.4, §7.5).
 *
 * The loop never decides success — it stops, and the run manager verifies in
 * the sandbox. These tests pin the stop reasons, the error codes and the
 * caps.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { runAgentLoop, type AgentLoopOptions } from '../../src/agent/loop.ts';
import { SHR_SUM_RANGE, TEST_COMMAND } from '../../src/agent/workload.ts';
import type { ToolCallOutcome, ToolDispatch } from '../../src/agent/tools.ts';
import { InferenceError } from '../../src/inference/client.ts';
import type { ChatRequest, ChatResponse, InferenceClient } from '../../src/inference/types.ts';

function toolResponse(name: string, args: Record<string, unknown>, id = 'call_1'): ChatResponse {
  return {
    id,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { total_tokens: 10 },
  };
}

function messageResponse(content: string): ChatResponse {
  return {
    id: 'msg',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { total_tokens: 10 },
  };
}

class ScriptedClient implements InferenceClient {
  readonly mode = 'mock' as const;
  readonly requests: ChatRequest[] = [];
  readonly #steps: readonly ChatResponse[];

  constructor(steps: readonly ChatResponse[]) {
    this.#steps = steps;
  }

  async complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
    this.requests.push(request);
    if (signal.aborted) throw new Error('cancelled');
    const step = this.#steps[Math.min(this.requests.length - 1, this.#steps.length - 1)];
    if (step === undefined) throw new Error('no step');
    return step;
  }
}

class FailingClient implements InferenceClient {
  readonly mode = 'mock' as const;
  readonly #error: Error;

  constructor(error: Error) {
    this.#error = error;
  }

  async complete(): Promise<ChatResponse> {
    throw this.#error;
  }
}

function outcome(
  name: 'list_files' | 'read_file' | 'write_file' | 'run_tests',
  options: {
    ok?: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    errorCode?: string | null;
    outcome?: ToolCallOutcome['evidence']['outcome'];
  } = {},
): ToolCallOutcome {
  const ok = options.ok ?? true;
  const exitCode = options.exitCode ?? null;
  const evidenceOutcome = options.outcome ?? (ok ? 'ok' : 'non-zero-exit');
  return {
    name,
    ok,
    modelText: options.stdout ?? 'tool output',
    record: {
      name,
      ok,
      errorCode: options.errorCode ?? null,
      errorMessage: ok ? null : 'The tool failed.',
      bytes: null,
      exitCode,
      durationMs: 5,
    },
    evidence: {
      argv: name === 'run_tests' ? TEST_COMMAND.split(/\s+/) : [],
      cwd: '/work',
      exitCode,
      signal: null,
      stdout: options.stdout ?? '',
      stderr: options.stderr ?? '',
      outcome: evidenceOutcome,
      killReason: null,
      written: null,
    },
  };
}

class RecordingDispatcher implements ToolDispatch {
  readonly calls: { name: string; arguments: string }[] = [];
  readonly #behaviour: (name: string) => ToolCallOutcome;

  constructor(behaviour: (name: string) => ToolCallOutcome) {
    this.#behaviour = behaviour;
  }

  async dispatch(rawName: string, rawArguments: string): Promise<ToolCallOutcome> {
    this.calls.push({ name: rawName, arguments: rawArguments });
    return this.#behaviour(rawName);
  }
}

const LIMITS = { maxToolCalls: 12, maxRepairs: 2, maxTotalTokens: 24_000 };

async function run(
  client: InferenceClient,
  dispatcher: ToolDispatch,
  overrides: Partial<AgentLoopOptions> = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<Awaited<ReturnType<typeof runAgentLoop>>> {
  const recorded: number[] = [];
  return runAgentLoop({
    client,
    dispatcher,
    fixture: SHR_SUM_RANGE,
    goal: 'fix it',
    limits: LIMITS,
    signal,
    emit: () => {},
    recordToolCall: (seq) => {
      recorded.push(seq);
    },
    ...overrides,
  });
}

describe('the agent loop', () => {
  it('stops on a final message and keeps the explanation verbatim', async () => {
    const client = new ScriptedClient([messageResponse('The range was exclusive; it is now inclusive.')]);
    const result = await run(client, new RecordingDispatcher(() => outcome('list_files')));
    assert.equal(result.stopReason, 'final-message');
    assert.equal(result.errorCode, null);
    assert.equal(result.explanation, 'The range was exclusive; it is now inclusive.');
  });

  it('feeds the tool output back to the model as a tool message', async () => {
    const client = new ScriptedClient([
      toolResponse('run_tests', { command: TEST_COMMAND }),
      messageResponse('done'),
    ]);
    const dispatcher = new RecordingDispatcher(() =>
      outcome('run_tests', { stdout: 'AssertionError: 10 != 15', exitCode: 1, ok: false }),
    );
    await run(client, dispatcher);
    assert.equal(dispatcher.calls.length, 1);
    const second = client.requests[1];
    assert.ok(second !== undefined);
    const toolMessages = second.messages.filter((message) => message.role === 'tool');
    assert.equal(toolMessages.length, 1);
    assert.ok(toolMessages[0]?.content?.includes('AssertionError: 10 != 15'));
  });

  it('stops with iteration_cap when the tool-call cap is reached', async () => {
    const client = new ScriptedClient([toolResponse('list_files', {})]);
    const dispatcher = new RecordingDispatcher(() => outcome('list_files'));
    const result = await run(client, dispatcher, { limits: { ...LIMITS, maxToolCalls: 2 } });
    assert.equal(result.stopReason, 'iteration-cap');
    assert.equal(result.errorCode, 'iteration_cap');
    assert.equal(dispatcher.calls.length, 2);
  });

  it('stops with budget_exhausted when the token budget is spent', async () => {
    const client = new ScriptedClient([toolResponse('list_files', {})]);
    const dispatcher = new RecordingDispatcher(() => outcome('list_files'));
    const result = await run(client, dispatcher, { limits: { ...LIMITS, maxTotalTokens: 5 } });
    assert.equal(result.stopReason, 'budget-exhausted');
    assert.equal(result.errorCode, 'budget_exhausted');
  });

  it('allows the initial test run plus two repairs, then stops', async () => {
    const client = new ScriptedClient([toolResponse('run_tests', { command: TEST_COMMAND })]);
    const dispatcher = new RecordingDispatcher(() =>
      outcome('run_tests', {
        stdout: 'FAIL: test_inclusive\nAssertionError: 10 != 15\nRan 1 test',
        exitCode: 1,
        ok: false,
        outcome: 'non-zero-exit',
      }),
    );
    const result = await run(client, dispatcher);
    assert.equal(result.stopReason, 'repair-budget-exhausted');
    assert.equal(result.errorCode, 'repair_budget_exhausted');
    assert.equal(dispatcher.calls.length, 3);
    assert.equal(result.repairAttempts, 2);
    assert.equal(result.lastTestGreen, false);
  });

  it('stops with model_error on a transport failure', async () => {
    const client = new FailingClient(new InferenceError('upstream_5xx', 'The provider failed.'));
    const result = await run(client, new RecordingDispatcher(() => outcome('list_files')));
    assert.equal(result.stopReason, 'model-error');
    assert.equal(result.errorCode, 'model_error');
  });

  it('stops with model_timeout on an inference timeout', async () => {
    const client = new FailingClient(new InferenceError('timeout', 'The provider timed out.'));
    const result = await run(client, new RecordingDispatcher(() => outcome('list_files')));
    assert.equal(result.stopReason, 'model-timeout');
    assert.equal(result.errorCode, 'model_timeout');
  });

  it('stops with cancelled when the run is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new ScriptedClient([messageResponse('never reached')]);
    const result = await run(
      client,
      new RecordingDispatcher(() => outcome('list_files')),
      {},
      controller.signal,
    );
    assert.equal(result.stopReason, 'cancelled');
    assert.equal(result.errorCode, 'cancelled');
  });

  it('records every tool call under a per-run ordinal', async () => {
    const client = new ScriptedClient([
      toolResponse('list_files', {}),
      toolResponse('read_file', { path: 'calculator.py' }),
      messageResponse('done'),
    ]);
    const dispatcher = new RecordingDispatcher((name) =>
      outcome(name === 'read_file' ? 'read_file' : 'list_files'),
    );
    const seqs: number[] = [];
    await run(client, dispatcher, {
      recordToolCall: (seq) => {
        seqs.push(seq);
      },
    });
    assert.deepEqual(seqs, [1, 2]);
  });
});
