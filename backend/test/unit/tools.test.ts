/**
 * Tool dispatch (§7.6). The model's arguments are untrusted: an unsafe path is
 * rejected before any I/O, and a command the project does not declare is
 * refused before the sandbox is touched.
 */

import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ToolDispatcher } from '../../src/agent/tools.ts';
import { SHR_SUM_RANGE, TEST_COMMAND } from '../../src/agent/workload.ts';
import { assertSafeRelativePath } from '../../src/http/validate.ts';
import type {
  SandboxCommand,
  SandboxDestroyResult,
  SandboxExecResult,
  SandboxFile,
  SandboxSession,
} from '../../src/contracts/sandbox.ts';

class FakeSession implements SandboxSession {
  readonly id = 'sbx_TESTTESTTESTTEST';
  readonly provider = 'standin' as const;
  readonly workDir = '/work';
  readonly limits = {
    wallClockMs: 5_000,
    memoryBytes: 134_217_728,
    cpuSeconds: 60,
    maxProcesses: 64,
    maxFileBytes: 1_048_576,
    maxOutputBytes: 65_536,
    maxOpenFiles: 256,
  };
  readonly enforcement = 'rlimit-only' as const;
  readonly network = {
    direct: 'blocked' as const,
    directMechanism: 'test double',
    broker: { transport: 'unix-socket' as const, endpoint: '/work/.brz/broker.sock', token: 'token' },
    allowlistedHosts: [] as readonly string[],
  };
  readonly createdAt = new Date().toISOString();

  readonly execCalls: SandboxCommand[] = [];
  readonly written: SandboxFile[] = [];

  async writeFiles(files: readonly SandboxFile[]): Promise<void> {
    this.written.push(...files);
  }

  async exec(command: SandboxCommand): Promise<SandboxExecResult> {
    this.execCalls.push(command);
    return {
      exitCode: 0,
      signal: null,
      stdout: 'Ran 2 tests\nOK\n',
      stderr: '',
      truncated: false,
      durationMs: 12,
      timedOut: false,
      killReason: null,
    };
  }

  async verify(): Promise<never> {
    throw new Error('not used');
  }

  async destroy(): Promise<SandboxDestroyResult> {
    return {
      ok: true,
      destroyedAt: new Date().toISOString(),
      verifiedGone: true,
      leftoverResources: [],
      error: null,
    };
  }
}

async function withWorkDir<T>(body: (dir: string, session: FakeSession) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'brz-tools-'));
  const session = new FakeSession();
  try {
    return await body(dir, session);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function dispatcherFor(session: FakeSession, hostWorkDir: string): ToolDispatcher {
  return new ToolDispatcher({
    session,
    hostWorkDir,
    fixture: SHR_SUM_RANGE,
    maxOutputBytes: 65_536,
  });
}

describe('path validation', () => {
  it('rejects the paths that would escape the work directory', () => {
    for (const unsafe of ['/etc/passwd', '../escape', 'a/../b', 'a//b', './a', 'a/']) {
      assert.throws(() => assertSafeRelativePath(unsafe), `expected ${unsafe} to be rejected`);
    }
  });

  it('rejects a NUL byte and an over-long path', () => {
    assert.throws(() => assertSafeRelativePath('a\u0000b'));
    assert.throws(() => assertSafeRelativePath(`${'a'.repeat(300)}`));
  });

  it('accepts a normal relative path', () => {
    assert.equal(assertSafeRelativePath('tests/test_calculator.py'), 'tests/test_calculator.py');
  });
});

describe('the tool dispatcher', () => {
  it('lists the files in the work directory', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch('list_files', '{}');
      assert.equal(result.ok, true);
      assert.ok(result.modelText.includes('Files in the project'));
    });
  });

  it('refuses a path that escapes the work directory and touches nothing', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch('write_file', JSON.stringify({ path: '../escape.py', content: 'x' }));
      assert.equal(result.ok, false);
      assert.equal(result.record.errorCode, 'invalid_path');
      assert.equal(session.execCalls.length, 0);
    });
  });

  it('writes a file and reports exactly what was written', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch(
        'write_file',
        JSON.stringify({ path: 'calculator.py', content: 'print(1)\n' }),
      );
      assert.equal(result.ok, true);
      assert.ok(result.evidence.written !== null);
      assert.equal(result.evidence.written?.content, 'print(1)\n');
      const onDisk = await readFile(path.join(dir, 'calculator.py'), 'utf8');
      assert.equal(onDisk, 'print(1)\n');
    });
  });

  it('refuses a command the project does not declare, without running it', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch(
        'run_tests',
        JSON.stringify({ command: 'rm -rf /' }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.record.errorCode, 'command_not_allowed');
      assert.equal(result.evidence.outcome, 'refused');
      assert.equal(session.execCalls.length, 0);
    });
  });

  it('runs a declared command in the sandbox', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch('run_tests', JSON.stringify({ command: TEST_COMMAND }));
      assert.equal(result.ok, true);
      assert.equal(session.execCalls.length, 1);
      assert.deepEqual(session.execCalls[0]?.argv, TEST_COMMAND.split(/\s+/));
      assert.equal(result.evidence.exitCode, 0);
    });
  });

  it('reports an unknown tool instead of throwing', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch('rm_rf', '{}');
      assert.equal(result.ok, false);
      assert.equal(result.record.errorCode, 'unknown_tool');
    });
  });

  it('reports invalid arguments as a recoverable error', async () => {
    await withWorkDir(async (dir, session) => {
      const dispatcher = dispatcherFor(session, dir);
      const result = await dispatcher.dispatch('read_file', JSON.stringify({ path: 42 }));
      assert.equal(result.ok, false);
      assert.equal(result.record.errorCode, 'invalid_arguments');
    });
  });
});
