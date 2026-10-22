# Permission requests

> Every out-of-scope action a worker wants to take is requested here first, and granted here first. Nothing happens without a `GRANTED` decision in the request file.
>
> Full procedure: `PROTOCOL.md`. This file holds the template and the index.

## How it works

| Step | Who | What |
|---|---|---|
| 1 | Worker | Stops the affected work. Writes a request to `permissions/<agent>/<slug>.md` using the template below. |
| 2 | Worker | Continues the rest of the task if coherent; otherwise waits. |
| 3 | HEAD | Reviews, questions the reasoning if it is vague, then records a decision **in the same file**. |
| 4 | Worker | Acts only on `GRANTED` / `GRANTED_WITH_CONDITIONS`, only for the granted scope, only until the task ends. |

**Never grantable** (see `PROTOCOL.md` §3): `git commit`/`git push` · the `subagent` tool · secrets in the repo · destructive operations on shared data · editing briefs, the ledger, permission files, or role cards · self-granting · bypassing the auth boundary.

## Request template

```markdown
# Permission request — <one-line title>

**Agent:** <AGENT>
**Brief:** AGENTS/briefs/NN-slug.md
**Date:** YYYY-MM-DD
**Status:** PENDING

## What
The exact path, command, or tool. Exact enough to be granted mechanically.

<exact path / command / tool>

## Why
The technical justification. Which requirement cannot be met without it, and why.

## What I will do
The precise change or invocation, and its expected effect.

## Blast radius
What could break, and how you would undo it.

## Fallback
What you will do instead if this is denied. If there is none, say so explicitly.
```

## Decision block (written by the HEAD only)

```markdown
## Decision
**Decision:** GRANTED | DENIED | GRANTED_WITH_CONDITIONS
**Granted scope:** <exact paths / commands / tools — nothing broader>
**Conditions:** <e.g. read-only · this task only · no network>
**Decided by:** HEAD
**Date:** YYYY-MM-DD
**Rationale:** <one or two lines>
```

## Index

| File | Agent | Brief | Status |
|---|---|---|---|
| _(none yet)_ | — | — | — |

## Archive

Decided requests stay in place as the record of what was granted and why. They are not deleted.
