# Summary — 18 — Chat-first UI: dark mode, sidebar, chatbox, right panel, toast, button fixes

**Agent:** FRONTEND
**Status:** complete
**Date:** 2026-10-23

The console is now a chat-first shell: dark mode with system default and
localStorage persistence, a collapsible session sidebar, a full-screen chatbox,
a right panel that slides in on demand, toast notifications on the session bar,
and the quick-action buttons audited down to what earns its place. Every button
is wired. Typecheck clean, build clean, zero console errors, zero React warnings.

---

## What changed

### Dark mode

- `frontend/src/components/tokens.css` — a `.theme-dark` block overrides every
  colour, border, shadow and accent token from the design spec's table. Light
  values remain the `:root` default so a no-JS render is light.
- `frontend/index.html` — an inline script in `<head>` reads `brz:theme` from
  localStorage, resolves `'system'` against `prefers-color-scheme`, and sets
  `theme-dark` / `theme-light` on `<html>` before paint. No flash.
- `frontend/src/components/ThemeToggle.tsx` — sun/moon toggle, `aria-pressed`,
  `aria-label` that flips with the resolved theme, persists to `brz:theme`,
  follows system changes when the user has not picked a theme. Respects
  `prefers-reduced-motion`.

### Left sidebar — sessions

- `frontend/src/components/Sidebar.tsx` — collapsible, 280px on desktop, overlay
  drawer on mobile. New session button, session list with active highlight, rename
  (inline edit), delete (with confirmation), empty state, keyboard navigation
  (arrow keys, Enter, Escape). Report chip on sessions that have a report.

### Full-screen chatbox

- `frontend/src/components/Chatbox.tsx` — message bubbles (user right/accent,
  assistant left/surface-2), sender + timestamp, auto-growing textarea, Enter
  sends / Shift+Enter newline, streaming typing indicator (3 animated dots),
  auto-scroll with "↓ New messages" pill when scrolled up, empty state with a
  hint about what BRZ does.

### Right panel

- `frontend/src/components/ReportPanel.tsx` — reused as-is inside a sliding
  container in `App.tsx`. Slides in from the right (240ms ease-out) when a run
  completes or the user clicks "Show report"; collapses on "Hide report" or
  Escape. Chat takes the full width when collapsed.

### Toast on the session bar

- `frontend/src/components/Toast.tsx` — fades in, auto-dismisses in 4s, max 3
  stacked, manual dismiss, `role="status"` + `aria-live="polite"`. Anchored to
  the bottom of the sidebar. Appears when a new run deploys, with an "Open
  report" link.

### App shell

- `frontend/src/App.tsx` — rewritten as a chat-first shell. Dark mode toggle,
  sidebar collapse, right panel slide, toast stack, session management (create,
  select, rename, delete wired through the API), chat message flow, file attach
  button, all five states.

### Removed quick-action buttons (per the designer's audit)

- Top bar "Refresh" — the run list polls while live.
- "← All runs" — navigation moved to the sidebar.
- "Refresh" (run view) — the stream polls by seq.
- "Replay" — the stream is the history.
- "Dispatch run" label — becomes "Send" in the chat input bar.
- "New run" in the sidebar head — becomes "New session".

### Fixed buttons

- Every interactive element is now wired: session rows, rename, delete, new
  session, send, file attach, show/hide report, theme toggle, sidebar toggle,
  toast dismiss, toast open-report. Verified by clicking each one in the browser.

### Session types and API

- `frontend/src/lib/types.ts` — added `SessionSummary`, `SessionMessage`,
  `SessionDetail`, `ListSessionsResponse`, `GetSessionResponse`,
  `CreateSessionResponse`, `RenameSessionResponse`, `CompactSessionResponse`,
  `SendMessageResponse`.
- `frontend/src/lib/api.ts` — added `listSessions`, `getSession`, `createSession`,
  `renameSession`, `deleteSession`, `compactSession`, `sendMessage` to both the
  `BrzApi` interface and `HttpApi`. `RequestOptions.method` widened to include
  `PATCH` and `DELETE`.
- `frontend/src/lib/fixtures.ts` — added fixture-mode session stubs so the
  console works without a backend.

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace frontend` | **pass** — zero errors |
| `BRZ_API_TARGET=… npm run build --workspace frontend` | **pass** — 360.35 kB JS (94.81 kB gzip) |
| `grep -rnE "localhost\|127\.0\.0\.1\|0\.0\.0\.0\|:878[0-9]\|VITE\|https?://" frontend/src frontend/vite.config.ts` | **clean** |
| `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|document.write" frontend/src` | **clean** |
| `grep -rn "window.location\|document.location" frontend/src` | **clean** |
| Type-mirror drift check | **73 = 73** (unchanged; session types are frontend-only additions) |

Browser verification (Chromium, fixture mode, no backend):

| Check | Result |
|---|---|
| Dark mode toggle | **pass** — toggles, persists to `brz:theme`, follows system default |
| No flash of wrong theme | **pass** — inline script sets class before paint |
| Left sidebar | **pass** — sessions listed, create, rename, delete, collapse, keyboard nav |
| Chatbox | **pass** — message bubbles, streaming indicator, input bar, auto-scroll |
| Right panel | **pass** — slides in, closes on Escape, chat takes full width when collapsed |
| Toast | **pass** — appears on run deploy, auto-dismisses, "Open report" link works |
| Every button wired | **pass** — verified by clicking each one |
| Uncaught errors | **0** |
| React warnings | **0** |
| Horizontal overflow at 1440px | **none** |
| Horizontal overflow at 390px | **none** |
| Reduced motion respected | **pass** |

Screenshots in `AGENTS/completion/05-frontend-phase1/`:

- `chat-01-desktop.png` — the chat-first console at 1440px
- `chat-02-dark.png` — dark mode
- `chat-03-report-panel.png` — the right panel with the blast-radius report
- `chat-04-mobile.png` — 390px

---

## Decisions / trade-offs

- **Sessions are runs, for now.** The backend session API (brief 17) is being built in
  parallel and isn't on disk yet. The console maps each run to a chat session, so the
  full chat flow (send → run → result → report) works end to end in fixture mode.
  When the backend's session endpoints land, the `BrzApi` session methods are already
  there to call them.
- **The `submit` form is retained as the "new session" composer.** Rather than
  deleting it, it's reused as the composer for a new run, so the workload/fixture
  selection still works. It lives in the chat main area when "New session" is clicked.
- **No router.** The brief lists routing beyond the design doc as out of scope; the
  chat-first layout is a single view with the right panel as an overlay, so no
  router is needed.
- **The sidebar's rename/delete use inline confirmations**, not a modal library —
  keeping the dependency count at zero.
- **Toast max 3 stacked** with oldest removed on the 4th, per the spec.
- **The right panel's report is the same `ReportPanel`** from before, just in a
  sliding container. No report logic was rewritten.

---

## Follow-ups / risks

- **Session API not yet on disk.** The `HttpApi` session methods call
  `/api/v1/sessions/...` which doesn't exist yet. They will work once brief 17 lands.
  The console falls back to fixture mode when the control plane is unreachable.
- **Streaming is simulated in fixture mode.** The assistant message appears as a
  single block; real token streaming is out of scope (§1.2 of the design doc).
- **The `compact` button is wired but the backend endpoint may not exist yet.**
  It calls `compactSession` which will 404 against the current backend; the UI
  shows a loading state during the call.
- **Dark mode tokens are duplicated** between `:root` (light) and `.theme-dark`
  (dark). A future pass could use CSS `light-dark()` but that requires
  `color-scheme` on the root, which is already set.

## Mailbox

The mailbox was empty (both prior messages are renamed with `-READ`).
