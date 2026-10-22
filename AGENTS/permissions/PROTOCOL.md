# Permission Protocol — out-of-scope access requires explicit grant

> **Canonical rule for every worker agent in BRZ.** If it is not in your brief, you do not do it. If you need to, you ask — you do not take.
>
> This file is the single source of truth. Role cards point here; they do not restate the procedure.

## 1. The rule

A worker's brief is a **hard boundary**, not a guideline. The worker may only:

- write inside its declared **write scope**,
- read anything it needs,
- run the exact **tools and commands** the brief authorized.

Anything else — a file it does not own, a tool the brief did not name, a command that touches shared state (database writes, migrations, dependency installs, network fetches, service restarts, browser sessions, process inspection) — requires **explicit permission from the main agent**, granted *before* the action.

**No grant, no action.** "It looked necessary", "it was only one line", "nobody would have noticed" are not permissions. Guessing is not asking.

## 2. What is covered

| In scope of the request | Examples |
|---|---|
| **Writing outside the write scope** | touching another agent's directory, editing a shared file the brief did not assign, adding a file to a path you were not given |
| **Tools not authorized in the brief** | package installs, Docker, `psql`, Playwright/browser control, `curl` to an external service, cloud CLIs, `gh`, dev servers, debugger/profiler, network inspection |
| **Commands that mutate shared state** | running migrations, writing to the dev database, seeding, clearing a cache, restarting a shared service, modifying `.env` |
| **Shared/serialized files** | a file the ledger shows is owned by another agent this wave |

## 3. What is never grantable

No permission can unlock these. Do not ask; do not do them.

- `git commit` / `git push` — the HEAD commits, always.
- Using the `subagent` tool — workers never spawn workers.
- Writing secrets, tokens, keys, or `.env` values into the repo.
- Destructive operations on shared data: `DROP`, `TRUNCATE`, `DELETE` on shared rows, rewriting an already-applied migration, `VACUUM FULL`, blocking indexes on hot tables.
- Editing your own brief, the scope ledger, the permission files, or your role card.
- Granting permission to yourself, or asking another worker to grant it.
- Bypassing the auth/security boundary, exposing internal identifiers, or weakening error hygiene.
- Publishing, deploying, or messaging outside the environment, except where the brief explicitly names a target and the coordinator has approved it.

## 4. How to request permission

1. **Stop** the affected part of the task immediately. Do not "just try it" to see if it works.
2. Write a request to `AGENTS/permissions/<your-agent-name>/<request-slug>.md`.
   Template: `AGENTS/permissions/README.md`.
3. The request must contain:
   - **What** — the exact path, command, or tool. Exact enough to be granted mechanically.
   - **Why** — the reason, and the technical justification. Not "I need it" but "the brief's acceptance criterion X cannot be met without Y because Z".
   - **What you will do** — the precise change or invocation, and its expected effect.
   - **Blast radius** — what could break if this goes wrong, and how you would undo it.
   - **Fallback** — what you will do instead if the request is denied. If there is no fallback, say so.
4. Continue with the rest of your task if it is still coherent. Otherwise, stop and wait.
5. Wait for the decision. The main agent may **question your reasoning** before deciding — that is the point of asking. Answer directly; if the main agent is right that you do not need it, drop the request.

## 5. How permission is granted

The main agent reviews the request and records the decision **in the same request file**, by appending a decision block:

```markdown
## Decision
**Decision:** GRANTED | DENIED | GRANTED_WITH_CONDITIONS
**Granted scope:** <exact paths / commands / tools — nothing broader>
**Conditions:** <e.g. read-only, this task only, no network>
**Decided by:** HEAD
**Date:** YYYY-MM-DD
**Rationale:** <one or two lines>
```

- `DENIED` → do the work some other way, or report the blocker in your summary.
- `GRANTED` → you may perform **exactly** the granted scope, **only** for the task you are working on, and only until the task completes. A grant is not a standing privilege.
- `GRANTED_WITH_CONDITIONS` → obey the conditions literally.

**The grant expires when the task completes.** It does not carry to your next brief, and it does not extend to actions you did not list.

## 6. Verifying the grant

- The request file must contain a decision block with `GRANTED` or `GRANTED_WITH_CONDITIONS`.
- If no decision block exists → **no permission**. You have not been granted anything. Stop.
- If the granted scope is narrower than what you need → request the difference separately. Do not exceed the grant.
- Never edit your own request file to add a decision. Only the main agent writes decisions.

## 7. Main agent duties

1. **Review every request.** Do not auto-grant. A grant that was not justified is a scope bug you just exported.
2. **Question the reasoning.** If the request is vague ("I need to edit the schema", "I need to run psql"), push back and ask for the exact path/command and the reason before deciding. The worker must answer, and its answer is part of the record.
3. **Grant narrowly.** Name exact paths and exact commands. Prefer a read-only grant, a specific file, or a single command over a general capability.
4. **Prefer a better fix.** If a worker keeps needing out-of-scope access, the brief's scope is probably wrong — re-brief with the correct scope instead of accumulating grants.
5. **Record the decision** in the request file, and mirror it in the brief's `Permission requests` section and in the scope ledger if the grant extends a write scope.
6. **Never grant a §3 item.** If a request asks for one, deny it and explain why.
7. **Renegotiate on conflict.** If a grant would collide with another worker's active scope, deny or defer it until that scope is released.

## 8. Worked examples

**Request** (worker needs to add a dependency to the backend):
> **What:** `backend/package.json` — add `zod` to `dependencies`, and update `backend/bun.lock`.
> **Why:** brief requirement #4 says every request body must be validated at the edge; the repo has no validation library and I am not allowed to hand-roll one.
> **What I will do:** add the single dependency line; run the package manager to update the lockfile; nothing else.
> **Blast radius:** the lockfile changes; if a parallel worker also installs, the lockfile conflicts — I will check the ledger and defer if BACKEND owns it this wave.
> **Fallback:** implement a small local validator module inside `backend/src/validation/` and skip the dependency.

**Decision:**
> `GRANTED_WITH_CONDITIONS` — `backend/package.json` only. Update `backend/bun.lock` only if the ledger shows no other agent owns it this wave. One dependency, no version churn.

---

**Request** (worker wants to run a database migration):
> **What:** `psql` against the dev database, applying `backend/src/db/migrations/012_*.sql`.
> **Why:** the acceptance criteria require verifying the constraint actually holds.
> **Blast radius:** writes to shared data.
> **Fallback:** none — I cannot verify the constraint without applying it.

**Decision:**
> `DENIED` — schema changes are DBMASTER's to approve and apply. Request routed to DBMASTER instead; you continue with the non-DB parts of the task and verify the constraint from the migration file.

---

**Request** (worker wants to read a file outside scope):
> **What:** read `frontend/src/lib/api.ts` (read-only).
> **Why:** the backend response contract must match what the client expects.
> **Blast radius:** none — read only.
> **Fallback:** I could work from the brief's contract section, but it may be stale.

**Decision:**
> `GRANTED` — read-only, `frontend/src/lib/api.ts`, this task only. (Reading is normally unrestricted; this is recorded because the brief listed a narrower read scope.)
