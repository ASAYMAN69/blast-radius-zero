/**
 * Boundary validation. Every route validates its input here, and every failure
 * is a 400-family `ApiError` with a field-level detail — never a 500.
 *
 * No schema library: the shapes are small and the rules are the contract.
 */

import { ApiError } from './errors.ts';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) {
    throw new ApiError('invalid_request', [{ field, issue: 'Must be a JSON object.' }]);
  }
  return value;
}

export function requireString(
  obj: JsonRecord,
  field: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  const value = obj[field];
  if (typeof value !== 'string') {
    throw new ApiError('invalid_request', [{ field, issue: 'Must be a string.' }]);
  }
  const min = options.minLength ?? 0;
  const max = options.maxLength ?? Number.MAX_SAFE_INTEGER;
  if (value.length < min || value.length > max) {
    throw new ApiError('invalid_request', [
      { field, issue: `Must be between ${min} and ${max} characters.` },
    ]);
  }
  return value;
}

export function optionalString(obj: JsonRecord, field: string): string | null {
  const value = obj[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiError('invalid_request', [{ field, issue: 'Must be a string.' }]);
  }
  return value;
}

export function requireEnum<T extends string>(
  obj: JsonRecord,
  field: string,
  allowed: readonly T[],
): T {
  const value = obj[field];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiError('invalid_request', [
      { field, issue: `Must be one of: ${allowed.join(', ')}.` },
    ]);
  }
  return value as T;
}

const MAX_PATH_LENGTH = 255;

/**
 * A file path that is safe to resolve inside the run's work directory.
 *
 * Rejects: empty strings, NUL bytes, absolute paths, Windows drive letters,
 * backslashes, `..` segments, empty segments, `.` segments and over-long
 * paths. Returns the normalised POSIX relative path.
 */
export function assertSafeRelativePath(raw: string, field = 'path'): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ApiError('invalid_path', [{ field, issue: 'A file path is required.' }]);
  }
  if (raw.length > MAX_PATH_LENGTH) {
    throw new ApiError('invalid_path', [{ field, issue: 'The path is too long.' }]);
  }
  if (raw.includes('\u0000')) {
    throw new ApiError('invalid_path', [{ field, issue: 'The path contains a NUL byte.' }]);
  }
  if (raw.startsWith('/') || raw.startsWith('\\') || /^[A-Za-z]:/.test(raw)) {
    throw new ApiError('invalid_path', [{ field, issue: 'The path must be relative.' }]);
  }
  if (raw.includes('\\')) {
    throw new ApiError('invalid_path', [{ field, issue: 'The path must use forward slashes.' }]);
  }
  const segments = raw.split('/');
  for (const segment of segments) {
    if (segment.length === 0) {
      throw new ApiError('invalid_path', [{ field, issue: 'The path has an empty segment.' }]);
    }
    if (segment === '.' || segment === '..') {
      throw new ApiError('invalid_path', [{ field, issue: 'The path may not contain "." or "..".' }]);
    }
    if (segment.length > 128) {
      throw new ApiError('invalid_path', [{ field, issue: 'A path segment is too long.' }]);
    }
  }
  return segments.join('/');
}

export function parseNonNegativeInt(
  raw: string | null,
  field: string,
  options: { min?: number; max?: number; fallback: number },
): number {
  if (raw === null || raw.length === 0) return options.fallback;
  if (!/^\d+$/.test(raw)) {
    throw new ApiError('invalid_request', [{ field, issue: 'Must be a non-negative integer.' }]);
  }
  const value = Number.parseInt(raw, 10);
  const min = options.min ?? 0;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApiError('invalid_request', [
      { field, issue: `Must be an integer between ${min} and ${max}.` },
    ]);
  }
  return value;
}

/** External run ids only: `run_` + 26 Crockford base32 characters (§8.5). */
const RUN_ID_PATTERN = /^run_[0-9A-HJKMNP-TV-Z]{26}$/;

export function isRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}

export function assertRunId(value: string): string {
  // A malformed id is indistinguishable from an unknown one: the route returns
  // 404 run_not_found rather than a 500.
  if (!isRunId(value)) throw new ApiError('run_not_found');
  return value;
}
