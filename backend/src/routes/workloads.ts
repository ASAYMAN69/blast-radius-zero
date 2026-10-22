/**
 * `/api/v1/workloads` (§8.4, §8.7).
 *
 * The frontend builds its form from this response; it must not hardcode the
 * workload, the fixtures or the tool list.
 */

import type { ListWorkloadsResponse } from '../contracts/api.ts';
import type { Router } from '../http/router.ts';
import { sendJson } from '../http/json.ts';
import { listWorkloads } from '../agent/workload.ts';

export function registerWorkloadRoutes(router: Router): void {
  router.add('GET', '/api/v1/workloads', async (ctx) => {
    const response: ListWorkloadsResponse = { workloads: listWorkloads() };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });
}
