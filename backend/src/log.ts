/**
 * Server-side logging. Everything that must never reach a client — provider
 * detail, SQL errors, stack traces — lands here instead.
 *
 * The logger writes one structured line per event to stderr. It never receives
 * the inference credential: the only place that value exists is the request
 * header built in `inference/client.ts`.
 */

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, error?: unknown, fields?: LogFields): void;
}

function serialise(fields: LogFields | undefined): string {
  if (fields === undefined) return '';
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = value instanceof Error ? { name: value.name, message: value.message } : value;
  }
  try {
    return ` ${JSON.stringify(safe)}`;
  } catch {
    return ' {"log":"unserialisable"}';
  }
}

function write(level: string, message: string, fields?: LogFields): void {
  process.stderr.write(`${new Date().toISOString()} ${level} ${message}${serialise(fields)}\n`);
}

export const logger: Logger = {
  info(message: string, fields?: LogFields): void {
    write('info', message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write('warn', message, fields);
  },
  error(message: string, error?: unknown, fields?: LogFields): void {
    const merged: Record<string, unknown> = { ...fields };
    if (error !== undefined) {
      if (error instanceof Error) {
        merged['errorName'] = error.name;
        merged['errorMessage'] = error.message;
        merged['errorStack'] = error.stack ?? null;
        const detail = (error as { detail?: unknown }).detail;
        if (typeof detail === 'string') merged['detail'] = detail;
      } else {
        merged['error'] = String(error);
      }
    }
    write('error', message, merged);
  },
};

/** A logger that discards everything. Used by tests. */
export const silentLogger: Logger = {
  info(): void {},
  warn(): void {},
  error(): void {},
};
