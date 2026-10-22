import { useCallback, useEffect, useState } from 'react';
import type { BrzApi } from '../lib/api';
import { ApiError } from '../lib/api';
import type { WorkloadDescriptor, WorkloadFixture } from '../lib/types';
import { errored, loading, ready } from '../lib/state';
import type { AsyncState } from '../lib/state';

/**
 * The workload descriptor and its project fixtures.
 *
 * The console does not hardcode the workload, the fixtures, or the tool list —
 * it asks the API. Adding a second workload in Phase 2 is a backend change.
 */
export interface UseWorkloadsResult {
  readonly state: AsyncState<readonly WorkloadDescriptor[]>;
  readonly fixtures: readonly WorkloadFixture[];
  readonly refresh: () => void;
}

export function useWorkloads(api: BrzApi | null): UseWorkloadsResult {
  const [state, setState] = useState<AsyncState<readonly WorkloadDescriptor[]>>(loading);
  const [fixtures, setFixtures] = useState<readonly WorkloadFixture[]>([]);

  const load = useCallback(async () => {
    if (api === null) return;
    try {
      const [workloads, projectFixtures] = await Promise.all([api.listWorkloads(), api.listFixtures()]);
      setState(ready(workloads.workloads));
      setFixtures(projectFixtures.fixtures);
    } catch (cause) {
      setState(
        errored(
          cause instanceof ApiError
            ? cause
            : new ApiError('api', 'internal_error', 'Something went wrong on our side.', 0, null),
        ),
      );
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, fixtures, refresh: load };
}
