/**
 * The migration runner (§9.4).
 *
 *  - numbered, ordered SQL files in `./migrations/`;
 *  - applies every version greater than the highest applied version, ascending,
 *    each in its own transaction;
 *  - records version, name, applied_at and a SHA-256 checksum;
 *  - fails loudly if a recorded checksum no longer matches the file on disk
 *    (that means an applied migration was edited);
 *  - runs at server startup, before the listener binds.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Database } from './sqlite.ts';
import { openDatabase } from './sqlite.ts';
import { parseConfig } from '../config.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface MigrationResult {
  /** Highest applied version, or `null` when the schema is empty. */
  readonly schemaVersion: number | null;
  /** Versions applied by this call. */
  readonly applied: readonly number[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function loadMigrations(directory: string = MIGRATIONS_DIR): readonly Migration[] {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const migrations: Migration[] = [];
  for (const file of files) {
    const match = /^(\d+)_([A-Za-z0-9_-]+)\.sql$/.exec(file);
    if (match === null) {
      throw new Error(`Migration file name is not "<version>_<name>.sql": ${file}`);
    }
    const version = Number.parseInt(match[1] ?? '', 10);
    const name = match[2] ?? '';
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new Error(`Migration file has an invalid version: ${file}`);
    }
    const sql = readFileSync(path.join(directory, file), 'utf8');
    migrations.push({ version, name, sql, checksum: sha256(sql) });
  }

  for (let index = 1; index < migrations.length; index += 1) {
    const previous = migrations[index - 1];
    const current = migrations[index];
    if (previous === undefined || current === undefined) continue;
    if (current.version <= previous.version) {
      throw new Error('Migration versions must be unique and strictly ascending.');
    }
  }

  return migrations;
}

interface AppliedRow {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

function readApplied(db: Database): readonly AppliedRow[] {
  const rows = db
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC')
    .all() as unknown as AppliedRow[];
  return rows;
}

/** The highest applied schema version, or `null` if the table does not exist. */
export function currentSchemaVersion(db: Database): number | null {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (table === undefined) return null;
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined;
  return row?.version ?? null;
}

export function migrate(db: Database, directory: string = MIGRATIONS_DIR): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT    NOT NULL,
      applied_at  TEXT    NOT NULL,
      checksum    TEXT    NOT NULL
    )
  `);

  const migrations = loadMigrations(directory);
  const applied = readApplied(db);
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

  for (const row of applied) {
    const migration = migrations.find((candidate) => candidate.version === row.version);
    if (migration === undefined) {
      throw new Error(
        `Migration ${row.version} (${row.name}) is recorded as applied but its file is missing. ` +
          'A migration file must never be removed.',
      );
    }
    if (migration.checksum !== row.checksum) {
      throw new Error(
        `Migration ${row.version} (${row.name}) has changed after it was applied. ` +
          'Applied migrations are immutable: add a new migration instead.',
      );
    }
  }

  let highest = applied.length === 0 ? 0 : Math.max(...applied.map((row) => row.version));
  const appliedNow: number[] = [];

  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) continue;
    if (migration.version <= highest) continue;

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, new Date().toISOString(), migration.checksum);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    appliedNow.push(migration.version);
    highest = migration.version;
  }

  return { schemaVersion: highest === 0 ? null : highest, applied: appliedNow };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  // `npm run migrate` path: fail loudly, with the variable named on a config
  // error and nothing secret printed.
  const config = parseConfig();
  const db = openDatabase(config.dbPath);
  try {
    const result = migrate(db);
    const suffix = result.applied.length === 0 ? 'no pending migrations' : `applied ${result.applied.join(', ')}`;
    console.log(`schema version ${result.schemaVersion ?? 'none'} — ${suffix}`);
  } finally {
    db.close();
  }
}
