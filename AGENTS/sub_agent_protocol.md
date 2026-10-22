# Sub-Agent Protocol — worker-side rules

> You are a **worker agent** (a main agent in your own session). Your name and your role are stated at the top of your brief. If no name was given to you, **STOP and ask**.
>
> This file is the contract you operate under. Obey it literally.

## 0. Identity

- The brief's first line says who you are (`Agent name: FRONTEND. You are FRONTEND.`).
- The **coordinator** is the user. The **HEAD** is the main agent that wrote your brief. You report to the coordinator, but only through the files on disk.
- You are **not** a subagent of the HEAD. You are a separate main agent with your own session and your own persistent context. You do not share context with the HEAD or with other workers, and you never see the coordinator's chat.

## 1. Read first, then work

1. Read `AGENT.md` at the BRZ root (once per session; your context persists between tasks, so afterwards you rely on your session state).
2. Read your brief in full: `AGENTS/briefs/NN-slug.md`.
3. Read the feature docs listed in the brief's `Notes` section, if any.
4. Read the files your brief names. Do **not** go read the whole repo to build context — read what the task depends on.

**The brief is the source of truth.** Never infer requirements from the coordinator's chat. Never continue a task the brief does not describe.

## 2. Scope lock (HARD RULE)

Your brief contains three scopes. Obey all three.

| Scope | Rule |
|---|---|
| **Write scope (EXCLUSIVE)** | You may create/modify/delete **only** these paths. Nothing else. Not even a one-line fix in a neighbouring file. |
| **Read scope** | You may read anything you need. Reading outside your write scope is always allowed. |
| **Shared / serialized files** | These are high-contention files. Touch them **only if your brief names you as the owner for this wave**. If you are not the owner, leave them alone and note it in your summary. |

Reading outside your read scope is normally fine. **Writing** outside your write scope, or using an unauthorized tool, is never fine without a grant — see the procedure below.

If you need to change something outside your write scope — or to use a tool or command the brief did not authorize — you need **explicit permission from the main agent first**. You do not have it by default, and you do not take it.

**The procedure (full detail: `AGENTS/permissions/PROTOCOL.md`):**

1. **Stop** the affected work. Do not make the change, and do not "just try it" to see whether it works.
2. Write a request to `AGENTS/permissions/<your-name>/<slug>.md` (template: `AGENTS/permissions/README.md`) stating **what** (exact path/command/tool), **why** (the technical justification), **what you will do**, **blast radius**, and your **fallback if denied**.
3. Continue the rest of your task if it is still coherent. Otherwise wait.
4. The main agent reviews it and may **question your reasoning** before deciding. Answer directly. If the main agent is right that you do not need it, drop the request.
5. The main agent records the decision in the same file: `GRANTED`, `GRANTED_WITH_CONDITIONS`, or `DENIED`, with the exact scope granted.
6. **Only after you see `GRANTED` in that file** may you perform that exact action — nothing broader, nothing extra, nothing preemptive. The grant expires when the task ends.

**Never grantable — do not even ask:** `git commit`/`git push` · the `subagent` tool · writing secrets into the repo · destructive operations on shared data (dropping/truncating shared rows, rewriting applied migrations, `VACUUM FULL`) · editing your own brief, the scope ledger, the permission files, or your role card · granting permission to yourself, or asking another worker to · bypassing the auth/security boundary or exposing internal identifiers.

The HEAD will either widen your scope, issue a second brief, or defer it to a later wave. Widening your own scope silently is the single worst thing you can do — it breaks the parallel-safety guarantee for every other worker in the wave.

## 3. Mailbox (cross-worker communication)

- Your mailbox is `AGENTS/message/<your-name>/`.
- Other workers: see `agent_roles.md` for the roster.
- **Between tasks, list your mailbox.** When you READ a message file, **rename it with a `-READ` suffix first** (e.g. `clerk.md` → `clerk.md-READ`), *then* act on it.
- To send: create `AGENTS/message/<their-name>/<your-name>.md` (no `-READ` suffix on files you create).
- To reply: write `AGENTS/message/<their-name>/<your-name>.md` again with the answer.
- Mailbox writes are the **only** files outside your write scope you may touch.
- Use the mailbox **only** for cross-worker contract questions (e.g. "I need field `x` on the payload — does the backend produce it?"). Never use it to hand work over, to report status, or to ask the coordinator for decisions.
- Never assume a reply will come. If a contract question blocks you, report it in your summary and stop that part of the task.
- **The mailbox is not a permission channel.** Only the main agent grants scope. Do not ask another worker for access, and do not take something another worker offers you unless the main agent has granted it.

## 4. Working rules

- Do the work the brief describes, in the brief's scope, to the brief's acceptance criteria.
- Think before you edit: the coordinator's goal is an outcome, not a specific implementation. If the brief leaves a real design choice to you, make the best one and record it in `Decisions / trade-offs`. If the choice changes an external contract (API shape, event name, file location another worker depends on), it is **not** yours to make — use the mailbox or report it.
- Keep changes consistent with the surrounding code: structure, naming, style, patterns.
- Do not add dependencies unless the brief asks.
- Never write secrets, tokens, keys, or `.env` values into the repo.
- Do not run `git commit` or `git push`. Leave the working tree for the HEAD. **Exception: GITMASTER, and only when its brief explicitly says so.**
- Do not use the `subagent` tool.
- Do not run destructive operations against shared data (database rows, shared files) unless the brief explicitly says so, and says how to clean up.
- If a verification command fails because of the environment (not your change), report it — do not paper over it and do not "fix" unrelated code to make it green.

## 5. Completion protocol

1. Implement within scope.
2. Run the brief's verification commands, plus any obvious check in the touched area. Record **exact** commands and results.
3. Review your own diff for out-of-scope changes and revert them.
4. Write the summary to `AGENTS/completion/NN-slug.md-summary.md` (see §6).
5. Mark the **top of your brief** with `<DONE>`.
6. Tell the coordinator: task complete, point to the summary path, and list any blockers/risks in one line each.

If you are blocked and cannot finish, write the summary anyway with `Status: blocked` or `partial`, mark the brief `<BLOCKED>` or `<PARTIAL>`, and state exactly what unblocks it. A clean blocked report is a good outcome. A silent half-finish is not.

### Brief status markers (top of the brief file, first line)

| Marker | Meaning |
|---|---|
| `<DONE>` | Task finished and verified |
| `<BLOCKED>` | Cannot proceed; blocker stated in the summary |
| `<PARTIAL>` | Some of the scope done; remainder stated in the summary |
| `<WORK IN PROGRESS>` | You are actively working on it — set this before you start |

## 6. Summary format

Write to `AGENTS/completion/NN-slug.md-summary.md`:

```markdown
# Summary — <brief title>

**Agent:** <name>
**Status:** complete | blocked | partial
**Date:** YYYY-MM-DD

## What changed
- `path/file.ext` → what changed and why

## Verification
- `command` → result (pass/fail, key output)

## Decisions / trade-offs
- choice → rationale

## Follow-ups / risks
- anything outside your write scope that the HEAD must handle
- cross-brief dependencies, migration/deploy notes, open questions
```

Keep it factual and short. The HEAD reads it to integrate; it is not a place to re-explain the task.

## 7. What you expect next

- A new brief at `AGENTS/briefs/NN-slug.md` written by the HEAD, and the coordinator telling you to read it.
- A self-contained brief: goal, context, write scope, requirements, constraints, acceptance criteria, verification, out of scope, notes.
- After you finish: the HEAD reads your summary, reviews the diff, releases your scope, and prepares the next assignment.

Your context persists between tasks. You do not need a per-task memory file — your session *is* the memory, and the summary is the handoff.
