import type { Database } from '../sqlite.ts';
import { newSessionId, newMessageId } from '../../runs/ids.ts';

function nowIso(): string { return new Date().toISOString(); }

export interface SessionRow {
  readonly sessionInternal: number;
  readonly sessionExternal: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly compactedSummary: string | null;
}

export interface MessageRow {
  readonly messageInternal: number;
  readonly messageExternal: string;
  readonly sessionInternal: number;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly createdAt: string;
}

export interface SessionStore {
  create(): SessionRow;
  get(sessionExternal: string): SessionRow | null;
  getByInternal(internal: number): SessionRow | null;
  list(): readonly SessionRow[];
  rename(sessionExternal: string, name: string): SessionRow | null;
  delete(sessionExternal: string): boolean;
  updateCompacted(sessionExternal: string, summary: string, keepLastN: number): { compactedCount: number; keptCount: number };
  touch(sessionExternal: string): void;
  touchByInternal(internal: number): void;
}

export interface MessageStore {
  add(sessionInternal: number, role: 'user' | 'assistant', content: string): MessageRow;
  list(sessionInternal: number): readonly MessageRow[];
  count(sessionInternal: number): number;
  deleteBySession(sessionInternal: number): void;
}

export function createSessionStore(db: Database): SessionStore {
  return {
    create(): SessionRow {
      const external = newSessionId();
      const now = nowIso();
      const info = db.prepare(
        'INSERT INTO sessions (session_external, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ).run(external, 'New session', now, now);
      const internal = Number(info.lastInsertRowid);
      return { sessionInternal: internal, sessionExternal: external, name: 'New session', createdAt: now, updatedAt: now, compactedSummary: null };
    },
    get(external: string): SessionRow | null {
      const row = db.prepare(
        'SELECT session_internal, session_external, name, created_at, updated_at, compacted_summary FROM sessions WHERE session_external = ?',
      ).get(external) as any;
      if (row === undefined) return null;
      return { sessionInternal: row.session_internal, sessionExternal: row.session_external, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, compactedSummary: row.compacted_summary };
    },
    getByInternal(internal: number): SessionRow | null {
      const row = db.prepare(
        'SELECT session_internal, session_external, name, created_at, updated_at, compacted_summary FROM sessions WHERE session_internal = ?',
      ).get(internal) as any;
      if (row === undefined) return null;
      return { sessionInternal: row.session_internal, sessionExternal: row.session_external, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, compactedSummary: row.compacted_summary };
    },
    list(): readonly SessionRow[] {
      const rows = db.prepare(
        'SELECT session_internal, session_external, name, created_at, updated_at, compacted_summary FROM sessions ORDER BY updated_at DESC',
      ).all() as any[];
      return rows.map((r) => ({ sessionInternal: r.session_internal, sessionExternal: r.session_external, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, compactedSummary: r.compacted_summary }));
    },
    rename(external: string, name: string): SessionRow | null {
      const now = nowIso();
      db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE session_external = ?').run(name, now, external);
      return this.get(external);
    },
    delete(external: string): boolean {
      const info = db.prepare('DELETE FROM sessions WHERE session_external = ?').run(external);
      return info.changes > 0;
    },
    touch(external: string): void {
      db.prepare('UPDATE sessions SET updated_at = ? WHERE session_external = ?').run(nowIso(), external);
    },
    touchByInternal(internal: number): void {
      db.prepare('UPDATE sessions SET updated_at = ? WHERE session_internal = ?').run(nowIso(), internal);
    },
    updateCompacted(external: string, summary: string, keepLastN: number): { compactedCount: number; keptCount: number } {
      const session = this.get(external);
      if (session === null) return { compactedCount: 0, keptCount: 0 };
      const msgs = db.prepare('SELECT message_internal FROM messages WHERE session_internal = ? ORDER BY message_internal ASC').all(session.sessionInternal) as any[];
      const total = msgs.length;
      const keep = Math.min(keepLastN, total);
      const compactCount = total - keep;
      if (compactCount <= 0) {
        return { compactedCount: 0, keptCount: total };
      }
      // delete the compacted (oldest) messages
      const toDelete = msgs.slice(0, compactCount).map((m: any) => m.message_internal);
      for (const id of toDelete) {
        db.prepare('DELETE FROM messages WHERE message_internal = ?').run(id);
      }
      db.prepare('UPDATE sessions SET compacted_summary = ?, updated_at = ? WHERE session_external = ?').run(summary, nowIso(), external);
      return { compactedCount: compactCount, keptCount: keep };
    },
  };
}

export function createMessageStore(db: Database): MessageStore {
  return {
    add(sessionInternal: number, role: 'user' | 'assistant', content: string): MessageRow {
      const external = newMessageId();
      const now = nowIso();
      const info = db.prepare(
        'INSERT INTO messages (message_external, session_internal, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(external, sessionInternal, role, content, now);
      return { messageInternal: Number(info.lastInsertRowid), messageExternal: external, sessionInternal, role, content, createdAt: now };
    },
    list(sessionInternal: number): readonly MessageRow[] {
      const rows = db.prepare(
        'SELECT message_internal, message_external, session_internal, role, content, created_at FROM messages WHERE session_internal = ? ORDER BY message_internal ASC',
      ).all(sessionInternal) as any[];
      return rows.map((r) => ({ messageInternal: r.message_internal, messageExternal: r.message_external, sessionInternal: r.session_internal, role: r.role, content: r.content, createdAt: r.created_at }));
    },
    count(sessionInternal: number): number {
      const row = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_internal = ?').get(sessionInternal) as any;
      return row?.c ?? 0;
    },
    deleteBySession(sessionInternal: number): void {
      db.prepare('DELETE FROM messages WHERE session_internal = ?').run(sessionInternal);
    },
  };
}
