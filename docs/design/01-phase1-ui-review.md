# Phase 1 operator console — UI design review

**Agent:** DESIGNER
**Date:** 2026-10-23
**Scope:** review only. No source, style, or component edits. Findings are written so FRONTEND can implement them in one pass.

## 0. Method and evidence

I reviewed the console from source (`frontend/src/**` and `frontend/src/styles/app.css`), the frozen contract mirror, and the FRONTEND completion summary (`AGENTS/completion/05-frontend-phase1.md-summary.md`). That summary's browser verification (1440px and 390px, no horizontal overflow, five states, reduced motion) is treated as measured fact and is not re-asserted here.

Screenshot note: the FRONTEND summary lists 11 screenshots in `AGENTS/completion/05-frontend-phase1/`. This review was performed in a session that cannot render PNGs, so I cannot pixel-measure them directly. Every finding below is anchored to `file:line` in source and is implementable without the images; where a pixel value matters it is stated as a CSS value, not a measured screenshot.

## 1. Screenshots referenced (not re-captured)

- `desktop-1440-submit.png`, `desktop-1440-run.png`, `desktop-1440-egress-denied.png`, `desktop-1440-resource-cap.png`, `desktop-report-panel.png`
- `mobile-390-run.png`, `mobile-390-report.png`
- `state-empty.png`, `state-error.png`, (loading/unauthorized implied)

## 2. Audit against the rubric

### Presentation (§1 of JUDGING-CRITERIA.md)

Helps: deliberate five-state design; verdict-first report; one primary action per screen; token set; reduced-motion support; keyboard traversal verified; no horizontal overflow at 390/1440.
Hurts: a few states are wired to the wrong component (run list's unauthorized renders as a generic error); report disclosures are all collapsed by default except two, so the "five-second read" depends on the top of the panel only; no dark mode (acceptable for Phase 1, but state it).

### Business Value

Helps: the console makes the containment claim legible to a non-engineer buyer; the report is the artifact a judge or customer keeps.
Hurts: nothing blocking. Copy is operator-facing; no onboarding for a first-time viewer. Out of scope for this brief.

### Application of Technology

Helps: strict TS, no bundle host sniffing, error hygiene, type-mirror drift check, `Measured<T>` honoured in the UI.
Hurts: the run list's unauthorized path bypasses the designed unauthorized state (see F-02); stand-in provider note is good and should stay.

### Originality

Helps: the report panel is a distinct artifact, not a generic dashboard; denials are first-class.
Hurts: nothing. Do not dilute it with generic charting.

## 3. Findings

Format: `file:line` · current · expected · severity.

- **F-01** `frontend/src/components/RunList.tsx:26` · unauthorized run-list state renders `<ErrorState>` with context "Access controlled." · Render `<UnauthorizedState onRetry={...} />` so the unauthorized state is the designed one, not a red error box. · P2
- **F-02** `frontend/src/components/RunList.tsx:26` · `state.error` is discarded when unauthorized · Pass `state.error` through only if UnauthorizedState gains an error prop; otherwise keep the generic copy. Either is acceptable; pick one and be consistent with `RunView.tsx:67`. · P3
- **F-03** `frontend/src/components/ReportPanel.tsx:203` · "Files changed" tile is always `tone='neutral'` even when files were written · Set tone to `'good'` when `agentFiles.length > 0` is the expected outcome of a successful run, or leave neutral but make the choice deliberate; currently the ternary is dead code. · P3
- **F-04** `frontend/src/components/ReportPanel.tsx:289` · "What ran" disclosure is `open` by default, dumping two tables before the reader has the verdict · Keep it open only when `report.code.commands.length <= 6`; otherwise collapse so the five-second read stays five seconds. · P2
- **F-05** `frontend/src/components/ReportPanel.tsx:360` · "What was denied" disclosure is open only when denials exist · Correct. No change. · (noted, no action)
- **F-06** `frontend/src/components/ReportPanel.tsx:417` · "Network", "Containment measurement", "Teardown", "Evidence", "Timeline" are all collapsed by default · Acceptable for density; but the containment measurement is the differentiator's proof and should be open by default when `verdict !== 'contained'`. · P2
- **F-07** `frontend/src/App.tsx:221` · while `view === null` the main region shows a bare "Loading…" paragraph with no skeleton · Reuse `<LoadingState label="Loading…" rows={5} />` for visual consistency with the run view. · P3
- **F-08** `frontend/src/components/States.tsx:100` · `UnauthorizedState` copy says "Sign in or use the allowed access path." but there is no sign-in flow anywhere · Change to "This deployment is access-controlled. If you expected to reach it, check your access path or credentials." and drop the sign-in implication. · P3
- **F-09** `frontend/src/components/ReportPanel.tsx:181` · verdict badge sits to the right of the eyebrow in the banner head, so on a narrow column the verdict wraps below the eyebrow and the headline still follows · Keep order, but give the banner head `align-items: flex-start` is already set; verify the verdict badge does not shrink (it has `white-space: nowrap`, ok). No CSS change required; flag only. · P3
- **F-10** `frontend/src/components/EventStream.tsx` (whole file) · not audited line-by-line here; the stream's `max-height: 68vh` (app.css:893) is tall enough to push the report below the fold on a 1440px laptop · Cap the stream at `min(420px, 50vh)` at 1440px so the report's verdict stays above the fold; the 1280px breakpoint already does 420px. · P2
- **F-11** `frontend/src/styles/app.css:1467` · `.row--denied td { background: var(--warn-soft); }` plus `.outcome--denied` amber on the same row double-codes the denial · Keep the row tint OR the badge, not both; recommend dropping the row tint and relying on the badge plus the denial cards above. · P3
- **F-12** `frontend/src/styles/app.css:1886` · the 1280px breakpoint reorders columns with `order`, which is a visual-only reorder; screen readers still read events first · Either reorder the DOM (events second) or add `aria-flowto`/a visually-hidden note; simplest is to keep DOM order events → main and rely on the reorder only above 1280px where both fit, but document the SR order. · P3
- **F-13** `frontend/src/styles/app.css:1952` · at 560px the disclosure tables rely on `overflow-x: auto` inside `.disclosure__body`; horizontal scroll inside a small panel is easy to miss · Add a one-line hint "scroll sideways for the full table" or reduce columns; recommend reducing the attempts table to host + verdict at <560px. · P3
- **F-14** `frontend/src/components/ReportPanel.tsx:1` · the report has no "print / copy" affordance · Out of scope for Phase 1; note for later. · P3
- **F-15** `frontend/src/components/States.tsx:20` · `LoadingState` has no `aria-busy` on the container · Add `aria-busy="true"` to the loading container for screen readers. · P3

## 4. The five states, audited

| State | Where | Copy | Layout | Recoverability | Verdict |
|---|---|---|---|---|---|
| Loading | `States.tsx:20` | "Loading…" + skeleton | skeleton rows | n/a | good |
| Empty | `States.tsx:36`, `RunList.tsx:32` | "No runs yet." + next step | dashed card | submit CTA present | good |
| Error | `States.tsx:54` | generic message + code + request id | red-bordered card | "Try again" when `onRetry` passed | good |
| Success | run view | data | n/a | n/a | good |
| Unauthorized | `States.tsx:100` | "Access controlled." | amber card | "Check again" when `onRetry` passed | mostly good; copy tweak F-08 |

Missing/accidental: run list unauthorized renders as error (F-01). No other missing state is a P1.

## 5. The report panel, audited

**Verdict: needs work** (not rework). The structure (banner → tiles → meters → disclosures) is right and the "not measured" treatment is correct. The gaps are density and default-open choices, not the model.

- Verdict banner: correct. One word + one sentence, largest type. Keep.
- Glance tiles: correct set. "Files changed" tone is dead code (F-03). "Bytes out" correctly says 0 B only when nothing left; good.
- Cap meters: all four dimensions present; `Meter` uses `role="img"` with an aria-label naming value + cap; good. The single shared `capsTone` means a memory-near-cap run tints every meter amber; acceptable, but consider per-meter tone in a later pass. P3.
- Disclosures: "What ran" and "What was denied" open by default is right for the containment story; "Network", "Containment measurement", "Teardown", "Evidence", "Timeline" collapsed is right for density but containment measurement should open on a non-contained verdict (F-06).
- "Not measured": honoured. `NotMeasured` renders italics with the reason in `title`; never coerced to zero. Good — do not change.
- Timeline: 3-column grid collapses to 2 at 560px with detail on its own row; good.
- Egress table: row tint duplicates the badge (F-11).

## 6. Accessibility

- Focus: `:focus-visible` 2px accent outline with 2px offset (app.css:45); good. Every interactive element ≥ 44px (`--tap`); verified by FRONTEND.
- Skip link present (App.tsx:124, app.css:112).
- Screen readers: loading containers lack `aria-busy` (F-15); run-list unauthorized mislabelled (F-01). Event stream and report have `aria-labelledby`/`aria-label` on key regions.
- Contrast: `--ink-3` (#66717f) on white is ~4.5:1; acceptable for 12px+ text. Do not darken further without re-checking.
- Hit targets: 44px minimum; verified.

## 7. Responsiveness

- 1440px: two-column grid (340px sidebar + main); report and events side by side. Report verdict above the fold only if the event stream is capped (F-10).
- 1280px: grid collapses to one column, events first in DOM but visually reordered (F-12).
- 960px: sidebar becomes a drawer with scrim and Escape-to-close; good.
- 768px: drawer mode (960 breakpoint covers it); no dedicated 768 rule needed.
- 560px/390px: reduced padding, smaller report headline and tile values; tables scroll horizontally inside disclosures (F-13). No horizontal overflow verified.

## 8. Motion

Named animations, all in `frontend/src/styles/app.css`:

| Name | Selector | Duration | Purpose | Reduced motion |
|---|---|---|---|---|
| `spin` | `.spinner` | 720ms linear infinite | loading indicator | collapsed |
| `shimmer` | `.skeleton__row` | 1.6s ease infinite | skeleton placeholder | collapsed |
| `pulse` | `.livedot__pulse` | 1.5s ease-in-out infinite | "live" indicator | collapsed |
| disclosure arrow | `.disclosure > summary::before` | 140ms (`--duration`) | open/close affordance | collapsed |
| meter fill | `.meter__fill` | 140ms | value change | collapsed |
| sidebar slide | `.sidebar` | 140ms | drawer open/close | collapsed |
| button hover | `.button` | 140ms | hover feedback | collapsed |

`prefers-reduced-motion: reduce` collapses every animation and transition to ~0ms (app.css:2005). Verified by FRONTEND (spinner 0.72s → 1e-6s). Good. The run-view replay (RunView.tsx:50, 170ms per step) also respects `prefersReducedMotion()` and skips. Good.

## 9. Prioritised polish list

P1 (must fix before the demo):
1. F-01 — run list unauthorized renders as error.
2. F-04 — "What ran" disclosure open by default on long command lists.
3. F-10 — cap event stream height so report verdict stays above the fold.

P2 (should fix):
4. F-06 — open containment measurement when verdict is not contained.
5. F-13 — horizontal-scroll hint or column reduction for tables at <560px.

P3 (nice to have):
6. F-03, F-07, F-08, F-09, F-11, F-12, F-15.

## 10. Time budget

- P1 (3 items): ~45 minutes (F-01 ~15m, F-04 ~15m, F-10 ~15m).
- P2 (2 items): ~45 minutes.
- P3 (7 items): ~60 minutes, optional.
- Total P1+P2: ~1.5 hours, inside the brief's ~2 hour cap. P3 only if time remains.

---

Report panel verdict: **needs work** (density and default-open choices only; structure and "not measured" treatment are correct).