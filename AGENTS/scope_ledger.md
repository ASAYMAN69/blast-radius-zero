# Scope Ledger

> **The single source of truth for who owns which paths right now.** The HEAD checks this table before dispatching every wave. Two briefs in the same wave may not hold overlapping scopes.

## How to read it

| Column | Meaning |
|---|---|
| `Wave` | The dispatch wave. Briefs in the same wave run in parallel. |
| `Brief` | `AGENTS/briefs/NN-slug.md` |
| `Agent` | The worker that owns the scope |
| `Write scope` | The exact paths/globs that worker may write |
| `Shared owner` | Who owns the high-contention files for that wave (`—` if none) |
| `Status` | `PENDING` (brief written, not dispatched) · `ACTIVE` (dispatched, running) · `RELEASED` (worker returned, scope free) · `BLOCKED` |

## Rules

1. **Before dispatch:** add a `PENDING` row. If its write scope overlaps any `ACTIVE` or `PENDING` row in the same wave → **do not dispatch**; split the work or move it to the next wave.
2. **On dispatch:** flip `PENDING` → `ACTIVE`.
3. **On return:** flip `ACTIVE` → `RELEASED` after the HEAD has reviewed the summary and the diff. Keep the row (history matters); do not delete it.
4. **Shared files** (`package.json`, lockfiles, root config, CI, `AGENT.md`, the ledger itself) are serialized: exactly one owner per wave, named in the `Shared owner` column. Everyone else defers them.
5. **Scope extension is a HEAD decision.** A worker that needs more room stops and reports. The HEAD widens the row or writes a new brief — never the worker.
6. **Writes need an explicit grant.** Out-of-scope access is granted, never assumed. The request lives in `AGENTS/permissions/` and the decision is recorded in that file before the action. See `permissions/PROTOCOL.md`.

## Current state

| Wave | Brief | Agent | Write scope | Shared owner | Status |
|---|---|---|---|---|---|
| 0 | `01-vultr-c1-capability-probe.md` | ARCHITECT | `docs/architecture/01-vultr-c1-capability-probe.md` | — | PENDING |
| 0 | `02-market-and-monetization.md` | BUSINESS | `docs/business/01-market-and-monetization.md` | — | PENDING |

## Permanent scope map (roster homes)

These are claimed for the lifetime of the project, independent of waves. A wave row must live inside the agent's home scope.

| Agent | Home scope |
|---|---|
| ARCHITECT | `docs/architecture/**` |
| DESIGNER | `docs/design/**` |
| FRONTEND | `frontend/**` |
| BACKEND | `backend/**` |
| DBMASTER | `backend/src/db/**` |
| TESTER | `AGENTS/reports/**` (read-only on product code) |
| DOCS | `docs/**` except `docs/architecture/**` and `docs/design/**` |
| BUSINESS | `docs/business/**` |
| GITMASTER | `.github/**`, `scripts/ci/**`, `docs/dev/**` + git/GitHub operations |
| HEAD | `AGENTS/**`, `AGENT.md`, `STATE.md`, `TODO.md`, `docs/VISION.md` |

**GITMASTER is serialized.** Never dispatch a GITMASTER task while another agent holds an open write scope, and never dispatch two GITMASTER tasks at once. The repository is a single shared mutable resource; concurrent writers corrupt it.
| HEAD | `AGENTS/**`, `AGENT.md`, `TODO.md` |

## Overlap examples (learn from these)

| Situation | Verdict |
|---|---|
| FRONTEND writes `frontend/src/views/**`, BACKEND writes `backend/src/routes/**` | ✅ disjoint, same wave is fine |
| FRONTEND writes `frontend/**`, another agent writes `frontend/src/views/X.tsx` | ❌ overlap — one of them moves to the next wave |
| Two agents both need to edit root `package.json` | ⚠️ serialize — one named owner, the other defers and reports |
| DBMASTER writes `backend/src/db/migrations/**` while BACKEND writes `backend/src/**` | ⚠️ BACKEND's scope must be narrowed to exclude `backend/src/db/**` for that wave |
| Two agents add a dependency → both touch the lockfile | ⚠️ one owner, or the second defers its dependency and reports it |
