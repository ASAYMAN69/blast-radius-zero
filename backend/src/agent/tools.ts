/**
 * The four tools, their validation, and their dispatch to the sandbox
 * (§7.6). The model's arguments are untrusted: they are parsed, validated
 * against the tool's contract, and path-checked before any I/O.
 */

import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SandboxKillReason, SandboxSession } from '../contracts/sandbox.ts';
import type { WorkloadFixture } from '../contracts/workload.ts';
import { assertSafeRelativePath } from '../http/validate.ts';

export type ToolName = 'list_files' | 'read_file' | 'write_file' | 'run_tests';

export interface ToolCallRequest {
  readonly name: ToolName;
  readonly arguments: Record<string, unknown>;
}

export interface ToolCallRecord {
  readonly name: ToolName;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly bytes: number | null;
  readonly exitCode: number | null;
  readonly durationMs: number;
}

export interface ToolCallOutcome {
  readonly name: ToolName;
  readonly ok: boolean;
  /** The text handed back to the model. */
  readonly modelText: string;
  /** The machine-readable result, stored in `tool_calls`. */
  readonly record: ToolCallRecord;
  /**
   * The raw execution evidence, stored in `tool_calls` and projected into the
   * report's `code.commands`. This is additive to the frozen record shape: the
   * frozen record is about the model's view, this is about the run's evidence.
   */
  readonly evidence: ToolEvidence;
}

export interface ToolEvidence {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly outcome: 'ok' | 'non-zero-exit' | 'killed' | 'timed-out' | 'refused';
  readonly killReason: SandboxKillReason | null;
}

export interface ToolDispatcherOptions {
  readonly session: SandboxSession;
  /** Absolute HOST path of the same directory the sandbox sees at `/work`. */
  readonly hostWorkDir: string;
  readonly fixture: WorkloadFixture;
  readonly maxOutputBytes: number;
}

const MAX_LISTED_FILES = 200;

class ToolInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ToolInputError';
    this.code = code;
  }
}

function rejectUnknownKeys(args: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new ToolInputError('invalid_arguments', `Unexpected argument "${key}".`);
    }
  }
}

function requireArgString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new ToolInputError('invalid_arguments', `Argument "${key}" must be a string.`);
  }
  return value;
}

function optionalArgString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ToolInputError('invalid_arguments', `Argument "${key}" must be a string.`);
  }
  return value;
}

export class ToolDispatcher {
  readonly #session: SandboxSession;
  readonly #hostWorkDir: string;
  readonly #fixture: WorkloadFixture;
  readonly #maxOutputBytes: number;

  constructor(options: ToolDispatcherOptions) {
    this.#session = options.session;
    this.#hostWorkDir = path.resolve(options.hostWorkDir);
    this.#fixture = options.fixture;
    this.#maxOutputBytes = options.maxOutputBytes;
  }

  /**
   * Resolve a validated relative path to a host path inside the work dir,
   * following symlinks for the parts that exist so a symlink cannot escape.
   */
  async #resolveHostPath(relative: string): Promise<string> {
    let safe: string;
    try {
      safe = assertSafeRelativePath(relative);
    } catch {
      throw new ToolInputError('invalid_path', 'The path is not allowed.');
    }
    const resolved = path.resolve(this.#hostWorkDir, safe);
    if (resolved !== this.#hostWorkDir && !resolved.startsWith(`${this.#hostWorkDir}${path.sep}`)) {
      throw new ToolInputError('invalid_path', 'The path escapes the project directory.');
    }
    try {
      const real = await realpath(resolved);
      if (real !== this.#hostWorkDir && !real.startsWith(`${this.#hostWorkDir}${path.sep}`)) {
        throw new ToolInputError('invalid_path', 'The path escapes the project directory.');
      }
    } catch {
      // The target does not exist yet; the pessimistic parent check is done by
      // resolving the parent below.
      const parent = path.dirname(resolved);
      try {
        const realParent = await realpath(parent);
        if (realParent !== this.#hostWorkDir && !realParent.startsWith(`${this.#hostWorkDir}${path.sep}`)) {
          throw new ToolInputError('invalid_path', 'The path escapes the project directory.');
        }
      } catch (error) {
        if (error instanceof ToolInputError) throw error;
      }
    }
    return resolved;
  }

  async dispatch(rawName: string, rawArguments: string): Promise<ToolCallOutcome> {
    const startedAt = performance.now();
    const name = rawName as ToolName;

    if (!['list_files', 'read_file', 'write_file', 'run_tests'].includes(rawName)) {
      return this.#failure(rawName as ToolName, 'unknown_tool', `There is no tool named "${rawName}".`, startedAt);
    }

    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawArguments === '' ? '{}' : rawArguments);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ToolInputError('invalid_arguments', 'The arguments must be a JSON object.');
      }
      args = parsed as Record<string, unknown>;
    } catch (error) {
      const message =
        error instanceof ToolInputError ? error.message : 'The arguments were not valid JSON.';
      return this.#failure(name, 'invalid_arguments', message, startedAt);
    }

    try {
      switch (name) {
        case 'list_files':
          return await this.#listFiles(args, startedAt);
        case 'read_file':
          return await this.#readFile(args, startedAt);
        case 'write_file':
          return await this.#writeFile(args, startedAt);
        case 'run_tests':
          return await this.#runTests(args, startedAt);
        default:
          return this.#failure(name, 'unknown_tool', `There is no tool named "${rawName}".`, startedAt);
      }
    } catch (error) {
      if (error instanceof ToolInputError) {
        return this.#failure(name, error.code, error.message, startedAt);
      }
      return this.#failure(
        name,
        'tool_error',
        'The tool failed to run. Check the path and try again.',
        startedAt,
      );
    }
  }

  async #listFiles(args: Record<string, unknown>, startedAt: number): Promise<ToolCallOutcome> {
    rejectUnknownKeys(args, ['path']);
    const requested = optionalArgString(args, 'path');
    const root = requested === null || requested === '' ? '' : assertSafeRelativePath(requested);
    const hostRoot = root === '' ? this.#hostWorkDir : await this.#resolveHostPath(root);

    const entries: string[] = [];
    const walk = async (absolute: string, relative: string): Promise<void> => {
      if (entries.length >= MAX_LISTED_FILES) return;
      const directoryEntries = await readdir(absolute, { withFileTypes: true });
      directoryEntries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of directoryEntries) {
        if (entries.length >= MAX_LISTED_FILES) return;
        if (entry.name === '.brz' || entry.name === '__pycache__') continue;
        const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          entries.push(`${childRelative}/`);
          await walk(path.join(absolute, entry.name), childRelative);
        } else if (entry.isFile()) {
          entries.push(childRelative);
        }
      }
    };

    let isDirectory = false;
    try {
      isDirectory = (await stat(hostRoot)).isDirectory();
    } catch {
      return this.#failure('list_files', 'not_found', `No such directory: ${root || '.'}`, startedAt);
    }
    if (!isDirectory) {
      return this.#failure('list_files', 'invalid_path', 'That path is a file, not a directory.', startedAt);
    }
    await walk(hostRoot, root);

    const listing = entries.join('\n');
    return this.#success(
      'list_files',
      `Files in the project (${entries.length}):\n${listing || '(empty)'}`,
      startedAt,
      { bytes: Buffer.byteLength(listing, 'utf8'), stdout: listing },
    );
  }

  async #readFile(args: Record<string, unknown>, startedAt: number): Promise<ToolCallOutcome> {
    rejectUnknownKeys(args, ['path']);
    const filePath = requireArgString(args, 'path');
    const hostPath = await this.#resolveHostPath(filePath);

    let content: string;
    try {
      const info = await stat(hostPath);
      if (!info.isFile()) {
        return this.#failure('read_file', 'invalid_path', 'That path is not a file.', startedAt);
      }
      if (info.size > this.#maxOutputBytes) {
        const handle = await readFile(hostPath, 'utf8');
        content = `${handle.slice(0, this.#maxOutputBytes)}\n…[truncated at ${this.#maxOutputBytes} bytes]`;
      } else {
        content = await readFile(hostPath, 'utf8');
      }
    } catch {
      return this.#failure('read_file', 'not_found', `No such file: ${filePath}`, startedAt);
    }

    return this.#success('read_file', `Contents of ${filePath}:\n${content}`, startedAt, {
      bytes: Buffer.byteLength(content, 'utf8'),
      stdout: content,
    });
  }

  async #writeFile(args: Record<string, unknown>, startedAt: number): Promise<ToolCallOutcome> {
    rejectUnknownKeys(args, ['path', 'content']);
    const filePath = requireArgString(args, 'path');
    const content = requireArgString(args, 'content');
    const hostPath = await this.#resolveHostPath(filePath);

    await mkdir(path.dirname(hostPath), { recursive: true });
    await writeFile(hostPath, content, { encoding: 'utf8', mode: 0o644 });

    const bytes = Buffer.byteLength(content, 'utf8');
    return this.#success('write_file', `Wrote ${filePath} (${bytes} bytes).`, startedAt, {
      bytes,
      stdout: '',
    });
  }

  async #runTests(args: Record<string, unknown>, startedAt: number): Promise<ToolCallOutcome> {
    rejectUnknownKeys(args, ['command']);
    const requested = optionalArgString(args, 'command');
    const command = (requested ?? this.#fixture.testCommand).trim();

    /*
     * The command check happens BEFORE the sandbox is touched (§7.6 rule 2).
     * A refusal is a denied capability request: it is recorded and reported,
     * not treated as a system error.
     */
    if (!this.#fixture.allowedCommands.includes(command)) {
      const message =
        `Refused: "${command}" is not a command this project declares. ` +
        `Allowed: ${this.#fixture.allowedCommands.join(', ')}.`;
      return {
        name: 'run_tests',
        ok: false,
        modelText: `ERROR command_not_allowed — ${message}`,
        record: {
          name: 'run_tests',
          ok: false,
          errorCode: 'command_not_allowed',
          errorMessage: 'The command is not declared by the project.',
          bytes: null,
          exitCode: null,
          durationMs: Math.round(performance.now() - startedAt),
        },
        evidence: {
          argv: command.length === 0 ? [] : command.split(/\s+/),
          cwd: this.#session.workDir,
          exitCode: null,
          signal: null,
          stdout: '',
          stderr: '',
          outcome: 'refused',
          killReason: null,
        },
      };
    }

    const argv = command.split(/\s+/);
    const result = await this.#session.exec({ argv, cwd: '.', timeoutMs: this.#session.limits.wallClockMs });

    const cap = this.#maxOutputBytes;
    const stdout = result.stdout.slice(0, cap);
    const stderr = result.stderr.slice(0, cap);
    const outputBytes = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8');

    const outcome: ToolEvidence['outcome'] =
      result.killReason === 'wall-clock-timeout'
        ? 'timed-out'
        : result.killReason !== null
          ? 'killed'
          : result.exitCode === 0
            ? 'ok'
            : 'non-zero-exit';

    const summary = result.timedOut
      ? `Command timed out after ${result.durationMs} ms.`
      : `Command exited with ${result.exitCode ?? 'no exit code'}${result.signal === null ? '' : ` (signal ${result.signal})`} in ${result.durationMs} ms.`;
    const modelText = [
      summary,
      stdout.length > 0 ? `stdout:\n${stdout}` : '',
      stderr.length > 0 ? `stderr:\n${stderr}` : '',
    ]
      .filter((part) => part.length > 0)
      .join('\n');

    const ok = result.exitCode === 0 && result.killReason === null;

    return {
      name: 'run_tests',
      ok,
      modelText,
      record: {
        name: 'run_tests',
        ok,
        errorCode: ok ? null : result.timedOut ? 'timeout' : 'exit_nonzero',
        errorMessage: ok
          ? null
          : result.timedOut
            ? 'The command timed out.'
            : 'The command exited non-zero.',
        bytes: outputBytes,
        exitCode: result.exitCode,
        durationMs: Math.round(result.durationMs),
      },
      evidence: {
        argv,
        cwd: this.#session.workDir,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout,
        stderr,
        outcome,
        killReason: result.killReason,
      },
    };
  }

  #success(
    name: ToolName,
    modelText: string,
    startedAt: number,
    data: { bytes: number; stdout: string },
  ): ToolCallOutcome {
    return {
      name,
      ok: true,
      modelText,
      record: {
        name,
        ok: true,
        errorCode: null,
        errorMessage: null,
        bytes: data.bytes,
        exitCode: null,
        durationMs: Math.round(performance.now() - startedAt),
      },
      evidence: {
        argv: [],
        cwd: this.#session.workDir,
        exitCode: null,
        signal: null,
        stdout: data.stdout,
        stderr: '',
        outcome: 'ok',
        killReason: null,
      },
    };
  }

  #failure(name: ToolName, code: string, message: string, startedAt: number): ToolCallOutcome {
    return {
      name,
      ok: false,
      modelText: `ERROR ${code} — ${message}`,
      record: {
        name,
        ok: false,
        errorCode: code,
        errorMessage: message,
        bytes: null,
        exitCode: null,
        durationMs: Math.round(performance.now() - startedAt),
      },
      evidence: {
        argv: [],
        cwd: this.#session.workDir,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        outcome: 'refused',
        killReason: null,
      },
    };
  }
}
