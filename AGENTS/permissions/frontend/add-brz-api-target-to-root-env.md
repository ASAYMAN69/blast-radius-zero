# Permission request — add `BRZ_API_TARGET` to the repository-root `.env` and `.env.example`

**Agent:** FRONTEND
**Brief:** AGENTS/briefs/05-frontend-phase1.md
**Date:** 2026-10-23
**Status:** PENDING

## What

Two lines appended to the **repository-root** env files, which are HEAD's files and
outside my write scope:

- `.env` → `BRZ_API_TARGET=http://127.0.0.1:8787`
- `.env.example` → `BRZ_API_TARGET=http://127.0.0.1:8787`

Nothing else. No other variable, no other file, no change to any manifest.

## Why

The design doc §10.6 and §10.8 make `BRZ_API_TARGET` a **required** variable:

- `frontend/vite.config.ts` reads it server-side with `loadEnv(mode, '../', '')` and
  **throws** if it is absent — the dev server and `vite build` both fail closed
  without it. That is deliberate (§10.6: "the proxy target is required, Vite fails to
  start without it"), and the M7 acceptance criterion depends on it.
- The variable is not in the root `.env` today, so `npm run dev --workspace frontend`
  and `npm run build --workspace frontend` both fail out of the box, and the failure
  message names the variable but does not set it.

I have run both commands with the variable supplied inline
(`BRZ_API_TARGET=… npm run build --workspace frontend`) and they pass — the request is
about the *repository state*, not about a blocker in my code. The HEAD owns the root
env files (§1.4 of `AGENTS/CONTEXT.md`: "Never edit a manifest or a lockfile" and the
env contract is the HEAD's), so this is the HEAD's call, not mine.

The value is the control plane's address, matching `PORT=8787` already in `.env`.
It is read only by the Vite dev server in Node; it never reaches the browser bundle.

## What I will do

Append the single `BRZ_API_TARGET` line to each of the two files, in the same
"Control plane" section as `PORT`, and re-run:

```
npm run typecheck --workspace frontend
BRZ_API_TARGET=… npm run build --workspace frontend
npm run dev --workspace frontend
```

to confirm the console starts with no inline override. I will not touch any other
 file, and no other env file.

## Decision
**Decision:** GRANTED
**Granted scope:** exactly two lines — `BRZ_API_TARGET=http://127.0.0.1:8787` appended to
the repository-root `.env` and to the repository-root `.env.example`. No other variable, no
other file, no manifest, no lockfile.
**Conditions:** the value is a loopback address for local development only. It must never be
committed with a production host, and it must never reach the browser bundle. The production
value belongs in the deployment environment, not in this repository.
**Decided by:** HEAD
**Date:** 2026-10-23
**Rationale:** the request is correct, minimal, and exactly matches what the design doc
§10.6 and §10.8 require. The agent diagnosed a real repository-state gap, verified its own
code passes with the variable supplied inline, identified the file owner correctly, and did
not touch a file it did not own. That is the protocol working. **Granted and applied by the
HEAD** — both files now carry the variable, and the HEAD re-ran the frontend typecheck and
build with no inline override to confirm.

---

**Note from the HEAD (later, same day).** The `tsconfig` split in this brief's companion
request needed a root-level fix that the HEAD applied directly rather than round-tripping:
`frontend/tsconfig.json` now covers the app only (`src/**`, `types: []`), `vite.config.ts`
lives in `frontend/tsconfig.node.json` (`types: ["node"]`), and the frontend `typecheck`
script runs **both** projects. This avoids TypeScript project references entirely, which is
what was producing TS6306/TS6310. No change to the agent's source files.
