/**
 * The capability-broker wire protocol — frozen by
 * `docs/architecture/02-phase1-design.md` §5.2.
 *
 * Brief 04 defines the protocol and the seam; brief 06 implements the broker
 * server, the egress proxy and the allowlist. Nothing in this file performs I/O.
 */

/** The capabilities the broker understands. */
export type BrokerCapability = 'fetch' | 'file_out' | 'credential';

/** Protocol version. Bumped on any breaking change; a mismatch is an error. */
export type BrokerProtocol = 'brz-broker/1';

export interface BrokerRequest {
  readonly protocol: BrokerProtocol;
  /** Unique per request. Echoed in the response. */
  readonly requestId: string;
  /** The run this request belongs to. Must match the token's run. */
  readonly runId: string;
  readonly capability: BrokerCapability;
  /** The per-run bearer token. */
  readonly token: string;
  readonly issuedAt: string;
  readonly payload: BrokerRequestPayload;
}

export type BrokerRequestPayload =
  | {
      readonly kind: 'fetch';
      /** Absolute URL. Scheme must be `https:` (or `http:` only for an explicitly allowlisted host). */
      readonly url: string;
      readonly method?: 'GET' | 'HEAD';
      /** Additional request headers. `Host`, `Authorization` and `Cookie` are stripped. */
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'file_out';
      /** Path, relative to the run's work dir, that the sandbox wants copied out. */
      readonly path: string;
      readonly maxBytes: number;
    }
  | {
      readonly kind: 'credential';
      /** The credential the sandbox wants. */
      readonly credentialId: string;
    };

export interface BrokerResponse {
  readonly protocol: BrokerProtocol;
  readonly requestId: string;
  readonly ok: boolean;
  readonly at: string;
  readonly result?: BrokerResult;
  readonly error?: BrokerError;
}

export type BrokerResult =
  | {
      readonly kind: 'fetch';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly bytes: number;
      readonly truncated: boolean;
    }
  | {
      readonly kind: 'file_out';
      readonly content: string;
      readonly bytes: number;
      readonly sha256: string;
    }
  | {
      readonly kind: 'credential';
      readonly credentialId: string;
      readonly value: string;
      readonly expiresAt: string;
    };

/** Machine-readable denial reasons. These strings appear verbatim in the report. */
export type BrokerErrorCode =
  | 'unauthorized'
  | 'unknown_capability'
  | 'capability_disabled'
  | 'egress_denied'
  | 'invalid_url'
  | 'path_not_allowed'
  | 'credential_not_allowed'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error';

export interface BrokerError {
  readonly code: BrokerErrorCode;
  /** Generic, human-readable, safe to show. Never contains upstream text. */
  readonly message: string;
}
