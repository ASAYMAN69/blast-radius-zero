/**
 * Presentation helpers. Every one of them is a pure function of its input —
 * the console never formats a number in two places in two ways.
 */

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${String(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${BYTE_UNITS[unit] ?? 'B'}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${String(minutes)}m ${String(rest)}s`;
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 1) return `${seconds.toFixed(3)} s`;
  return `${seconds.toFixed(2)} s`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Wall-clock time of day, in the operator's own locale and time zone. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Wall-clock time with milliseconds. A run's events land inside a few
 * seconds of each other, so a second-resolution clock cannot order them.
 */
export function formatTimePrecise(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function formatDateTime(iso: string | null | undefined): string {  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** "just now" / "12 s ago" / "4 min ago" / "2 h ago" / a date past a day. */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const delta = Math.max(0, now - then);
  if (delta < 2000) return 'just now';
  if (delta < 60_000) return `${String(Math.round(delta / 1000))} s ago`;
  if (delta < 3_600_000) return `${String(Math.round(delta / 60_000))} min ago`;
  if (delta < 86_400_000) return `${String(Math.round(delta / 3_600_000))} h ago`;
  return formatDateTime(iso);
}

/** The share of a cap that was used, clamped to 0–100. */
export function usagePercent(used: number, cap: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.max(0, Math.min(100, (used / cap) * 100));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value >= 99.5) return '100%';
  if (value < 1 && value > 0) return '<1%';
  return `${value.toFixed(0)}%`;
}

/** A run id is long; show enough of it to be recognisable, and all of it in the title. */
export function shortId(id: string, head = 10): string {
  if (id.length <= head + 4) return id;
  return `${id.slice(0, head)}…${id.slice(-4)}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
