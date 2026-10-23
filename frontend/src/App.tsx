import { useCallback, useEffect, useState } from 'react';
import { HttpApi, probeControlPlane } from './lib/api';
import { FixtureApi } from './lib/fixtures';
import type { ApiError, BrzApi as BrzApiType } from './lib/api';
import type { ChatMessage } from './components/Chatbox';
import type { ToastItem } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { Sidebar } from './components/Sidebar';
import { Chatbox } from './components/Chatbox';
import { ToastStack } from './components/Toast';
import { SubmitForm } from './components/SubmitForm';
import { useRuns } from './hooks/useRuns';
import { useRun } from './hooks/useRun';
import type { WorkloadDescriptor, WorkloadFixture } from './lib/types';
import { ReportPanel } from './components/ReportPanel';

/**
 * Chat-first console.
 *
 * The chatbox is the home. Sessions (runs) live in the left sidebar. The
 * right panel slides in only when a report needs to be read. A toast on the
 * session bar announces a deployed run.
 */

type Mode = 'probing' | 'live' | 'fixtures';
type View = { kind: 'chat' } | { kind: 'new' };

export function App() {
  const liveApi = useState(() => new HttpApi())[0];
  const fixtureApi = useState(() => new FixtureApi())[0];

  const [mode, setMode] = useState<Mode>('probing');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('brz:sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelRunId, setRightPanelRunId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [view, setView] = useState<View>({ kind: 'chat' });
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [workload, setWorkload] = useState<WorkloadDescriptor | null>(null);
  const [fixtures, setFixtures] = useState<readonly WorkloadFixture[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const api: BrzApiType = mode === 'fixtures' ? (fixtureApi as BrzApiType) : (liveApi as BrzApiType);
  const runs = useRuns(mode === 'probing' ? null : api);

  // Probe on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await probeControlPlane();
      if (cancelled) return;
      if (result.state === 'unreachable') {
        setMode('fixtures');
      } else {
        setMode('live');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load workloads
  useEffect(() => {
    if (mode === 'probing') return;
    (async () => {
      try {
        const [w, f] = await Promise.all([api.listWorkloads(), api.listFixtures()]);
        setWorkload(w.workloads[0] ?? null);
        setFixtures(f.fixtures);
      } catch { /* ignore */ }
    })();
  }, [mode, api]);

  // Default to the most recent run
  useEffect(() => {
    if (runs.state.kind !== 'ready') return;
    if (activeRunId !== null) return;
    const newest = runs.state.data[0];
    if (newest) setActiveRunId(newest.runId);
  }, [runs.state, activeRunId]);

  const activeRun = useRun(activeRunId, api);

  // Persist sidebar collapse
  useEffect(() => {
    try { localStorage.setItem('brz:sidebar-collapsed', String(sidebarCollapsed)); } catch { /* ignore */ }
  }, [sidebarCollapsed]);

  // Escape closes right panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rightPanelOpen) {
        setRightPanelOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rightPanelOpen]);

  const openReport = useCallback((runId: string) => {
    setRightPanelRunId(runId);
    setRightPanelOpen(true);
  }, []);

  const closeReport = useCallback(() => {
    setRightPanelOpen(false);
  }, []);

  const addToast = useCallback((item: ToastItem) => {
    setToasts((prev) => {
      const next = [...prev, item];
      if (next.length > 3) next.shift();
      return next;
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSubmit = async (content: string) => {
    if (!workload) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // In fixture mode, create a run via the fixture API
      const response = await api.submitRun({
        workload: workload.id as any,
        task: content,
        source: { kind: 'fixture', fixtureId: fixtures[0]?.id ?? 'shr-sum-range' },
      });
      setActiveRunId(response.runId);
      runs.refresh();
      // Collapse right panel and show toast
      setRightPanelOpen(false);
      addToast({
        id: response.runId,
        message: `Run deployed — ${content.slice(0, 40)}`,
        actionLabel: 'Open report',
        onAction: () => openReport(response.runId),
      });
    } catch (cause) {
      setSubmitError(cause as ApiError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSession = () => {
    setView({ kind: 'new' });
  };

  const handleSelectSession = (id: string) => {
    setActiveRunId(id);
    setView({ kind: 'chat' });
    setDrawerOpen(false);
    // If the session has a report, we could auto-open it, but we keep it closed by default
  };

  // Build chat messages from the active run
  const chatMessages: ChatMessage[] = [];
  if (activeRun.state.kind === 'ready' && activeRun.state.data) {
    const run = activeRun.state.data;
    chatMessages.push({
      id: run.runId + '-user',
      role: 'user',
      content: run.goal,
      createdAt: run.createdAt,
    });
    if (run.modelExplanation) {
      chatMessages.push({
        id: run.runId + '-assistant',
        role: 'assistant',
        content: run.modelExplanation,
        createdAt: run.finishedAt ?? run.updatedAt,
        runId: run.runId,
      });
    }
  }

  const isStreaming = activeRun.state.kind === 'ready' && (activeRun.state.data?.status === 'queued' || activeRun.state.data?.status === 'running');

  // Sidebar sessions from runs
  const sessions = (runs.state.kind === 'ready' ? runs.state.data : []).map((r) => ({
    sessionExternal: r.runId,
    name: r.goal.slice(0, 40) + (r.goal.length > 40 ? '…' : ''),
    updatedAt: r.createdAt,
    messageCount: 2,
  }));

  const reportRuns = new Set<string>(sessions.filter((s) => {
    const run = runs.state.kind === 'ready' ? runs.state.data.find((r) => r.runId === s.sessionExternal) : null;
    return run?.verdict !== null;
  }).map((s) => s.sessionExternal));

  if (mode === 'probing') {
    return (
      <div className="app">
        <div className="connecting">
          <p className="connecting__title"><span className="spinner" aria-hidden="true" /> Connecting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app app--chat">
      <header className="topbar">
        <div className="topbar__brand">
          <button
            className="button button--ghost button--small topbar__drawerbutton"
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            aria-label="Toggle sessions"
          >
            ☰
          </button>
          <span className="brand">BRZ</span>
          <span className="brand__text">
            <strong>Blast Radius Zero</strong>
          </span>
        </div>
        <div className="topbar__right">
          <ThemeToggle />
          <span className={`mode mode--${mode}`}>
            <span className="mode__dot" aria-hidden="true" />
            {mode === 'live' ? 'Live' : 'Fixtures'}
          </span>
          <button className="button button--ghost button--small" type="button" onClick={() => setSidebarCollapsed((c) => !c)}>
            {sidebarCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </header>

      {drawerOpen && (
        <button className="scrim" type="button" aria-label="Close sessions" onClick={() => setDrawerOpen(false)} />
      )}

      <div className="chat-shell">
        <Sidebar
          sessions={sessions}
          activeId={activeRunId}
          collapsed={sidebarCollapsed && !drawerOpen}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          onSelect={handleSelectSession}
          onCreate={handleNewSession}
          onRename={() => {}}
          onDelete={() => {}}
          onOpenReport={openReport}
          reports={reportRuns}
        />

        {view.kind === 'new' ? (
          <div className="chat-main">
            <SubmitForm
              workload={workload}
              fixtures={fixtures}
              onSubmit={async (req) => {
                await handleSubmit(req.task);
                setView({ kind: 'chat' });
              }}
              submitting={submitting}
              error={submitError}
            />
          </div>
        ) : (
          <div className="chat-main">
            <Chatbox
              messages={chatMessages}
              onSend={handleSubmit}
              streaming={isStreaming}
              onShowReport={openReport}
            />
          </div>
        )}

        {rightPanelOpen && rightPanelRunId && (
          <aside className="right-panel" role="complementary" aria-labelledby="report-heading">
            <div className="right-panel__head">
              <h2 id="report-heading">Blast-radius report</h2>
              <button className="button button--ghost button--small" type="button" onClick={closeReport}>
                Hide report
              </button>
            </div>
            <div className="right-panel__body">
              <ReportPanel
                report={activeRun.report.kind === 'ready' ? activeRun.report.data : null}
                state={activeRun.report}
              />
            </div>
          </aside>
        )}
      </div>

      <ToastStack items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
