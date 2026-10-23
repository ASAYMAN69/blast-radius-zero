<DONE>

# 14 — Fix the frontend type mirror (P1 from the TESTER report)

Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.

**Wave:** 7
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 12 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/FRONTEND.md`, then this brief. You are in your **existing session** — you built the console and you know the mirror.

## Goal
Bring `frontend/src/lib/types.ts` back in sync with `backend/src/contracts/*`. The TESTER flagged it as a P1: the mirror still carries `'standin'` in `SandboxProviderKind` and is missing `'provider.rotated'` in `RunEventType`, both of which brief 06 removed/added in the backend.

## Why / context
The backend contract is the source of truth for the wire format. FRONTEND hand-copies it into `frontend/src/lib/types.ts`, and a drift check in CI compares the two files' exported type names. The types are currently stale by two members:

- `SandboxProviderKind` in the backend is now `'bwrap' | 'vultr-vm'` (the `'standin'` member was removed when the sealed tier landed). FRONTEND's mirror still has `'bwrap' | 'vultr-vm' | 'standin'`.
- `RunEventType` in the backend now includes `'provider.rotated'` (added in brief 06). FRONTEND's mirror does not.

This is a contract-correctness issue, not a cosmetic one. The mirror drifts further with every change, and the drift check is the only thing catching it.

## Write scope (EXCLUSIVE — do not touch anything else)
- `frontend/src/lib/types.ts`

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `backend/src/contracts/sandbox.ts` — the authoritative `SandboxProviderKind`
- `backend/src/contracts/events.ts` — the authoritative `RunEventType`
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none.

## Requirements
1. Remove `'standin'` from the `SandboxProviderKind` union in `frontend/src/lib/types.ts` and delete the deviation comment block that explains it (the deviation is no longer in effect).
2. Add `'provider.rotated'` to the `RunEventType` union in `frontend/src/lib/types.ts`.
3. Update the offline fixture that shows a `provider: 'bwrap'` / `verdict: 'contained-with-denials'` run so it reflects the sealed tier's actual output — or, if you already added a stand-in fixture in brief 12, leave it and remove only the stale union member. Do not add new fixtures; just make the existing ones consistent.
4. Do not change any other type, any component, or any style. This is a mirror sync, not a redesign.

## Constraints
- **Strict TypeScript.** `npm run typecheck --workspace frontend` must pass after the change.
- **No dependencies.** No new imports, no new packages.
- **Do not touch** `backend/**`, `deploy/**`, `docs/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.

## Acceptance criteria
- [ ] `frontend/src/lib/types.ts` `SandboxProviderKind` is exactly `'bwrap' | 'vultr-vm'`.
- [ ] `frontend/src/lib/types.ts` `RunEventType` includes `'provider.rotated'`.
- [ ] `npm run typecheck --workspace frontend` → clean (both projects).
- [ ] `npm run build --workspace frontend` → success.
- [ ] The drift check (exported type names on both sides) still passes: 73 = 73, or the new count after the change.
- [ ] No console errors, no broken fixtures.

## Verification
- `npm run typecheck --workspace frontend` → clean
- `npm run build --workspace frontend` → clean
- `git diff --stat` → only `frontend/src/lib/types.ts` (and fixtures if you changed them)
- `npm run dev --workspace frontend` → open the console, confirm all fixtures render

## Out of scope
- The backend, the sandbox, the broker
- `deploy/**`
- The pitch, the deck, the video
- Any change to the type mirror beyond the two members above

## Notes
- The design doc's `ContainmentVerification` and `IsolationFact` are the source of truth for the report types. The two new nullable fields (`namespaces`, `projectDirectoryVisible`) are already in your mirror — do not remove them.
- Your mailbox is `AGENTS/message/frontend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/frontend/<slug>.md` and wait for the decision. Do not proceed without it.
