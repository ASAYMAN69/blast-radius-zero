import { renderMarkdown } from '../lib/markdown.tsx';
import type { BlastRadiusReport, RunDetail } from '../lib/types.ts';
import { EmptyState } from './States.tsx';

/**
 * The agent's output.
 *
 * Two things live here, and the difference between them is the whole point of
 * the product:
 *
 *   1. **What the agent said.** Its closing explanation, rendered as text —
 *      Markdown becomes React elements, never HTML. There is no
 *      `dangerouslySetInnerHTML` anywhere in this console.
 *   2. **What the sandbox decided.** The verification run's exit code and
 *      result. The model's claim is shown next to it, and the sandbox's
 *      verdict is the one that counts.
 */
export function ResultPanel({
  run,
  report,
}: {
  run: RunDetail;
  report: BlastRadiusReport | null;
}) {
  const explanation = report?.code.modelExplanation ?? run.modelExplanation ?? '';
  const finalTest = report?.code.finalTestRun ?? null;

  if (explanation.trim() === '' && finalTest === null) {
    return (
      <EmptyState
        title="No output yet."
        body="The agent's explanation and the verification result appear here once the run finishes."
      />
    );
  }

  return (
    <section className="result" aria-labelledby="result-heading">
      <div className="panel__head">
        <h2 className="panel__title" id="result-heading">
          Result
        </h2>
        {finalTest !== null && (
          <span
            className={`verdict verdict--${finalTest.exitCode === 0 ? 'contained' : 'violated'}`}
            title="Decided by the sandbox, not by the model"
          >
            <span className="verdict__dot" aria-hidden="true" />
            {finalTest.exitCode === 0 ? 'suite green' : 'suite red'}
          </span>
        )}
      </div>

      {finalTest !== null && (
        <div className="verdictline">
          <div className="verdictline__item">
            <span className="verdictline__label">Exit code</span>
            <span className="verdictline__value mono">{String(finalTest.exitCode ?? '—')}</span>
          </div>
          <div className="verdictline__item">
            <span className="verdictline__label">Tests passed</span>
            <span className="verdictline__value mono">
              {String(finalTest.passed)} / {String(finalTest.total)}
            </span>
          </div>
          <div className="verdictline__item verdictline__item--wide">
            <span className="verdictline__label">Command</span>
            <span className="verdictline__value mono mono--inline">{finalTest.command}</span>
          </div>
        </div>
      )}

      {finalTest !== null && finalTest.failedTests.length > 0 && (
        <ul className="failedtests">
          {finalTest.failedTests.map((failed) => (
            <li key={failed.test}>
              <span className="failedtests__name mono">{failed.test}</span>
              <span className="failedtests__message mono">{failed.message}</span>
            </li>
          ))}
        </ul>
      )}

      {explanation.trim() !== '' && (
        <div className="prose">
          <p className="prose__label">The agent’s explanation</p>
          <div className="prose__body">{renderMarkdown(explanation)}</div>
        </div>
      )}

      {report !== null && report.code.modelClaim.trim() !== '' && (
        <p className="prose__claim">
          <span className="prose__label">The agent’s claim, before verification</span>
          {report.code.modelClaim}
        </p>
      )}

      {finalTest !== null && finalTest.output.trim() !== '' && (
        <details className="disclosure">
          <summary>Verification output</summary>
          <pre className="codeblock mono">{finalTest.output}</pre>
        </details>
      )}
    </section>
  );
}
