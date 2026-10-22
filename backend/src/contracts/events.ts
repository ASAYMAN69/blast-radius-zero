/**
 * Run lifecycle and the event stream — frozen by
 * `docs/architecture/02-phase1-design.md` §8.6.
 */

/** Per-run monotonic sequence number. `after` in the events query is this. */
export type EventSeq = number;

/**
 * The run's lifecycle state. `queued` → `running` → a terminal status.
 * `phase` is the finer-grained position *within* `running`.
 */
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** The position within a run. `done` is the terminal phase of a finished run. */
export type RunPhase =
  | 'queued'
  | 'sandbox_starting'
  | 'containment_probe'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'reporting'
  | 'teardown'
  | 'done';

export type RunEventType =
  | 'run.queued'
  | 'run.started'
  | 'sandbox.created'
  | 'sandbox.probe'
  | 'agent.plan'
  | 'agent.message'
  | 'tool.call'
  | 'tool.result'
  | 'egress.attempt'
  | 'resource.sample'
  | 'sandbox.destroyed'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

export interface RunEvent {
  readonly seq: EventSeq;
  readonly runId: string;
  readonly at: string;
  readonly type: RunEventType;
  readonly phase: RunPhase;
  /** A short human label for the UI's event list. */
  readonly label: string;
  /** Type-specific detail. Always JSON-safe and free of secrets. */
  readonly detail: Readonly<Record<string, unknown>>;
}
