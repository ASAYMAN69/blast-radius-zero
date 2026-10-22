import type { ReactNode } from 'react';
import type {
  BlastRadiusReport,
  BlastRadiusVerdict,
  EgressAttempt,
  Measured,
  ResourceEnforcementMode,
  SandboxKillReason,
} from '../lib/types';
import { formatBytes, formatDuration, formatSeconds, formatTime, usagePercent } from '../lib/format';
import { verdictLabel } from './Badges';
import { ErrorState, NotReadyState, UnauthorizedState } from './States';
import type { ReportState } from '../hooks/useRun';

/**
 * The blast-radius report.
 *
 * This panel is the product. It has to be readable in five seconds by someone
 * who does not know the system, and it has to be honest in every line — a
 * measurement that was not taken is shown as *not measured*, never as `0`.
 *
 * The shape is deliberate:
 *
 *   verdict banner   → one word and one sentence: was it contained?
 *   glance tiles     → what changed, what passed, what left, what was refused
 *   cap meters       → measured peak against the cap, for every dimension
 *   details          → the evidence, one disclosure per question
 *
 * A judge should be able to point at this panel and say what happened.
 */

const ENFORCEMENT_LABEL: Readonly<Record<ResourceEnforcementMode, string>> = {
  'cgroup+rlimit': 'cgroup v2 + rlimits',
  'rlimit-only': 'rlimits only — no cgroup was available',
  'provider-native': 'enforced by the provider',
};

const KILL_REASON_LABEL: Readonly<Record<SandboxKillReason, string>> = {
  'wall-clock-timeout': 'wall-clock timeout',
  'memory-cap': 'memory cap',
  'cpu-cap': 'CPU cap',
  'process-cap': 'process cap',
  'file-size-cap': 'file size cap',
  cancelled: 'cancelled',
  'sandbox-destroyed': 'sandbox destroyed',
  'provider-error': 'provider error',
};

function verdictTone(verdict: BlastRadiusVerdict): 'good' | 'warn' | 'bad' | 'neutral' {
  switch (verdict) {
    case 'contained':
      return 'good';
    case 'contained-with-denials':
      return 'warn';
    case 'violated':
      return 'bad';
    case 'incomplete':
    default:
      return 'neutral';
  }
}

function Tile({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className={`tile tile--${tone}`}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {note !== undefined && <span className="tile__note">{note}</span>}
    </div>
  );
}

function NotMeasured({ reason }: { reason: string }) {
  return (
    <span className="notmeasured" title={reason}>
      not measured
    </span>
  );
}

function Meter({
  label,
  used,
  cap,
  formatUsed,
  formatCap,
  tone,
}: {
  label: string;
  used: Measured<number>;
  cap: number;
  formatUsed: (value: number) => string;
  formatCap: (value: number) => string;
  tone: 'neutral' | 'warn' | 'bad';
}) {
  const percent = used.state === 'measured' ? usagePercent(used.value, cap) : 0;
  return (
    <div className={`meter meter--${tone}`}>
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        <span className="meter__value mono">
          {used.state === 'measured' ? formatUsed(used.value) : <NotMeasured reason={used.reason} />}
        </span>
      </div>
      <div
        className="meter__track"
        role="img"
        aria-label={
          used.state === 'measured'
            ? `${label}: ${formatUsed(used.value)} of ${formatCap(cap)}`
            : `${label}: not measured`
        }
      >
        <span className="meter__fill" style={{ width: `${String(percent)}%` }} />
      </div>
      <span className="meter__cap mono">cap {formatCap(cap)}</span>
    </div>
  );
}

function FactRow({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className={`fact${tone !== undefined ? ` fact--${tone}` : ''}`}>
      <span className="fact__label">{label}</span>
      <span className="fact__value">{value}</span>
    </div>
  );
}

function attemptVerdict(attempt: EgressAttempt): 'denied' | 'allowed' {
  return attempt.verdict === 'denied' ? 'denied' : 'allowed';
}

export function ReportPanel({ report, state }: { report: BlastRadiusReport | null; state: ReportState }) {
  if (state.kind === 'not-ready') {
    return <NotReadyState label="Waiting for the report…" />;
  }
  if (state.kind === 'unauthorized') {
    return <UnauthorizedState />;
  }
  if (state.kind === 'error') {
    return <ErrorState error={state.error} context="The report could not be loaded." />;
  }
  if (report === null) {
    return <NotReadyState label="Waiting for the report…" />;
  }

  const tone = verdictTone(report.verdict);
  const denied = report.network.attempts.filter((attempt) => attempt.verdict === 'denied');
  const allowed = report.network.attempts.filter((attempt) => attempt.verdict === 'allowed');
  const bytesOut = allowed.reduce((total, attempt) => total + (attempt.bytes ?? 0), 0);
  const agentFiles = report.code.filesWritten.filter((file) => file.origin === 'agent');
  const finalTest = report.code.finalTestRun;
  const limits = report.containment.resourceLimits;
  const lifecycle = report.containment.lifecycle;
  const measurement = report.containment.measurement;

  const capsTone: 'neutral' | 'warn' | 'bad' =
    report.resources.killReason !== null
      ? 'bad'
      : report.resources.memoryPeakBytes.state === 'measured' &&
          report.resources.memoryPeakBytes.value >= report.resources.memoryCapBytes * 0.9
        ? 'warn'
        : 'neutral';

  return (
    <section className="report" aria-labelledby="report-heading">
      <header className={`report__banner report__banner--${tone}`}>
        <div className="report__bannerhead">
          <p className="eyebrow">Blast-radius report</p>
          <span className={`verdict verdict--${report.verdict} verdict--large`}>
            <span className="verdict__dot" aria-hidden="true" />
            {verdictLabel(report.verdict)}
          </span>
        </div>
        <h2 className="report__headline" id="report-heading">
          {report.headline}
        </h2>
        <p className="report__meta mono">
          <span title="Run id">{report.runId}</span>
          <span aria-hidden="true">·</span>
          <span title="Generated at">generated {formatTime(report.generatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>report v{report.reportVersion}</span>
        </p>
      </header>

      <div className="tiles">
        <Tile
          label="Files changed"
          value={String(agentFiles.length)}
          note={agentFiles.length > 0 ? agentFiles.map((file) => file.path).join(', ') : 'nothing was modified'}
          tone={agentFiles.length > 0 ? 'neutral' : 'neutral'}
        />
        <Tile
          label="Tests"
          value={
            finalTest === null ? (
              <NotMeasured reason="The verification run never completed." />
            ) : (
              `${String(finalTest.passed)} / ${String(finalTest.total)}`
            )
          }
          note={
            finalTest === null
              ? 'no verification run'
              : finalTest.exitCode === 0
                ? 'decided by the sandbox'
                : 'the suite is red'
          }
          tone={finalTest === null ? 'neutral' : finalTest.exitCode === 0 ? 'good' : 'bad'}
        />
        <Tile
          label="Bytes out"
          value={allowed.length === 0 ? '0 B' : formatBytes(bytesOut)}
          note={allowed.length === 0 ? 'nothing left the sandbox' : `${String(allowed.length)} allowed fetch(es)`}
          tone={allowed.length === 0 ? 'good' : 'warn'}
        />
        <Tile
          label="Network attempts"
          value={`${String(report.network.deniedCount)} denied`}
          note={
            report.network.allowedCount === 0
              ? 'none were allowed'
              : `${String(report.network.allowedCount)} were allowed`
          }
          tone={report.network.deniedCount > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="caps" aria-label="Resource usage against the caps">
        <Meter
          label="Memory peak"
          used={report.resources.memoryPeakBytes}
          cap={report.resources.memoryCapBytes}
          formatUsed={(value) => formatBytes(value)}
          formatCap={(value) => formatBytes(value)}
          tone={capsTone}
        />
        <Meter
          label="CPU time"
          used={report.resources.cpuSeconds}
          cap={report.resources.cpuCapSeconds}
          formatUsed={(value) => formatSeconds(value)}
          formatCap={(value) => formatSeconds(value)}
          tone={capsTone}
        />
        <Meter
          label="Processes"
          used={report.resources.maxProcessesObserved}
          cap={report.resources.processCap}
          formatUsed={(value) => String(value)}
          formatCap={(value) => String(value)}
          tone={capsTone}
        />
        <Meter
          label="Wall clock"
          used={report.resources.wallClockMs}
          cap={report.resources.wallClockCapMs}
          formatUsed={(value) => formatDuration(value)}
          formatCap={(value) => formatDuration(value)}
          tone={capsTone}
        />
      </div>

      {report.resources.killReason !== null && (
        <p className="report__alert report__alert--bad" role="status">
          <strong>The sandbox was killed by a cap.</strong> The {KILL_REASON_LABEL[report.resources.killReason]}{' '}
          fired, and the run could not finish. The peak above is the measurement taken at the moment of death.
        </p>
      )}

      {limits.state === 'measured' && limits.value.capFired && report.resources.killReason === null && (
        <p className="report__alert report__alert--warn" role="status">
          <strong>A cap was reached</strong> during the run, though the process was not killed.
        </p>
      )}

      <details className="disclosure" open>
        <summary>
          What ran <span className="disclosure__count">{String(report.code.commands.length)} commands</span>
        </summary>
        <div className="disclosure__body">
          <h3 className="subhead">Files written</h3>
          {report.code.filesWritten.length === 0 ? (
            <p className="muted">No file was written during this run.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Path</th>
                  <th scope="col">Size</th>
                  <th scope="col">Written by</th>
                  <th scope="col">Digest</th>
                </tr>
              </thead>
              <tbody>
                {report.code.filesWritten.map((file) => (
                  <tr key={`${file.path}-${file.sha256}`}>
                    <td className="mono mono--inline">{file.path}</td>
                    <td className="mono">{formatBytes(file.bytes)}</td>
                    <td>{file.origin === 'agent' ? 'agent' : 'workload seed'}</td>
                    <td className="mono mono--dim" title={file.sha256}>
                      {file.sha256.slice(0, 10)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 className="subhead">Commands</h3>
          {report.code.commands.length === 0 ? (
            <p className="muted">No command was executed.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Command</th>
                  <th scope="col">Exit</th>
                  <th scope="col">Took</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {report.code.commands.map((command, index) => (
                  <tr key={`${command.argv.join(' ')}-${String(index)}`}>
                    <td className="mono mono--inline">{command.argv.join(' ')}</td>
                    <td className="mono">{command.exitCode === null ? '—' : String(command.exitCode)}</td>
                    <td className="mono">{formatDuration(command.durationMs)}</td>
                    <td>
                      <span className={`outcome outcome--${command.outcome}`}>
                        {command.outcome.replace('-', ' ')}
                      </span>
                      {command.refusalReason !== null && (
                        <span className="muted"> — {command.refusalReason}</span>
                      )}
                      {command.killReason !== null && (
                        <span className="muted"> — {KILL_REASON_LABEL[command.killReason]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      <details className="disclosure" open={denied.length > 0}>
        <summary>
          What was denied <span className="disclosure__count">{String(denied.length)} refusals</span>
        </summary>
        <div className="disclosure__body">
          {denied.length === 0 ? (
            <p className="muted">
              Nothing was denied in this run. No capability request was refused and no command was rejected.
            </p>
          ) : (
            <>
              <p className="muted">
                Every refusal is recorded. A denied request performs no work at all — the broker answers
                without touching the network.
              </p>
              <ul className="denials">
                {denied.map((attempt, index) => (
                  <li className="denial" key={`${attempt.at}-${String(index)}`}>
                    <span className="denial__badge">denied</span>
                    <span className="denial__body">
                      <span className="denial__host mono">
                        {attempt.host ?? 'no host'} · {attempt.capability}
                      </span>
                      <span className="denial__reason mono">{attempt.reason}</span>
                      <span className="denial__origin">
                        asked by the {attempt.origin === 'agent' ? 'agent' : 'containment probe'} at{' '}
                        {formatTime(attempt.at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {report.code.commands.some((command) => command.outcome === 'refused') && (
            <>
              <h3 className="subhead">Refused commands</h3>
              <ul className="denials">
                {report.code.commands
                  .filter((command) => command.outcome === 'refused')
                  .map((command, index) => (
                    <li className="denial" key={`refused-${String(index)}`}>
                      <span className="denial__badge">refused</span>
                      <span className="denial__body">
                        <span className="denial__host mono">{command.argv.join(' ')}</span>
                        <span className="denial__reason mono">{command.refusalReason ?? 'not_allowed'}</span>
                        <span className="denial__origin">the command never reached the sandbox</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          Network <span className="disclosure__count">{String(report.network.attempts.length)} attempts</span>
        </summary>
        <div className="disclosure__body">
          <FactRow
            label="Direct access from the sandbox"
            value={report.network.directAccess === 'blocked' ? 'blocked' : report.network.directAccess}
            tone="good"
          />
          <FactRow label="Mechanism" value={<span className="mono mono--inline">{report.network.directMechanism}</span>} />
          <FactRow
            label="Probe result"
            value={
              report.network.probe.state === 'measured' ? (
                <span className="mono mono--inline">
                  reachable {String(report.network.probe.value.reachable)} · errno{' '}
                  {report.network.probe.value.errno ?? '—'} · broker socket{' '}
                  {String(report.network.probe.value.brokerReachable)}
                </span>
              ) : (
                <NotMeasured reason={report.network.probe.reason} />
              )
            }
          />
          <FactRow
            label="Egress allowlist"
            value={
              report.network.allowlist.length === 0 ? (
                <span className="muted">empty — every fetch is denied</span>
              ) : (
                <span className="mono mono--inline">{report.network.allowlist.join(', ')}</span>
              )
            }
          />
          <FactRow label="Allowed" value={String(report.network.allowedCount)} tone={report.network.allowedCount > 0 ? 'warn' : 'good'} />
          <FactRow label="Denied" value={String(report.network.deniedCount)} tone={report.network.deniedCount > 0 ? 'warn' : undefined} />

          {report.network.attempts.length > 0 && (
            <table className="table table--attempts">
              <thead>
                <tr>
                  <th scope="col">At</th>
                  <th scope="col">Capability</th>
                  <th scope="col">Host</th>
                  <th scope="col">Verdict</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Origin</th>
                </tr>
              </thead>
              <tbody>
                {report.network.attempts.map((attempt, index) => (
                  <tr key={`${attempt.at}-${String(index)}`} className={`row--${attemptVerdict(attempt)}`}>
                    <td className="mono">{formatTime(attempt.at)}</td>
                    <td className="mono">{attempt.capability}</td>
                    <td className="mono mono--inline">{attempt.host ?? '—'}</td>
                    <td>
                      <span className={`outcome outcome--${attempt.verdict}`}>{attempt.verdict}</span>
                    </td>
                    <td className="mono mono--dim">{attempt.reason}</td>
                    <td>{attempt.origin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>Containment measurement</summary>
        <div className="disclosure__body">
          {measurement === null ? (
            <p className="muted">The containment probe never ran, so nothing was measured.</p>
          ) : (
            <>
              <FactRow
                label="Direct egress reachable"
                value={String(measurement.directNetworkReachable)}
                tone={measurement.directNetworkReachable ? 'bad' : 'good'}
              />
              <FactRow
                label="Direct egress probe"
                value={
                  <span className="mono mono--inline">
                    {measurement.directNetworkProbe.attempted ? 'attempted' : 'not attempted'} · errno{' '}
                    {measurement.directNetworkProbe.errno ?? '—'} · {measurement.directNetworkProbe.message}
                  </span>
                }
              />
              <FactRow
                label="Credential-shaped keys visible"
                value={String(measurement.secretMaterialVisible)}
                tone={measurement.secretMaterialVisible ? 'bad' : 'good'}
              />
              <FactRow
                label="Environment inside the sandbox"
                value={<span className="mono mono--inline">{measurement.environmentKeys.join(' ') || '—'}</span>}
              />
              <FactRow
                label="Writable outside the work dir"
                value={String(measurement.writableOutsideWorkDir)}
                tone={measurement.writableOutsideWorkDir ? 'bad' : 'good'}
              />
              <FactRow
                label="Process namespace isolated"
                value={String(measurement.processNamespaceIsolated)}
                tone={measurement.processNamespaceIsolated ? 'good' : 'bad'}
              />
              <FactRow
                label="Root entries visible"
                value={<span className="mono mono--inline">{measurement.visibleRootEntries.join(' ')}</span>}
              />
              <FactRow label="Broker socket reachable" value={String(measurement.brokerReachable)} />
              <FactRow label="Measured at" value={formatTime(measurement.measuredAt)} />
              <FactRow label="Provider" value={measurement.provider} />
            </>
          )}

          {report.containment.secretHygiene.state === 'measured' && (
            <FactRow
              label="Project directory visible"
              value={String(report.containment.secretHygiene.value.projectDirectoryVisible)}
              tone={report.containment.secretHygiene.value.projectDirectoryVisible ? 'bad' : 'good'}
            />
          )}
          {limits.state === 'measured' && (
            <FactRow
              label="Caps enforced by"
              value={<span className="mono mono--inline">{ENFORCEMENT_LABEL[limits.value.enforcement]}</span>}
            />
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          Teardown <span className="disclosure__count">{report.lifecycle.teardownVerified ? 'verified' : 'unverified'}</span>
        </summary>
        <div className="disclosure__body">
          <FactRow
            label="Sandbox destroyed"
            value={report.lifecycle.destroyedAt === null ? 'no' : formatTime(report.lifecycle.destroyedAt)}
          />
          <FactRow
            label="Teardown verified"
            value={String(report.lifecycle.teardownVerified)}
            tone={report.lifecycle.teardownVerified ? 'good' : 'bad'}
          />
          <FactRow
            label="Work directory removed"
            value={String(report.lifecycle.workDirRemoved)}
            tone={report.lifecycle.workDirRemoved ? 'good' : 'bad'}
          />
          <FactRow
            label="cgroup removed"
            value={String(report.lifecycle.cgroupRemoved)}
            tone={report.lifecycle.cgroupRemoved ? 'good' : 'bad'}
          />
          <FactRow
            label="Leaked resources"
            value={
              report.lifecycle.leakedResources.length === 0 ? (
                <span className="muted">none</span>
              ) : (
                <span className="mono mono--inline">{report.lifecycle.leakedResources.join(', ')}</span>
              )
            }
            tone={report.lifecycle.leakedResources.length > 0 ? 'bad' : 'good'}
          />
          <p className="evidence-text mono">{report.lifecycle.teardownEvidence}</p>
          {lifecycle.state === 'measured' && (
            <FactRow label="Sandbox id" value={<span className="mono mono--inline">{lifecycle.value.sandboxId}</span>} />
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          Evidence <span className="disclosure__count">{String(report.evidence.eventCount)} events</span>
        </summary>
        <div className="disclosure__body">
          <FactRow label="Events recorded" value={String(report.evidence.eventCount)} />
          <FactRow
            label="Event digest"
            value={<span className="mono mono--inline">{report.evidence.eventDigest}</span>}
          />
          {report.evidence.artifacts.length === 0 ? (
            <p className="muted">No artifacts were captured.</p>
          ) : (
            report.evidence.artifacts.map((artifact) => (
              <div className="artifact" key={`${artifact.label}-${artifact.sha256}`}>
                <div className="artifact__head">
                  <span className="artifact__label">{artifact.label}</span>
                  <span className="mono mono--dim">{formatBytes(artifact.bytes)}</span>
                </div>
                {artifact.content !== null && <pre className="codeblock mono">{artifact.content}</pre>}
              </div>
            ))
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          Timeline <span className="disclosure__count">{String(report.timeline.length)} entries</span>
        </summary>
        <div className="disclosure__body">
          <ol className="timeline">
            {report.timeline.map((entry, index) => (
              <li className={`timeline__item timeline__item--${entry.kind}`} key={`${entry.at}-${String(index)}`}>
                <span className="timeline__time mono">{formatTime(entry.at)}</span>
                <span className="timeline__label">{entry.label}</span>
                <span className="timeline__detail mono mono--dim">{entry.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </section>
  );
}
