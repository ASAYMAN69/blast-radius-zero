/**
 * `/api/v1/runs` (§8.3, §8.4).
 *
 * Semantics that are easy to get wrong, and are pinned here:
 *  - POST returns 202 with `SubmitRunResponse`, not a run detail;
 *  - the report route returns 409 `report_not_ready` while the run exists but
 *    has no report, never 404;
 *  - a malformed run id is a 404 `run_not_found`, not a 500;
 *  - the events poll's `nextCursor` is null exactly when the run is terminal
 *    and all events have been delivered.
 */

import type { Router } from '../http/router.ts';
import type { Config } from '../config.ts';
import type { Stores } from '../db/store/index.ts';
import type { RunRow } from '../db/store/runs.ts';
import type {
  GetReportResponse,
  GetRunResponse,
  ListEventsResponse,
  ListRunsResponse,
  RunDetail,
  RunSource,
  RunSummary,
  SubmitRunRequest,
  WorkloadId,
} from '../contracts/api.ts';
import type { RunStatus } from '../contracts/events.ts';
import { ApiError } from '../http/errors.ts';
import { readJsonObject, sendJson } from '../http/json.ts';
import {
  assertRunId,
  assertSafeRelativePath,
  isRecord,
  parseNonNegativeInt,
  requireString,
} from '../http/validate.ts';
import { isKnownWorkload } from '../agent/workload.ts';
import type { RunManager } from '../runs/manager.ts';

export interface RunRoutesDeps {
  readonly config: Config;
  readonly stores: Stores;
  readonly manager: RunManager;
}

const TERMINAL: readonly RunStatus[] = ['succeeded', 'failed', 'cancelled'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_EVENT_LIMIT = 200;
const MAX_EVENT_LIMIT = 500;
const MAX_SOURCE_FILES = 64;

function isTerminal(status: RunStatus): boolean {
  return TERMINAL.includes(status);
}

function toSummary(run: RunRow): RunSummary {
  return {
    runId: run.id,
    status: run.status,
    phase: run.phase,
    workload: run.workload as WorkloadId,
    goal: run.goal,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
    durationMs: run.wallClockMs,
    verdict: run.verdict,
    testPassed: run.testPassed,
    testTotal: run.testTotal,
    errorCode: run.errorCode,
  };
}

function toDetail(run: RunRow): RunDetail {
  return {
    ...toSummary(run),
    updatedAt: run.updatedAt,
    sourceKind: run.sourceKind,
    sourceRef: run.sourceRef,
    provider: run.provider,
    sandboxId: run.sandboxId,
    modelExplanation: run.modelExplanation,
    iterations: run.iterations,
    toolCalls: run.toolCalls,
    totalTokens: run.totalTokens,
    deniedEgressAttempts: run.deniedAttempts,
  };
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id]), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      parsed[0].length > 0 &&
      parsed[1].length > 0
    ) {
      return { createdAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // Fall through to the typed error below.
  }
  throw new ApiError('invalid_request', [
    { field: 'cursor', issue: 'The cursor is not valid.' },
  ]);
}

function parseSource(value: unknown): RunSource {
  if (!isRecord(value)) {
    throw new ApiError('invalid_source', [{ field: 'source', issue: 'Must be a JSON object.' }]);
  }
  const kind = value['kind'];

  if (kind === 'fixture') {
    const fixtureId = value['fixtureId'];
    if (typeof fixtureId !== 'string' || fixtureId.length === 0 || fixtureId.length > 200) {
      throw new ApiError('invalid_source', [
        { field: 'source.fixtureId', issue: 'A fixture id is required.' },
      ]);
    }
    return { kind: 'fixture', fixtureId };
  }

  if (kind === 'files') {
    const rawFiles = value['files'];
    if (!Array.isArray(rawFiles) || rawFiles.length === 0 || rawFiles.length > MAX_SOURCE_FILES) {
      throw new ApiError('invalid_source', [
        {
          field: 'source.files',
          issue: `Between 1 and ${MAX_SOURCE_FILES} files are required.`,
        },
      ]);
    }

    const files = rawFiles.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new ApiError('invalid_source', [
          { field: `source.files[${index}]`, issue: 'Must be a JSON object.' },
        ]);
      }
      const rawPath = entry['path'];
      const content = entry['content'];
      if (typeof rawPath !== 'string' || typeof content !== 'string') {
        throw new ApiError('invalid_source', [
          { field: `source.files[${index}]`, issue: 'A path and content string are required.' },
        ]);
      }
      // A path that escapes the work dir is `invalid_path` (§8.2), before I/O.
      return {
        path: assertSafeRelativePath(rawPath, `source.files[${index}].path`),
        content,
      };
    });

    return { kind: 'files', files };
  }

  throw new ApiError('invalid_source', [
    { field: 'source.kind', issue: 'Must be "fixture" or "files".' },
  ]);
}

export function registerRunRoutes(router: Router, deps: RunRoutesDeps): void {
  const { stores, manager } = deps;

  router.add('POST', '/api/v1/runs', async (ctx) => {
    const body = await readJsonObject(ctx.req);

    const workloadRaw = body['workload'];
    if (typeof workloadRaw !== 'string' || !isKnownWorkload(workloadRaw)) {
      throw new ApiError('invalid_workload');
    }
    const task = requireString(body, 'task', { minLength: 1, maxLength: 2_000 });
    const source = parseSource(body['source']);

    const request: SubmitRunRequest = {
      workload: workloadRaw as WorkloadId,
      task,
      source,
    };
    const accepted = manager.submit(request);

    /*
     * A client that disconnects before the 202 is on the wire takes the run
     * with it (§7.7). A disconnect AFTER the response completed is the console
     * closing an idle connection and must not cancel a healthy run.
     */
    ctx.req.on('close', () => {
      if (ctx.req.complete || ctx.res.writableEnded) return;
      try {
        manager.cancel(accepted.runId);
      } catch {
        // The run already finished, or it was cancelled already.
      }
    });

    sendJson(ctx.res, 202, accepted, ctx.requestId);
  });

  router.add('GET', '/api/v1/runs', async (ctx) => {
    const rawCursor = ctx.url.searchParams.get('cursor');
    const limit = parseNonNegativeInt(ctx.url.searchParams.get('limit'), 'limit', {
      min: 1,
      max: MAX_PAGE_SIZE,
      fallback: DEFAULT_PAGE_SIZE,
    });
    const cursor = rawCursor === null || rawCursor.length === 0 ? null : decodeCursor(rawCursor);

    const rows = stores.runs.list(cursor, limit + 1);
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const last = page[page.length - 1];

    const response: ListRunsResponse = {
      runs: page.map(toSummary),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.createdAt, last.id) : null,
    };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });

  router.add('GET', '/api/v1/runs/:runId', async (ctx) => {
    const runId = assertRunId(ctx.params['runId'] ?? '');
    const run = stores.runs.get(runId);
    if (run === null) throw new ApiError('run_not_found');
    const response: GetRunResponse = { run: toDetail(run) };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });

  router.add('GET', '/api/v1/runs/:runId/events', async (ctx) => {
    const runId = assertRunId(ctx.params['runId'] ?? '');
    const run = stores.runs.get(runId);
    if (run === null) throw new ApiError('run_not_found');

    const after = parseNonNegativeInt(ctx.url.searchParams.get('after'), 'after', {
      fallback: 0,
      min: 0,
    });
    const limit = parseNonNegativeInt(ctx.url.searchParams.get('limit'), 'limit', {
      min: 1,
      max: MAX_EVENT_LIMIT,
      fallback: DEFAULT_EVENT_LIMIT,
    });

    const events = stores.events.list(runId, after, limit);
    const last = events[events.length - 1];
    const terminal = isTerminal(run.status);

    const nextCursor =
      events.length === 0
        ? terminal
          ? null
          : after
        : terminal && events.length < limit
          ? null
          : (last?.seq ?? after);

    const response: ListEventsResponse = {
      events,
      nextCursor,
      runStatus: run.status,
      runPhase: run.phase,
    };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });

  router.add('GET', '/api/v1/runs/:runId/report', async (ctx) => {
    const runId = assertRunId(ctx.params['runId'] ?? '');
    const run = stores.runs.get(runId);
    if (run === null) throw new ApiError('run_not_found');

    const report = stores.reports.get(runId);
    if (report === null) throw new ApiError('report_not_ready');
    const response: GetReportResponse = { report };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });

  router.add('POST', '/api/v1/runs/:runId/cancel', async (ctx) => {
    const runId = assertRunId(ctx.params['runId'] ?? '');
    const cancelled = manager.cancel(runId);
    sendJson(ctx.res, 202, cancelled, ctx.requestId);
  });
}
