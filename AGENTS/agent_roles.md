# Agent Roles — the BRZ roster

> Provisional until the product brief lands. The coordinator may rename roles, add roles, or change the directory layout. When that happens, the HEAD rewrites this file and `AGENT.md` §2 and updates `scope_ledger.md`.

## The roster

| Agent | Exclusive write scope (home) | Reads | Produces |
|---|---|---|---|
| **ARCHITECT** | `docs/architecture/**` | everything | System design, data model, API contracts, ADRs, `AGENTS/features/*.md` |
| **DESIGNER** | `docs/design/**` | everything | UX flows, visual system, copy, wireframes, design tokens |
| **FRONTEND** | `frontend/**` | everything | UI, client state, client-side logic, styling, frontend tests |
| **BACKEND** | `backend/**` | everything | API, services, business logic, integrations, backend tests |
| **DBMASTER** | `backend/src/db/**` | everything | Migrations, schema definition, index/constraint review, DB reports |
| **TESTER** | `AGENTS/reports/**` only | everything | Verification reports — **never** product code |
| **DOCS** | `docs/**` (except the above) | everything | README, guides, reference, changelog, release notes |
| **BUSINESS** | `docs/business/**` | everything | Market, buyer, pricing, revenue model, pitch narrative, competitive analysis |
| **GITMASTER** | `.github/**`, `scripts/ci/**`, `docs/dev/**` + git/GitHub operations | everything | Branches, commits, PRs, merge, diff review, CI/CD, repo hygiene |
| **HEAD** | `AGENTS/**`, `AGENT.md`, `STATE.md`, `TODO.md`, `docs/VISION.md` | everything | Briefs, ledger, review, integration, commits |

**HEAD writes no product code by default.** If the coordinator says "you do this one yourself", the HEAD takes the code scope for that brief and releases it in the ledger like anyone else.

**GITMASTER is the single exception to the no-commit rule.** Every other agent leaves the working tree untouched. GITMASTER may run `git commit` / `git push` / `gh pr merge` **only when the HEAD's brief tells it to**, and it never edits product source to make CI green.

**GITMASTER is always serialized.** The repository is one shared mutable resource; it never runs concurrently with an agent that has open write scopes, and never runs two tasks at once. The HEAD enforces this in `AGENTS/scope_ledger.md`.

## Scope escalation — everyone, including the HEAD

Any action outside a brief's declared write scope, or any tool/command the brief did not authorize, requires **explicit permission from the main agent, granted before the action**.

- The requester writes `AGENTS/permissions/<agent>/<slug>.md`, stops the affected work, and waits.
- The main agent reviews, questions vague reasoning, and records `GRANTED` / `GRANTED_WITH_CONDITIONS` / `DENIED` with the exact scope granted.
- Only then does the action happen — only for the exact scope granted, and only until the task ends.
- Never grantable: `git commit`/`git push` · the `subagent` tool · secrets in the repo · destructive operations on shared data · editing briefs, the ledger, permission files, or role cards · self-granting · bypassing the auth boundary.

Full procedure: `AGENTS/permissions/PROTOCOL.md`.

## Identity lines

Each brief starts with the agent's identity. Use it verbatim:

```markdown
Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.
```

## Per-role specifics

### ARCHITECT
- Decides structure, not features. The coordinator decides features.
- Output: a decision per concern (data model, API surface, module boundaries, failure modes), each with a rationale.
- Must name every file/interface other workers will depend on, so briefs can reference exact contracts.
- Never writes code outside `docs/architecture/**`.

### DESIGNER
- Owns how it feels and how it reads: layout, hierarchy, motion, states (loading/empty/error), copy.
- Must specify every state, not just the happy one.
- Never writes product code.

### FRONTEND
- The browser talks only to its own origin; the API hop is a dev/prod proxy, never an absolute URL in the bundle.
- Never construct a microservice URL (upload, payment, OAuth) — the backend returns it.
- No `*_internal` identifiers, no hashes, no raw error text from the server rendered to the user.
- All five states exist: loading, empty, error, success, unauthorized.
- Prefer incremental typecheck over full production builds for routine verification.

### BACKEND
- Config comes from `.env`; no hardcoded host/port/key fallbacks; production fails closed.
- External IDs only on the wire; internal keys stay in the database layer.
- Errors: machine-readable code for the client, generic message to the user, full detail in the log.
- Ownership and scoping are enforced server-side on every write.
- Schema changes go through a migration, additive and ordered, and are mirrored in the schema definition file.

### DBMASTER
- **Approval gate.** No migration merges without `APPROVED` or `APPROVED WITH CHANGES`.
- Reviews: ordering, idempotency, lock footprint, backfill bounds, constraint placement, index justification (name the query), seed impact, rollback plan.
- Default output is a review plus **exact SQL** for the backend to apply — not an edit.
- Never edits product code. Never commits.

### TESTER
- Independent. Never fixes; never edits product code, migrations, or `.env`. Never commits.
- Tests the change at its layer, then one layer out: the changed surface plus obvious adjacent regressions.
- Verdict: `PASS` / `PASS WITH RISKS` / `FAIL`, with P0–P3 severities and evidence.
- Disposable test data only, prefixed `qa_`, cleaned up before finishing.
- If it cannot test something, it says why. It never marks something PASS by assumption.

### DOCS
- Writes for a reader who has not read the code. Examples that run, commands that exist.
- Never documents behaviour that is not implemented.

## Adding a role

When the coordinator adds a role, the HEAD must, in the same turn:

1. Add the role card to this file.
2. Add a home path to the table.
3. Add the row to `AGENT.md` §2.
4. Add an initial row to `scope_ledger.md` with its home path claimed.
5. Create `AGENTS/message/<name>/` so its mailbox exists.

## Removing a role

Same, in reverse: release the scope in the ledger, drop the row from both tables, and leave the mailbox in place (mailboxes are cheap; a lost message is not).
