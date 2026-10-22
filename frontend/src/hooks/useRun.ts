import { useCallback, useEffect, useRef, useState } from 'react';
import type { BrzApi } from '../lib/api';
import { ApiError } from '../lib/api';
import type { BlastRadiusReport, RunDetail, RunEvent, RunStatus } from '../lib/types';
import { errored, loading, ready } from '../lib/state';
import type { AsyncState } from '../lib/state';

/**
 * One run, its live event stream, and its report.
 *
 * The event stream is polled by `seq`, so a poll cannot miss an event and
 * there is no second transport. Polling stops when the run reaches a terminal
 * status and the report has been sealed.
 */

const POLL_INTERVAL_MS = 900;

export type ReportState = { readonly kind: 'not-ready' } | AsyncState<BlastRadiusReport>;

export interface UseRunResult {
  readonly state: AsyncState<RunDetail>;
  readonly events: readonly RunEvent[];
  readonly report: ReportState;
  readonly refresh: () => void;
  readonly cancel: () => void;
  readonly cancelling: boolean;
}

function isTerminal(status: RunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new ApiError('api', 'internal_error', 'Something went wrong on our side.', 0, null);
}

export function useRun(runId: string | null, api: BrzApi): UseRunResult {
  const [state, setState] = useState<AsyncState<RunDetail>>(loading);
  const [events, setEvents] = useState<readonly RunEvent[]>([]);
  const [report, setReport] = useState<ReportState>({ kind: 'not-ready' });
  const [cancelling, setCancelling] = useState(false);

  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const cursor = useRef(0);
  const accumulated = useRef<RunEvent[]>([]);
  const reportSealed = useRef(false);
  // A response that arrives after the transport changed belongs to a previous
  // generation and is discarded, so a stale request cannot overwrite a fresh
  // one.
  const generation = useRef(0);

  const load = useCallback(
    async (scheduleNext: boolean) => {
      if (runId === null || inFlight.current) return;
      inFlight.current = true;
      const current = generation.current;
      try {
        const detail = await api.getRun(runId);
        if (current !== generation.current) return;
        let stream: { events: readonly RunEvent[] } = { events: [] };
        try {
          stream = await api.listEvents(runId, cursor.current === 0 ? undefined : cursor.current);
        } catch {
          // A transient failure to read the stream must not lose the run.
          stream = { events: [] };
        }
        if (current !== generation.current) return;
        if (stream.events.length > 0) {
          accumulated.current = [...accumulated.current, ...stream.events];
          const last = stream.events[stream.events.length - 1];
          if (last !== undefined) cursor.current = last.seq;
        }
        setState(ready(detail.run));
        setEvents(accumulated.current);

        if (isTerminal(detail.run.status) && !reportSealed.current) {
          try {
            const response = await api.getReport(runId);
            if (current !== generation.current) return;
            reportSealed.current = true;
            setReport(ready(response.report));
          } catch (cause) {
            if (current !== generation.current) return;
            if (cause instanceof ApiError && cause.code === 'report_not_ready') {
              setReport({ kind: 'not-ready' });
            } else {
              setReport(errored(toApiError(cause)));
            }
          }
        }

        const settled = isTerminal(detail.run.status) && reportSealed.current;
        if (scheduleNext && !settled) {
          timer.current = window.setTimeout(() => {
            void load(true);
          }, POLL_INTERVAL_MS);
        }
      } catch (cause) {
        if (current !== generation.current) return;
        setState(errored(toApiError(cause)));
      } finally {
        inFlight.current = false;
      }
    },
    [api, runId],
  );

  const refresh = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    void load(true);
  }, [load]);

  const cancel = useCallback(() => {
    if (runId === null) return;
    setCancelling(true);
    void api
      .cancelRun(runId)
      .then(() => {
        setCancelling(false);
        refresh();
      })
      .catch(() => {
        setCancelling(false);
      });
  }, [api, refresh, runId]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    cursor.current = 0;
    accumulated.current = [];
    reportSealed.current = false;
    setEvents([]);
    setReport({ kind: 'not-ready' });
    setState(loading);
    void load(true);
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, [load, runId]);

  return { state, events, report, refresh, cancel, cancelling };
}
