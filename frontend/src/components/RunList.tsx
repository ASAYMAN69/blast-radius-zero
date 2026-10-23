import type { RunSummary } from '../lib/types';
import { formatDuration, formatRelative, shortId } from '../lib/format';
import { StatusPill, VerdictBadge } from './Badges';
import { EmptyState, ErrorState, LoadingState, UnauthorizedState } from './States';
import type { AsyncState } from '../lib/state';

/**
 * The run list — the console's home screen.
 *
 * Newest first, because that is the order an operator cares about. Each card
 * carries the three things worth knowing at a glance: what happened, when, and
 * what the blast radius came out as.
 */
export function RunList({
  state,
  selectedRunId,
  onSelect,
  refresh,
}: {
  state: AsyncState<readonly RunSummary[]>;
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  refresh?: () => void;
}) {
  if (state.kind === 'loading') {
    return <LoadingState label="Loading runs…" rows={4} />;
  }
  if (state.kind === 'unauthorized') {
    return <UnauthorizedState onRetry={refresh} />;
  }
  if (state.kind === 'error') {
    return <ErrorState error={state.error} context="Could not load the run list." />;
  }
  if (state.data.length === 0) {
    return (
      <EmptyState
        title="No runs yet."
        body="Submit a task to dispatch the first one. The run will appear here and update live."
      />
    );
  }

  return (
    <ul className="runlist">
      {state.data.map((run) => {
        const selected = run.runId === selectedRunId;
        return (
          <li key={run.runId}>
            <button
              type="button"
              className={`runcard${selected ? ' runcard--selected' : ''}`}
              onClick={() => onSelect(run.runId)}
              aria-current={selected ? 'true' : undefined}
            >
              <span className="runcard__top">
                <StatusPill status={run.status} />
                {run.verdict !== null && <VerdictBadge verdict={run.verdict} />}
              </span>
              <span className="runcard__goal">{run.goal}</span>
              <span className="runcard__meta">
                <span className="mono mono--id" title={run.runId}>
                  {shortId(run.runId)}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatRelative(run.createdAt)}</span>
                {run.durationMs !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(run.durationMs)}</span>
                  </>
                )}
                {run.testTotal !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {run.testPassed === true
                        ? `${String(run.testTotal)}/${String(run.testTotal)} green`
                        : run.testPassed === false
                          ? 'suite red'
                          : `${String(run.testTotal)} tests, unverified`}
                    </span>
                  </>
                )}
              </span>
              {run.errorCode !== null && (
                <span className="runcard__error mono mono--code">{run.errorCode}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
