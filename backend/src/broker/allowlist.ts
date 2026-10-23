/** The egress allowlist helpers (design doc §5.4). */

export function matchAllowlist(host: string, allowlist: readonly string[]): boolean {
  const h = host.toLowerCase();
  for (const entry of allowlist) {
    const e = entry.trim().toLowerCase();
    if (e === '') continue;
    if (e.startsWith('*.')) {
      const suffix = e.slice(2);
      if (h === suffix || h.endsWith('.' + suffix)) return true;
    } else if (h === e) {
      return true;
    }
  }
  return false;
}

export function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}