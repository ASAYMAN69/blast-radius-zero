# Brief template

> Copy this skeleton for every brief in `AGENTS/briefs/`. Delete the parenthetical guidance. A brief must be self-contained: a worker reading only this file must be able to do the job without seeing any chat.

---

```markdown
<WORK IN PROGRESS>

# NN — <short task title>

Agent name: <AGENT>. You are <AGENT>. If no name was given to you, STOP and ask.

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then
> `AGENTS/roles/<AGENT>.md`, then this brief. The task is self-contained;
> do not infer from any conversation you cannot see.

**Wave:** N            **Assigned by:** HEAD      **Date:** YYYY-MM-DD
**Depends on:** <other brief IDs, or "nothing">
**Contract:** <the design doc or upstream artifact defining the interfaces, or "none">

## Goal
One paragraph: the outcome, in terms of what works when you are done. No implementation detail.

## Why / context
What the coordinator wants and why. Background the worker needs — they have not seen any
conversation. Name the real constraints (business rules, invariants, existing patterns).

## Write scope (EXCLUSIVE — do not touch anything else)
- `path/to/file.ext`
- `path/to/dir/**`

## Read scope
- anything else you need to read
- `AGENTS/features/<file>.md` — the feature doc this task must stay consistent with

## Shared / serialized files
- `package.json` → owner: <AGENT>   (or: deferred to wave N+1)
- `bun.lock` → owner: <AGENT>

## Requirements
- Concrete, testable requirements. Number them.
- Exact contracts: endpoint paths, methods, request fields, response shapes, error codes.
- Exact UI states, components, and file paths.
- Compatibility notes: what must keep working.

## Constraints
- Stay inside the write scope. If you need to change something else: stop and report it.
- Base rules from `AGENT.md` §7 that apply here.
- Do not commit or push. Do not use the `subagent` tool.
- <task-specific constraints>

## Acceptance criteria
- [ ] Observable behaviour 1
- [ ] Observable behaviour 2
- [ ] Verification command passes: `<command>`
- [ ] No regressions in the named adjacent area
- [ ] No out-of-scope files modified

## Verification
Exact commands, and what a pass looks like:
- `<command>` → expect: <result>
- `<command>` → expect: <result>

## Out of scope
- What you must NOT do, named explicitly.

## Permission requests
- If your task needs access outside the write scope, or a tool/command the brief did not
  authorize, you must request it from the main agent before acting:
  write `AGENTS/permissions/<your-name>/<slug>.md` (template:
  `AGENTS/permissions/README.md`), stop the affected work, and wait for a
  `GRANTED` decision recorded in that file. Never grantable: `git commit`/`git push`,
  the `subagent` tool, secrets in the repo, destructive operations on shared data,
  editing your own brief or the ledger, self-granting, bypassing the auth boundary.
- The main agent records each decision here:
  - `<none yet>` — the worker must request before touching anything outside scope.

## Notes
- Links: `AGENT.md`, `AGENTS/features/<file>.md`, related briefs.
- Known gotchas: environment quirks, services that must be running, seed data needed.
- Your mailbox: `AGENTS/message/<agent>/`. Read it between tasks.
```

---

## Quality bar (inherited by every brief)

A task is not done when it *works*. It is done when it is **right, complete, and presentable to a stranger who has never seen it**. The coordinator's standing instruction is **"never settle for less."** Concretely:

1. **No stubs in the shipped path.** Every code path reachable by the acceptance criteria is real. If something is deliberately deferred, it sits behind an explicit flag and says so in the code — never silently faked.
2. **Nothing a human reads is a placeholder.** No `TODO`, no filler copy, no empty state that says nothing. Every string a user sees is written.
3. **Failure paths are designed, not accidental.** Every reachable error state has a written message, a recovery path, and a retry.
4. **The unhappy path is the deliverable.** For anything that runs untrusted code, the denial, the cap, and the teardown *are* the feature. Build the failure first, then the success.
5. **It survives a stranger.** No unexplained jargon, no magic numbers, no code that needs a paragraph of context to follow. A reviewer with five minutes must be able to read it.
6. **It is measured, not asserted.** "It works" needs a command and its output. Prefer a check that **fails** when the claim is false.
7. **Polish is not optional.** Spacing, type scale, empty states, loading, focus, contrast. A judge watches the screen.

If a brief's acceptance criteria can be met by something that technically works and looks like a prototype, the brief is under-specified — say so in your summary rather than shipping the prototype.

---

## Writing rules

- **Number the file** `NN-slug.md` with a zero-padded two-digit number. Numbers define order, and the order is the wave order. Numbers are never reused.
- **One agent per brief.** If two agents are needed, write two briefs.
- **One brief per agent per wave.** If an agent needs two tasks in the same wave, split them into two briefs or push one to the next wave.
- **Every path in the write scope is real.** A glob that matches nothing is a bug in the brief; verify before dispatching.
- **The write scope must be as tight as possible.** A tight scope is what makes parallel workers safe. If the scope says `frontend/**`, ask whether `frontend/src/views/**` would do.
- **The acceptance criteria must be checkable by someone who did not write the code** — the HEAD reads them to decide whether the work is done.
- **Say what "done" looks like in the summary**: which file, which behaviour, which command.

## After the worker finishes

The HEAD reviews `AGENTS/completion/NN-slug.md-summary.md` and the diff, then:
1. Marks the row `RELEASED` in `scope_ledger.md`.
2. Updates `AGENT.md` `<projectInfo>` / `<featureInfo>` if the work changed the project's shape.
3. Commits.
