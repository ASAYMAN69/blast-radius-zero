import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiError, BrzApi } from './lib/api';
import { ApiError as ApiErrorClass, HttpApi, probeControlPlane } from './lib/api';
import { FixtureApi } from './lib/fixtures';
import type { SubmitRunRequest } from './lib/types';
import { useRuns } from './hooks/useRuns';
import { useWorkloads } from './hooks/useWorkloads';
import { RunList } from './components/RunList';
import { SubmitForm } from './components/SubmitForm';
import { RunView } from './components/RunView';
import { ErrorState } from './components/States';

/**
 * The operator console.
 *
 * The shell does three things and nothing else:
 *
 *   1. Decide how the console talks to the control plane — **live** over the
 *      same-origin `/api` path, or **fixtures** when the control plane is not
 *      there. The choice is visible in the top bar at all times, because a
 *      console that quietly shows sample data is worse than no console.
 *   2. Hold the view: the run list, the submit form, or one run.
 *   3. Keep the run list fresh.
 */

type Mode = 'probing' | 'live' | 'fixtures';

type View = { readonly kind: 'run'; readonly runId: string } | { readonly kind: 'submit' };

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiErrorClass) return cause;
  return new ApiErrorClass('api', 'internal_error', 'Something went wrong on our side.', 0, null);
}

export function App() {
  const liveApi = useMemo(() => new HttpApi(), []);
  const fixtureApi = useMemo(() => new FixtureApi(), []);

  const [mode, setMode] = useState<Mode>('probing');
  const [probeError, setProbeError] = useState<ApiError | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const api: BrzApi = mode === 'fixtures' ? fixtureApi : liveApi;
  // While the console is still finding out whether the control plane is
  // there, it makes no requests at all — no failed calls, no console noise.
  const activeApi: BrzApi | null = mode === 'probing' ? null : api;

  const runs = useRuns(activeApi);
  const workloads = useWorkloads(activeApi);

  const connect = useCallback(async () => {
    setMode('probing');
    const result = await probeControlPlane();
    if (result.state === 'unreachable') {
      setProbeError(result.error);
      setMode('fixtures');
    } else {
      setProbeError(null);
      setMode('live');
    }
    setView(null);
  }, []);

  useEffect(() => {
    void connect();
  }, [connect]);

  // The run list is a drawer on a narrow screen. Escape closes it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  // Open on the most recent run; open the form when there is nothing to open.
  useEffect(() => {
    if (view !== null) return;
    if (runs.state.kind !== 'ready') return;
    const newest = runs.state.data[0];
    setView(newest === undefined ? { kind: 'submit' } : { kind: 'run', runId: newest.runId });
  }, [runs.state, view]);

  const handleSubmit = async (request: SubmitRunRequest) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await api.submitRun(request);
      setView({ kind: 'run', runId: response.runId });
      setDrawerOpen(false);
      runs.refresh();
    } catch (cause) {
      setSubmitError(toApiError(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    if (mode === 'fixtures') {
      void connect();
      return;
    }
    setMode('fixtures');
    setProbeError(null);
    setView(null);
  };

  const selectRun = (runId: string) => {
    setView({ kind: 'run', runId });
    setDrawerOpen(false);
  };

  const workload =
    workloads.state.kind === 'ready' ? (workloads.state.data[0] ?? null) : null;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <div className="topbar__brand">
          <button
            className="button button--ghost button--small topbar__drawerbutton"
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            aria-controls="runs-sidebar"
          >
            Runs
          </button>
          <span className="brand" aria-hidden="true">
            BRZ
          </span>
          <span className="brand__text">
            <strong>Blast Radius Zero</strong>
            <span>containment-first control plane</span>
          </span>
        </div>

        <div className="topbar__right">
          <span className={`mode mode--${mode}`}>
            <span className="mode__dot" aria-hidden="true" />
            {mode === 'live' ? 'Live control plane' : mode === 'fixtures' ? 'Fixture data' : 'Connecting…'}
          </span>
          <button className="button button--ghost button--small" type="button" onClick={toggleMode}>
            {mode === 'fixtures' ? 'Use live API' : 'Show fixtures'}
          </button>
          <button className="button button--ghost button--small" type="button" onClick={runs.refresh}>
            Refresh
          </button>
        </div>
      </header>

      {mode === 'fixtures' && (
        <div className="banner banner--fixtures" role="status">
          <p className="banner__text">
            <strong>Fixture data.</strong> {probeError === null
              ? 'You switched to the built-in sample runs.'
              : 'The control plane is not reachable, so the console is showing the built-in sample runs: a successful run, a model failure, a run killed by the memory cap, and a run whose egress attempts were denied.'}
          </p>
          <button className="button button--secondary button--small" type="button" onClick={() => void connect()}>
            Try the live API
          </button>
        </div>
      )}

      <div className="app__body">
        {drawerOpen && (
          <button
            className="scrim"
            type="button"
            aria-label="Close the run list"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <aside className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`} id="runs-sidebar">
          <div className="sidebar__head">
            <h2 className="sidebar__title">Runs</h2>
            <div className="sidebar__actions">
              <button
                className="button button--primary button--small"
                type="button"
                onClick={() => {
                  setView({ kind: 'submit' });
                  setDrawerOpen(false);
                }}
              >
                New run
              </button>
              <button
                className="button button--ghost button--small sidebar__close"
                type="button"
                onClick={() => setDrawerOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
          <RunList state={runs.state} selectedRunId={view?.kind === 'run' ? view.runId : null} onSelect={selectRun} />
        </aside>

        <main className="main" id="main" tabIndex={-1}>
          {mode === 'probing' ? (
            <div className="connecting">
              <p className="connecting__title">
                <span className="spinner" aria-hidden="true" />
                Connecting to the control plane…
              </p>
              <p className="connecting__body">
                If it does not answer, the console falls back to the built-in fixture runs and says so.
              </p>
            </div>
          ) : view === null ? (
            <div className="connecting">
              <p className="connecting__title">Loading…</p>
            </div>
          ) : view.kind === 'submit' ? (
            <SubmitForm
              workload={workload}
              fixtures={workloads.fixtures}
              onSubmit={handleSubmit}
              submitting={submitting}
              error={submitError}
            />
          ) : (
            <RunView runId={view.runId} api={api} onBack={() => setView(null)} onSettled={runs.refresh} />
          )}

          {view !== null && view.kind === 'submit' && workloads.state.kind === 'error' && (
            <ErrorState
              error={workloads.state.error}
              context="The workload could not be loaded."
              onRetry={workloads.refresh}
            />
          )}
        </main>
      </div>
    </div>
  );
}
