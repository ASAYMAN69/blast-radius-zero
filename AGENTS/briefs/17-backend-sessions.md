<DONE>

# 17 — Sessions, messages, and multi-turn agent loop

Agent name: BACKEND. You are BACKEND. If no name was given to you, STOP and ask.

**Wave:** 9
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 06 (`<DONE>`) — the sealed sandbox and the control plane exist

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BACKEND.md`, then this brief. You are in your **existing session** — you built the control plane and you know it.

## Goal
Add **sessions and multi-turn messaging** to the control plane. A session is a conversation thread with many messages; each user message triggers a run (one task, one sandbox, one blast-radius report). The agent loop takes the session's message history as context, so the user can send multiple texts under one session and the agent remembers what it did.

## Why / context
BRZ is a containment-first control plane for AI agents. Phase 1 shipped one task → one run → one report. The coordinator now wants a **chat-first UI**: the user types a task, hits enter, and the agent responds; the user can send a follow-up under the same session. Sessions need create, list, rename, delete, and compaction.

Read `AGENTS/CONTEXT.md`, `docs/VISION.md` §3, and `docs/design/02-chat-first-layout.md` (the layout spec — you need it for the session sidebar contract).

**Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for backend (database, API design, performance, reliability). Read `ROUTER.md` first, then open at most 1–2 skill files per pass.

## Write scope (EXCLUSIVE — do not touch anything else)
- `backend/src/contracts/sessions.ts` (new)
- `backend/src/db/store/sessions.ts` (new)
- `backend/src/db/store/messages.ts` (new)
- `backend/src/db/migrations/002_sessions.sql` (new)
- `backend/src/routes/sessions.ts` (new)
- `backend/src/agent/sessionLoop.ts` (new — the multi-turn loop)
- `backend/src/server.ts` (mount the new router)

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/architecture/02-phase1-design.md` — §4 (provider), §6 (report), §8 (API patterns), §9 (schema patterns)
- `docs/design/02-chat-first-layout.md` — the layout spec
- `backend/src/contracts/*`, `backend/src/db/store/*`, `backend/src/agent/loop.ts`, `backend/src/runs/manager.ts`
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- `backend/package.json` → HEAD's file. Do not touch.
- root `package-lock.json` → HEAD's file. Do not touch.
- `backend/src/server.ts` → you own the mount line only.

## Requirements

### Schema
1. **`sessions` table**: `session_internal` (PK), `session_external` (ULID, unique), `name` (text, not null, default "New session"), `created_at` (timestamptz, not null), `updated_at` (timestamptz, not null), `compacted_summary` (text, nullable — the compaction output).
2. **`messages` table**: `message_internal` (PK), `message_external` (ULID, unique), `session_internal` (FK → sessions, on delete cascade), `role` (text, check in ('user','assistant')), `content` (text, not null), `created_at` (timestamptz, not null).
3. Migration: `002_sessions.sql`, additive, re-runnable. Mirror in `schemaDefinition.ts` if it exists (check the codebase).

### API contract (these are the endpoints FRONTEND builds against)
4. `POST /api/v1/sessions` → `{ sessionExternal, name, createdAt }`. Creates a session with an empty name default.
5. `GET /api/v1/sessions` → `{ sessions: [{ sessionExternal, name, updatedAt, messageCount }] }`, ordered by `updated_at DESC`.
6. `GET /api/v1/sessions/:id` → `{ sessionExternal, name, createdAt, updatedAt, compactedSummary, messages: [{ messageExternal, role, content, createdAt }] }`.
7. `PATCH /api/v1/sessions/:id` → `{ name }` (rename). Returns the updated session.
8. `DELETE /api/v1/sessions/:id` → 204. Cascades to messages and any associated runs.
9. `POST /api/v1/sessions/:id/compact` → compacts old messages into `compacted_summary`, clears the compacted messages, keeps the last N (default 4) recent messages. Returns `{ compactedCount, keptCount, summary }`.
10. `POST /api/v1/sessions/:id/messages` → `{ content }`. Creates a user message, triggers a run (the existing run manager), and returns `{ messageExternal, runId }`. The agent loop takes the session's message history (compacted summary + recent messages) as context.

### Multi-turn agent loop
11. The agent loop (`sessionLoop.ts`) must take the session's message history as context: `compacted_summary` (if present) + all messages (in order). It must produce an assistant response and store it as a message. The existing run manager handles the sandbox and the report.
12. The agent's context must be trimmed to fit the model's context window. Use a simple strategy: if the total message content exceeds a threshold (e.g. 8,000 tokens estimated), trigger compaction automatically (or fail with a clear error asking the user to compact).

### Store
13. Typed stores: `createSession`, `getSession`, `listSessions`, `renameSession`, `deleteSession`, `addMessage`, `getMessages`, `compactSession`. Prepared statements, no ORM.

### Constraints
14. **No hardcoded hosts, ports, keys, models, or URLs.**
15. **Strict TypeScript.** Types match the contract above exactly.
16. **No dependencies beyond what the design doc lists.** If you need one, request permission.
17. **Do not touch** `frontend/**`, `deploy/**`, `docs/**`, or any harness file.
18. Do not commit or push. Do not use the `subagent` tool.
19. **Never write a secret, a token, or an `.env` value into the repo, a log, or a response.**

### Acceptance criteria
- [ ] `npm run typecheck --workspace backend` → clean.
- [ ] `npm test --workspace backend` → all green (existing 91 + new session tests).
- [ ] Create a session, send a message, receive an assistant response, send a follow-up, receive a context-aware response.
- [ ] Rename, delete, list sessions — all work.
- [ ] Compact a session — old messages summarized, last N kept.
- [ ] `GET /api/v1/sessions/:id` returns the full message history.
- [ ] Session deletion cascades to messages and runs.
- [ ] The agent loop takes session history as context (verified by a test: follow-up references prior turn).

### Verification
- `npm run typecheck --workspace backend` → clean
- `npm test --workspace backend` → green
- Curl: create session → send message → get session → send follow-up → get session → compact → get session → delete
- Confirm the follow-up response references the prior turn

### Out of scope
- The frontend — brief 18
- The sealed sandbox, the broker — already done
- The pitch, the deck, the video

### Notes
- The design doc's §9 schema patterns should be followed. The migration mechanism (checksummed, re-runnable) is already in place.
- `BRZ_RUN_TOKEN_BUDGET` applies to the whole run, including multi-turn. Each user message triggers one run with its own budget.
- Your mailbox is `AGENTS/message/backend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/backend/<slug>.md` and wait for the decision. Do not proceed without it.
- **Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for backend (database, API design, performance, reliability). Read `ROUTER.md` first, then open at most 1–2 skill files per pass. It is a reference, not a dependency.
