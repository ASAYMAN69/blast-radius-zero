import type { BlastRadiusVerdict, RunPhase, RunStatus } from '../lib/types';

/**
 * The small vocabulary of labels the console shows.
 *
 * Status, phase, and verdict are the three words a judge reads first, so they
 * are written here once and reused everywhere.
 */

const STATUS_LABEL: Readonly<Record<RunStatus, string>> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const PHASE_LABEL: Readonly<Record<RunPhase, string>> = {
  queued: 'Queued',
  sandbox_starting: 'Starting sandbox',
  containment_probe: 'Containment probe',
  planning: 'Planning',
  executing: 'Executing',
  verifying: 'Verifying',
  reporting: 'Reporting',
  teardown: 'Tearing down',
  done: 'Done',
};

const VERDICT_LABEL: Readonly<Record<BlastRadiusVerdict, string>> = {
  contained: 'Contained',
  'contained-with-denials': 'Contained, with denials',
  violated: 'Violated',
  incomplete: 'Incomplete',
};

export function statusLabel(status: RunStatus): string {
  return STATUS_LABEL[status];
}

export function phaseLabel(phase: RunPhase): string {
  return PHASE_LABEL[phase];
}

export function verdictLabel(verdict: BlastRadiusVerdict): string {
  return VERDICT_LABEL[verdict];
}

export function StatusPill({ status }: { status: RunStatus }) {
  return <span className={`pill pill--${status}`}>{statusLabel(status)}</span>;
}

export function PhaseChip({ phase }: { phase: RunPhase }) {
  return <span className="chip">{phaseLabel(phase)}</span>;
}

export function VerdictBadge({ verdict }: { verdict: BlastRadiusVerdict }) {
  return (
    <span className={`verdict verdict--${verdict}`}>
      <span className="verdict__dot" aria-hidden="true" />
      {verdictLabel(verdict)}
    </span>
  );
}
