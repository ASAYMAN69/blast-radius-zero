/**
 * The `artifacts` table: the evidence a reader can check without trusting the
 * narrative — file contents, the failing test output, the diff-sized facts.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';

export interface AppendArtifactInput {
  readonly runId: string;
  readonly label: string;
  readonly kind: 'text' | 'file';
  readonly content: string | null;
  readonly bytes: number;
  readonly sha256: string;
  readonly createdAt: string;
}

export interface ArtifactRow {
  readonly label: string;
  readonly kind: 'text' | 'file';
  readonly content: string | null;
  readonly bytes: number;
  readonly sha256: string;
}

interface RawArtifactRow {
  label: string;
  kind: string;
  content: string | null;
  bytes: number;
  sha256: string;
}

export interface ArtifactStore {
  append(input: AppendArtifactInput): void;
  list(runId: string): readonly ArtifactRow[];
}

export function createArtifactStore(db: Database): ArtifactStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    append(input: AppendArtifactInput): void {
      stmt(
        `INSERT INTO artifacts (run_id, label, kind, content, bytes, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.runId,
        input.label,
        input.kind,
        input.content,
        Math.max(0, Math.round(input.bytes)),
        input.sha256,
        input.createdAt,
      );
    },

    list(runId: string): readonly ArtifactRow[] {
      const rows = stmt(
        `SELECT label, kind, content, bytes, sha256
           FROM artifacts
          WHERE run_id = ?
          ORDER BY id ASC`,
      ).all(runId) as unknown as RawArtifactRow[];
      return rows.map((row) => ({
        label: row.label,
        kind: row.kind as 'text' | 'file',
        content: row.content,
        bytes: row.bytes,
        sha256: row.sha256,
      }));
    },
  };
}
