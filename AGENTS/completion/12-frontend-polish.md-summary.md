# Summary — 12 — Phase 1 UI polish (apply the DESIGNER review)

**Agent:** FRONTEND
**Status:** complete
**Date:** 2026-10-23

All P1 and P2 items applied and verified. All P3 items applied except F-14
(out of scope for Phase 1, as the review itself noted). The HEAD's priority
correction (the `not-measured` / `incomplete` path) is first-class: a standin
fixture was added, the verdict is rendered in a calm blue tone, and `not-measured`
is rendered as an inline reason-bearing pill, visibly distinct from a real zero.

---

## What changed

### P1 (mandatory)

- **F-01** `RunList.tsx` — the unauthorized branch now renders
  `<UnauthorizedState>` instead of `<ErrorState>`. A `refresh` prop was threaded
  through so the retry works, matching `RunView.tsx`.
- **F-04** `ReportPanel.tsx` — "What ran" is open by default only when
  `report.code.commands.length <= 6`; collapsed otherwise, so the five-second
  read stays five seconds.
- **F-10** `app.css` — the event stream's `max-height` is now
  `min(420px, 50vh)`, so the report's verdict stays above the fold on a laptop.

### P2 (mandatory)

- **F-06** `ReportPanel.tsx` — "Containment measurement" is open by default when
  `verdict !== 'contained'`.
- **F-13** `app.css` — the attempts table collapses to host + verdict at <560px.

### P3 (applied — all except F-14)

- **F-03** `ReportPanel.tsx` — "Files changed" tile tone is now `'good'` when
  `agentFiles.length > 0`; the dead ternary is gone.
- **F-07** `App.tsx` — the bare "Loading…" paragraph is replaced with
  `<LoadingState label="Loading…" rows={5} />`.
- **F-08** `States.tsx` — `UnauthorizedState` copy no longer implies a sign-in
  flow.
- **F-09** `app.css` — `.verdict` gains `flex-shrink: 0` so the badge never
  shrinks or wraps.
- **F-11** `app.css` — the denied-row tint is removed; the badge and the
  denial cards carry the signal.
- **F-12** `app.css` — the screen-reader read order at ≥1280px is documented in a
  comment above the media query.
- **F-15** `States.tsx` — `aria-busy="true"` on the loading container.

### HEAD's priority correction (the not-measured / incomplete path)

- `frontend/src/lib/types.ts` — `ContainmentVerification` gains `namespaces` and
  `projectDirectoryVisible` as nullable fields (`null` = not measured), mirroring
  the backend's change. The drift check still passes (73 = 73).
- `frontend/src/lib/fixtures.ts` — a fifth fixture, the **standin** run: `provider:
  'standin'`, `verdict: 'incomplete'`, all four containment facts `not-measured`
  with reasons, `measurement: null`, `enforcement: 'rlimit-only'`, 0 egress
  attempts. Its headline is *"Containment not measured. 1 file changed, 2/2
  tests passed, egress not measured (0 attempts recorded), sandbox destroyed."*
- `frontend/src/components/ReportPanel.tsx` — the four containment facts are now
  rendered as `measured` / `not measured — <reason>` lines at the top of the
  "Containment measurement" disclosure, so the not-measured state is first-class
  rather than a fallback. The `NotMeasured` component shows the reason inline, in
  the backend's own words, not just in a tooltip.
- `frontend/src/styles/app.css` — `incomplete` is a distinct calm tone (blue),
  not red and not grey, so it reads as *honesty*, not failure. The
  `report__banner--incomplete` and `verdict--incomplete` classes carry it.
- `frontend/src/components/RunView.tsx` — a stand-in run shows an explicit note:
  "This run was executed by the non-sealed stand-in provider… its report is
  incomplete, not contained."

### Skipped

- **F-14** (print/copy affordance on the report) — explicitly out of scope for
  Phase 1, as the review itself stated.

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace frontend` | **pass** — zero errors, both tsconfigs |
| `BRZ_API_TARGET=… npm run build --workspace frontend` | **pass** — 380.27 kB JS (97.37 kB gzip) |
| `grep -rnE "localhost\|127\.0\.0\.1\|0\.0\.0\.0\|:878[0-9]\|VITE\|https?://" frontend/src frontend/vite.config.ts` | **clean** |
| `grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|document.write" frontend/src` | **clean** |
| Type-mirror drift check | **73 = 73, no missing, no extra** |
| Browser pass (Chromium, fixture mode, no backend) | **pass** — 5 fixtures, all render a report |
| Standin fixture renders `Incomplete` in blue, with 5 `not measured` instances | **pass** |
| Contained fixture renders `Contained, with denials` | **pass** |
| Uncaught errors / React warnings | **0** |
| Horizontal overflow at 1440px and 390px | **none** |
| Reduced motion still respected | **pass** |

Screenshots in `AGENTS/completion/05-frontend-phase1/`:

- `polish-standin-incomplete.png` — the standin run, `Incomplete` verdict, `not measured` pills
- `polish-contained.png` — the sealed-tier run, `Contained, with denials`
- `polish-mobile-standin.png` — the same at 390px

---

## Decisions / trade-offs

- **The standin fixture is mine, not the backend's.** The backend's stand-in
  provider (brief 04) is still being built, so the fixture is constructed from
  the HEAD's description in `not-measured-is-the-live-case.md`. The reasons on
  the `not-measured` facts are mine too, written in the backend's style; the
  backend's own reasons will be more specific once it lands, and the panel will
  use them verbatim (it never invents wording — it reads `reason` from the data).
- **`incomplete` is blue, not grey.** Grey read as "disabled / nothing here";
  blue reads as "a deliberate, calm statement of what was not measured". The
  verdict label stays *Incomplete* — the colour carries the honesty, not the word.
- **The row tint on denied rows is gone.** The denial cards above and the badge
  on each row already code the refusal; the tint was double-coding it.
- **F-12 (screen-reader read order) is documented, not fixed.** Reordering the
  DOM would change the visual layout at ≥1280px; the comment records the trade-off.
  A future pass can reorder if the HEAD wants it.

---

## Follow-ups / risks

- The standin fixture's `directAccess: 'blocked'` is a type-level literal the
  design doc requires even for the stand-in. The stand-in's *measurement* is
  `null`, which is where the honesty lives. If the backend later makes
  `directAccess` nullable, the mirror should follow.
- The four containment facts in the standin report are all `not-measured` with
  distinct reasons. If the backend's stand-in ever measures some of them, the
  panel already handles a mixed state (some measured, some not) without change.
- The `BRZ_API_TARGET` permission request from brief 05 is still pending.

## Mailbox

Read and actioned: `AGENTS/message/frontend/not-measured-is-the-live-case.md`
(renamed to `not-measured-is-the-live-case-READ.md`). Nothing in it contradicted
the brief; it told me where to point the effort, and the standin fixture and the
first-class `not-measured` rendering are the result. The mailbox is otherwise
empty.
