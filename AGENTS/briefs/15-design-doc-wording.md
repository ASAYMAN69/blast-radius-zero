<DONE>

# 15 — Fix the stale "byte-identical" wording in §12.5

Agent name: ARCHITECT. You are ARCHITECT. If no name was given to you, STOP and ask.

**Wave:** 7
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 03 (`<DONE>`)

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/ARCHITECT.md`, then this brief. You are in your **existing session** — you wrote the design doc.

## Goal
Fix one sentence in §12.5 of the design doc that claims something the system does not do.

## Why / context
Your brief-03 summary said: *"The offline demo is deterministic, not byte-identical. §12.5 promises a 'byte-identical' report from the scripted mock. Ours is deterministic in everything the control plane decides — the transcript, the commands, the exit codes, the verdict, the event sequence, the structure — but the report also contains measured facts (durations, timestamps, the event digest), so two offline runs differ in those bytes."*

The design doc's §12.5 currently says:

> "`npm run demo:offline` runs the identical scenario against the scripted inference mock and produces a **byte-identical** report every time."

This is wrong. The offline demo is **deterministic**, not byte-identical, because the report carries measured durations and timestamps. Claiming byte-identity would mean freezing measurements — which is the "fabricated number" this project exists to avoid. The TESTER flagged it as a P3.

The first two bullets of §12.5 are already correct and must not change: "Deterministic and identical on every run" for the containment facts, and "Not bit-identical" for the text/durations. Only the last bullet is wrong.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/architecture/02-phase1-design.md` — **only** the sentence in §12.5

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `AGENTS/completion/04-backend-core.md-summary.md` — deviation 10
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none.

## Requirements
1. Replace the sentence `produces a **byte-identical** report every time.` with wording that states the truth: the offline demo is **deterministic** — the containment facts, the denial, the resource limits, the teardown, the verdict, the event sequence and the report's structure are identical on every run, because they come from the control plane and the kernel, not the model; the measured durations and timestamps differ between runs, and two runs are not byte-identical.
2. Do not change anything else in §12.5, §12, or any other section. Do not touch the two correct bullets above the sentence.
3. Add a one-line note at the end of §12.5 explaining why the offline demo is not byte-identical: the report carries measured facts, and freezing measurements would be fabricating a number.

## Constraints
- **One sentence and one note.** Nothing else.
- Do not commit or push. Do not use the `subagent` tool.

## Acceptance criteria
- [ ] The only change to the document is the corrected sentence and the one-line note.
- [ ] No remaining "byte-identical" claim about the report.
- [ ] The document still reads correctly as a judge-facing architecture explanation.

## Verification
- `grep -n "byte-identical" docs/architecture/02-phase1-design.md` → paste the result and confirm the remaining hit (if any) is clearly scoped to the containment beat, not the whole report.
- `git diff --stat` → only `docs/architecture/02-phase1-design.md` changed, with a small line count.

## Out of scope
- Any other section of the design doc.
- The code, the sandbox, the report.
- The pitch, the deck, the video.

## Notes
- This is a correction, not a redesign. The design doc is yours and it is right everywhere except this one sentence.
- Your mailbox is `AGENTS/message/architect/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/architect/<slug>.md` and wait for the decision. Do not proceed without it.
