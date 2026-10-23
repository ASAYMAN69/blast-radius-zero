import type { Router } from '../http/router.ts';
import type { Config } from '../config.ts';
import type { Stores } from '../db/store/index.ts';
import type { RunManager } from '../runs/manager.ts';
import type { InferenceClient } from '../inference/types.ts';
import { ApiError } from '../http/errors.ts';
import { readJsonObject, sendJson } from '../http/json.ts';
import { assertSessionId, requireString } from '../http/validate.ts';
import { runSessionTurn } from '../agent/sessionLoop.ts';

export interface SessionRoutesDeps {
  readonly config: Config;
  readonly stores: Stores;
  readonly manager: RunManager;
  readonly createInference: () => InferenceClient;
}

export function registerSessionRoutes(router: Router, deps: SessionRoutesDeps): void {
  const { stores, manager, createInference } = deps;

  router.add('POST', '/api/v1/sessions', async (ctx) => {
    const session = stores.sessions.create();
    sendJson(ctx.res, 201, {
      sessionExternal: session.sessionExternal,
      name: session.name,
      createdAt: session.createdAt,
    }, ctx.requestId);
  });

  router.add('GET', '/api/v1/sessions', async (ctx) => {
    const sessions = stores.sessions.list();
    const out = sessions.map((s) => ({
      sessionExternal: s.sessionExternal,
      name: s.name,
      updatedAt: s.updatedAt,
      messageCount: stores.messages.count(s.sessionInternal),
    }));
    sendJson(ctx.res, 200, { sessions: out }, ctx.requestId);
  });

  router.add('GET', '/api/v1/sessions/:id', async (ctx) => {
    const id = assertSessionId(ctx.params['id'] ?? '');
    const session = stores.sessions.get(id);
    if (session === null) throw new ApiError('not_found');
    const msgs = stores.messages.list(session.sessionInternal);
    sendJson(ctx.res, 200, {
      sessionExternal: session.sessionExternal,
      name: session.name,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      compactedSummary: session.compactedSummary,
      messages: msgs.map((m) => ({
        messageExternal: m.messageExternal,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    }, ctx.requestId);
  });

  router.add('PATCH', '/api/v1/sessions/:id', async (ctx) => {
    const id = assertSessionId(ctx.params['id'] ?? '');
    const body = await readJsonObject(ctx.req);
    const name = requireString(body, 'name');
    const updated = stores.sessions.rename(id, name);
    if (updated === null) throw new ApiError('not_found');
    sendJson(ctx.res, 200, {
      sessionExternal: updated.sessionExternal,
      name: updated.name,
      updatedAt: updated.updatedAt,
    }, ctx.requestId);
  });

  router.add('DELETE', '/api/v1/sessions/:id', async (ctx) => {
    const id = assertSessionId(ctx.params['id'] ?? '');
    const session = stores.sessions.get(id);
    if (session === null) throw new ApiError('not_found');
    stores.messages.deleteBySession(session.sessionInternal);
    stores.sessions.delete(id);
    sendJson(ctx.res, 204, {}, ctx.requestId);
  });

  router.add('POST', '/api/v1/sessions/:id/compact', async (ctx) => {
    const id = assertSessionId(ctx.params['id'] ?? '');
    const session = stores.sessions.get(id);
    if (session === null) throw new ApiError('not_found');
    const body = await readJsonObject(ctx.req);
    const keepLastN = typeof body['keepLastN'] === 'number' ? body['keepLastN'] : 4;
    // build a simple summary from the compacted messages
    const msgs = stores.messages.list(session.sessionInternal);
    const keep = Math.min(keepLastN, msgs.length);
    const compacted = msgs.slice(0, msgs.length - keep);
    const summary = compacted.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');
    const result = stores.sessions.updateCompacted(id, summary, keepLastN);
    sendJson(ctx.res, 200, {
      compactedCount: result.compactedCount,
      keptCount: result.keptCount,
      summary,
    }, ctx.requestId);
  });

  router.add('POST', '/api/v1/sessions/:id/messages', async (ctx) => {
    const id = assertSessionId(ctx.params['id'] ?? '');
    const session = stores.sessions.get(id);
    if (session === null) throw new ApiError('not_found');
    const body = await readJsonObject(ctx.req);
    const content = requireString(body, 'content');

    const msg = stores.messages.add(session.sessionInternal, 'user', content);
    stores.sessions.touch(id);

    // Trigger a run via the run manager (task = content).
    const accepted = manager.submit({
      workload: 'self-healing-runner',
      task: content,
      source: { kind: 'fixture', fixtureId: 'shr-sum-range' },
    });

    // Produce an assistant reply in the background using session history.
    const inference = createInference();
    void (async () => {
      try {
        const reply = await runSessionTurn({
          stores,
          sessionInternal: session.sessionInternal,
          userContent: content,
          inference,
          maxTokens: 8000,
        });
        stores.sessions.touch(id);
        // attach runId? stored separately; nothing to do
        void reply;
      } catch {
        // ignore
      }
    })();

    sendJson(ctx.res, 202, {
      messageExternal: msg.messageExternal,
      runId: accepted.runId,
    }, ctx.requestId);
  });
}
