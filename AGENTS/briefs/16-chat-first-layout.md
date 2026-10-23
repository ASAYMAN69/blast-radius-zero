<DONE>

# 16 — Chat-first layout spec (dark mode, sidebar, chatbox, right panel, toast)

Agent name: DESIGNER. You are DESIGNER. If no name was given to you, STOP and ask.

**Wave:** 8
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 05 (`<DONE>`) and brief 11 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/DESIGNER.md`, then this brief. You are in your **existing session** — you reviewed the console before and you know its structure.

## Goal
Design the **chat-first** layout that replaces the current form-and-run-view console. The user types a task, hits enter, and the agent responds in a full-screen chat. Sessions live in a collapsible left sidebar. The blast-radius report (the product's differentiator) slides in from the right only when needed. Dark mode is first-class.

## Why / context
BRZ is a containment-first control plane for AI agents. The console is the demo, and the rubric scores *Presentation* and *Application of Technology* on a ladder that rewards a console that is "working & well-executed, with features and functionalities working smoothly" and "well thought of". The current console is form-heavy, quick-action-heavy, and complex. The coordinator wants it simplified: **chatbox full screen, sessions on the left, report on the right (on demand)**.

The coordinator's exact words: *"keep runs/sessions in the left, and when a new run deploys, collapse it and make a button do a toast appearance on the session bar. if the ui that pops up during the run needs to show (on the right) then show it but by default make the chatbox screen full screen and only slide the right side ui in when needed."*

Read `AGENTS/CONTEXT.md`, `HACKATHON.md` §7, `JUDGING-CRITERIA.md` §1 and §3, and `docs/design/01-phase1-ui-review.md` (your previous review — carry forward the findings that still apply).

**Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend UI/UX, state management, loading/error states, dark mode, optimization, and security. Read `ROUTER.md` first, then open at most 1–2 skill files per pass. It is a reference, not a dependency — do not copy it into this repo.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/design/02-chat-first-layout.md` (new)

## Read scope
- everything — read the console source, the review, and the hmskills library freely

## Shared / serialized files
- none. You write to `docs/design/**` only. You never edit code.

## Requirements

1. **Dark mode.** Define the token set for both themes (light + dark) as CSS custom properties. Specify: the toggle (button in the top bar), the default (system preference via `prefers-color-scheme`), persistence (localStorage key name), and which elements change (backgrounds, text, borders, accent, the report panel's verdict colors). Provide a transition strategy (no flash of wrong theme on load — use an inline script in `index.html` that sets the class before paint).

2. **Left sidebar — sessions.** Collapsible, with a toggle. Layout: session list (name + last activity), "New session" button, rename/delete per session, active session highlighted. Width: fixed on desktop, overlay on mobile. Empty state: "No sessions yet — start a chat."

3. **Full-screen chatbox.** The chatbox is the main content area. Message bubbles: user (right-aligned, accent) and assistant (left-aligned, neutral). Input bar pinned to the bottom with a send button and a file attach. Streaming: assistant message appears character-by-character (or chunk-by-chunk) with a typing indicator. Auto-scroll to bottom on new message; allow manual scroll with a "scroll to bottom" affordance.

4. **Right panel (slides in on demand).** The blast-radius report (the differentiator) lives here. Default: **collapsed/hidden**. Slides in (from the right, ~240ms ease) when: a run completes, the user clicks "Show report" on a message, or the user clicks a session that has a report. Collapses when: a new run deploys (toast on the sidebar instead), the user clicks "Hide report", or Escape is pressed. When collapsed, the chat takes the full width.

5. **Toast on the session bar.** When a new run deploys, the right panel collapses and a toast appears on the session bar (left sidebar): "Run deployed — [session name]" with a link to open the report. Fades in, auto-dismisses in 4s, max 3 stacked.

6. **Remove unnecessary quick action buttons.** Audit the current console for quick-action buttons that don't earn their place. List each one, its location, and why it should be removed or kept. The coordinator's instruction: "remove unnecessary quick action buttons."

7. **Fix the broken buttons.** The coordinator reports that some frontend buttons don't work. List the buttons you can identify from source (with `file:line`), what they currently do, and what they should do. This is a review finding, not a code change — FRONTEND fixes it.

8. **Dark mode tokens.** Provide the full CSS custom property set for both themes (light + dark), with the values. The dark theme should be a real dark theme (not just inverted colors) — use the hmskills reference for dark mode patterns if applicable.

9. **Accessibility.** Dark mode toggle must be keyboard-accessible, have an aria-label, and respect `prefers-color-scheme`. The sidebar must be keyboard-navigable. The chat input must be focusable on load.

10. **Responsive.** Mobile (<560px): sidebar becomes an overlay (hamburger toggle), chat is full-screen, right panel is a full-screen overlay when open. Desktop: sidebar + chat + right panel (when open).

## Constraints
- **Write one document only.** No code, no CSS, no component edits. You review and specify; FRONTEND implements.
- Do not commit or push. Do not use the `subagent` tool.
- If you cannot determine something from source, say so rather than guessing.

## Acceptance criteria
- [ ] The document covers all ten items above.
- [ ] Dark mode tokens are complete (both themes, all properties).
- [ ] The sidebar, chatbox, right panel, and toast are all specified with dimensions, states, and transitions.
- [ ] The "remove unnecessary buttons" audit lists every button in the current console with a keep/remove verdict and reason.
- [ ] The "broken buttons" section lists every button that doesn't work, with `file:line` and expected behaviour.
- [ ] The layout is implementable by FRONTEND without asking you a question.

## Verification
- The document is readable by a FRONTEND agent who has never seen the console: every section is implementable without asking you a question.
- The dark mode tokens are complete and consistent (no missing property in either theme).
- The responsive breakpoints are specified for every component.

## Out of scope
- Any change to source code, styles, or components.
- The pitch, the deck, the video.
- Any change to `AGENT.md`, `STATE.md`, `HACKATHON.md`, or the harness files.

## Notes
- The coordinator's exact words: *"keep runs/sessions in the left, and when a new run deploys, collapse it and make a button do a toast appearance on the session bar. if the ui that pops up during the run needs to show (on the right) then show it but by default make the chatbox screen full screen and only slide the right side ui in when needed."*
- The reference library at `/mnt/ee/aprojects/hmskills/` has frontend skills for UI/UX, state management, loading/error states, and optimization. Read `ROUTER.md` first, then open at most 1–2 skill files per pass.
- Your mailbox is `AGENTS/message/designer/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/designer/<slug>.md` and wait for the decision. Do not proceed without it.
