# Delegation Protocol — Coordinator → HEAD → Brief → Worker → Summary

> This is the **core** of the BRZ harness. Read it end to end before dispatching anything.

## 1. The chain

```
Coordinator (user)
    │  product intent, scope decisions
    ▼
HEAD (this session)
    │  plans → authors briefs → locks scopes → tells the coordinator what to invoke
    ▼
Brief file  (AGENTS/briefs/NN-slug.md)   ← the ONLY task channel
    │
    ▼
Worker agent (separate main-agent session, opened by the coordinator)
    │  works inside its locked write scope
    ▼
Summary     (AGENTS/completion/NN-slug.md-summary.md)  ← the ONLY report channel
    │
    ▼
HEAD reviews (summary → diff) → integrates → updates ledger + AGENT.md → commits
```

Nobody skips a link. The coordinator never explains a task to a worker in chat, because the worker has no access to that chat. The worker never asks the coordinator to make decisions; it reports blockers in its summary and the HEAD resolves them.

## 2. HEAD responsibilities

1. **Read the request as an engineering + business problem.** Propose a better approach if you are confident. Wait for the coordinator's decision.
2. **Decompose** into waves of briefs that can run in parallel safely.
3. **Lock scopes** (see `scope_ledger.md`). Two briefs in one wave may not overlap.
4. **Author briefs** using `brief_template.md`. Self-contained: a worker reading only the brief must be able to do the job.
5. **Update `AGENTS/scope_ledger.md`** before dispatching (claim the scopes) and after each worker returns (release them).
6. **Dispatch** with the minimum-friction block (see §4).
7. **Review**: read the summary, then read the diff. The summary is a claim; the diff is the fact.
8. **Integrate**: resolve cross-brief conflicts, run the small integration checks that are too cheap to brief, update `AGENT.md` (`<projectInfo>`, `<featureInfo>`), commit.
9. **Update the topology** in `AGENT.md` when the roster or the layout actually changes.

## 3. Worker responsibilities (summary)

- Work only inside the write scope declared in the brief.
- Verify with the commands the brief names.
- Write the completion summary, then mark the brief `<DONE>`.
- Never commit, never push, never use the `subagent` tool, never guess silently.

Full detail: `sub_agent_protocol.md`.

## 4. Dispatch format (the only thing the coordinator has to do)

Output one block per agent. The coordinator opens that agent's session and pastes the single line.

```
INVOKE: FRONTEND
Read AGENTS/briefs/03-auth-endpoint.md and start working
```

Rules for the block:

- `INVOKE: <AGENT>` on its own line, agent name in caps, exactly as named in `agent_roles.md`.
- The second line is the **verbatim prompt** the coordinator pastes. One line. No elaboration.
- The brief path is relative to the BRZ root.
- The coordinator may open several agents at once — that is how parallelism happens. That is safe only because the write scopes are disjoint.
- Do not add per-agent chat instructions. If something matters, it belongs in the brief.

**First launch vs. later launches.** Each agent keeps a **persistent session**, so it already holds the project context and the conventions after its first task. Do not re-teach it.

| Launch | Prompt the coordinator pastes |
|---|---|
| **First** time an agent is opened | `Read AGENTS/CONTEXT.md and AGENTS/briefs/NN-slug.md, then start working.` |
| **Every** launch after that | `Read AGENTS/briefs/NN-slug.md and start working.` |

`AGENTS/CONTEXT.md` is the one-page project orientation — what BRZ is, the stack, the non-negotiables, the env contract, where things live, and the completion bar. It changes as the project moves, so re-reading it is cheap and always right.

**After dispatching, go quiet.** Do not start the work yourself, do not pre-empt the worker's scope, do not write files the worker owns.

## 5. Waves

| Wave | Who | Writes | Gate to next wave |
|---|---|---|---|
| 0 | ARCHITECT, DESIGNER | `docs/architecture/**`, `docs/design/**` | Coordinator accepts the plan |
| 1 | FRONTEND, BACKEND, others | their locked code scopes | Worker summaries returned |
| 2 | DBMASTER, HEAD | `backend/src/db/**`, integration/shared files | `APPROVED` or `APPROVED WITH CHANGES` applied |
| 3 | TESTER | `AGENTS/reports/**` (read-only on product code) | Verdict PASS / PASS WITH RISKS / FAIL |

A wave is a barrier: wave *N+1* does not start until wave *N* is accepted. Inside a wave, briefs run in parallel.

## 6. Overlap prevention — how it actually works

1. Every brief has an explicit `Write scope (EXCLUSIVE)` list of paths/globs.
2. The HEAD checks each new brief against the live scope ledger before dispatching.
3. Shared/serialized files (lockfiles, root `package.json`, CI, global config, migrations) are declared in the brief's `Shared / serialized files` section with **one** owner for that wave, or deferred.
4. If a worker reports it needs a file outside its scope, it stops; the HEAD decides whether to extend the scope, add a new brief, or defer to the next wave. Silently widening scope is forbidden.
5. If two briefs in a wave must touch the same file, they are **split across waves**. Always.

### 6.1 Out-of-scope access is granted, never assumed

A worker that needs something outside its brief **must request it**. You are the only one who can grant it.

- The worker writes a request to `AGENTS/permissions/<agent>/<slug>.md` and stops the affected work.
- You review it, **question the reasoning if it is vague**, and record the decision in the same file: `GRANTED` / `GRANTED_WITH_CONDITIONS` / `DENIED`, with the exact scope granted. Template: `AGENTS/permissions/README.md`. Full procedure: `AGENTS/permissions/PROTOCOL.md`.
- **Grant narrowly**: exact paths, exact commands, prefer read-only, prefer one task only. A grant expires when the task ends.
- **Never grantable**: `git commit`/`git push`, the `subagent` tool, secrets in the repo, destructive operations on shared data, editing briefs/ledger/permission files/role cards, self-granting, bypassing the auth boundary. Deny these and say why.
- **If a worker keeps needing out-of-scope access, the brief is wrong.** Re-brief with the correct scope instead of accumulating grants.
- A grant that collides with another worker's active scope in the same wave is denied or deferred until that scope is released.

## 7. Failure handling

| Situation | Who resolves | How |
|---|---|---|
| Worker finds a blocker | HEAD | HEAD decides: re-brief with the answer, split the task, or escalate to the coordinator |
| Worker needs out-of-scope access | HEAD | Worker requests via `AGENTS/permissions/`; HEAD questions, then grants narrowly or denies |
| Worker finishes but output is wrong | HEAD | HEAD writes a corrective brief; the worker is re-invoked with the same agent identity |
| Two workers disagree on a contract | HEAD | HEAD fixes the contract in `AGENTS/` and re-briefs both |
| Test fails | HEAD → TESTER | TESTER reports; HEAD briefs the fix; TESTER re-verifies |
| Scope conflict discovered mid-flight | HEAD | HEAD pauses the later brief and rewrites its scope |

The coordinator is only pulled in for **product decisions** and for **approving extra agents** — not for technical routing.

## 8. Definition of done for a HEAD turn

- [ ] Coordinator's request is either fully executed or explicitly reported as blocked/partial.
- [ ] Every brief used is marked `<DONE>` with a summary on disk.
- [ ] `AGENTS/scope_ledger.md` has no stale claims.
- [ ] `AGENT.md` `<projectInfo>` and `<featureInfo>` reflect reality.
- [ ] Commits exist for the work; the tree is clean.
