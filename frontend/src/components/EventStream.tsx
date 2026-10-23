import type { RunEvent, RunEventType } from '../lib/types';
import { formatBytes, formatDuration, formatTimePrecise } from '../lib/format';
import { EmptyState } from './States';

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
  'provider.rotated': 'lifecycle',
  'tool.call': 'tool',
  'tool.result': 'tool',
  'egress.attempt': 'egress',
  'resource.sample': 'resource',
};

interface Fact {
  readonly label: string;
  readonly value: string;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

/**
 * The event `detail` object is free-form by contract, so the console reads
 * the fields it knows and shows them as short labelled facts. An unknown
 * field is ignored rather than dumped.
 */
function factsFor(event: RunEvent): readonly Fact[] {
  const detail = event.detail;
  const facts: Fact[] = [];

  const command = text(detail['command']);
  if (command !== null) facts.push({ label: 'command', value: command });

  const path = text(detail['path']);
  if (path !== null) facts.push({ label: 'path', value: path });

  const exitCode = detail['exitCode'];
  if (typeof exitCode === 'number') facts.push({ label: 'exit', value: String(exitCode) });

  const passed = count(detail['passed']);
  const total = count(detail['total']);
  if (passed !== null && total !== null) {
    facts.push({ label: 'tests', value: `${passed}/${total} passed` });
  }

  const bytes = detail['bytes'];
  if (typeof bytes === 'number') facts.push({ label: 'size', value: formatBytes(bytes) });

  const duration = detail['durationMs'];
  if (typeof duration === 'number') facts.push({ label: 'took', value: formatDuration(duration) });

  const killReason = text(detail['killReason']);
  if (killReason !== null) facts.push({ label: 'killed by', value: killReason });

  const verdict = text(detail['verdict']);
  if (verdict !== null) facts.push({ label: 'verdict', value: verdict });

  const reason = text(detail['reason']);
  if (reason !== null) facts.push({ label: 'reason', value: reason });

  const host = text(detail['host']);
  if (host !== null) facts.push({ label: 'host', value: host });

  const capability = text(detail['capability']);
  if (capability !== null) facts.push({ label: 'capability', value: capability });

  const directEgress = text(detail['directEgress']);
  if (directEgress !== null) facts.push({ label: 'direct egress', value: directEgress });

  const errno = text(detail['errno']);
  if (errno !== null) facts.push({ label: 'errno', value: errno });

  const credentialKeys = count(detail['credentialShapedKeys']);
  if (credentialKeys !== null) {
    facts.push({ label: 'credential keys', value: credentialKeys });
  }

  const errorCode = text(detail['errorCode']);
  if (errorCode !== null) facts.push({ label: 'error', value: errorCode });

  if (detail['verifiedGone'] === true) facts.push({ label: 'teardown', value: 'verified gone' });
  if (detail['workDirRemoved'] === true) facts.push({ label: 'work dir', value: 'removed' });
  if (detail['cgroupRemoved'] === true) facts.push({ label: 'cgroup', value: 'removed' });

  const provider = text(detail['provider']);
  if (provider !== null) facts.push({ label: 'provider', value: provider });

  const enforcement = text(detail['enforcement']);
  if (enforcement !== null) facts.push({ label: 'caps', value: enforcement });

  const memoryCap = detail['memoryCapBytes'];
  if (typeof memoryCap === 'number') facts.push({ label: 'memory cap', value: formatBytes(memoryCap) });

  const denied = count(detail['denied']);
  if (denied !== null) facts.push({ label: 'denied', value: denied });

  return facts;
}

/** A long free-text field that deserves its own line. */
function narration(event: RunEvent): string | null {
  const summary = text(event.detail['summary']);
  if (summary !== null) return summary;
  return text(event.detail['message']);
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
          const facts = factsFor(event);
          const note = narration(event);
          return (
            <li className={`event event--${EVENT_TONE[event.type]}`} key={event.seq}>
              <span className="event__time mono">{formatTimePrecise(event.at)}</span>
              <span className="event__dot" aria-hidden="true" />
              <span className="event__body">
                <span className="event__label">{event.label}</span>
                {facts.length > 0 && (
                  <span className="event__facts">
                    {facts.map((fact) => (
                      <span className="event__fact mono" key={`${event.seq}-${fact.label}`}>
                        <span className="event__factlabel">{fact.label}</span>
                        {fact.value}
                      </span>
                    ))}
                  </span>
                )}
                {note !== null && <span className="event__note">{note}</span>}
                <span className="event__type mono">{event.type}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
