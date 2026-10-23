<WORK IN PROGRESS>

# 19 — Schema review: sessions and messages tables

Agent name: DBMASTER. You are DBMASTER. If no name was given to you, STOP and ask.

**Wave:** 10
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 17 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/DBMASTER.md`, then this brief. You are the **first launch** of this agent, so read the standing card once and then rely on your session.

## Goal
Review the `sessions` and `messages` schema that BACKEND created in brief 17. Return a decision: `APPROVED`, `APPROVED WITH CHANGES`, or `BLOCKED`, with exact SQL for any required change.

## Why / context
BRZ is a containment-first control plane for AI agents. Phase 2 added sessions (conversation threads) and messages (multi-turn history). The schema was created by BACKEND in brief 17 and needs your approval before it is considered final.

Read `AGENTS/CONTEXT.md`, `docs/VISION.md`, and `docs/design/02-chat-first-layout.md`.

## Write scope (EXCLUSIVE — do not touch anything else)
- `AGENTS/reports/db-2026-10-23-sessions.md` (new) — your review report

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `backend/src/db/migrations/002_sessions.sql`
- `backend/src/db/store/sessions.ts`
- `backend/src/db/store/index.ts`
- `backend/src/contracts/sessions.ts`
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none — you write only to `AGENTS/reports/**`.

## What to review

### Migration safety
- File name and order are correct (002 after 001).
- Additive and re-runnable.
- No long locks on a hot table.

### Constraints & integrity
- `session_internal` PK, `session_external` ULID unique.
- `message_internal` PK, `message_external` ULID unique.
- FK: `messages.session_internal` → `sessions.session_internal` with `ON DELETE CASCADE`.
- `role` CHECK in ('user','assistant').
- `compacted_summary` nullable.
- Unique keys match the real identity.

### Indexes
- `idx_messages_session` on (session_internal, message_internal).
- `idx_sessions_updated` on (updated_at DESC).
- Are they sufficient for the queries the store runs?

### Seed and tests
- `backend/src/db/store/sessions.ts` still produces rows that satisfy constraints.
- No test rows left in the DB.

### Security & privacy
- No secrets, tokens, or PII in new columns.
- `content` is user-supplied text — is it stored safely (parameterized queries)?

## Constraints
- **Read-only SQL only.** Do not alter schema or run destructive writes.
- Do not edit product code, migrations, or `.env`.
- Do not `git commit` or `git push`.
- Do not use the `subagent` tool.

## Acceptance criteria
- [ ] All items in §"What to review" addressed.
- [ ] A decision: `APPROVED`, `APPROVED WITH CHANGES`, or `BLOCKED`.
- [ ] If `APPROVED WITH CHANGES` or `BLOCKED`, exact SQL for the required change.
- [ ] Report written to `AGENTS/reports/db-2026-10-23-sessions.md`.

## Verification
- Read the migration end to end.
- Run read-only SQL to confirm the schema matches.
- `npm run schema:check` in `backend/` (if it exists).

## Out of scope
- Any change to product code.
- The pitch, the deck, the video.

## Notes
- Your mailbox is `AGENTS/message/dbmaster/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/dbmaster/<slug>.md` and wait for the decision. Do not proceed without it.
- **Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for backend (database, API design). Read `ROUTER.md` first, then open at most 1–2 skill files per pass.
