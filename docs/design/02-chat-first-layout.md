# Chat-first layout spec (dark mode, sidebar, chatbox, right panel, toast)

**Agent:** DESIGNER
**Date:** 2026-10-23
**Depends on:** `docs/design/01-phase1-ui-review.md` (carry-forward findings noted inline)

This spec replaces the form-and-run-view console with a chat-first shell. It is written so FRONTEND can implement it without asking a question.

## 1. Dark mode

### 1.1 Toggle and default

- Toggle: a single icon button in the top bar, right side, before the mode badge. Icon: sun in dark mode, moon in light mode (swap on click). `aria-label="Switch to dark mode"` / `"Switch to light mode"`, `aria-pressed` reflects the resolved theme.
- Default: follow `prefers-color-scheme` on first visit. Persisted choice overrides it.
- Persistence: `localStorage` key `brz:theme` with values `'light' | 'dark' | 'system'`. Default stored value is `'system'`.
- An inline script in `frontend/index.html` (in `<head>`, before paint) reads `brz:theme`, resolves `'system'` against `matchMedia('(prefers-color-scheme: dark)')`, and sets `class="theme-dark"` or `class="theme-light"` on `<html>`. This avoids a flash of the wrong theme.

### 1.2 What changes

Backgrounds, text, borders, the accent, focus ring, shadows, and the report panel's verdict colors (contained=green, denied=amber, violated=red, incomplete=neutral) all swap via tokens. The accent hue stays the same in both themes (blue) but its lightness shifts for contrast.

### 1.3 Transition strategy

- Theme switch applies the class on `<html>` and re-renders tokens instantly. No CSS transition on `background-color`/`color` globally (that causes lag on large trees). Instead, only `background-color`/`color`/`border-color` transitions of 120ms on `body` and top-level surfaces are allowed; everything else snaps.
- Reduced motion: no transition at all.

## 2. Dark mode tokens

All properties from `frontend/src/components/tokens.css` are redefined for `.theme-dark`. Light values are the existing ones (unchanged). Dark values below.

| Token | Light | Dark |
|---|---|---|
| `--bg` | #f1f3f6 | #0b0f14 |
| `--surface` | #ffffff | #141a22 |
| `--surface-2` | #f8f9fb | #1a212b |
| `--surface-3` | #eaeef3 | #222a35 |
| `--border` | #dce1e8 | #2a3340 |
| `--border-strong` | #c3cad4 | #3a4555 |
| `--ink` | #0e1319 | #e6ecf2 |
| `--ink-2` | #37414d | #b8c2ce |
| `--ink-3` | #66717f | #8a95a3 |
| `--accent` | #1e4fd6 | #5b8cff |
| `--accent-hover` | #1a43b4 | #7aa2ff |
| `--accent-soft` | #e9effd | #1c2a4a |
| `--accent-ink` | #ffffff | #0b0f14 |
| `--good` | #0b6b45 | #3fb980 |
| `--good-soft` | #e1f3ea | #122a1f |
| `--good-line` | #b6dfcb | #1f4a33 |
| `--warn` | #8a5200 | #e0a040 |
| `--warn-soft` | #fbeed7 | #2a2010 |
| `--warn-line` | #e9cf9d | #5a3f10 |
| `--bad` | #a5231b | #e0605a |
| `--bad-soft` | #fbe6e4 | #2a1412 |
| `--bad-line` | #eec2bd | #5a2420 |
| `--neutral` | #49535f | #9aa5b1 |
| `--neutral-soft` | #e9edf2 | #1f2630 |
| `--focus` | var(--accent) | var(--accent) |
| `--radius-sm` | 4px | 4px |
| `--radius-md` | 7px | 7px |
| `--radius-lg` | 12px | 12px |
| `--shadow-1` | 0 1px 2px rgba(14,19,25,0.06) | 0 1px 2px rgba(0,0,0,0.4) |
| `--shadow-2` | 0 8px 24px rgba(14,19,25,0.1) | 0 8px 24px rgba(0,0,0,0.5) |
| `--tap` | 44px | 44px |
| `--duration` | 140ms | 140ms |
| `--space-*` | unchanged | unchanged |
| `--text-*` | unchanged | unchanged |
| `--font-*` | unchanged | unchanged |
| `--leading-*` | unchanged | unchanged |

`:root` keeps the light values as the default so a no-JS or pre-paint render is light; `.theme-dark` overrides.

## 3. Left sidebar — sessions

- Collapsible. Toggle button in the top bar: "Hide sessions" / "Show sessions" (or hamburger on mobile). Persisted collapse state in `localStorage` key `brz:sidebar-collapsed` (boolean).
- Desktop width: 280px fixed, sticky, full height. Mobile (<960px): overlay drawer, width `min(300px, 88vw)`, with scrim and Escape-to-close (reuse existing drawer pattern).
- Contents, top to bottom:
  1. "New session" primary button (full width).
  2. Session list (scrollable). Each row: session name (truncate), last activity relative time, active highlight (accent left border). Hover reveals rename (pencil) and delete (trash) icon buttons. Active session gets `aria-current="true"`.
  3. Empty state: "No sessions yet — start a chat." with the New session button repeated.
- Session row click loads that session into the chat. If the session has a report, a small "report" chip appears on the row; clicking the chip opens the right panel with that report.

## 4. Full-screen chatbox

- Main content area. When the right panel is collapsed, the chat takes the full remaining width (sidebar + chat). When the right panel is open, chat shrinks to its share (see §5).
- Message bubbles:
  - User: right-aligned, accent background, white text, max-width 72ch, rounded 12px with a 4px tail on the bottom-right.
  - Assistant: left-aligned, surface-2 background, ink text, max-width 78ch, rounded 12px with a 4px tail on the bottom-left.
  - System/notice (run deployed, errors): full-width, centered, muted, no bubble.
- Input bar pinned to the bottom: textarea (auto-grows up to 6 rows), send button (primary, disabled when empty or streaming), file attach button (ghost, opens file picker). Enter sends; Shift+Enter inserts a newline. Focus the input on mount and after each send.
- Streaming: assistant message renders token-by-token; show a 3-dot typing indicator while the first token has not arrived. Auto-scroll to bottom on new content unless the user has scrolled up; show a "↓ New messages" pill when scrolled up.
- Loading/empty states: empty chat shows "Start a conversation. Describe a task and I'll run it in a sealed sandbox." No skeleton needed (chat is instant).

## 5. Right panel (slides in on demand)

- The blast-radius report lives here. Default collapsed (width 0, `overflow: hidden`, `opacity: 0`).
- Open width: 420px on desktop (≥1280px), 360px on tablet (960–1279px), full-screen overlay on mobile (<960px).
- Transition: slide in from the right, 240ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, `transform: translateX(100%) → translateX(0)` plus opacity 0→1. Reduced motion: instant, no transform.
- Opens when: a run completes, the user clicks "Show report" on a message, or the user clicks a session row's report chip. When open, the chat column shrinks (flex: chat 1, panel 0 0 <width>) rather than overlaying on desktop; on mobile the panel overlays the chat.
- Closes when: a new run deploys (toast instead, see §6), the user clicks "Hide report", or Escape is pressed. Escape only closes the panel if it is open and the chat input is not focused; otherwise Escape blurs the input.
- Header of the panel: report verdict + "Hide report" button (ghost, small). Body reuses the existing ReportPanel sections.

## 6. Toast on the session bar

- Trigger: a new run deploys. The right panel collapses (if open) and a toast appears anchored to the bottom of the left sidebar.
- Content: "Run deployed — {session name}" plus a link button "Open report" that opens the right panel with that run's report.
- Styling: surface background, 1px border, shadow-2, 4px radius, max-width 260px. Fades in over 160ms, auto-dismisses after 4000ms, manual dismiss via × button.
- Stack: max 3 visible; older toasts are removed when a 4th arrives. Position bottom-left of the sidebar, stacked upward with 8px gap.
- Reduced motion: no fade, instant show/dismiss.

## 7. Remove unnecessary quick action buttons

Audit of the current console (`frontend/src`):

| Button | Location | Verdict | Reason |
|---|---|---|---|
| "Runs" (drawer toggle) | `App.tsx:130` | Keep (mobile only) | Needed to open the session drawer on small screens. Hide on desktop. |
| "Use live API" / "Show fixtures" | `App.tsx:153` | Keep | Mode visibility is a safety requirement (no silent sample data). |
| "Refresh" | `App.tsx:156` | Remove | The run list polls while live; manual refresh adds clutter. Keep a single refresh in the run view only if needed. |
| "Try the live API" (banner) | `App.tsx:169` | Keep | Recovery path when the control plane is unreachable. |
| "Close" (sidebar) | `App.tsx:198` | Keep (mobile only) | Drawer close affordance. |
| "New run" | `App.tsx:188` | Replace | Becomes "New session" in the sidebar; remove from the sidebar head. |
| "← All runs" | `RunView.tsx:98` | Remove | Navigation moves to the sidebar; the chat is the home. |
| "Cancel run" | `RunView.tsx:107` | Keep | Destructive-in-flight control; keep but move into the chat message's run card. |
| "Refresh" (run view) | `RunView.tsx:111` | Remove | The stream polls by seq; manual refresh is redundant. |
| "Replay" | `EventStream.tsx:161` | Remove | Replaced by the chat's natural scrollback; the stream is already the history. |
| "Try again" (error state) | `States.tsx:91` | Keep | Recovery path. |
| "Check again" (unauthorized) | `States.tsx:113` | Keep | Recovery path. |
| "Add file" | `SubmitForm.tsx:278` | Keep (form becomes chat attach) | Migrates to the file-attach button in the input bar. |
| "Remove" (file row) | `SubmitForm.tsx:299` | Keep | Needed for editing attached files. |
| "Dispatch run" | `SubmitForm.tsx:332` | Replace | Becomes "Send" in the chat input bar. |
| "Try again" (workload error) | `App.tsx:238` (ErrorState) | Keep | Recovery path. |

Net: the top bar keeps mode toggle + theme toggle + (mobile) sidebar toggle; everything else migrates into chat, sidebar, or the run card.

## 8. Broken buttons

From source inspection, only one button is effectively dead:

- `frontend/src/components/EventStream.tsx:161` — **Replay**. `onReplay` (wired in `RunView.tsx:170`) calls `replay()` which, when `prefersReducedMotion()` is true or `events.length === 0`, sets `replayTo` to `null` and does nothing visible; in the normal path it animates a 170ms step. The button therefore appears to do nothing for reduced-motion users and is redundant for everyone else. **Expected:** remove the button (per §7) rather than fix it. If retained, it must visibly restart the stream animation for all users.

No other button in the current source is a no-op: every other handler is wired to a real state update or network call. If the coordinator observes additional dead buttons, they are likely in a build not matching this source; flag them with a screenshot and I will add them here.

## 9. Accessibility

- Theme toggle: keyboard-activatable (it is a `<button>`), `aria-label` switches with the resolved theme, `aria-pressed` reflects dark mode. Focus ring uses `--focus`.
- Sidebar: all session rows are `<button>` elements; arrow keys move between rows (roving tabindex), Enter/Space activates, Delete removes (with a confirm). New session button is reachable first.
- Chat input: `autoFocus` on mount; after send, refocus the textarea. `aria-label="Message"` on the textarea.
- Right panel: `role="complementary"`, `aria-labelledby="report-heading"`; Escape closes (see §5). Focus moves into the panel's "Hide report" button on open and back to the chat input on close.
- Toast: `role="status"`, `aria-live="polite"`, dismiss button has `aria-label="Dismiss"`.
- `prefers-color-scheme` is honoured by the default theme (§1.1) and `prefers-reduced-motion` collapses all transitions (§1.3, §5, §6).

## 10. Responsive

Breakpoints: 960px (sidebar drawer), 1280px (right panel inline vs overlay), 560px (mobile full-screen overlays).

- Desktop (≥1280px): sidebar (280px) + chat (flex) + right panel (420px when open). All three visible.
- Tablet (960–1279px): sidebar (280px) + chat (flex) + right panel as an overlay drawer (360px) when open, with scrim.
- Mobile (<960px): sidebar is an overlay drawer (hamburger in top bar); chat is full screen; right panel is a full-screen overlay when open, with a "Back to chat" button in its header. Input bar stays pinned above the virtual keyboard (use `position: sticky; bottom: 0` plus `env(safe-area-inset-bottom)` padding).
- Sidebar collapse state persists across breakpoints; on mobile the collapsed state is ignored (drawer is closed by default).

## Carry-forward from review 01

- F-01 (run list unauthorized) — moot in the new layout; sessions have no unauthorized state. Drop.
- F-04/F-06 (disclosure default-open) — carry over into the right panel; keep "What ran" collapsed when long, open containment measurement on non-contained verdicts.
- F-10 (cap event stream height) — moot; the stream becomes the chat scrollback.
- F-13 (horizontal scroll hint) — carry over for the report's attempts table in the right panel.