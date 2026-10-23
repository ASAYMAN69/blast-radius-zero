<WORK IN PROGRESS>

# 12 — Phase 1 UI polish (apply the DESIGNER review)

Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.

**Wave:** 5
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 05 (`<DONE>`) and brief 11 (`<DONE>`, DESIGNER's review)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/FRONTEND.md`, then `docs/design/01-phase1-ui-review.md`, then this brief. You are in your **existing session** — you built the console and you know it.

## Goal
Apply the DESIGNER's review findings to the Phase 1 console. The P1 list (3 items, ~45 minutes) is mandatory. The P2 list (2 items, ~45 minutes) is mandatory. The P3 list (7 items, ~60 minutes) is to be done only if time permits, in order.

## Why / context
BRZ is a containment-first control plane for AI agents. The console is the demo, and the rubric scores *Application of Technology* on a ladder where **4/5 requires the demo to be "working and well-executed, with features and functionalities working smoothly"** and the code to be "well thought of". The designer's review found the console is **good, not great**: the structure and the `not measured` treatment are correct, but the density and default-open choices waste the five-second read the report panel is supposed to have.

Read `AGENTS/CONTEXT.md` and `docs/design/01-phase1-ui-review.md` in full before you touch anything.

## Write scope (EXCLUSIVE — do not touch anything else)
- `frontend/**`

## Read scope
- `docs/design/01-phase1-ui-review.md` (your implementation spec)
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none — the manifest is HEAD's and you do not touch it.

## Requirements

Apply these findings, in this order, with the exact change the designer specified:

**P1 (must fix, ~45 min)**
1. **F-01** (`frontend/src/components/RunList.tsx:26`): run-list unauthorized state renders `<ErrorState>`. Change it to `<UnauthorizedState onRetry={...} />` so the unauthorized state is the designed one, not a red error box.
2. **F-04** (`frontend/src/components/ReportPanel.tsx:289`): "What ran" disclosure is open by default. Keep it open only when `report.code.commands.length <= 6`; collapse otherwise, so the five-second read stays five seconds.
3. **F-10** (`frontend/src/components/EventStream.tsx` / `app.css:893`): cap the stream at `min(420px, 50vh)` at 1440px so the report's verdict stays above the fold.

**P2 (should fix, ~45 min)**
4. **F-06** (`frontend/src/components/ReportPanel.tsx:417`): "Containment measurement" should be open by default when `verdict !== 'contained'`.
5. **F-13** (`frontend/src/styles/app.css:1952`): horizontal-scroll hint or column reduction for tables at <560px. Reduce the attempts table to host + verdict at <560px.

**P3 (only if time permits, ~60 min, in this order)**
6. **F-03** (`ReportPanel.tsx:203`): "Files changed" tile tone — set to `'good'` when `agentFiles.length > 0`, or remove the dead ternary.
7. **F-07** (`App.tsx:221`): replace the bare "Loading…" paragraph with `<LoadingState label="Loading…" rows={5} />`.
8. **F-08** (`States.tsx:100`): fix the unauthorized copy — drop the sign-in implication.
9. **F-09** (`ReportPanel.tsx:181`): verify the verdict badge does not shrink (no CSS change required).
10. **F-11** (`app.css:1467`): drop the row tint on denied rows, keep the badge.
11. **F-12** (`app.css:1886`): document the screen-reader read order at ≥1280px.
12. **F-15** (`States.tsx:20`): add `aria-busy="true"` to the loading container.

**Plus the things the HEAD wants on top of the review:**
13. The `incomplete` / `not-measured` path must be first-class in the report panel — the HEAD's priority correction from `AGENTS/message/frontend/not-measured-is-the-live-case.md`. Make `not-measured` visually distinct from `0`, and make `incomplete` read as honesty, not failure. (The HEAD's note is in your mailbox.)
14. Add a fixture that mirrors the real current output (standin / incomplete / not-measured) alongside the contained fixture, clearly labelled.

## Constraints
- **No new dependencies.** If you need one, request permission.
- **Do not touch** `backend/**`, `deploy/**`, `docs/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.
- Never render a secret, a token, or an env value.

## Acceptance criteria
- [ ] P1 items (F-01, F-04, F-10) applied and verified.
- [ ] P2 items (F-06, F-13) applied and verified.
- [ ] P3 items applied only if time permits; say in the summary which were done and which were skipped.
- [ ] The `not-measured` / `incomplete` path is first-class and visually distinct from `0` and from `contained`.
- [ ] A fixture mirrors the real current output (`standin` / `incomplete` / `not-measured`).
- [ ] `cd frontend && npm run typecheck` passes (both projects).
- [ ] `cd frontend && npm run build` succeeds.
- [ ] No horizontal overflow at 390px; no console errors; reduced motion still respected.
- [ ] Screenshots at 1440 and 390 in the summary, including the report panel before and after.

## Verification
- `cd frontend && npm run typecheck` → clean
- `cd frontend && npm run build` → clean
- Run the console in fixture mode, walk all four fixtures, screenshot each
- Confirm the P1 items are visibly different from before (before/after screenshots)
- Check `git status --short` — only `frontend/**` modified

## Out of scope
- The backend, the sandbox, the broker
- `deploy/**`
- The pitch, the deck, the video

## Notes
- The designer's review said "screenshots could not be rendered in this session" — they were taken by FRONTEND and are in `AGENTS/completion/05-frontend-phase1/`. Re-use them and add new ones for the changes.
- Your mailbox is `AGENTS/message/frontend/`. **Check it — there is a priority correction from the HEAD.**
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/frontend/<slug>.md` and wait for the decision. Do not proceed without it.
