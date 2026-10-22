<WORK IN PROGRESS>

# 04 — Phase 1 control plane: server, inference, store, agent loop, routes

Agent name: BACKEND. You are BACKEND. If no name was given to you, STOP and ask.

**Wave:** 2
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 03 (ARCHITECT) must be `RELEASED` — its design doc is your contract

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BACKEND.md`, then this brief. **Your contract is `docs/architecture/02-phase1-design.md`** — read it in full before writing code. If it conflicts with this brief, **the design doc wins**, and say so in your summary.

## Goal
Build the Phase 1 control plane: an HTTP service that accepts a task, drives the agent loop against the OpenAI-compatible model, executes the agent's tool calls through the sandbox provider, records everything, and serves the run, the events, and the blast-radius report over HTTP. When this brief is done, a real task submitted to `POST /api/v1/runs` produces a real result and a real report, end to end, on this machine.

## Why / context
BRZ is a containment-first control plane for AI agents. Read `AGENTS/CONTEXT.md` first — it has the stack, the non-negotiables, and the env contract. Then read the design doc.

This brief is the **spine**. A second BACKEND brief (06) will replace the sandbox implementation with the real sealed one and add the broker and the deploy bootstrap. **You are not expected to build containment in this brief** — you build the machine that containment plugs into, and you wire it against the `SandboxProvider` interface exactly as the design doc defines it.

The `SandboxProvider` interface is frozen. Implement the interface, and provide **one** working implementation so the system runs end to end. If the design doc names a local development implementation, use it. If the design doc does not name one, implement the smallest honest one (a child process with the caps you can apply) and **label it clearly in code and in your summary as the non-sealed stand-in that brief 06 replaces**. Do not present it as contained.

## Write scope (EXCLUSIVE — do not touch anything else)
- `backend/**` — **except** `backend/src/sandbox/**` and `backend/src/broker/**`

Those two subtrees belong to brief 06. You may **read** them and you may **import** from them once brief 06 has landed, but do not create or edit files in them in this brief. If your code needs something there that does not exist yet, define the call against the interface and leave a clearly-marked seam — brief 06 fills it in.

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/architecture/02-phase1-design.md` — **your contract**
- `HACKATHON.md`, `docs/VISION.md` (context only)
- `AGENTS/permissions/PROTOCOL.md`

> **MONOREPO UPDATE (from HEAD, mid-flight):** the repo is a single npm workspace. The root
> `package.json` and `tsconfig.base.json` **already exist and are HEAD's files** — do not create or
> edit them, and ignore any line in this brief that says "no root package.json". Your workspace
> package owns only `backend/package.json` (or `frontend/package.json`). Each workspace's
> `tsconfig.json` must **extend `../../tsconfig.base.json`** for the shared strictness and set only
> what differs (`module`, `moduleResolution`, `lib`, `types`, `outDir`, `include`). One lockfile, one
> `node_modules`, one `npm install` at the root. Full details: `docs/MONOREPO.md`.

> **MANIFEST + TSCONFIG UPDATE (from HEAD, after wave 1):** the workspace manifests and the
> workspace `tsconfig.json` files are **now written and installed** — `backend/package.json`,
> `frontend/package.json`, `backend/tsconfig.json`, `frontend/tsconfig.json`,
> `frontend/tsconfig.node.json`, the root `package-lock.json`, and the root `.npmrc`. One
> `npm install` at the root has been run; `node_modules/` is populated. **Do not create or edit any
> manifest, any lockfile, or the root `tsconfig.base.json`.** You may edit **your own** workspace
> `tsconfig.json` if you need to, but not the root base.
>
> Two things to know: (1) the `extends` path is `../tsconfig.base.json` — the design doc's `../../`
> assumed `packages/backend` and is wrong for our layout (verified: `TS5083` with `../../`).
> (2) The backend's `build` script is `tsc --noEmit` — there is no emit step, by design (§10.4).
> Run `npm run typecheck --workspace backend` (or `--workspace frontend`) to check your work.

## Shared / serialized files
- `backend/package.json` → **the HEAD's file, written between wave 1 and wave 2** with the dependency list from the design doc, and installed at the workspace root. **Do not create or edit it.**
- root `package-lock.json` → **the HEAD's file.** One lockfile for the whole workspace. Never create a lockfile inside a package, never run `npm install` inside a package.
- root `package.json` → **the HEAD's file, already written. Do not create or edit it.** The repo is one npm workspace: `backend` and `frontend` are the two workspace packages.

## Requirements

Implement, in the file layout the design doc specifies:

1. **Config module.** Reads `OPENAI_API_KEY`, `OPENAI_ENDPOINT`, `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_RETRIES`, `PORT`, `NODE_ENV`. **Fail closed at startup** if a required value is missing or the endpoint is not `https://`. Never log a secret. Never fall back to a default provider, model, or host.
2. **OpenAI-compatible inference client.** A thin wrapper over `fetch` against `${OPENAI_ENDPOINT}/chat/completions` (or whatever the design doc specifies). It must: send the model from env, honour the timeout and retry settings, surface typed errors (`timeout`, `rate_limited`, `upstream_4xx`, `upstream_5xx`, `malformed_response`) **without leaking the provider's raw text into anything user-facing**, and support **streaming or not** per the design doc.
3. **A deterministic offline mode.** A switch (env, e.g. `BRZ_INFERENCE_MODE=mock`) that returns scripted responses **without calling the network**, so the whole system can be developed, tested, and demoed without burning tokens or depending on a provider. This is a development and test affordance, and it must be impossible to leave on in production (`NODE_ENV=production` forces live mode).
4. **The agent loop**, exactly as the design doc specifies it: tool definitions, the plan→execute→explain cycle, the error-feedback retry rule, iteration and token caps, and the stopping conditions.
5. **Tool-call dispatch to the sandbox.** The mapping from a model tool call to a `SandboxProvider` execution, including how a failed execution is fed back to the model.
6. **Persistence** — `node:sqlite`, the schema and migration mechanism from the design doc. A store module per table, typed, with prepared statements. **No ORM.**
7. **HTTP server** on `PORT`, binding `0.0.0.0`, with the routes, payloads, status codes, and error codes from the design doc. Plus `/healthz` that reports the inference mode and the database state. Every route validated at the boundary; invalid input returns a 400 with a machine code, never a 500.
8. **Error hygiene.** The API returns generic, per-status messages with a stable machine code. Provider, SQL, and stack text goes to the server log only.
9. **The blast-radius report assembly** — the report *type* and the data to fill it, exactly as the design doc defines it. If the sealed sandbox does not yet supply the denial and usage data (brief 06), populate what you have and leave the remaining fields explicitly `null`/empty with a clear `source` marker — **never fabricate a zero that means "not measured"**. Distinguish "no egress attempted" from "egress not measured".
10. **A run-scoped `AbortController`** so a client disconnect or a timeout cancels the run and **destroys the sandbox**.

## Constraints
- **No hardcoded hosts, ports, keys, models, or URLs.** Everything from env. A grep of `backend/src` for `localhost`, `127.0.0.1`, `http://`, `https://`, `gsk_`, `groq`, and `vultr` must return **nothing** (except `http://` inside a test fixture or a comment explaining why, which you must justify in the summary).
- **Strict TypeScript.** `strict: true`, `noUncheckedIndexedAccess`, no `any` without a written reason. The types must match the design doc's types exactly — FRONTEND is building against them in parallel.
- **No dependencies beyond what the design doc lists.** The manifests are already written and installed by the HEAD. If you need one that is not listed, you **do not add it** — you request permission with the reason, and the HEAD adds it.
- **Do not touch** `backend/src/sandbox/**` or `backend/src/broker/**` (brief 06). Do not touch `frontend/**`, `deploy/**`, `docs/**`, or the harness files.
- Do not commit or push. Do not use the `subagent` tool.
- **Test data only.** Any test user, file, or run is disposable and prefixed `qa_`; clean it up.
- Never write a secret, a token, or an `.env` value into the repo, a log, or a response.

## Acceptance criteria
- [ ] `cd backend && npm run typecheck` passes with zero errors, in strict mode.
- [ ] `npm test` (or the suite the design doc names) passes; unit tests cover the config validation, the error mapping, the agent loop's stopping conditions, and the report assembly.
- [ ] **Offline mode end to end:** with `BRZ_INFERENCE_MODE=mock`, a submitted task produces a run, events, a result, and a blast-radius report over HTTP — no network call is made.
- [ ] **Live mode end to end:** with the real `OPENAI_*` values, one real task runs and produces a real result. Record the actual output in your summary.
- [ ] The routes and payload shapes match the design doc **exactly**. If you had to change one, you say so loudly in the summary and in a code comment.
- [ ] The grep in the Constraints section returns clean.
- [ ] No secret appears in any log line, error response, or test fixture.
- [ ] Every field the report needs is either populated with a real value or explicitly marked as not-yet-measured. No fabricated zeros.
- [ ] `GET /healthz` returns 200 with the inference mode and database state.

## Verification
- `cd backend && npm run typecheck` → clean
- `cd backend && npm test` → all green
- `cd backend && npm run build` → clean (only if the design doc asks for a build step; do not run a production bundle for routine checks)
- Start the service and drive one run with `curl` against `localhost:8787` — paste the actual request and response into your summary
- Run the grep from the Constraints section and paste the (empty) result
- Confirm the report contains no fabricated zeros

## Out of scope
- The sealed sandbox, the broker, the egress allowlist — **brief 06**
- `deploy/**` — **brief 06**
- The frontend — **brief 05**
- The pitch, the market analysis, the video
- Choosing the workload (the design doc decides it) or changing the API contract

## Notes
- FRONTEND is building the UI **at the same time as you**, against the design doc. If you find the contract wrong or unimplementable, **do not silently deviate**: report it in the summary and implement the closest reasonable reading, marked with a comment.
- The single most important thing: **the API must match the design doc's types exactly.** Parallel work fails on mismatched types, not on hard problems.
- Your mailbox is `AGENTS/message/backend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/backend/<slug>.md` and wait for the decision. Do not proceed without it.
