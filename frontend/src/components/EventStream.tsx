import type { RunEvent, RunEventType } from '../lib/types.ts';
import { formatTime } from '../lib/format.ts';
import { EmptyState } from './States.tsx';

/**
 * The live event stream.
 *
 * The event stream is the run's progress made visible: planning → tool call →
 * execution → output → explanation. It is polled by sequence number, so a
 * poll cannot miss an event, and it is announced politely to assistive
 * technology as it grows.
 */

const EVENT_TONE: Readonly<Record<RunEventType, string>> = {
  'run.queued': 'lifecycle',
  'run.started': 'lifecycle',
  'run.completed': 'good',
  'run.failed': 'bad',
  'run.cancelled': 'lifecycle',
  'sandbox.created': 'sandbox',
  'sandbox.probe': 'sandbox',
  'sandbox.destroyed': 'lifecycle',
  'agent.plan': 'agent',
  'agent.message': 'agent',
  'tool.call': 'tool',
  'tool.result': 'tool',
  'egress.attempt': 'egress',
  'resource.sample': 'resource',
};

const DETAIL_KEYS = [
  'tool',
  'command',
  'path',
  'exitCode',
  'passed',
  'total',
  'ok',
  'bytes',
  'durationMs',
  'killReason',
  'verdict',
  'reason',
  'host',
  'capability',
  'directEgress',
  'errno',
  'credentialShapedKeys',
  'errorCode',
  'verifiedGone',
  'workDirRemoved',
  'cgroupRemoved',
  'provider',
  'enforcement',
  'summary',
  'message',
] as const;

function detailPairs(event: RunEvent): readonly string[] {
  const pairs: string[] = [];
  for (const key of DETAIL_KEYS) {
    if (!(key in event.detail)) continue;
    const value = event.detail[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    pairs.push(`${key} ${String(value)}`);
  }
  return pairs;
}

export function EventStream({
  events,
  live,
  onReplay,
}: {
  events: readonly RunEvent[];
  live: boolean;
  onReplay: () => void;
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet."
        body="The run has been accepted and the sandbox is being prepared. Its first event will appear here as soon as it lands."
      />
    );
  }

  return (
    <section className="events" aria-labelledby="events-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="events-heading">
          Event stream
        </h2>
        <div className="panel__tools">
          {live && (
            <span className="livedot" aria-label="Run is live">
              <span className="livedot__pulse" aria-hidden="true" />
              live
            </span>
          )}
          <button className="button button--ghost" type="button" onClick={onReplay}>
            Replay
          </button>
        </div>
      </div>
      <ol className="events__list" aria-live="polite" aria-relevant="additions">
        {events.map((event) => {
          const pairs = detailPairs(event);
          return (
            <li className={`event event--${EVENT_TONE[event.type]}`} key={event.seq}>
              <span className="event__time mono">{formatTime(event.at)}</span>
              <span className="event__dot" aria-hidden="true" />
              <span className="event__body">
                <span className="event__label">{event.label}</span>
                {pairs.length > 0 && <span className="event__detail mono mono--inline">{pairs.join(' · ')}</span>}
                <span className="event__type mono">{event.type}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
