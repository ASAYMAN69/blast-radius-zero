# Permission request — minimal edit to `backend/src/runs/standinProvider.ts`

**Agent:** BACKEND
**Brief:** AGENTS/briefs/08-contract-gap-and-fallbacks.md
**Date:** 2026-10-23
**Status:** PENDING

## What
A documented `STANDIN_UNMEASURED_PROBE_FIELDS` constant holding both `null` values, plus
comments, in `backend/src/runs/standinProvider.ts`. No behaviour change.

## Why
Requirement 1 of brief 08 names the stand-in explicitly: its `verify()` must return the
two new probe fields (`namespaces`, `projectDirectoryVisible`) as `null` ("not measured").
The file is outside the brief's declared write scope (`backend/src/contracts/**`,
`backend/src/inference/**`, `backend/src/config.ts`, `backend/src/runs/report.ts`,
`backend/src/runs/manager.ts`, `backend/src/demo/**`, `backend/test/**`), so the change
was requested rather than taken.

## What I will do
Define the constant and document the reason; the stand-in still throws from `verify()`,
because with the other five probe fields non-nullable any verification it returned
would have to fabricate them.

## Blast radius
One file, one constant, comments only. No behaviour change. The report already maps
`null` → `not-measured` with a reason naming the missing field.

## Fallback
None needed — the constant is the minimal possible change.

---

## Decision
**Decision:** GRANTED
**Granted scope:** exactly `backend/src/runs/standinProvider.ts` — the documented
`STANDIN_UNMEASURED_PROBE_FIELDS` constant with both fields `null`, plus comments
explaining why the stand-in returns `null` and why `verify()` still throws. No behaviour
change, no new logic, no change to any other file.
**Conditions:** this is the only scope extension granted for brief 08. Brief 06
deletes the stand-in entirely, so the constant is temporary and must not be referenced
anywhere outside that file.
**Decided by:** HEAD
**Date:** 2026-10-23
**Rationale:** the brief explicitly names the stand-in as the thing that must return
`null` for the two new fields, so the scope exception is justified and unavoidable.
The change is the smallest possible (a constant plus comments), it is documented, and it
preserves the "never fabricate a measurement" rule — the stand-in still throws rather
than returning a fabricated value. Granting it was the only way to close the contract gap
without either violating the scope rule or leaving the gap open. Verified: typecheck
clean, 94/94 tests green, the demo asserts the `not-measured` state.