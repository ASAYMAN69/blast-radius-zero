/**
 * The run state machine (§3.2, §7.7).
 *
 *   queued → running → {succeeded | failed | cancelled}
 *
 * Responsibilities:
 *  - accept a run and persist it before the 202 is returned;
 *  - give the run an `AbortController` (client cancel, wall-clock budget,
 *    shutdown) and destroy the sandbox in a `finally`, always;
 *  - drive the agent loop against the inference client;
 *  - record every tool call, command, resource sample and lifecycle row;
 *  - verify in the sandbox — the sandbox decides success, never the model;
 *  - assemble and persist the blast-radius report from those records.
 *
 * Ordering note: the report is assembled AFTER teardown, because `lifecycle.*`
 * and `containment.lifecycle` are teardown facts (§6.6) and the report must
 * contain the real `destroyedAt`. The §7.1 diagram shows REPORTING before
 * TEARDOWN; a report written before the destroy could only guess those fields.
 * This deviation is recorded in the brief-04 summary.
 */

import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config, FallbackProviderConfig } from '../config.ts';
import type {
  CancelRunResponse,
  RunSource,
  SubmitRunResponse,
  WorkloadId,
} from '../contracts/api.ts';
import type { RunEventType, RunPhase, RunStatus } from '../contracts/events.ts';
import type {
  SandboxCreateSpec,
  SandboxDestroyResult,
  SandboxProvider,
  SandboxSession,
} from '../contracts/sandbox.ts';
import { SandboxError } from '../contracts/sandbox.ts';
import type { TestOutcome } from '../contracts/report.ts';
import type { WorkloadFixture } from '../contracts/workload.ts';
import type { Stores } from '../db/store/index.ts';
import type { InferenceClient } from '../inference/types.ts';
import type { Logger } from '../log.ts';
import { ApiError } from '../http/errors.ts';
import { assertSafeRelativePath } from '../http/validate.ts';
import {
  type AgentLoopResult,
  type EmitEvent,
  runAgentLoop,
} from '../agent/loop.ts';
import { ToolDispatcher } from '../agent/tools.ts';
import type { ToolCallOutcome } from '../agent/tools.ts';
import { createBroker } from '../broker/server.ts';
import { createBudgetedClient } from '../inference/budget.ts';
import { createChainedClient, type ProviderEvent } from '../inference/chain.ts';
import {
  createFilesFixture,
  getFixture,
  isGreen,
  isKnownWorkload,
  toTestOutcome,
} from '../agent/workload.ts';
import {
  newBrokerToken,
  newRunId,
  sha256Hex,
} from './ids.ts';
import {
  assembleReport,
  SEED_ARTIFACT_PREFIX,
  VERIFICATION_ARTIFACT,
  WRITE_ARTIFACT_PREFIX,
  type SandboxCreateDetail,
  type SandboxExecDetail,
} from './report.ts';

export interface SubmitRunInput {
  readonly workload: WorkloadId;
  readonly task: string;
  readonly source: RunSource;
}

/**
 * Every error code a run can end with.
 *
 * These are RUN errors: they are written to `runs.error_code` and shown on the
 * run, never returned as an HTTP status. The HTTP error codes live in
 * `contracts/api.ts` and are a different, frozen list.
 */
export type RunErrorCode =
  | 'tests_not_green'
  | 'iteration_cap'
  | 'budget_exhausted'
  | 'repair_budget_exhausted'
  | 'token_budget_exhausted'
  | 'model_error'
  | 'model_timeout'
  | 'sandbox_error'
  | 'timeout'
  | 'cancelled'
  | 'internal_error'
  | 'interrupted';

export interface RunManagerOptions {
  readonly config: Config;
  readonly stores: Stores;
  readonly provider: SandboxProvider;
  /** A fresh client per run: the mock's transcript is a per-run cursor. */
  readonly createInference: () => InferenceClient;
  /**
   * Injected in tests so a fallback never reaches the network. In production
   * the chain builds a live client for each fallback entry.
   */
  readonly createFallbackClient?: (entry: FallbackProviderConfig) => InferenceClient;
  readonly logger: Logger;
}

interface ActiveRun {
  readonly controller: AbortController;
  readonly startedAtMs: number;
  readonly brokerToken: string;
  readonly brokerTokenHash: string;
  session: SandboxSession | null;
}

interface ResolvedSource {
  readonly files: readonly { readonly path: string; readonly content: string }[];
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly fixture: WorkloadFixture;
}

const TERMINAL: readonly RunStatus[] = ['succeeded', 'failed', 'cancelled'];

function isTerminal(status: RunStatus): boolean {
  return TERMINAL.includes(status);
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessageFor(code: string): string {
  switch (code) {
    case 'sandbox_error':
      return 'The sandbox could not be created or was lost.';
    case 'timeout':
      return 'The run exceeded its wall-clock budget.';
    case 'cancelled':
      return 'The run was cancelled.';
    case 'model_error':
      return 'The model provider failed.';
    case 'model_timeout':
      return 'The model provider timed out.';
    case 'tests_not_green':
      return 'The verification test run did not pass.';
    case 'repair_budget_exhausted':
      return 'The repair budget was exhausted.';
    case 'iteration_cap':
      return 'The tool-call cap was reached.';
    case 'budget_exhausted':
      return 'The token budget was exhausted.';
    case 'token_budget_exhausted':
      return 'The run reached its token budget and stopped.';
    default:
      return 'Something went wrong on our side.';
  }
}

function commandOutcome(result: {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly killReason: string | null;
}): SandboxExecDetail['outcome'] {
  if (result.killReason === 'wall-clock-timeout') return 'timed-out';
  if (result.killReason !== null) return 'killed';
  return result.exitCode === 0 ? 'ok' : 'non-zero-exit';
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export class RunManager {
  readonly #config: Config;
  readonly #stores: Stores;
  readonly #provider: SandboxProvider;
  readonly #createInference: () => InferenceClient;
  readonly #createFallbackClient: ((entry: FallbackProviderConfig) => InferenceClient) | undefined;
  readonly #logger: Logger;
  readonly #active = new Map<string, ActiveRun>();

  constructor(options: RunManagerOptions) {
    this.#config = options.config;
    this.#stores = options.stores;
    this.#provider = options.provider;
    this.#createInference = options.createInference;
    this.#createFallbackClient = options.createFallbackClient;
    this.#logger = options.logger;
  }

  get activeCount(): number {
    return this.#active.size;
  }

  /**
   * Accept a run. The row and the `run.queued` event are durable before this
   * returns, so the 202 is a promise the control plane can keep across a crash.
   */
  submit(input: SubmitRunInput): SubmitRunResponse {
    if (!isKnownWorkload(input.workload)) {
      throw new ApiError('invalid_workload');
    }
    if (this.#active.size >= this.#provider.supports.maxParallelSandboxes) {
      throw new ApiError('too_many_runs');
    }

    const resolved = this.#resolveSource(input);
    const runId = newRunId();
    const createdAt = nowIso();
    // The raw token is never stored: only its hash (§9.3). The raw token is
    // delivered out of band to the sandbox and used to authenticate the broker.
    const brokerToken = newBrokerToken();
    const brokerTokenHash = sha256Hex(brokerToken);

    this.#stores.runs.create({
      id: runId,
      workload: input.workload,
      goal: input.task,
      sourceKind: resolved.sourceKind,
      sourceRef: resolved.sourceRef,
      provider: this.#provider.kind,
      brokerTokenHash,
      createdAt,
    });

    this.#stores.events.append({
      runId,
      at: createdAt,
      type: 'run.queued',
      phase: 'queued',
      label: 'Run queued',
      detail: {
        workload: input.workload,
        sourceKind: resolved.sourceKind,
        sourceRef: resolved.sourceRef,
      },
    });

    // Reserve the concurrency slot now, not when the async work starts.
    const active: ActiveRun = {
      controller: new AbortController(),
      startedAtMs: Date.now(),
      brokerToken,
      brokerTokenHash,
      session: null,
    };
    this.#active.set(runId, active);

    this.#logger.info('run accepted', { runId, workload: input.workload, provider: this.#provider.kind });
    setImmediate(() => {
      void this.#execute(runId, resolved);
    });

    return { runId, status: 'queued', createdAt };
  }

  /**
   * `POST /runs/{id}/cancel` — **the supported way to cancel a run.**
   *
   * A client disconnect is honoured only *before* the run's `202` is written:
   * after that the run has been accepted, the console polls it over separate
   * requests, and cancelling on any later socket close would kill healthy runs
   * when the console drops an idle connection. A terminal run is a 409, never
   * a silent no-op.
   */
  cancel(runId: string): CancelRunResponse {
    const run = this.#stores.runs.get(runId);
    if (run === null) throw new ApiError('run_not_found');
    if (isTerminal(run.status)) throw new ApiError('run_not_cancellable');

    const active = this.#active.get(runId);
    if (active === undefined) throw new ApiError('run_not_cancellable');
    active.controller.abort('cancel');
    return { runId, status: run.status };
  }

  /** Abort every live run and wait for their teardown. Used on SIGTERM. */
  async shutdown(): Promise<void> {
    for (const active of this.#active.values()) active.controller.abort('shutdown');
    const deadline = Date.now() + 10_000;
    while (this.#active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /**
   * A previous process may have died mid-run. Its sandbox is gone with it, so
   * the run can never finish: mark it failed rather than leave the console
   * polling forever. No report is fabricated for it.
   */
  recoverOrphans(): void {
    for (const run of this.#stores.runs.listActive()) {
      const at = nowIso();
      this.#stores.runs.update(run.id, {
        status: 'failed',
        phase: 'done',
        errorCode: 'interrupted',
        errorMessage: 'The control plane restarted while this run was in flight.',
        finishedAt: at,
      });
      this.#stores.events.append({
        runId: run.id,
        at,
        type: 'run.failed',
        phase: 'done',
        label: 'Run interrupted',
        detail: { errorCode: 'interrupted' },
      });
      this.#logger.warn('orphaned run marked failed', { runId: run.id });
    }
  }

  #resolveSource(input: SubmitRunInput): ResolvedSource {
    const source = input.source;
    if (source.kind === 'fixture') {
      const fixture = getFixture(source.fixtureId);
      if (fixture === null || fixture.workload !== input.workload) {
        throw new ApiError('invalid_source', [
          { field: 'source.fixtureId', issue: 'No such fixture for this workload.' },
        ]);
      }
      return {
        files: fixture.files,
        sourceKind: 'fixture',
        sourceRef: fixture.id,
        fixture,
      };
    }

    if (source.kind === 'files') {
      if (source.files.length === 0) {
        throw new ApiError('invalid_source', [
          { field: 'source.files', issue: 'At least one file is required.' },
        ]);
      }
      const seen = new Set<string>();
      const files = source.files.map((file) => {
        const safe = assertSafeRelativePath(file.path, 'source.files[].path');
        if (seen.has(safe)) {
          throw new ApiError('invalid_source', [
            { field: 'source.files', issue: `Duplicate path: ${safe}` },
          ]);
        }
        seen.add(safe);
        return { path: safe, content: file.content };
      });

      // §9.3: a files source is identified by a digest, not by its contents.
      const digest = sha256Hex(
        [...files]
          .sort((left, right) => left.path.localeCompare(right.path))
          .map((file) => `${file.path}\u0000${file.content}\u0000`)
          .join('\n'),
      );

      return {
        files,
        sourceKind: 'files',
        sourceRef: `sha256:${digest}`,
        fixture: createFilesFixture(files),
      };
    }

    throw new ApiError('invalid_source');
  }

  async #execute(runId: string, resolved: ResolvedSource): Promise<void> {
    const active = this.#active.get(runId);
    if (active === undefined) return;

    const { controller } = active;
    const wallClockBudget = this.#config.runLimits.runWallClockMs;
    const timer = setTimeout(() => controller.abort('timeout'), wallClockBudget);
    timer.unref();

    const events = this.#stores.events;
    const emit: EmitEvent = (
      type: RunEventType,
      phase: RunPhase,
      label: string,
      detail?: Readonly<Record<string, unknown>>,
    ): void => {
      events.append({ runId, at: nowIso(), type, phase, label, detail });
    };

    const hostWorkDir = path.join(this.#config.workRoot, runId);
    let session: SandboxSession | null = null;
    let loopResult: AgentLoopResult | null = null;
    let verification: TestOutcome | null = null;
    let sandboxFailed = false;
    let status: RunStatus = 'failed';
    let errorCode: string | null = 'internal_error';
    let errorMessage: string | null = errorMessageFor('internal_error');
    let tokensUsed = 0;
    let servingProvider: string | null = null;

    /*
     * The inference client for this run, in three layers:
     *
     *   1. the primary client (the scripted mock, or the live client);
     *   2. the fallback chain, so one shared rate limit does not decide
     *      whether the run happens at all;
     *   3. the token budget, so a run can never burn through a shared quota.
     *
     * With no fallbacks configured, layer 2 is the identity and the behaviour
     * is exactly what it was before the chain existed.
     */
    const primaryClient = this.#createInference();
    const fallbacks =
      this.#config.inference.mode === 'live' ? this.#config.inference.fallbacks : [];
    /*
     * The chain is always used, even with no fallbacks: the run has to record
     * which provider served it, and the chain is what knows. With no fallbacks
     * it delegates to the primary and nothing else changes.
     */
    const chainedClient = createChainedClient({
      primary: primaryClient,
      primaryLabel: this.#config.inference.mode === 'mock' ? 'scripted' : 'primary',
      primaryModel: this.#config.inference.model,
      fallbacks,
      timeoutMs: this.#config.inference.timeoutMs,
      logger: this.#logger,
      ...(this.#createFallbackClient === undefined
        ? {}
        : { createFallbackClient: this.#createFallbackClient }),
      hooks: {
        onProvider: (event: ProviderEvent) => {
          servingProvider = event.provider;
          /*
           * The frozen `RunEventType` union has no provider member, and the
           * contracts are frozen for this brief, so the rotation is recorded
           * under the closest existing type with a label and a detail that
           * make it unambiguous. The HEAD may add a `provider.rotated` member
           * later — it is a two-line mirror on the frontend.
           */
          emit(
            event.rotated ? 'provider.rotated' : 'agent.message',
            'planning',
            event.rotated ? `Provider rotated to ${event.provider}` : `Provider: ${event.provider}`,
            {
              provider: event.provider,
              model: event.model,
              rotated: event.rotated,
              reason: event.reason,
              summary: event.rotated
                ? `Rotated to ${event.provider} after ${event.reason}.`
                : `Serving from ${event.provider}.`,
            },
          );
        },
      },
    });

    const client = createBudgetedClient({
      client: chainedClient,
      budget: this.#config.runTokenBudget,
      logger: this.#logger,
      onUsage: (cumulative) => {
        tokensUsed = cumulative;
        if (
          this.#config.runTokenBudget > 0 &&
          cumulative > this.#config.runTokenBudget &&
          !controller.signal.aborted
        ) {
          // A budget-stopped run is a designed outcome, not a crash.
          controller.abort('token_budget');
        }
      },
    });

    try {
      this.#stores.runs.update(runId, {
        status: 'running',
        phase: 'sandbox_starting',
        startedAt: nowIso(),
      });
      emit('run.started', 'sandbox_starting', 'Run started', {
        provider: this.#provider.kind,
        inferenceMode: this.#config.inference.mode,
      });

      await mkdir(hostWorkDir, { recursive: true, mode: 0o700 });
      await mkdir(path.join(hostWorkDir, '.brz'), { recursive: true, mode: 0o700 });

      const broker = createBroker({
        runId,
        workDir: hostWorkDir,
        tokenHash: this.#active.get(runId)!.brokerTokenHash,
        allowlist: this.#config.egress.allowlist,
        maxBytes: this.#config.egress.maxBytes,
        stores: this.#stores,
        emit,
      });
      await broker.start();

      for (const file of resolved.files) {
        const bytes = Buffer.byteLength(file.content, 'utf8');
        this.#stores.artifacts.append({
          runId,
          label: `${SEED_ARTIFACT_PREFIX}${file.path}`,
          kind: 'file',
          content: file.content,
          bytes,
          sha256: sha256Hex(file.content),
          createdAt: nowIso(),
        });
      }

      const spec: SandboxCreateSpec = {
        runId,
        workDir: hostWorkDir,
        limits: this.#config.sandboxLimits,
        broker: {
          transport: 'unix-socket',
          // As seen inside the sandbox (`SandboxSession.workDir` is always /work).
          endpoint: path.posix.join('/work', '.brz', 'broker.sock'),
          token: this.#active.get(runId)!.brokerToken,
        },
        allowlistedHosts: this.#config.egress.allowlist,
        files: resolved.files.map((file) => ({ path: file.path, content: file.content })),
        envAllowlist: ['HOME', 'LANG', 'PATH', 'PWD'],
        metadata: {
          workload: resolved.fixture.workload,
          provider: this.#provider.kind,
        },
      };

      session = await this.#provider.create(spec);
      active.session = session;
      (active as any).broker = broker;
      this.#stores.runs.update(runId, { sandboxId: session.id });

      const createDetail: SandboxCreateDetail = {
        enforcement: session.enforcement,
        directMechanism: session.network.directMechanism,
        workDir: session.workDir,
        provider: session.provider,
      };
      this.#stores.sandbox.append({
        runId,
        at: nowIso(),
        action: 'create',
        provider: session.provider,
        sandboxId: session.id,
        ok: true,
        detail: JSON.stringify(createDetail),
      });
      emit('sandbox.created', 'sandbox_starting', 'Sandbox created', {
        sandboxId: session.id,
        provider: session.provider,
        enforcement: session.enforcement,
      });

      this.#stores.runs.update(runId, { phase: 'containment_probe' });
      await this.#probe(runId, session, emit);

      if (controller.signal.aborted) {
        ({ status, errorCode, errorMessage } = this.#abortOutcome(controller.signal));
      } else {
        this.#stores.runs.update(runId, { phase: 'planning' });

        const dispatcher = new ToolDispatcher({
          session,
          hostWorkDir,
          fixture: resolved.fixture,
          maxOutputBytes: this.#config.sandboxLimits.maxOutputBytes,
        });

        const run = this.#stores.runs.get(runId);
        if (run === null) throw new Error('The run disappeared while it was executing.');

        loopResult = await runAgentLoop({
          client,
          dispatcher,
          fixture: resolved.fixture,
          goal: run.goal,
          limits: this.#config.runLimits,
          signal: controller.signal,
          emit,
          recordToolCall: (seq, outcome, args) => {
            this.#recordToolCall(runId, seq, outcome, args, emit);
          },
          logger: this.#logger,
        });

        if (controller.signal.aborted) {
          ({ status, errorCode, errorMessage } = this.#abortOutcome(controller.signal));
        } else {
          verification = await this.#verify(runId, session, resolved.fixture, controller.signal);
          ({ status, errorCode, errorMessage } = this.#decide(loopResult, verification));
        }
      }
    } catch (error) {
      if (error instanceof SandboxError) {
        sandboxFailed = true;
        status = 'failed';
        errorCode = 'sandbox_error';
        errorMessage = errorMessageFor('sandbox_error');
        this.#logger.error('sandbox failure', error, { runId, code: error.code });
      } else {
        status = 'failed';
        errorCode = 'internal_error';
        errorMessage = errorMessageFor('internal_error');
        this.#logger.error('run failed unexpectedly', error, { runId });
      }
    } finally {
      clearTimeout(timer);
      const finishedAt = nowIso();
      const wallClockMs = Date.now() - active.startedAtMs;

      let destroy: SandboxDestroyResult | null = null;
      const brokerHandle = (active as any).broker as { stop(): Promise<void> } | undefined;
      if (session !== null) {
        this.#stores.runs.update(runId, { phase: 'teardown' });
        try {
          destroy = await this.#provider.destroy(session);
        } catch (error) {
          this.#logger.error('sandbox teardown failed', error, { runId, sandboxId: session.id });
        }

        if (brokerHandle) { try { await brokerHandle.stop(); } catch { /* ignore */ } }

        // The control plane owns the host work dir and checks its own removal.
        let workDirRemoved = false;
        try {
          await rm(hostWorkDir, { recursive: true, force: true });
          workDirRemoved = !(await pathExists(hostWorkDir));
        } catch {
          workDirRemoved = false;
        }

        const leftoverResources = destroy?.leftoverResources ?? [];
        const cgroupRemoved = session.enforcement === 'cgroup+rlimit'
          ? !leftoverResources.some((entry) => entry.includes('cgroup'))
          : false;
        const verifiedGone = destroy?.verifiedGone === true && workDirRemoved;

        this.#stores.sandbox.append({
          runId,
          at: destroy?.destroyedAt ?? finishedAt,
          action: 'destroy',
          provider: session.provider,
          sandboxId: session.id,
          ok: verifiedGone,
          detail: JSON.stringify({
            verifiedGone,
            workDirRemoved,
            cgroupRemoved,
            leftoverResources,
            error: destroy?.error ?? null,
          }),
        });
        emit('sandbox.destroyed', 'teardown', 'Sandbox destroyed', {
          sandboxId: session.id,
          verifiedGone,
          workDirRemoved,
          cgroupRemoved,
          leftoverResources: leftoverResources.length,
        });
      } else {
        // No sandbox was created; make sure the host directory did not survive.
        try {
          await rm(hostWorkDir, { recursive: true, force: true });
        } catch {
          // Nothing to remove, or the OS refused. Reported as "not removed".
        }
        if (sandboxFailed) {
          emit('sandbox.destroyed', 'teardown', 'No sandbox to destroy', { created: false });
        }
      }

      try {
        /*
         * The run's terminal state is persisted BEFORE the report is
         * assembled, because the report reads the run's error code: a run that
         * stopped on its token budget must say so in its headline, and a
         * report written before the status was known could only guess.
         */
        this.#stores.runs.update(runId, {
          phase: 'reporting',
          status,
          errorCode,
          errorMessage,
          modelExplanation: loopResult?.explanation ?? null,
          modelClaim: loopResult?.modelClaim ?? null,
          testPassed: verification === null ? null : isGreen(verification),
          testTotal: verification === null ? null : verification.total,
          testFailures: verification === null ? null : verification.failedTests.length,
          iterations: loopResult?.iterations ?? 0,
          toolCalls: loopResult?.toolCalls ?? 0,
          totalTokens: Math.max(loopResult?.totalTokens ?? 0, tokensUsed),
          deniedAttempts: this.#stores.egress
            .list(runId)
            .filter((attempt) => attempt.verdict === 'denied').length,
          finishedAt,
          wallClockMs,
        });

        if (errorCode === 'token_budget_exhausted') {
          // The usage that was reached, against the budget that stopped it.
          emit('resource.sample', 'reporting', 'Token budget reached', {
            tokens: tokensUsed,
            tokenBudget: this.#config.runTokenBudget,
          });
        }

        if (status === 'succeeded') {
          emit('run.completed', 'reporting', 'Run completed', {
            status: 'succeeded',
            provider: servingProvider,
          });
        } else if (status === 'cancelled') {
          emit('run.cancelled', 'reporting', 'Run cancelled', {
            errorCode,
            provider: servingProvider,
          });
        } else {
          emit('run.failed', 'reporting', 'Run failed', {
            errorCode,
            provider: servingProvider,
          });
        }

        const run = this.#stores.runs.get(runId);
        if (run === null) throw new Error('The run disappeared before its report was written.');
        /*
         * ACCEPTED DEVIATION (brief 08, and the design doc's §7.1 diagram
         * shows the other order): the report is assembled AFTER the teardown.
         * `lifecycle.*` and `containment.lifecycle` ARE teardown facts — the
         * sandbox id, the destroy time, whether the work dir was removed — so
         * a report written before the destroy could only guess them. The
         * teardown still happens in a `finally`, always, and the report is
         * built from the persisted destroy record rather than from memory.
         */
        const report = assembleReport({
          run,
          stores: this.#stores,
          config: this.#config,
          generatedAt: finishedAt,
        });
        this.#stores.reports.put(report);

        this.#stores.runs.update(runId, {
          phase: 'done',
          verdict: report.verdict,
        });
        this.#logger.info('run finished', {
          runId,
          status,
          errorCode,
          verdict: report.verdict,
          wallClockMs,
        });
      } catch (error) {
        this.#logger.error('report assembly failed', error, { runId });
        this.#stores.runs.update(runId, {
          status: 'failed',
          phase: 'done',
          errorCode: 'internal_error',
          errorMessage: errorMessageFor('internal_error'),
          finishedAt,
        });
      } finally {
        this.#active.delete(runId);
      }
    }
  }

  async #probe(runId: string, session: SandboxSession, emit: EmitEvent): Promise<void> {
    try {
      const measurement = await session.verify();
      this.#stores.sandbox.append({
        runId,
        at: nowIso(),
        action: 'probe',
        provider: session.provider,
        sandboxId: session.id,
        ok: true,
        detail: 'Containment probe measured from inside the sandbox.',
        measurement,
      });
      emit('sandbox.probe', 'containment_probe', 'Containment probe', {
        measured: true,
        directNetworkReachable: measurement.directNetworkReachable,
        environmentKeys: measurement.environmentKeys.length,
        secretMaterialVisible: measurement.secretMaterialVisible,
        processNamespaceIsolated: measurement.processNamespaceIsolated,
      });
    } catch (error) {
      /*
       * A provider that cannot measure (the stand-in) says so. The run does not
       * fail: the report records `not-measured` and the verdict is `incomplete`.
       */
      const code = error instanceof SandboxError ? error.code : 'provider_error';
      this.#stores.sandbox.append({
        runId,
        at: nowIso(),
        action: 'probe',
        provider: session.provider,
        sandboxId: session.id,
        ok: false,
        detail: 'Containment was not measured: the provider cannot verify containment.',
      });
      this.#logger.warn('containment not measured', { runId, code });
      emit('sandbox.probe', 'containment_probe', 'Containment not measured', {
        measured: false,
        reason: 'The provider cannot verify containment.',
      });
    }
  }

  #recordToolCall(
    runId: string,
    seq: number,
    outcome: ToolCallOutcome,
    args: Readonly<Record<string, unknown>>,
    emit: EmitEvent,
  ): void {
    const session = this.#active.get(runId)?.session ?? null;
    const provider = session?.provider ?? this.#provider.kind;
    const sandboxId = session?.id ?? null;

    this.#stores.toolCalls.append({
      runId,
      seq,
      toolName: outcome.name,
      arguments: args,
      ok: outcome.ok,
      errorCode: outcome.record.errorCode,
      errorMessage: outcome.record.errorMessage,
      exitCode: outcome.evidence.exitCode,
      signal: outcome.evidence.signal,
      durationMs: outcome.record.durationMs,
      stdout: outcome.evidence.stdout,
      stderr: outcome.evidence.stderr,
      bytes: outcome.record.bytes,
      outcome: outcome.evidence.outcome,
      killReason: outcome.evidence.killReason,
    });

    if (outcome.evidence.written !== null) {
      const written = outcome.evidence.written;
      const bytes = Buffer.byteLength(written.content, 'utf8');
      this.#stores.artifacts.append({
        runId,
        label: `${WRITE_ARTIFACT_PREFIX}${written.path}`,
        kind: 'file',
        content: written.content,
        bytes,
        sha256: sha256Hex(written.content),
        createdAt: nowIso(),
      });
    }

    if (outcome.name === 'run_tests') {
      // Every test invocation is a command record, including a refusal.
      const exec: SandboxExecDetail = {
        argv: outcome.evidence.argv,
        cwd: outcome.evidence.cwd,
        exitCode: outcome.evidence.exitCode,
        signal: outcome.evidence.signal,
        durationMs: outcome.record.durationMs,
        outcome: outcome.evidence.outcome,
        killReason: outcome.evidence.killReason,
        refusalReason:
          outcome.record.errorCode === 'command_not_allowed' ? outcome.record.errorMessage : null,
      };
      this.#stores.sandbox.append({
        runId,
        at: nowIso(),
        action: 'exec',
        provider,
        sandboxId,
        ok: outcome.evidence.outcome === 'ok',
        detail: JSON.stringify(exec),
      });

      this.#stores.resources.append({
        runId,
        at: nowIso(),
        wallClockMs: outcome.record.durationMs,
        memoryBytes: null,
        cpuMs: null,
        processCount: null,
      });
      emit('resource.sample', 'executing', 'Resource sample', {
        durationMs: outcome.record.durationMs,
      });
    }
  }

  async #verify(
    runId: string,
    session: SandboxSession,
    fixture: WorkloadFixture,
    signal: AbortSignal,
  ): Promise<TestOutcome | null> {
    if (signal.aborted) return null;

    this.#stores.runs.update(runId, { phase: 'verifying' });
    const command = fixture.testCommand;
    const argv = command.split(/\s+/);
    try {
      const result = await session.exec({
        argv,
        cwd: '.',
        timeoutMs: session.limits.wallClockMs,
      });
      const outcome = toTestOutcome(command, result.stdout, result.stderr, result.exitCode);

      const exec: SandboxExecDetail = {
        argv,
        cwd: session.workDir,
        exitCode: result.exitCode,
        signal: result.signal,
        durationMs: Math.round(result.durationMs),
        outcome: commandOutcome(result),
        killReason: result.killReason,
        refusalReason: null,
      };
      this.#stores.sandbox.append({
        runId,
        at: nowIso(),
        action: 'exec',
        provider: session.provider,
        sandboxId: session.id,
        ok: exec.outcome === 'ok',
        detail: JSON.stringify(exec),
      });

      const json = JSON.stringify(outcome);
      this.#stores.artifacts.append({
        runId,
        label: VERIFICATION_ARTIFACT,
        kind: 'text',
        content: json,
        bytes: Buffer.byteLength(json, 'utf8'),
        sha256: sha256Hex(json),
        createdAt: nowIso(),
      });

      return outcome;
    } catch (error) {
      this.#logger.error('verification run failed', error, { runId });
      return null;
    }
  }

  #abortOutcome(signal: AbortSignal): {
    status: RunStatus;
    errorCode: string | null;
    errorMessage: string | null;
  } {
    if (signal.reason === 'timeout') {
      return { status: 'failed', errorCode: 'timeout', errorMessage: errorMessageFor('timeout') };
    }
    if (signal.reason === 'token_budget') {
      /*
       * The run's own token budget stopped it. That is a designed outcome:
       * the report says so, and the usage that was reached is recorded.
       */
      return {
        status: 'failed',
        errorCode: 'token_budget_exhausted',
        errorMessage: errorMessageFor('token_budget_exhausted'),
      };
    }
    return { status: 'cancelled', errorCode: 'cancelled', errorMessage: errorMessageFor('cancelled') };
  }

  /** §7.5: the sandbox decides success, never the model. */
  #decide(
    loop: AgentLoopResult,
    verification: TestOutcome | null,
  ): { status: RunStatus; errorCode: string | null; errorMessage: string | null } {
    switch (loop.stopReason) {
      case 'final-message':
        if (verification === null) {
          return {
            status: 'failed',
            errorCode: 'sandbox_error',
            errorMessage: errorMessageFor('sandbox_error'),
          };
        }
        return isGreen(verification)
          ? { status: 'succeeded', errorCode: null, errorMessage: null }
          : {
              status: 'failed',
              errorCode: 'tests_not_green',
              errorMessage: errorMessageFor('tests_not_green'),
            };
      case 'iteration-cap':
        return {
          status: 'failed',
          errorCode: 'iteration_cap',
          errorMessage: errorMessageFor('iteration_cap'),
        };
      case 'budget-exhausted':
        return {
          status: 'failed',
          errorCode: 'budget_exhausted',
          errorMessage: errorMessageFor('budget_exhausted'),
        };
      case 'repair-budget-exhausted':
        return {
          status: 'failed',
          errorCode: 'repair_budget_exhausted',
          errorMessage: errorMessageFor('repair_budget_exhausted'),
        };
      case 'model-error':
        return {
          status: 'failed',
          errorCode: 'model_error',
          errorMessage: errorMessageFor('model_error'),
        };
      case 'model-timeout':
        return {
          status: 'failed',
          errorCode: 'model_timeout',
          errorMessage: errorMessageFor('model_timeout'),
        };
      case 'cancelled':
        return {
          status: 'cancelled',
          errorCode: 'cancelled',
          errorMessage: errorMessageFor('cancelled'),
        };
    }
  }
}
