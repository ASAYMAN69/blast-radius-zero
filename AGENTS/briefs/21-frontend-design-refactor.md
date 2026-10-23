<DONE>

# 21 — Frontend design refactor using design skills

Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.

**Wave:** 11
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 18 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/FRONTEND.md`, then this brief. You are in your **existing session** — you built the console and you know it. Also read `skills/frontend-design/SKILL.md` and `skills/ui-ux-pro-max/SKILL.md` before writing any code.

## Goal
Refactor the frontend to look like a **real, polished product** — not a hackathon prototype. Apply design skills from the `skills/` directory. Fix every broken button. Make the UI clean, clear, and usable.

## Why / context
BRZ is a containment-first control plane for AI agents. The console is the demo, and the rubric scores *Presentation* and *Application of Technology* on a ladder that rewards a console that is "working & well-executed, with features and functionalities working smoothly" and "well thought of". The current console works but looks like a prototype — inconsistent spacing, generic styling, no visual hierarchy. The coordinator wants it to look like a real product.

Read `AGENTS/CONTEXT.md`, `docs/design/02-chat-first-layout.md`, `docs/design/01-phase1-ui-review.md`, and the skills in `skills/frontend-design/`, `skills/ui-ux-pro-max/`, `skills/impeccable/`, `skills/high-end-visual-design/`, `skills/redesign-existing-projects/`, `skills/emil-design-eng/`.

**Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend (UI/UX, state management, loading/error states, dark mode, optimization, security). Read `ROUTER.md` first, then open at most 1–2 skill files per pass. It is a reference, not a dependency.

## Write scope (EXCLUSIVE — do not touch anything else)
- `frontend/**`

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/design/02-chat-first-layout.md`
- `docs/design/01-phase1-ui-review.md`
- `skills/frontend-design/SKILL.md`
- `skills/ui-ux-pro-max/SKILL.md`
- `skills/impeccable/SKILL.md`
- `skills/high-end-visual-design/SKILL.md`
- `skills/redesign-existing-projects/SKILL.md`
- `skills/emil-design-eng/SKILL.md`
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- `frontend/package.json` → HEAD's file. Do not touch.
- root `package-lock.json` → HEAD's file. Do not touch.

## Requirements

### Design skills to apply
1. **Read `skills/frontend-design/SKILL.md`** — apply its principles for distinctive, production-grade interfaces.
2. **Read `skills/ui-ux-pro-max/SKILL.md`** — apply its UI/UX intelligence (color systems, typography, spacing, interaction states, accessibility).
3. **Read `skills/impeccable/SKILL.md`** — apply its design/audit/polish principles.
4. **Read `skills/high-end-visual-design/SKILL.md`** — apply its high-end agency design standards.
5. **Read `skills/redesign-existing-projects/SKILL.md`** — apply its audit and upgrade methodology.
6. **Read `skills/emil-design-eng/SKILL.md`** — apply its UI polish and component design principles.

### Design improvements
7. **Visual hierarchy.** The chatbox is the star. The sidebar is secondary. The report panel is the differentiator. Make this hierarchy obvious through spacing, type scale, and color.
8. **Typography.** Use a proper type scale (not just `--text-sm` everywhere). Headings should be distinct from body. The report panel should have its own typographic rhythm.
9. **Spacing rhythm.** Consistent spacing throughout. No arbitrary pixel values. Use the token scale (`--space-1` through `--space-7`).
10. **Color system.** The dark mode and light mode should both feel intentional, not just inverted. Accent colors should be distinct and purposeful.
11. **Interaction states.** Every button, link, and input must have: hover, focus, active, disabled states. Focus rings must be visible.
12. **Empty states.** Every empty state should be helpful, not just "No data". Include a next action.
13. **Loading states.** Skeletons or spinners should match the content shape. No generic spinners where a skeleton would be better.
14. **Error states.** Red-bordered cards with a retry button. The error message should be helpful, not just "Something went wrong".
15. **Transitions.** Smooth, purposeful transitions. No janky animations. Respect `prefers-reduced-motion`.

### Button fixes (the coordinator reports broken buttons)
16. **Audit every button.** Click each one. If it doesn't do what its label says, fix it. The designer's review listed 16 buttons with keep/remove verdicts — apply them.
17. **Verify every button works.** Add a manual checklist in the summary: button name, what it does, verified (yes/no).

### Remove unnecessary quick action buttons
18. **Remove** buttons that don't earn their place. The designer's review identified several: "Refresh" (run list), "← All runs", "Replay", "Dispatch run" label, etc. Remove them and replace with better UX patterns.

### Accessibility
19. **Keyboard navigation** for the sidebar, chatbox, and report panel.
20. **Screen reader labels** for non-obvious elements.
21. **Focus management** — when the right panel slides in, focus moves to it; when it closes, focus returns.
22. **Color contrast** — WCAG AA minimum (4.5:1 for text, 3:1 for large text).

### Responsive
23. **Mobile (<560px):** sidebar is an overlay, chat is full-screen, right panel is a full-screen overlay.
24. **Tablet (560–1023px):** sidebar collapses to a drawer, chat full-width, right panel slides in as overlay.
25. **Desktop (≥1024px):** sidebar + chat + right panel (when open).

## Constraints
- **No new dependencies.** If you need one, request permission.
- **Do not touch** `backend/**`, `deploy/**`, `docs/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.
- Never render a secret, a token, or an env value.
- **No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write`.**
- All API calls are relative `/api/v1/...` paths.

## Acceptance criteria
- [ ] Dark mode: toggle, system default, localStorage, no flash of wrong theme. Both themes look intentional, not just inverted.
- [ ] Left sidebar: session list, create, rename, delete, collapsible, keyboard-navigable, empty state.
- [ ] Full-screen chatbox: message bubbles, streaming indicator, input bar, auto-scroll.
- [ ] Right panel: slides in on demand, collapses, chat takes full width when collapsed.
- [ ] Toast on session bar when a new run deploys.
- [ ] Unnecessary quick-action buttons removed.
- [ ] **Every button in the frontend works** — verified by clicking each one.
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
- **Reference library.** `/mnt/ee/aprojects/hmskills/` contains markdown skills for frontend (UI/UX, state management, loading/error states, dark mode, optimization, security). Read `ROUTER.md` first, then open at most 1–2 skill files per pass.
- The coordinator's standing instruction is **"never settle for less."** A bar that lives only in a chat message is not a bar.
