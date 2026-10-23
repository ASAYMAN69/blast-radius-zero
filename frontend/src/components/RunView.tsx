import { useEffect, useRef, useState } from 'react';
import type { BrzApi } from '../lib/api';
import { useRun } from '../hooks/useRun';
import { formatDateTime, formatDuration, shortId } from '../lib/format';
import { PhaseChip, StatusPill } from './Badges';
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from './States';
import { EventStream } from './EventStream';
import { ResultPanel } from './ResultPanel';
import { ReportPanel } from './ReportPanel';

/**
 * The run view — the heart of the console.
 *
 * The run's status and phase, its live event stream, the agent's output, and
 * the blast-radius report. Everything the operator needs to answer "what
 * happened, and what could it reach?" is on this one screen.
 */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function RunView({
  runId,
  api,
  onBack,
  onSettled,
}: {
  runId: string;
  api: BrzApi;
  onBack: () => void;
  onSettled?: () => void;
}) {
  const { state, events, report, refresh, cancel, cancelling } = useRun(runId, api);
  const [replayTo, setReplayTo] = useState<number | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (state.data.status === 'queued' || state.data.status === 'running') {
      settled.current = false;
      return;
    }
    if (settled.current) return;
    settled.current = true;
    onSettled?.();
  }, [onSettled, state]);

  useEffect(() => {
    if (replayTo === null) return;
    if (replayTo >= events.length) {
      setReplayTo(null);
      return;
    }
    const timer = window.setTimeout(() => setReplayTo(replayTo + 1), 170);
    return () => window.clearTimeout(timer);
  }, [events.length, replayTo]);

  if (state.kind === 'loading') {
    return (
      <div className="runview">
        <LoadingState label="Loading the run…" rows={5} />
      </div>
    );
  }
  if (state.kind === 'unauthorized') {
    return (
      <div className="runview">
        <UnauthorizedState onRetry={refresh} />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="runview">
        <ErrorState error={state.error} context="The run could not be loaded." onRetry={refresh} />
      </div>
    );
  }

  const run = state.data;
  const live = run.status === 'queued' || run.status === 'running';
  const visibleEvents = replayTo === null ? events : events.slice(0, replayTo);

  const replay = () => {
    if (prefersReducedMotion() || events.length === 0) {
      setReplayTo(null);
      return;
    }
    setReplayTo(1);
  };

  return (
    <div className="runview">
      <header className="runhead">
        <div className="runhead__top">
          <button className="button button--ghost button--small" type="button" onClick={onBack}>
            ← All runs
          </button>
          <div className="runhead__status">
            <StatusPill status={run.status} />
            <PhaseChip phase={run.phase} />
          </div>
          <div className="runhead__actions">
            {live && (
              <button className="button button--secondary button--small" type="button" onClick={cancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel run'}
              </button>
            )}
            <button className="button button--ghost button--small" type="button" onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>

        <h1 className="runhead__goal">{run.goal}</h1>

        <dl className="runmeta">
          <div className="runmeta__item">
            <dt>Run</dt>
            <dd className="mono" title={run.runId}>
              {shortId(run.runId, 12)}
            </dd>
          </div>
          <div className="runmeta__item">
            <dt>Started</dt>
            <dd>{formatDateTime(run.createdAt)}</dd>
          </div>
          <div className="runmeta__item">
            <dt>Duration</dt>
            <dd>{formatDuration(run.durationMs)}</dd>
          </div>
          <div className="runmeta__item">
            <dt>Provider</dt>
            <dd className="mono">{run.provider}</dd>
          </div>
          <div className="runmeta__item">
            <dt>Tool calls</dt>
            <dd className="mono">{String(run.toolCalls)}</dd>
          </div>
          <div className="runmeta__item">
            <dt>Egress denied</dt>
            <dd className="mono">{String(run.deniedEgressAttempts)}</dd>
          </div>
        </dl>

        {run.errorCode !== null && (
          <p className="runhead__error" role="status">
            <span className="mono mono--code">{run.errorCode}</span>
            <span>
              The run ended early. The report below records everything that did happen.
            </span>
          </p>
        )}
      </header>

      <div className="runview__grid">
        <div className="runview__col runview__col--events">
          <EventStream events={visibleEvents} live={live} onReplay={replay} />
        </div>
        <div className="runview__col runview__col--main">
          <ReportPanel report={report.kind === 'ready' ? report.data : null} state={report} />
          {report.kind === 'ready' || report.kind === 'not-ready' ? (
            <ResultPanel run={run} report={report.kind === 'ready' ? report.data : null} />
          ) : (
            <EmptyState title="No result." body="The agent's output appears here when the run finishes." />
          )}
        </div>
      </div>
    </div>
  );
}
