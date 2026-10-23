import { useEffect, useState } from 'react';

/**
 * The theme toggle.
 *
 * Reads the resolved theme from the document (set by the inline script in
 * index.html before paint) and lets the user override it. The choice is
 * persisted in localStorage under `brz:theme`.
 */

type Theme = 'light' | 'dark' | 'system';

function readStored(): Theme {
  try {
    const v = localStorage.getItem('brz:theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  document.documentElement.classList.add(`theme-${resolved}`);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStored);
  const resolved = resolveTheme(theme);
  const isDark = resolved === 'dark';

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('brz:theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Follow system changes when the user has not picked a theme.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <button
      type="button"
      className="button button--ghost button--small theme-toggle"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
    </button>
  );
}
