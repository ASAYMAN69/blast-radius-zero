<WORK IN PROGRESS>

# 11 — UI design review of the Phase 1 console

Agent name: DESIGNER. You are DESIGNER. If no name was given to you, STOP and ask.

**Wave:** 4
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 05 (FRONTEND, `<DONE>`) — the console exists and is verified

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/DESIGNER.md`, then this brief. You are the **first launch** of this agent, so read the standing card once and then rely on your session.

## Goal
Review the Phase 1 operator console that BACKEND and FRONTEND just built, and write a **concrete, implementable polish spec** — not opinions, not a mood board. Every finding must name the file, the state, and the exact change. The output is a document BACKEND or FRONTEND can implement in one pass without asking you a question.

## Why / context
BRZ is a containment-first control plane for AI agents: submit a task → the control plane dispatches real execution into an isolated sandbox → you get the result plus a blast-radius report proving the blast radius was zero.

The console already works. It has five designed states, four fixture runs, a live event stream, and a blast-radius report panel. The HEAD's review of the screenshots found it **readable in five seconds and deliberate** — but the rubric's *Presentation* ladder rewards a console that is not just working but **well-executed**, and the *Application of Technology* ladder rewards code that is "well thought of". A DESIGNER review closes the gap between "it works" and "it is well done".

Read `AGENTS/CONTEXT.md`, `HACKATHON.md` §7 (guidelines, submission), `JUDGING-CRITERIA.md` §1 (Presentation ladder) and §3 (Application of Technology ladder).

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/design/01-phase1-ui-review.md` (new)

## Read scope
- Everything — read the console source and the screenshots freely

## Shared / serialized files
- none. You write to `docs/design/**` only. You never edit code.

## Requirements

1. **Screenshots first.** Open the console at 1440px and 390px. Capture the submit screen, the run view (live and completed), the report panel, and all five states. Paste them into the review. If you cannot run the console, say so and review from the source.
2. **Audit against the rubric.** For each of the four criteria (Presentation, Business Value, Application of Technology, Originality), list what the console currently does that helps and what hurts.
3. **Findings, each one implementable.** Format: `file:line` · current behaviour · expected behaviour · severity (P1 blocking / P2 important / P3 polish). No finding without a location. No finding that says "make it nicer" without saying how.
4. **The five states, audited.** Loading, empty, error, success, unauthorized — each one reviewed for copy, layout, and recoverability. A state that is missing or accidental is a P1.
5. **The report panel, audited.** It is the differentiator. Review the verdict, the glance tiles, the cap meters, the disclosures, the timeline, and the "not measured" treatment. Say what is right and what is wrong, with pixel-level specifics.
6. **Accessibility.** Contrast, focus order, hit targets, keyboard reachability, screen-reader labels for anything non-obvious. Name the specific element and the specific failure.
7. **Responsiveness.** 390px, 768px, 1440px. What breaks, what shifts, what overflows.
8. **Motion.** What animates, at what duration, and whether it respects `prefers-reduced-motion`. Name each animation.
9. **A prioritised polish list.** P1 (must fix before the demo), P2 (should fix), P3 (nice to have). Each item references the finding number.
10. **A time budget for the polish pass.** How long the P1 and P2 items take, so the coordinator can schedule them.

## Constraints
- **Write one document only.** No code, no CSS, no component edits. You review; FRONTEND implements.
- Do not commit or push. Do not use the `subagent` tool.
- If you cannot run the console or take screenshots, say so in the document rather than skipping the findings.

## Acceptance criteria
- [ ] The document covers all ten items above.
- [ ] Every finding has a `file:line` and a severity.
- [ ] The P1 list is short enough to be done in one pass (under ~2 hours).
- [ ] The report panel audit has a verdict: *good as is* / *needs work* / *needs rework*.
- [ ] Written to `docs/design/01-phase1-ui-review.md` only.

## Verification
- The document is readable by a FRONTEND agent who has not seen the console: every finding is implementable without asking you a question.
- No finding contradicts another.
- The polish time estimate is realistic.

## Out of scope
- Any change to source code, styles, or components.
- The pitch, the deck, the video.
- Any change to `AGENT.md`, `STATE.md`, `HACKATHON.md`, or the harness files.

## Notes
- The console's `report.ts` types are frozen in `backend/src/contracts/`. The `not-measured` treatment is a type-level distinction — review whether the UI honours it.
- The brief 05 summary said "11 screenshots" but only 11 were listed. Check whether all five states were captured.
- Your mailbox is `AGENTS/message/designer/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/designer/<slug>.md` and wait for the decision. Do not proceed without it.
