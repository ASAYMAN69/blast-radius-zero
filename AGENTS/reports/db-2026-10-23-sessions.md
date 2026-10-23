# DB Review — sessions and messages schema (brief 19) — 2026-10-23

**Decision:** APPROVED
**Change:** `backend/src/db/migrations/002_sessions.sql` (sessions + messages tables, 2 indexes)
**Reviewer:** DBMASTER

## Change summary

Brief 17 (BACKEND) added two tables for Phase 2 conversation threads: `sessions` (a thread with name, timestamps, nullable compacted summary) and `messages` (turns belonging to a session, with role CHECK and FK cascade). Migration 002 is additive on top of 001_initial and re-runnable. Store layer (`backend/src/db/store/sessions.ts`) and contracts (`backend/src/contracts/sessions.ts`) were reviewed alongside it. No product code was changed by this review.

## Schema delta

| Table | Change | Why |
|-------|--------|-----|
| sessions | new table: `session_internal` PK, `session_external` unique, `name` default, `created_at`/`updated_at`, nullable `compacted_summary` | conversation thread identity |
| messages | new table: `message_internal` PK, `message_external` unique, `session_internal` FK cascade, `role` CHECK, `content`, `created_at` | multi-turn history |
| messages | index `idx_messages_session` on (session_internal, message_internal) | list/count by session in id order |
| sessions | index `idx_sessions_updated` on (updated_at DESC) | session list sorted by recency |

## Migration review

- Order / idempotency: file is `002_sessions.sql`, strictly after `001_initial.sql`; loader regex and ascending-version check pass. All DDL uses `IF NOT EXISTS`, so re-running is a no-op. Each migration runs in its own `BEGIN IMMEDIATE … COMMIT` in the runner, with checksum immutability enforced.
- Locks / backfill: both tables are new; no existing hot table is rewritten, no `ACCESS EXCLUSIVE` lock on a shared table, no backfill.
- Rollback: forward-only by design (consistent with 001). A rollback would be a new migration dropping the two tables; acceptable for Phase 1 pre-launch. No destructive change is present.
- Schema definition updated: there is no separate schema-definition file in this repo (drift is governed by the migration runner's checksum + `schema_migrations`); `npm run schema:check` does not exist in `backend/package.json`, so that verification step is N/A.

## Constraint & integrity review

- `session_internal` is `INTEGER PRIMARY KEY AUTOINCREMENT` (PK). `session_external` is `TEXT NOT NULL UNIQUE` — unique key matches the real external identity.
- `message_internal` is `INTEGER PRIMARY KEY AUTOINCREMENT` (PK). `message_external` is `TEXT NOT NULL UNIQUE`.
- FK `messages.session_internal → sessions.session_internal` declared inline with `ON DELETE CASCADE`; confirmed via `PRAGMA foreign_key_list(messages)` (`on_delete = CASCADE`). Enforcement depends on `PRAGMA foreign_keys = ON`, which `openDatabase` sets on every connection.
- `role` has `CHECK (role IN ('user','assistant'))` — matches the contract's `MessageDetail.role`.
- `compacted_summary` is nullable (`notnull = 0`, no default) — confirmed.
- Invariants live in the DB (unique, check, FK), not only in the store. Store inserts are fully parameterized (`?` placeholders) — no SQL interpolation; `content` is bound as a parameter.

## Index review

- Proposed: `idx_messages_session (session_internal, message_internal)` / Query served: `WHERE session_internal = ? ORDER BY message_internal ASC` (list, updateCompacted) and `WHERE session_internal = ?` (count) / Verdict: APPROVED. `EXPLAIN QUERY PLAN` shows `SEARCH messages USING INDEX idx_messages_session (session_internal=?)` and `SEARCH … USING COVERING INDEX` for count; no temp B-tree for ordering.
- Proposed: `idx_sessions_updated (updated_at DESC)` / Query served: `ORDER BY updated_at DESC` (list) / Verdict: APPROVED. `EXPLAIN` shows `SCAN sessions USING INDEX idx_sessions_updated`.
- `sessions` lookup by `session_external` uses the implicit unique index `sqlite_autoindex_sessions_1`. No speculative or prefix-redundant indexes present.

## Seed / test impact

- The migration ships no seed data. `createSessionStore`/`createMessageStore` inserts satisfy every constraint (external id, NOT NULL fields, role values, FK target).
- No test rows are introduced by the migration; no session/message tests exist in `backend/test/`, so nothing is left behind. The store's parameterized inserts keep `content` safe.
- No secrets in seed or test data.

## Security & privacy

- New columns hold only internal/external ids, a user-chosen display name, timestamps, a role enum, message text, and a compacted summary. No secrets, tokens, password hashes, or PII beyond user-supplied chat text.
- `content` is stored via parameterized statements (verified in `sessions.ts`); no string interpolation into SQL anywhere in the store.
- External ids are the only identifiers returned by the routes (internal ids stay in the store layer).

## Risks (advisory, not blocking)

- Timestamps are stored as `TEXT` ISO-8601 rather than `TIMESTAMPTZ`; this is consistent with every other table in 001_initial (SQLite has no native timestamptz), so no change is required for consistency. If a future migration moves to Postgres, convert to `timestamptz`.
- `session_external`/`message_external` are random 26-char Crockford strings (`ses_`/`msg_` prefixed), not time-ordered ULIDs. Uniqueness is enforced by the DB; if creation-time ordering or ULID shape validation is later required, a `CHECK` constraint and/or ULID generator change would be needed. Not required for Phase 1.
- `name` and `content` have no length cap at the DB level; cap enforcement, if desired, belongs in the route/validation layer. Not a schema blocker.
- `DELETE /api/v1/sessions/:id` explicitly deletes messages before the session; redundant with the cascade but harmless and defensive if `foreign_keys` is ever off.
- `updateCompacted` deletes compacted messages one statement at a time; consider batching in a transaction for performance if sessions grow large. Code-level, not schema.

## Required changes (exact SQL)

None. No SQL changes are required; the schema is approved as written.

## Verification

- Read `backend/src/db/migrations/002_sessions.sql` end to end.
- Applied migrations 1 and 2 to a scratch database (`BRZ_DB_PATH=/tmp/opencode/scratch.db`): `schema version 2 — applied 1, 2`.
- Read-only inspection: `sqlite_master`, `PRAGMA table_info`, `PRAGMA foreign_key_list`, `PRAGMA foreign_key_check` (empty — no violations).
- `EXPLAIN QUERY PLAN` confirmed both indexes serve their named queries with no temp B-tree.
- `npm run schema:check` is not defined in `backend/package.json` (N/A).
- Typecheck: `npm run typecheck --workspace backend` not re-run (no code changed by this review).

## Decision rationale

All items in the brief's review checklist (migration safety, constraints/integrity, indexes, seed/tests, security/privacy) pass. The migration is additive, idempotent, transactional, and correctly ordered; constraints and FK cascade match the real identity; both indexes are justified and verified against the actual store queries; no secrets or unsafe SQL interpolation. Advisory items above do not block approval.