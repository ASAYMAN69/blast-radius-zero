/// <reference types="node" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server is the only hop between the browser and the control plane.
 *
 * The browser only ever calls relative `/api/...` paths. The proxy target is a
 * **server-side** env var (`BRZ_API_TARGET`) read here, in Node, at config
 * time. It is deliberately not a browser-exposed variable, so the bundler
 * never inlines it into the browser bundle. There is no default target: the
 * config fails closed, so a missing value is a startup error rather than a
 * silent misroute.
 *
 * The path is forwarded **unchanged** — `/api/v1/runs` arrives at the control
 * plane as `/api/v1/runs`. No prefix stripping.
 *
 * In production there is no proxy at all: the control plane serves the built
 * bundle and the API from the same origin.
 */
export default defineConfig(({ mode }) => {
  // An empty prefix loads EVERY variable from the env file, including the ones
  // that are not browser-exposed. This app declares no browser-exposed
  // variables, so nothing from the env file can reach the browser.
  //
  // `envDir` is resolved relative to the dev server's CWD, which is
  // `frontend/`, so `'../'` is the repository root where `.env` lives.
  const env = loadEnv(mode, '../', '');
  const target = env.BRZ_API_TARGET;
  if (!target) {
    throw new Error(
      'BRZ_API_TARGET is not set. It points the dev proxy at the control plane. ' +
        'It is read server-side only and is never exposed to the browser.',
    );
  }

  return {
    plugins: [react()],
    // The build must resolve React's production bundle. Some toolchains in the
    // dependency chain set `NODE_ENV=development` while the config is being
    // resolved, which would make the bundler pick React's development build.
    // Stating the value here keeps the production bundle deterministic.
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
      },
    },
  };
});
