import { useRef, useState } from 'react';
import type { SessionSummary } from '../lib/types';

/**
 * The left sidebar — sessions.
 *
 * Collapsible on desktop, overlay drawer on mobile. Session list with
 * rename/delete, empty state, keyboard navigation.
 */

export interface SidebarProps {
  readonly sessions: readonly SessionSummary[];
  readonly activeId: string | null;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onOpenReport?: (id: string) => void;
  readonly reports: ReadonlySet<string>;
}

export function Sidebar({
  sessions,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenReport,
  reports,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const handleRename = (id: string) => {
    const session = sessions.find((s) => s.sessionExternal === id);
    if (!session) return;
    setEditingId(id);
    setEditValue(session.name);
  };

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    if (trimmed.length > 0) onRename(id, trimmed);
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(index + 1, sessions.length - 1);
      const btn = listRef.current?.querySelectorAll('button.session-row')[next] as HTMLButtonElement | undefined;
      btn?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(index - 1, 0);
      const btn = listRef.current?.querySelectorAll('button.session-row')[prev] as HTMLButtonElement | undefined;
      btn?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sessions[index]) onSelect(sessions[index].sessionExternal);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onToggle();
    }
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed" aria-label="Sessions">
        <button className="button button--ghost button--small sidebar__toggle" type="button" onClick={onToggle} aria-label="Show sessions">
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar" aria-label="Sessions">
      <div className="sidebar__head">
        <h2 className="sidebar__title">Sessions</h2>
        <button className="button button--ghost button--small sidebar__toggle" type="button" onClick={onToggle} aria-label="Hide sessions">
          ✕
        </button>
      </div>

      <button className="button button--primary sidebar__new" type="button" onClick={onCreate}>
        + New session
      </button>

      {sessions.length === 0 ? (
        <div className="sidebar__empty">
          <p>No sessions yet — start a chat.</p>
        </div>
      ) : (
        <ul className="session-list" ref={listRef}>
          {sessions.map((session, index) => {
            const isActive = session.sessionExternal === activeId;
            const isEditing = editingId === session.sessionExternal;
            const isConfirming = confirmDeleteId === session.sessionExternal;
            return (
              <li key={session.sessionExternal} className={`session-row${isActive ? ' session-row--active' : ''}`}>
                {isEditing ? (
                  <input
                    className="input session-row__input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitRename(session.sessionExternal)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(session.sessionExternal);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="session-row__button"
                    onClick={() => onSelect(session.sessionExternal)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className="session-row__name">{session.name}</span>
                    <span className="session-row__meta">{formatRelative(session.updatedAt)}</span>
                    {reports.has(session.sessionExternal) && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="session-row__report-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReport?.(session.sessionExternal);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenReport?.(session.sessionExternal);
                          }
                        }}
                        aria-label="Open report"
                      >
                        report
                      </span>
                    )}
                  </button>
                )}
                {!isEditing && (
                  <div className="session-row__actions">
                    <button type="button" className="session-row__action" onClick={() => handleRename(session.sessionExternal)} aria-label="Rename session">
                      ✎
                    </button>
                    <button type="button" className="session-row__action" onClick={() => setConfirmDeleteId(session.sessionExternal)} aria-label="Delete session">
                      ×
                    </button>
                  </div>
                )}
                {isConfirming && (
                  <div className="session-row__confirm">
                    <span>Delete this session?</span>
                    <button type="button" className="button button--ghost button--small" onClick={() => { onDelete(session.sessionExternal); setConfirmDeleteId(null); }}>
                      Delete
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const delta = Math.max(0, Date.now() - then);
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${String(Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${String(Math.round(delta / 3_600_000))}h ago`;
  return new Date(iso).toLocaleDateString();
}
