<DONE>

# 18 — Chat-first UI: dark mode, sidebar, chatbox, right panel, toast, button fixes

Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.

**Wave:** 9
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 12 (`<DONE>`) and brief 16 (DESIGNER, `<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/FRONTEND.md`, then `docs/design/02-chat-first-layout.md`, then this brief. You are in your **existing session** — you built the console and you know it.

## Goal
Replace the form-and-run-view console with a **chat-first** layout: dark mode, a collapsible session sidebar on the left, a full-screen chatbox, and a right panel that slides in only when needed. Remove unnecessary quick-action buttons. Fix every broken button. The result should be simpler, cleaner, and more usable.

## Why / context
BRZ is a containment-first control plane for AI agents. The console is the demo, and the rubric scores *Presentation* and *Application of Technology* on a ladder that rewards a console that is "working & well-executed, with features and functionalities working smoothly" and "well thought of". The current console is form-heavy, quick-action-heavy, and complex. The coordinator's instruction: *"the website is too complex to use or understand. remove unnecessary quick action buttons. keep runs/sessions in the left, and when a new run deploys, collapse it and make a button do a toast appearance on the session bar. if the ui that pops up during the run needs to show (on the right) then show it but by default make the chatbox screen full screen and only slide the right side ui in when needed."*

Read `AGENTS/CONTEXT.md`, `docs/design/02-chat-first-layout.md` (your spec), and `docs/design/01-phase1-ui-review.md` (your previous review — carry forward the findings that still apply).

**Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend UI/UX, state management, loading/error states, dark mode, optimization, and security. Read `ROUTER.md` first, then open at most 1–2 skill files per pass. It is a reference, not a dependency — do not copy it into this repo.

## Write scope (EXCLUSIVE — do not touch anything else)
- `frontend/**`

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/design/02-chat-first-layout.md` — your layout spec
- `docs/design/01-phase1-ui-review.md` — your previous review
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- `frontend/package.json` → HEAD's file. Do not touch.
- root `package-lock.json` → HEAD's file. Do not touch.

## Requirements

### Dark mode
1. **CSS custom properties** for both themes (light + dark), defined in `frontend/src/styles/tokens.css`. Every color, background, border, and shadow must use a token — no hardcoded colors.
2. **Toggle button** in the top bar. Icon: sun/moon. Clicking toggles the theme.
3. **Default: system preference** (`prefers-color-scheme`). On first load, if no saved preference, use the system's.
4. **Persistence:** save the choice to `localStorage` under `brz_theme`. On load, apply the saved theme before paint (inline script in `index.html` to prevent flash).
5. **Transition:** smooth transition on theme change (150ms ease). Respect `prefers-reduced-motion`.

### Left sidebar — sessions
6. **Collapsible sidebar** on the left. Toggle button in the top bar (hamburger on mobile, collapse/expand on desktop).
7. **Session list**: each session shows its name + last activity. Active session is highlighted.
8. **"New session" button** at the top of the sidebar.
9. **Per-session actions**: rename (inline edit) and delete (with confirmation).
10. **Empty state**: "No sessions yet — start a chat."
11. **Width**: fixed 280px on desktop (≥1024px), overlay (full width) on mobile (<560px).
12. **Keyboard**: arrow keys navigate sessions, Enter selects, Escape closes (mobile overlay).

### Full-screen chatbox
13. **The chatbox is the main content area** — full width when the sidebar is collapsed and the right panel is hidden.
14. **Message bubbles**: user (right-aligned, accent background), assistant (left-aligned, neutral background). Each bubble shows the sender, timestamp, and content.
15. **Input bar pinned to the bottom**: text input + send button + file attach button. Enter sends, Shift+Enter inserts a newline.
16. **Streaming**: assistant message appears chunk-by-chunk with a typing indicator (animated dots). Auto-scroll to bottom on new message; "scroll to bottom" button when scrolled up.
17. **Empty state**: "No messages yet. Start a conversation." with a subtle hint about what BRZ does.

### Right panel (slides in on demand)
18. **Default: hidden.** The chat takes the full width.
19. **Slides in from the right** (240ms ease-out) when: a run completes, the user clicks "Show report" on a message, or the user clicks a session that has a report.
20. **Collapses when**: a new run deploys (toast on the sidebar instead), the user clicks "Hide report", or Escape is pressed.
21. **When collapsed, the chat takes the full width** (no empty space).
22. **Content**: the blast-radius report (verdict, glance tiles, cap meters, disclosures) — the same report panel from the previous console, just in a sliding container.

### Toast on the session bar
23. **When a new run deploys**, the right panel collapses and a **toast appears on the session bar** (left sidebar): "Run deployed — [session name]" with a link to open the report.
24. **Toast behaviour**: fades in, auto-dismisses in 4s, max 3 stacked. Clicking the toast opens the report panel.

### Remove unnecessary quick action buttons
25. **Audit and remove** quick-action buttons that don't earn their place. The coordinator said "remove unnecessary quick action buttons" — the designer's review (F-14 and others) should guide this. Keep only what's essential.

### Fix broken buttons
26. **Every interactive element must be wired and functional.** The coordinator reports that some buttons don't work. The designer's review found specific broken buttons (e.g. F-01: run list unauthorized renders as error instead of the unauthorized state). Fix all of them. Add an acceptance criterion that every button is verified.

### Session management (backend dependency)
27. **Sessions are created, listed, renamed, and deleted.** The session list comes from the backend API (`GET /api/v1/sessions`). Create (`POST`), rename (`PATCH`), delete (`DELETE`).
28. **Each session has a message history.** Messages come from `GET /api/v1/sessions/:id`. New messages are sent via `POST /api/v1/sessions/:id/messages`.
29. **Session compaction.** A "Compact" button in the session menu calls `POST /api/v1/sessions/:id/compact`. Show a loading state during compaction.

### Accessibility
30. Dark mode toggle: keyboard-accessible, `aria-label`, respects `prefers-color-scheme`.
31. Sidebar: keyboard-navigable (arrow keys, Enter, Escape).
32. Chat input: focusable on load, Enter sends, Shift+Enter newline.
33. Right panel: Escape closes.
34. All interactive elements: 44px minimum targets, visible focus.

### Responsive
35. Mobile (<560px): sidebar is an overlay (hamburger toggle), chat is full-screen, right panel is a full-screen overlay when open.
36. Desktop (≥1024px): sidebar + chat + right panel (when open).
37. Tablet (560px–1023px): sidebar collapses to a drawer, chat full-width, right panel slides in as overlay.

## Constraints
- **No new dependencies** beyond what the manifests already list. If you need one, request permission.
- **Do not touch** `backend/**`, `deploy/**`, `docs/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.
- Never render a secret, a token, or an env value.
- **No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write`.**
- All API calls are relative `/api/v1/...` paths.

## Acceptance criteria
- [ ] Dark mode works: toggle, system default, localStorage persistence, no flash of wrong theme.
- [ ] Left sidebar: session list, create, rename, delete, collapsible, keyboard-navigable.
- [ ] Full-screen chatbox: message bubbles, streaming, input bar, auto-scroll.
- [ ] Right panel: slides in on demand, collapses, chat takes full width when collapsed.
- [ ] Toast on session bar when a new run deploys.
- [ ] Unnecessary quick-action buttons removed.
- [ ] **Every button in the frontend works** — verified by clicking each one in the browser.
- [ ] `npm run typecheck --workspace frontend` → clean (both projects).
- [ ] `npm run build --workspace frontend` → success.
- [ ] No horizontal overflow at 390px; no console errors; reduced motion respected.
- [ ] All five (loading, empty, error, success, unauthorized) states present and designed.
- [ ] Screenshots at 1440 and 390 in the summary, including the chatbox, sidebar, right panel, and dark mode.

## Verification
- `npm run typecheck --workspace frontend` → clean
- `npm run build --workspace frontend` → clean
- Run the console in dev mode, walk every state, screenshot each
- Click every button and confirm it does something
- Test dark mode toggle, sidebar collapse, right panel slide, toast
- Test on mobile (390px) and desktop (1440px)

## Out of scope
- The backend, the sandbox, the broker
- `deploy/**`
- The pitch, the deck, the video
- Session compaction (nice-to-have, can be deferred to a follow-up brief)

## Notes
- The design spec is at `docs/design/02-chat-first-layout.md`. Follow it exactly.
- The previous review (`docs/design/01-phase1-ui-review.md`) has 15 findings — carry forward the ones that still apply.
- The backend's session API is being built in parallel by BACKEND (brief 17). Build against the contract in that brief; if it conflicts, the backend contract wins and you report it.
- Your mailbox is `AGENTS/message/frontend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/frontend/<slug>.md` and wait for the decision. Do not proceed without it.
- **Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend (UI/UX, state management, loading/error states, dark mode, optimization, security). Read `ROUTER.md` first, then open at most 1–2 skill files per pass. It is a reference, not a dependency.
