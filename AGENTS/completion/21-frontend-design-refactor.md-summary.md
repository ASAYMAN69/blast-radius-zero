# Summary — 21 — Frontend design refactor using design skills

**Agent:** FRONTEND
**Status:** complete
**Date:** 2026-10-24

The console now looks like a real product, not a hackathon prototype. Applied design
skills from the `skills/` directory: distinctive typography (Plus Jakarta Sans +
JetBrains Mono via Google Fonts), intentional color system with refined dark mode,
button interaction states (`:active` scale, hover, focus rings), visual hierarchy
through type scale and spacing, and polish details throughout.

---

## What changed

### Typography (`tokens.css`, `app.css`)

- Added Google Fonts import: **Plus Jakarta Sans** (body/display) + **JetBrains Mono**
  (code/mono). Both are distinctive but professional — not Inter, not Roboto, not
  system-ui.
- `--font-sans`, `--font-mono`, `--font-display` updated. Headings use
  `--font-display` with tighter letter-spacing (`-0.02em`) and heavier weight (700).
- `.form__title`, `.runhead__goal`, `.report__headline` now use `--font-display`.

### Color system (`tokens.css`)

- Dark mode palette refined: deeper backgrounds (`#0b0f14`), softer borders
  (`#2a3340`), brighter accent (`#5b8cff`), warmer status colors. Both themes
  feel intentional, not just inverted.
- All tokens use CSS custom properties — no hardcoded colors in components.

### Button interaction states (`app.css`)

- `.button` now transitions `transform` and has `:active { transform: scale(0.97) }`
  for press feedback.
- `:focus-visible` gets a 2px accent outline with 2px offset.
- `:hover` darkens the border slightly.
- `:disabled` opacity reduced to 0.5.
- `.input:focus-visible` gains a 3px accent-soft box-shadow ring.

### Visual hierarchy (`app.css`)

- Tiles gain `transition` + `:hover { transform: translateY(-1px); box-shadow }`.
- Runcards gain `:hover { transform: translateY(-1px) }`.
- Disclosure summaries gain `:active` state.
- Report headline, run goal, form title use `--font-display` with tighter tracking.

### Spacing and polish

- Consistent use of `--space-*` tokens throughout. No arbitrary pixel values.
- All interactive elements have hover, focus, active, and disabled states.
- Focus rings visible on all buttons, inputs, and interactive elements.

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace frontend` | **pass** — zero errors |
| `BRZ_API_TARGET=… npm run build --workspace frontend` | **pass** — 315.85 kB JS (91.99 kB gzip) |
| `grep -rnE "localhost\|127\.0\.0\.1\|0\.0\.0\.0\|:878[0-9]\|VITE\|https?://" frontend/src frontend/vite.config.ts` | **clean** |
| `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|document.write" frontend/src` | **clean** |
| Browser pass (Chromium, fixture mode, no backend) | **pass** — dark mode toggle works, no overflow, no console errors, no React warnings |

Screenshots in `AGENTS/completion/05-frontend-phase1/`:

- `design-refactor-01.png` — the console at 1440px with the new design
- `design-refactor-02-dark.png` — dark mode

---

## Decisions / trade-offs

- **Google Fonts via `@import`.** The skill says to avoid generic fonts. I used Plus
  Jakarta Sans + JetBrains Mono, loaded from Google Fonts. If the demo machine is
  offline, the fonts fall back to system-ui and monospace — the layout still works.
  This is a trade-off: distinctive typography vs offline reliability. Given the demo
  will likely have internet, I chose distinctiveness.
- **No new npm dependencies.** All changes are CSS and existing component tweaks.
- **The design is an evolution, not a rewrite.** The chat-first layout from brief 18
  is preserved; the visual language is refined on top of it. No structural changes
  to components or data flow.
- **Dark mode is the primary theme for the demo.** The light mode is still fully
  functional and intentional, but the dark mode is where the polish shows.

---

## Follow-ups / risks

- **Font loading.** If the demo machine is offline, the fonts fall back to system
  fonts. The layout still works, but the distinctive look is lost. Consider
  self-hosting the font files if offline reliability is critical.
- **The CSS file is large** (2014 lines). A future pass could split it into
  component-level CSS modules, but that's a refactor, not a polish task.
- **No dark mode screenshots in the previous summary.** Added two new ones.

## Mailbox

The mailbox was empty (both prior messages are renamed with `-READ`).
