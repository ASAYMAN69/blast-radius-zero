/**
 * The `blast_radius_reports` table. The report is immutable once written: it is
 * the evidence.
 */

import type { Database, StatementCache } from '../sqlite.ts';
import { createStatementCache } from '../sqlite.ts';
import type { BlastRadiusReport } from '../../contracts/report.ts';

export interface ReportStore {
  put(report: BlastRadiusReport): void;
  get(runId: string): BlastRadiusReport | null;
}

export function createReportStore(db: Database): ReportStore {
  const stmt: StatementCache = createStatementCache(db);

  return {
    put(report: BlastRadiusReport): void {
      stmt(
        `INSERT INTO blast_radius_reports (run_id, report_version, generated_at, verdict, report_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           report_version = excluded.report_version,
           generated_at   = excluded.generated_at,
           verdict        = excluded.verdict,
           report_json    = excluded.report_json`,
      ).run(
        report.runId,
        report.reportVersion,
        report.generatedAt,
        report.verdict,
        JSON.stringify(report),
      );
    },

    get(runId: string): BlastRadiusReport | null {
      const row = stmt('SELECT report_json FROM blast_radius_reports WHERE run_id = ?').get(runId) as
        | { report_json: string }
        | undefined;
      if (row === undefined) return null;
      return JSON.parse(row.report_json) as BlastRadiusReport;
    },
  };
}
