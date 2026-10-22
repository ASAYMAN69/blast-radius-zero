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
| 1 | `03-phase1-design.md` | ARCHITECT | `docs/architecture/02-phase1-design.md` | — | **RELEASED** |
| 1 | `02-market-and-monetization.md` | BUSINESS | `docs/business/01-market-and-monetization.md` | — | **RELEASED** (off critical path) |
| 2 | `04-backend-core.md` | BACKEND | `backend/src/**` except `backend/src/sandbox/**`, `backend/src/broker/**` | none — all manifests are HEAD's | **RELEASED** |
| 2 | `08-contract-gap-and-fallbacks.md` | BACKEND | `backend/src/contracts/sandbox.ts`, `backend/src/contracts/report.ts`, `backend/src/inference/**`, `backend/src/config.ts`, `backend/src/runs/report.ts`, `backend/src/runs/manager.ts`, `backend/src/demo/**`, `backend/test/**` | none | **READY** |
| 2 | `05-frontend-phase1.md` | FRONTEND | `frontend/src/**` | none — all manifests are HEAD's | **ACTIVE** |
| 2 | `07-commercial-revision.md` | BUSINESS | `docs/business/01-market-and-monetization.md` | — | **ACTIVE** |
| 3 | `06-backend-containment.md` | BACKEND | `backend/src/sandbox/**`, `backend/src/broker/**`, `deploy/**` | `deploy/**` | PLANNED (needs wave 2 released) — **now also owns: deleting the stand-in, flipping the provider default to `bwrap`, removing the `'standin'` union member, and the two new probe fields** |
| 4 | CI + PR hygiene | GITMASTER | `.github/**`, `scripts/ci/**` | serialized | PLANNED |
| 4 | UI design review | DESIGNER | `docs/design/01-phase1-ui-review.md` | — | PLANNED |
| 5 | UI polish | FRONTEND | `frontend/**` | — | PLANNED |
| 6 | Phase 1 verification | TESTER | `AGENTS/reports/**` | read-only on product | PLANNED |
| — | `01-vultr-c1-capability-probe.md` | ARCHITECT | `docs/architecture/01-vultr-c1-capability-probe.md` | — | **HOLD** — same agent as wave 1; runs after it |

**Wave gate:** wave *N+1* does not start until wave *N* is `RELEASED`. Inside a wave, briefs run in parallel and their write scopes must be disjoint — checked above.

**Numbering is an ID, not the order.** Brief numbers are stable identifiers; the **wave column** is the order. A brief may be added to an earlier wave later (as `07` was), because the ledger — not the filename — is what prevents overlap.

**Every brief inherits the quality bar** (`AGENT.md` §7.0): no stubs in the shipped path, no placeholders a human reads, designed failure paths, the unhappy path as the deliverable, survives a stranger, measured not asserted, polish not optional. It applies to the HEAD's own briefs.

**Notes on this plan**
- Wave 1 has ARCHITECT and BUSINESS: different agents, disjoint scopes, no conflict.
- Wave 2 has BACKEND and FRONTEND: disjoint directories. They work in parallel **because** wave 1 froze the contracts. If a contract turns out to be wrong, both briefs say the design doc wins and the worker reports the mismatch.
- Waves 2 and 3 are both BACKEND, so they are **sequential** — wave 3 starts only after wave 2 is released and the stand-in sandbox is in place to be replaced.
- The probe (brief 01) is held because it is the same agent as wave 1, and the design brief is on the critical path.

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
