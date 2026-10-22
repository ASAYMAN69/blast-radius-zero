import type { ReactNode } from 'react';
import type { ApiError } from '../lib/api.ts';

/**
 * The five states, as components.
 *
 * Every screen in the console renders one of these, so none of them is ever
 * an accident:
 *
 *   loading       — a skeleton in the region being loaded, never a blank panel
 *   empty         — a deliberate explanation of what to do next
 *   error         — the server's generic message, the machine code, the request id
 *   success       — the data
 *   unauthorized  — the deployment is access-controlled; there is no sign-in flow
 *
 * Error hygiene: only the generic `message`, the machine `code`, and the
 * `requestId` are ever shown. No stack, no provider text, no raw body.
 */

export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <p className="state__title">
        <span className="spinner" aria-hidden="true" />
        {label}
      </p>
      <div className="skeleton" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="skeleton__row" key={index} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      <p className="state__body">{body}</p>
      {action !== undefined && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  context,
}: {
  error: ApiError;
  onRetry?: () => void;
  context?: string;
}) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">
        {context ?? 'Something went wrong.'}
      </p>
      <p className="state__body">{error.message}</p>
      <p className="state__meta">
        <span className="mono mono--code" title="Machine-readable error code">
          {error.code}
        </span>
        {error.requestId !== null && (
          <span className="mono mono--code" title="Server request id">
            request {error.requestId}
          </span>
        )}
        {error.status > 0 && <span className="mono mono--code">HTTP {error.status}</span>}
      </p>
      {error.details.length > 0 && (
        <ul className="state__details">
          {error.details.map((detail) => (
            <li key={`${detail.field}-${detail.issue}`}>
              <span className="mono mono--code">{detail.field}</span> {detail.issue}
            </li>
          ))}
        </ul>
      )}
      {onRetry !== undefined && (
        <div className="state__action">
          <button className="button button--secondary" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function UnauthorizedState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="state state--unauthorized" role="alert">
      <p className="state__title">Access controlled.</p>
      <p className="state__body">
        This deployment is access-controlled. Sign in or use the allowed access path.
      </p>
      <p className="state__meta">
        <span className="mono mono--code">HTTP 401</span>
      </p>
      {onRetry !== undefined && (
        <div className="state__action">
          <button className="button button--secondary" type="button" onClick={onRetry}>
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A `409 report_not_ready` is not an error. It is a run that is still going,
 * so the panel says so and keeps waiting.
 */
export function NotReadyState({ label }: { label: string }) {
  return (
    <div className="state state--pending" role="status" aria-live="polite">
      <p className="state__title">
        <span className="spinner" aria-hidden="true" />
        {label}
      </p>
      <p className="state__body">
        The report is assembled from the run’s own records after the sandbox is torn down. It appears here
        the moment it is sealed.
      </p>
    </div>
  );
}
