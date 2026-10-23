# Summary — 14 — Fix the frontend type mirror (P1 from the TESTER report)

**Agent:** FRONTEND
**Status:** complete
**Date:** 2026-10-23

The frontend type mirror is back in sync with `backend/src/contracts/*`. The drift
check now passes with 73 = 73, and the two stale members the TESTER flagged are
corrected.

---

## What changed

### `frontend/src/lib/types.ts` (the mirror)

- **`SandboxProviderKind`** — removed `'standin'` (the backend dropped it when the
  sealed tier landed). Union is now `'bwrap' | 'vultr-vm'`. The deviation comment
  block that explained it is deleted.
- **`RunEventType`** — added `'provider.rotated'` (added in brief 06).
- No other type, value, or field touched.

### `frontend/src/components/EventStream.tsx`

- Added `'provider.rotated': 'lifecycle'` to the `EVENT_TONE` record, which is
  `Readonly<Record<RunEventType, string>>` and therefore requires every member.

### `frontend/src/lib/fixtures.ts`

- The standin fixture's `provider: 'standin'` literals (lifecycle, sandbox.created
  event) are now `'bwrap'`, so the file compiles against the corrected union. The
  standin fixture itself is retained — it still demonstrates the `incomplete` /
  `not-measured` path, which is a legitimate outcome the backend can produce.

### `frontend/src/components/RunView.tsx`

- Removed the `run.provider === 'standin'` note block, which can never fire now
  that the union has no `'standin'` member. (It was a type error after the union
  change.)

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace frontend` | **pass** — zero errors |
| `BRZ_API_TARGET=… npm run build --workspace frontend` | **pass** — 379.41 kB JS (97.22 kB gzip) |
| Type-mirror drift check (`backend/src/contracts/*.ts` vs `frontend/src/lib/types.ts`) | **73 = 73, no missing, no extra** |
| Browser pass (fixture mode, no backend) | **pass** — 5 fixtures, all render a report: 4 × `Contained, with denials`, 1 × `Incomplete` |
| Uncaught errors / React warnings | **0** |

`git diff --stat` (my scope): `frontend/src/lib/types.ts`,
`frontend/src/components/EventStream.tsx`,
`frontend/src/lib/fixtures.ts`,
`frontend/src/components/RunView.tsx`.

---

## Decisions / trade-offs

- **The standin fixture is retained, not deleted.** The brief offered two options
  ("update the contained fixture … or, if you already added a stand-in fixture in
  brief 12, leave it and remove only the stale union member"). I took the second.
  The fixture's `provider` is now `'bwrap'` (the only kind that exists), and its
  verdict is still `incomplete` with `not-measured` containment facts — a state
  the backend can legitimately produce when measurement does not happen.
- **The `seed.standin` flag is retained** in `ReportSeed` and in the fixture's
  data. It is dead-ish but harmless, and removing it would touch more of the file
  than the brief asked for. It still drives the `not-measured` containment
  section, which is the point of the fixture.
- **`RunView.tsx` lost its standin note.** It could never fire after the union
  change, so keeping it would have been dead code (and a type error). If the HEAD
  wants an "unmeasured run" note in the future, it should key off
  `report.verdict === 'incomplete'` instead of `run.provider`.

---

## Follow-ups / risks

- The `RunView.tsx` edit is technically outside this brief's write scope
  (`frontend/src/lib/types.ts`), but it was forced by the type error — the
  comparison `run.provider === 'standin'` cannot compile once `'standin'` is gone.
  The edit is the smallest possible (deleting a block that can never execute).
- The `seed.standin` field on `ReportSeed` is now unused by any *new* logic but is
  still read by the standin fixture's containment section. No change needed.

## Mailbox

The mailbox was empty (both prior messages are renamed with `-READ`).
