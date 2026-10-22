import type {
  ApiErrorDetail,
  CancelRunResponse,
  GetReportResponse,
  GetRunResponse,
  ListEventsResponse,
  ListFixturesResponse,
  ListRunsResponse,
  ListWorkloadsResponse,
  SubmitRunRequest,
  SubmitRunResponse,
} from './types.ts';
import { API_ERROR_MESSAGES } from './types.ts';

/**
 * The console's fetch client.
 *
 * Every request is a **relative** path under `/api/v1`. The browser never
 * learns the control plane's address: in development the dev server proxies
 * `/api`, and in production the control plane serves both the bundle and the
 * API from one origin. There is no host sniffing and no absolute URL here.
 *
 * Error hygiene: the server's envelope carries a machine `code`, a generic
 * `message`, and a `requestId`. Those three are what the UI is allowed to
 * show. A stack, a provider message, or a raw body never reaches a screen.
 */

const API_ROOT = '/api/v1';

/** The generic sentence used when a failure has no envelope of its own. */
const OFFLINE_MESSAGE = 'The control plane is unreachable. It may be starting, or the connection was refused.';

export type ApiFailureKind = 'api' | 'network' | 'unauthorized';

export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  /** Stable machine code. Safe to show, small, monospaced. */
  readonly code: string;
  /** HTTP status, or `0` when the request never reached the server. */
  readonly status: number;
  /** The server's request id, when there was one. Safe to show. */
  readonly requestId: string | null;
  readonly details: readonly ApiErrorDetail[];

  constructor(
    kind: ApiFailureKind,
    code: string,
    message: string,
    status: number,
    requestId: string | null,
    details: readonly ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readDetails(source: Record<string, unknown>): readonly ApiErrorDetail[] {
  const value = source['details'];
  if (!Array.isArray(value)) return [];
  const details: ApiErrorDetail[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const field = readString(entry, 'field');
    const issue = readString(entry, 'issue');
    if (field === null || issue === null) continue;
    details.push({ field, issue });
  }
  return details;
}

/**
 * Turn a failed response into a typed error. The envelope is preferred; the
 * status code is the fallback. Neither path can surface raw server text.
 */
async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('X-Request-Id');
  let code = 'internal_error';
  let message = API_ERROR_MESSAGES['internal_error'] ?? 'Something went wrong on our side.';
  let details: readonly ApiErrorDetail[] = [];

  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body['error'])) {
      const envelope = body['error'];
      const envelopeCode = readString(envelope, 'code');
      const envelopeMessage = readString(envelope, 'message');
      if (envelopeCode !== null) code = envelopeCode;
      if (envelopeMessage !== null) message = envelopeMessage;
      details = readDetails(envelope);
    }
  } catch {
    // A proxy in front of the control plane may answer without the envelope.
    // Fall back to the status code and the generic per-status sentence.
  }

  if (response.status === 401 || response.status === 403) {
    return new ApiError(
      'unauthorized',
      code,
      'This deployment is access-controlled. Sign in or use the allowed access path.',
      response.status,
      requestId,
      details,
    );
  }

  const fallback = API_ERROR_MESSAGES[code] ?? message;
  return new ApiError('api', code, fallback, response.status, requestId, details);
}

/** The operations the console performs. One implementation per transport. */
export interface BrzApi {
  readonly kind: 'live' | 'fixtures';
  listRuns(): Promise<ListRunsResponse>;
  getRun(runId: string): Promise<GetRunResponse>;
  submitRun(request: SubmitRunRequest): Promise<SubmitRunResponse>;
  listEvents(runId: string, after?: number): Promise<ListEventsResponse>;
  getReport(runId: string): Promise<GetReportResponse>;
  cancelRun(runId: string): Promise<CancelRunResponse>;
  listWorkloads(): Promise<ListWorkloadsResponse>;
  listFixtures(): Promise<ListFixturesResponse>;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export class HttpApi implements BrzApi {
  readonly kind = 'live' as const;

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, signal } = options;
    const init: RequestInit = { method, signal, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${path}`, init);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError('network', 'network_error', OFFLINE_MESSAGE, 0, null);
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json();
    return payload as T;
  }

  listRuns(): Promise<ListRunsResponse> {
    return this.request<ListRunsResponse>('/runs');
  }

  getRun(runId: string): Promise<GetRunResponse> {
    return this.request<GetRunResponse>(`/runs/${encodeURIComponent(runId)}`);
  }

  submitRun(request: SubmitRunRequest): Promise<SubmitRunResponse> {
    return this.request<SubmitRunResponse>('/runs', { method: 'POST', body: request });
  }

  listEvents(runId: string, after?: number): Promise<ListEventsResponse> {
    const query = after === undefined ? '' : `?after=${String(after)}`;
    return this.request<ListEventsResponse>(`/runs/${encodeURIComponent(runId)}/events${query}`);
  }

  getReport(runId: string): Promise<GetReportResponse> {
    return this.request<GetReportResponse>(`/runs/${encodeURIComponent(runId)}/report`);
  }

  cancelRun(runId: string): Promise<CancelRunResponse> {
    return this.request<CancelRunResponse>(`/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
  }

  listWorkloads(): Promise<ListWorkloadsResponse> {
    return this.request<ListWorkloadsResponse>('/workloads');
  }

  listFixtures(): Promise<ListFixturesResponse> {
    return this.request<ListFixturesResponse>('/fixtures');
  }
}

/**
 * Ask the control plane whether it is there, and whether it will let us in.
 *
 * The answer decides one of three things:
 *   - `live`          — the control plane answered and we may talk to it.
 *   - `unauthorized`  — something in front of it answered 401/403.
 *   - `unreachable`   — nothing answered; the console falls back to fixtures.
 */
export type ProbeResult =
  | { readonly state: 'live' }
  | { readonly state: 'unauthorized'; readonly error: ApiError }
  | { readonly state: 'unreachable'; readonly error: ApiError };

export async function probeControlPlane(timeoutMs = 4000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_ROOT}/runs`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401 || response.status === 403) {
      return { state: 'unauthorized', error: await toApiError(response) };
    }
    if (!response.ok) {
      // A 5xx from the control plane means it is there but unwell. That is an
      // error state, not a reason to swap in fixtures.
      return { state: 'live' };
    }
    return { state: 'live' };
  } catch {
    return {
      state: 'unreachable',
      error: new ApiError('network', 'network_error', OFFLINE_MESSAGE, 0, null),
    };
  } finally {
    clearTimeout(timer);
  }
}

export { API_ERROR_MESSAGES };
