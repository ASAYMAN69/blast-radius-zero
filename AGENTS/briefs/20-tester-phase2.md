<WORK IN PROGRESS>

# 20 — Phase 2 verification: chat-first UI and sessions

Agent name: TESTER. You are TESTER. If no name was given to you, STOP and ask.

**Wave:** 10
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** briefs 17 and 18 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/TESTER.md`, then this brief. You are in your **existing session** — you verified Phase 1 before and you know the codebase.

## Goal
Independently verify that the Phase 2 changes (chat-first UI, dark mode, session sidebar, sessions API, multi-turn messaging) work correctly and did not break Phase 1. Verdict: PASS, PASS WITH RISKS, or FAIL.

## Why / context
BRZ is a containment-first control plane for AI agents. Phase 2 added a chat-first UI (dark mode, collapsible session sidebar, full-screen chatbox, right panel that slides in on demand, toast on session bar), session management (create/list/rename/delete), multi-turn messaging (each user message triggers a run), and session compaction. Phase 1 (sealed sandbox, containment report, demo) must not have regressed.

Read `AGENTS/CONTEXT.md`, `HACKATHON.md` §3, and `JUDGING-CRITERIA.md`.

## Write scope (EXCLUSIVE — do not touch anything else)
- `AGENTS/reports/test-2026-10-23-phase2.md` (new) — your report

You may **read** everything. You may **run** anything. You may **not** edit product code, migrations, `.env`, or anything else.

## Read scope
- everything

## Shared / serialized files
- none. You are read-only on product code and write only to `AGENTS/reports/**`.

## What to verify

### A. Phase 1 regression (nothing broke)
1. All 91 backend tests still pass.
2. The offline demo still exits 0 with verdict `contained`.
3. The sealed sandbox still works (secret hygiene, no egress, caps, lifecycle).
4. The report panel still renders correctly (5 fixtures).
5. Typecheck clean on both workspaces.

### B. Dark mode
6. Toggle switches between light and dark. Persisted to `localStorage` under `brz_theme`.
7. Default follows `prefers-color-scheme`. No flash of wrong theme on load.
8. All components render correctly in both themes (no invisible text, no broken contrast).

### C. Session sidebar
9. Create a session → appears in the sidebar.
10. Rename a session → name updates.
11. Delete a session → removed from list.
12. Sidebar collapses/expands. Keyboard navigation works (arrow keys, Enter, Escape).
13. Empty state: "No sessions yet — start a chat."

### D. Chat UI
14. Full-screen chatbox: message bubbles, streaming indicator, input bar, auto-scroll.
15. User sends a message → assistant responds.
16. Right panel slides in on demand (report, run details).
17. Right panel collapses on "Hide report" or Escape. Chat takes full width when collapsed.
18. Toast appears on the session bar when a new run deploys.

### E. Sessions API
19. `POST /api/v1/sessions` → create.
20. `GET /api/v1/sessions` → list, ordered by updated_at DESC.
21. `GET /api/v1/sessions/:id` → full detail with messages.
22. `PATCH /api/v1/sessions/:id` → rename.
23. `DELETE /api/v1/sessions/:id` → 204, cascades.
24. `POST /api/v1/sessions/:id/compact` → compacts old messages.
25. `POST /api/v1/sessions/:id/messages` → creates user message, triggers run, returns runId.

### F. Multi-turn
26. Send a follow-up message → agent responds with context from prior turns.
27. Session history is preserved across page reloads.

### G. Hygiene
28. No absolute backend URLs, no `VITE_` secrets, no dangerous DOM APIs.
29. No horizontal overflow at 390px; reduced motion respected.
30. No console errors or React warnings.

### H. The rubric
31. For each of the four criteria, state what the console currently does that helps and what hurts, and give a score.

## Constraints
- **Read-only on product code.** You may not edit anything. If you find a bug, report it; do not fix it.
- **No destructive SQL, no schema changes, no migrations.**
- **No `git commit` or `git push`.** No `subagent` tool.
- **No secrets in your report.** Paths and line numbers only.
- If you cannot verify something, say why. Never mark it PASS by assumption.

## Acceptance criteria
- [ ] Every item in §A–§H is addressed, with evidence for each.
- [ ] A verdict: PASS, PASS WITH RISKS, or FAIL.
- [ ] P0/P1/P2/P3 findings with repro, expected, actual, suspected area, suggested owner.
- [ ] A "Not tested / limitations" section.
- [ ] A recommendation: ship / fix first / re-test after.
- [ ] Written to `AGENTS/reports/test-2026-10-23-phase2.md` only.

## Verification
- All commands you ran, with their output, pasted into the report.
- `git status --short` → only `AGENTS/reports/test-2026-10-23-phase2.md` should be new/modified by you.

## Out of scope
- Any change to product code, migrations, or `.env`.
- Any change to the harness, the design doc, or the briefs.
- The pitch, the deck, the video.

## Notes
- The design doc is at `docs/architecture/02-phase1-design.md`. The chat-first layout spec is at `docs/design/02-chat-first-layout.md`.
- Your mailbox is `AGENTS/message/tester/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/tester/<slug>.md` and wait for the decision. Do not proceed without it.
- **Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend (UI/UX, state management, loading/error states, dark mode, optimization). Read `ROUTER.md` first, then open at most 1–2 skill files per pass.
- The coordinator's standing instruction is **"never settle for less."** A verdict of PASS means you would defend it in a room of judges.
