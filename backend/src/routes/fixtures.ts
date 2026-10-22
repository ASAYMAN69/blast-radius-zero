/**
 * `/api/v1/fixtures` (§8.4, §8.7). The default workload is the only Phase 1
 * workload; a `?workload=` that is not known is a 400 `invalid_workload`.
 */

import type { ListFixturesResponse, WorkloadId } from '../contracts/api.ts';
import type { Router } from '../http/router.ts';
import { ApiError } from '../http/errors.ts';
import { sendJson } from '../http/json.ts';
import { WORKLOAD_ID, isKnownWorkload, listFixtures } from '../agent/workload.ts';

export function registerFixtureRoutes(router: Router): void {
  router.add('GET', '/api/v1/fixtures', async (ctx) => {
    const requested = ctx.url.searchParams.get('workload');
    const workload = requested === null || requested.length === 0 ? WORKLOAD_ID : requested;
    if (!isKnownWorkload(workload)) throw new ApiError('invalid_workload');

    const response: ListFixturesResponse = {
      workload: workload as WorkloadId,
      fixtures: listFixtures(workload),
    };
    sendJson(ctx.res, 200, response, ctx.requestId);
  });
}
