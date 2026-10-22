/**
 * Redaction for anything that is persisted from model input (§9.5).
 *
 * The model's tool arguments are untrusted and may contain a credential-shaped
 * value. The redactor replaces the value of any sensitive key and truncates
 * long strings BEFORE the insert, every time.
 */

const SENSITIVE_KEY = /token|key|secret|password|authorization|credential/i;
const MAX_STRING_LENGTH = 4 * 1024;
const MAX_DEPTH = 8;

export const REDACTED = '[redacted]';

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(entry, depth + 1);
    }
    return result;
  }
  return '[unserialisable]';
}

/** Stable JSON for persistence: the key order is the insertion order. */
export function redactToJson(value: unknown): string {
  return JSON.stringify(redactValue(value));
}
