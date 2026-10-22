# BRZ — Project Context

> **Read this first, in any new agent session.** It is the short orientation every worker needs. It is intentionally brief — the rules live in `AGENT.md`, your role card lives in `AGENTS/roles/<AGENT>.md`, and the task lives in your brief.
>
> If you are reading this for the first time, you do not need any other context. If you have read it before, re-read it anyway — it changes.

---

## What BRZ is

BRZ is a **containment-first control plane for AI agents**. The user gives a task; BRZ plans the work, dispatches the real execution into an **isolated, ephemeral sandbox**, verifies the result, and returns evidence **plus a blast-radius report** showing that the execution could not reach anything it should not.

**Not** a chat wrapper. **A runtime that makes agent execution safe enough to approve.**

## Where we are

- **Project:** entry to the **Vultr Agent Rush Hackathon** (lablab.ai × Vultr), **Challenge 01 · Blast Radius Zero**. Requirements: `HACKATHON.md`. Scoring: `JUDGING-CRITERIA.md`. Vision: `docs/VISION.md`.
- **Current phase:** **Phase 1 — core that works.** Build the minimum real thing. Ship it, run it, prove it. Expand afterwards if there is time.
- **Deployed?** No. Vultr access arrives at kickoff (3 Nov 2026). Everything must be buildable and testable **locally** first.
- **No Vultr account yet.** The production sandbox tier is **written against the same interface** and exercised after kickoff.

## Stack (decided — do not relitigate)

| Layer | Choice |
|---|---|
| Language | **TypeScript**, strict |
| Runtime | **Node 24** (not Bun) |
| Frontend | **React + Vite** |
| Persistence | **`node:sqlite`** (built into Node 24 — no database server) |
| Local sandbox | **bubblewrap (`bwrap`) + cgroup v2 + rlimits** — no Docker on this machine, no `/dev/kvm` |
| Inference | **OpenAI-compatible client, provider chosen by env only** |
| Dev provider | Groq (`openai/gpt-oss-120b`) |
| Prod provider | Vultr Serverless Inference (`https://api.vultrinference.com/v1`) — mandatory for C1 |
| Repo | `github.com/ASAYMAN69/blast-radius-zero` (public, MIT) |
| Layout | **Monorepo** — one git repo, one npm workspace root, one lockfile, one `node_modules`. Workspaces: `backend`, `frontend`. `deploy/` is not a package. See `docs/MONOREPO.md` |
| Ports | control plane `8787`, frontend `5173` |

## Environment

All configuration is env. **No host, port, key, model, or URL in source.** `.env` holds the values and is gitignored; `.env.example` is the blank template. `scripts/envcheck.sh` verifies presence without printing values.

| Variable | Meaning |
|---|---|
| `OPENAI_API_KEY` | inference credential |
| `OPENAI_ENDPOINT` | OpenAI-compatible base URL |
| `OPENAI_MODEL` | model id |
| `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES` | transport tuning |
| `PORT` | control-plane port |
| `NODE_ENV` | mode |

## Wave 1 → 2 handoff (already done)

The workspace manifests, the three workspace `tsconfig.json` files, the root `package-lock.json`, and the root `.npmrc` are **written and installed**. `npm install` at the root has run; `node_modules/` is populated. Workers write **source only**.

- `npm run typecheck --workspace backend` · `npm run typecheck --workspace frontend`
- The `extends` path is `../tsconfig.base.json` (the design doc's `../../` assumed `packages/backend` and fails with `TS5083`).
- The backend has **no emit step** — `build` is `tsc --noEmit`, by design. The backend ships as source.
- The backend `test` script is `node --test` (Node 24 discovers `*.test.ts`).

## Non-negotiables

1. **Credentials never enter the sandbox.** The control plane holds every key. The sandbox gets scoped capabilities from the broker.
2. **The sandbox has no direct network.** Egress goes through the control plane's allowlist proxy, and every attempt is logged.
3. **The sandbox is ephemeral per task.** Created for one run, destroyed after it. No reuse.
4. **Real resource caps.** cgroup v2 `memory.max` / `cpu.max` / `pids.max` plus rlimits (wall clock, file size, process count). A `setTimeout` is not a cap.
5. **Only external IDs cross the wire.** No internal keys, no hashes, no raw server error text in a user-facing response.
6. **One OpenAI-compatible client.** Provider comes from env. Nothing hardcodes Groq or Vultr.
7. **Nothing in a sandbox is a dependency install.** Phase 1 uses the system Python with the **standard library only** — no `pip`, no network.

## How the work runs

The **coordinator** (the user) decides what goes in the product. The **main agent** plans, writes briefs, locks scopes, reviews, and commits. **Workers** execute inside a locked write scope and report via a summary.

- Your task is a **brief**: `AGENTS/briefs/NN-slug.md`. It is self-contained. Do not infer anything from a conversation you cannot see.
- Your **write scope is exclusive**. If you need anything outside it — another file, a tool, a command — you **stop and request permission**: `AGENTS/permissions/<your-name>/<slug>.md`, then wait for a `GRANTED` decision in that file. No grant, no action.
- Your **mailbox** is `AGENTS/message/<your-name>/`. Read it between tasks. Rename what you read with a `-READ` suffix.
- On completion: write `AGENTS/completion/NN-slug.md-summary.md`, mark the brief `<DONE>`, tell the coordinator where the summary is.
- Do not `git commit` or `git push` — except **GITMASTER**, and only when its brief says so. Do not use the `subagent` tool.

Full rules: `AGENT.md`. Protocol: `AGENTS/sub_agent_protocol.md`. Your role: `AGENTS/roles/<AGENT>.md`.

## Where things are

```
backend/        control plane (to be built)  — npm workspace "backend"
frontend/       React + Vite console (to be built) — npm workspace "frontend"
deploy/         bootstrap + systemd + env template (to be built) — not a package
package.json    root workspace manifest (HEAD's file)
tsconfig.base.json  shared strictness (HEAD's file)
docs/architecture/  ARCHITECT output — contracts live here
docs/business/      BUSINESS output
docs/design/        DESIGNER output
docs/MONOREPO.md    the workspace contract
AGENTS/         the harness
```

**Never edit a manifest or a lockfile.** The HEAD owns `package.json`, `tsconfig.base.json`, `backend/package.json`, `frontend/package.json`, and the root lockfile. If you need a dependency, request permission with the reason.

## The bar for "it works"

Phase 1 is done when a real task, end to end, produces a real result and a real blast-radius report — with no stubs, no mock provider left in the critical path, and the demo reproducible from a clean clone.
