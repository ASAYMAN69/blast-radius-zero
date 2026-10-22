/**
 * The database handle. `node:sqlite` is built into Node 24 — no driver, no
 * server, no ORM (§9.1).
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type Database = DatabaseSync;

/**
 * Prepared statements are reused per SQL string (§9.1: "Every statement is
 * prepared and reused. No string interpolation into SQL anywhere.").
 */
export type StatementCache = (sql: string) => StatementSync;

export function createStatementCache(db: Database): StatementCache {
  const cache = new Map<string, StatementSync>();
  return (sql: string): StatementSync => {
    const existing = cache.get(sql);
    if (existing !== undefined) return existing;
    const prepared = db.prepare(sql);
    cache.set(sql, prepared);
    return prepared;
  };
}


/**
 * Open the database and apply the pragmas that the design fixes.
 *
 * WAL: the control plane writes events continuously while the console reads
 * runs; WAL lets readers proceed during a write.
 */
export function openDatabase(dbPath: string): Database {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
