/**
 * The deterministic offline mode (`BRZ_INFERENCE_MODE=mock`).
 *
 * It returns a scripted transcript with NO network call. This is a development
 * and CI affordance: `NODE_ENV=production` refuses to start with mock mode on
 * (see `config.ts`), and `npm run demo` is the live demo.
 *
 * The script is the one in §7.3: list → read → run (fail) → write (fix) →
 * run (pass) → final message.
 *
 * **Determinism, stated honestly.** Two offline runs are identical in
 * everything the control plane decides — the transcript, the commands, the
 * exit codes, the verdict, the event sequence, the report's structure — and
 * they differ in the measured facts: durations, timestamps, and the digest
 * over them. The report is not byte-identical between runs, and it must not
 * be: freezing a measurement would be a fabricated number.
 */

import type { ChatRequest, ChatResponse, InferenceClient } from './types.ts';

export type MockStep =
  | {
      readonly kind: 'tool';
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
      /** Assistant text that accompanies the call. */
      readonly content?: string;
    }
  | {
      readonly kind: 'message';
      readonly content: string;
    };

const TEST_COMMAND = 'python3 -m unittest discover -s tests -v';

/**
 * The corrected source. The bug is `range(start, end)`, which excludes `end`;
 * making it `end + 1` is the one-token fix the workload was designed around.
 */
export const SHR_FIXED_CALCULATOR = `def sum_range(start, end):
    """Return the sum of the integers from start to end, inclusive."""
    return sum(range(start, end + 1))
`;

export const SHR_SUM_RANGE_SCRIPT: readonly MockStep[] = [
  {
    kind: 'tool',
    name: 'list_files',
    arguments: {},
    content: 'I will start by looking at the project.',
  },
  {
    kind: 'tool',
    name: 'read_file',
    arguments: { path: 'calculator.py' },
  },
  {
    kind: 'tool',
    name: 'run_tests',
    arguments: { command: TEST_COMMAND },
    content: 'The docstring says inclusive, so let me see the real failure first.',
  },
  {
    kind: 'tool',
    name: 'write_file',
    arguments: { path: 'calculator.py', content: SHR_FIXED_CALCULATOR },
    content: 'I updated `calculator.py` so the range includes `end`.',
  },
  {
    kind: 'tool',
    name: 'run_tests',
    arguments: { command: TEST_COMMAND },
  },
  {
    kind: 'message',
    content:
      '`sum_range` used `range(start, end)`, which excludes `end`, but the docstring and the tests both ' +
      'specify an inclusive range. The first test expected 15 for (1, 5) but got 10. I changed the sum ' +
      'to `sum(range(start, end + 1))`, which makes the range inclusive without changing the start bound. ' +
      'Both tests now pass.',
  },
];

function usageFor(request: ChatRequest, completion: string): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
} {
  const promptChars = request.messages.reduce((total, message) => total + (message.content?.length ?? 0), 0);
  const prompt = Math.max(1, Math.ceil(promptChars / 4));
  const completionTokens = Math.max(1, Math.ceil(completion.length / 4));
  return {
    prompt_tokens: prompt,
    completion_tokens: completionTokens,
    total_tokens: prompt + completionTokens,
  };
}

export interface MockClientOptions {
  readonly script?: readonly MockStep[];
  /** Used in the response id so a transcript is traceable in logs. */
  readonly idPrefix?: string;
}

/**
 * A scripted client. Each `complete()` call returns the next step, so the
 * transcript is byte-deterministic for a given run.
 */
export function createMockClient(options: MockClientOptions = {}): InferenceClient {
  const script = options.script ?? SHR_SUM_RANGE_SCRIPT;
  const idPrefix = options.idPrefix ?? 'mock';
  let cursor = 0;

  return {
    mode: 'mock',

    async complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse> {
      if (signal.aborted) {
        throw new Error('The mock inference request was cancelled.');
      }
      const step = script[cursor];
      cursor += 1;

      const index = cursor;
      if (step === undefined) {
        const content = 'The project is fixed and both tests pass.';
        return {
          id: `${idPrefix}-${index}`,
          model: 'mock',
          choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: usageFor(request, content),
        };
      }

      if (step.kind === 'message') {
        return {
          id: `${idPrefix}-${index}`,
          model: 'mock',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: step.content },
              finish_reason: 'stop',
            },
          ],
          usage: usageFor(request, step.content),
        };
      }

      const argumentsJson = JSON.stringify(step.arguments);
      return {
        id: `${idPrefix}-${index}`,
        model: 'mock',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: step.content ?? null,
              tool_calls: [
                {
                  id: `call_${index}`,
                  type: 'function',
                  function: { name: step.name, arguments: argumentsJson },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: usageFor(request, step.content ?? argumentsJson),
      };
    },
  };
}
