<WORK IN PROGRESS>

# 03 — Phase 1 system design and frozen contracts

Agent name: ARCHITECT. You are ARCHITECT. If no name was given to you, STOP and ask.

**Wave:** 1
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** nothing — this is the first brief of the build

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/ARCHITECT.md`, then this brief. You are the **first** agent on the build, so the project context matters — but do not read the whole repo; it is nearly empty.

## Goal
Produce the single design document that the BACKEND and FRONTEND agents will both implement against, so they can work in parallel without ever talking to each other. The document must specify **exact** contracts — TypeScript signatures, HTTP routes with payloads, the SQLite schema, the sandbox provider interface, the run state machine, the blast-radius report shape, and the file layout. Two agents building from this document must produce code that fits together on the first try.

## Why / context
BRZ is a containment-first control plane for AI agents: the user submits a task, the control plane plans it, dispatches the real execution into an **isolated ephemeral sandbox**, verifies the result, and returns the result plus a **blast-radius report** proving the execution could not reach anything it should not.

Read first: `AGENTS/CONTEXT.md` (stack, non-negotiables), `HACKATHON.md` §3 (what Challenge 01 demands), `docs/VISION.md` §3 (the seven defining decisions).

**Phase 1 is the minimum real thing.** The coordinator's instruction: *"just some core features… just that it works, just works."* Expansion comes later, if there is time. So this design is deliberately **one** workload and **one** sandbox tier, done properly, with a clean seam for the next tier.

**The provider interface is the most important decision in the document.** Nothing above it may know where code executes. Local tier: `bwrap` + cgroup v2 (this machine has no Docker and no `/dev/kvm`). Production tier: a throwaway Vultr VM per task, written now against a mocked Vultr API, exercised after kickoff. A judge will read this document, so it must also read as an architecture explanation, not just an internal spec.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/architecture/02-phase1-design.md` (new)

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`, `HACKATHON.md`, `docs/VISION.md`
- `AGENTS/permissions/PROTOCOL.md`
- The public web only if you need to confirm a library's API (e.g. `bwrap` flag semantics, cgroup v2 file layout, `node:sqlite` API). Cite what you check.

## Shared / serialized files
- none — you own no shared file in this wave.

## Requirements

The document must contain the following sections, in this order. Each section states a **decision**, not a menu — pick one, name the alternative you rejected and why.

### 1. Scope of Phase 1
What is in, what is explicitly out (browser/Pattern B, multi-user, auth, streaming, policy engine, Vultr VM tier, self-healing loops beyond one retry). One paragraph each.

### 2. The one workload
Pick **one** Phase-1 workload and name it, with the reasoning. Constraints on your choice:
- It must be **one of the ten named directions** in `HACKATHON.md` §3.3.
- It must be **reliably completable by a deliberately simple tool-calling agent** — no clever reasoning required, because a thin agent that fails on the demo is a scoring disaster.
- It must exercise the full loop: the model writes code, the code runs in the sandbox, real output comes back, the model explains it, and **an error can be fed back for one retry**.
- State what the user submits, what the agent produces, and what the UI shows.

### 3. System diagram and request flow
A diagram (ASCII is fine) plus a numbered walkthrough of one run from submit to blast-radius report. Name every component.

### 4. The `SandboxProvider` interface
The **exact TypeScript signature**, with doc comments. It must express: create a sandbox, write files into it, execute a command with caps, stream/collect output, read results, and destroy the sandbox. It must **not** leak implementation details of either tier, and it must support a "no network" guarantee as a first-class property rather than a convention. Show the two implementations side by side:
- **`BwrapProvider`** — local, this machine. Real `bwrap` invocation with the exact flags, the cgroup v2 setup, the rlimits, the ephemeral tmpfs, the read-only root, and the network namespace. State precisely how each of the four containment requirements is satisfied: *process isolation · secret hygiene · resource limits · lifecycle discipline*.
- **`VultrVMProvider`** — production. The **exact Vultr API calls** (create instance → wait ready → push/exec → destroy) with the endpoint paths and the fields, the instance plan you are assuming, and the cold-start time you are assuming. It is written against a **mocked** Vultr API in this phase; say exactly what the mock must cover.

### 5. The capability broker
The protocol by which a sandbox asks the control plane for something (a file out, a network fetch through the allowlist, a scoped credential). The exact request/response shape, the auth between sandbox and control plane, the allowlist mechanism for egress, and what happens when the sandbox asks for something not allowed. Keep it minimal — Phase 1 needs exactly as much as the workload requires, and no more.

### 6. The blast-radius report
The **exact output shape** of the thing that differentiates BRZ. It must let a human see, at a glance: what code ran, what the sandbox tried to do and was denied, resource usage against the caps, the network attempts (including "none"), and the teardown. Give the TypeScript type and a filled-in example. **This is what the demo video will show — it must look worth looking at.**

### 7. The agent loop
The exact prompt strategy, the tool definitions sent to the model, the retry rule, the stopping conditions, the token/iteration caps, and what happens on a model error, a timeout, or an infinite loop. Specify how the model is told what it may and may not do, and how a tool call becomes a sandbox execution.

### 8. API contract
Every route: method, path, request body, response body, status codes, and error codes. At minimum: submit a run, get a run, list runs, stream/poll run progress, and the blast-radius report. Give the TypeScript request/response types. **This is what FRONTEND builds against** — it must be complete and unambiguous.

### 9. Persistence
The `node:sqlite` schema: every table, column, type, constraint, and index, plus the migration mechanism and the exact SQL for the initial migration. State how runs, events, tool calls, sandbox lifecycle records, and the report are stored. Keep it minimal but complete enough that a second agent could write the queries.

### 10. File layout
The exact tree under `backend/` and `frontend/`, with one line per file saying what it owns. This is the map the implementers follow, and the map GITMASTER will use to scope PRs.

### 11. The Vultr portability contract
Restate the ten rules from `docs/VISION.md` §4 as **testable acceptance criteria** for the code in this phase, and specify how each is verified (a command, an assertion, a grep). Include what `deploy/bootstrap.sh` must do on a fresh Ubuntu 24.04 instance, idempotently.

### 12. The demo scenario
Describe the exact demo a judge will see, step by step, including the **containment moment**: the specific command the operator asks the agent to run, what the sandbox does, what the blast-radius report shows, and what the judge sees. It must be **deterministic and re-runnable** so the video can be re-shot until it is clean. Give it a name and make it a single script or single command.

### 13. Phase 1 acceptance criteria
A numbered, checkable list that TESTER will later run against. Include the security checks: no secrets in the sandbox, no direct egress, the resource caps actually bite, and the sandbox is actually destroyed after the run.

## Constraints
- **Design only.** No product code, no scaffolding, no `npm init`. One markdown file.
- **Every interface must be exact.** If a signature is vague, the two implementing agents will guess differently and waste a day. Prefer a real TypeScript type over a prose description.
- **Do not over-design.** Phase 1 is the minimum real thing. If a section could be deferred to Phase 2, say so in §1 and keep it out of the contracts.
- **Do not pick the product workload** without defending it against the three constraints in §2. If you think a different named direction is better, argue it.
- Stay inside your write scope. If you need a file you do not own, request permission per `AGENTS/permissions/PROTOCOL.md` — do not take it.
- Do not commit or push. Do not use the `subagent` tool.
- Cite external facts with a URL and an access date. No claim from memory.

## Acceptance criteria
- [ ] All 13 sections present, in order, each making a decision.
- [ ] The `SandboxProvider` interface is a complete, copy-pasteable TypeScript declaration.
- [ ] The `bwrap` invocation is specified with **exact flags**, and each of the four containment requirements is traced to a specific mechanism.
- [ ] The Vultr API call sequence is specified with endpoint paths and fields, plus the mock's required coverage.
- [ ] The API contract covers every route FRONTEND needs, with full request/response types.
- [ ] The SQLite schema is complete enough to write the queries from.
- [ ] The blast-radius report has a type and a filled-in example.
- [ ] The demo scenario is a single named command with a deterministic containment moment.
- [ ] Every Phase-1 acceptance criterion is checkable by a command or an assertion.
- [ ] A final section "Decisions the implementers must not re-litigate" listing the choices that are now frozen.
- [ ] Written to `docs/architecture/02-phase1-design.md` only.

## Verification
- Every TypeScript type in the document must be syntactically valid TypeScript. Check it.
- Every `bwrap` flag you specify must be a real flag. Verify against `bwrap --help` on this machine — you have it.
- Every cgroup v2 path you specify must exist or be creatable on this machine. Verify the layout, and record the exact cgroup path the sandbox will use.
- Every Vultr API endpoint you specify must be documented. Verify against the public Vultr API docs and cite it.
- Read the document once as the BACKEND implementer, then once as the FRONTEND implementer. If either of you would have to ask a question, the document is not specific enough — fix it.

## Out of scope
- Writing any code, package.json, or config.
- The pitch, the deck, the market analysis.
- The Vultr capability probe (that is brief 01, on hold).
- Choosing the deployment target or buying anything.

## Notes
- The two downstream briefs are `04-backend-core.md` and `05-frontend-phase1.md`, which run **in parallel** against your document. Everything they need must be in it.
- The single highest-value thing you can do is make §4, §6, and §8 **unambiguous**. Those are what make parallel work possible.
- Your mailbox is `AGENTS/message/architect/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/architect/<slug>.md` and wait for the decision. Do not proceed without it.
