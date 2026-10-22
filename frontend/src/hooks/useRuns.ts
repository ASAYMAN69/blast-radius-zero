import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrzApi } from '../lib/api.ts';
import { ApiError } from '../lib/api.ts';
import type { RunSummary } from '../lib/types.ts';
import { errored, loading, ready } from '../lib/state.ts';
import type { AsyncState } from '../lib/state.ts';

/**
 * The run list: the console's home screen.
 *
 * It polls while something is still running, because a run that finishes in
 * the background should appear in the list without the operator refreshing.
 */

const POLL_INTERVAL_MS = 4000;

export interface UseRunsResult {
  readonly state: AsyncState<readonly RunSummary[]>;
  readonly refresh: () => void;
}

function isActive(summary: RunSummary): boolean {
  return summary.status === 'queued' || summary.status === 'running';
}

export function useRuns(api: BrzApi): UseRunsResult {
  const [state, setState] = useState<AsyncState<readonly RunSummary[]>>(loading);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);

  const load = useCallback(
    async (scheduleNext: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const response = await api.listRuns();
        setState(ready(response.runs));
        if (scheduleNext && response.runs.some(isActive)) {
          timer.current = window.setTimeout(() => {
            void load(true);
          }, POLL_INTERVAL_MS);
        }
      } catch (cause) {
        setState(errored(cause instanceof ApiError ? cause : new ApiError('api', 'internal_error', 'Something went wrong on our side.', 0, null)));
      } finally {
        inFlight.current = false;
      }
    },
    [api],
  );

  const refresh = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    void load(true);
  }, [load]);

  useEffect(() => {
    void load(true);
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [load]);

  return { state, refresh };
}
