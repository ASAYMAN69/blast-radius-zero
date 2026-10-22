/**
 * One error type for the whole HTTP surface, and the single place the
 * code → status → generic-message mapping is applied.
 *
 * Error hygiene: the response carries a machine code and a generic message.
 * Provider text, SQL text and stack traces go to the server log only.
 */

import {
  API_ERROR_MESSAGES,
  API_ERROR_STATUS,
  type ApiErrorBody,
  type ApiErrorDetail,
} from '../contracts/api.ts';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: readonly ApiErrorDetail[] | undefined;

  constructor(code: string, details?: readonly ApiErrorDetail[]) {
    const status = API_ERROR_STATUS[code];
    // An unknown code is a programming error, not a client error: map it to 500
    // and let the log carry the code the caller passed.
    const resolvedStatus = status ?? 500;
    const resolvedCode = status === undefined ? 'internal_error' : code;
    super(API_ERROR_MESSAGES[resolvedCode] ?? API_ERROR_MESSAGES['internal_error'] ?? 'Something went wrong on our side.');
    this.name = 'ApiError';
    this.code = resolvedCode;
    this.status = resolvedStatus;
    this.details = details;
  }
}

export function apiError(code: string, details?: readonly ApiErrorDetail[]): ApiError {
  return new ApiError(code, details);
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** The wire shape of an error. Never includes detail, stack or provider text. */
export function toErrorBody(error: unknown, requestId: string): ApiErrorBody {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }
  return {
    error: {
      code: 'internal_error',
      message: API_ERROR_MESSAGES['internal_error'] ?? 'Something went wrong on our side.',
      requestId,
    },
  };
}

export function statusFor(error: unknown): number {
  return error instanceof ApiError ? error.status : 500;
}
