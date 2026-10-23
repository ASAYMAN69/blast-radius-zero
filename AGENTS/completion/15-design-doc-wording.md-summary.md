# 15 — Fix the stale "byte-identical" wording in §12.5 — COMPLETION SUMMARY

> **Agent:** ARCHITECT · **Brief:** `AGENTS/briefs/15-design-doc-wording.md` · **Date:** 2026-10-23
> **Artifact:** `docs/architecture/02-phase1-design.md` (§12.5 only)

---

## Status

**DONE.** One sentence and one note changed. Nothing else.

## What changed

`docs/architecture/02-phase1-design.md`, §12.5, the fourth bullet of "Determinism, stated honestly":

- The old sentence — `produces a **byte-identical** report every time.` — was replaced with wording stating the truth: the offline demo's containment facts, denial, resource limits, teardown, verdict, event sequence and report structure are identical on every run (they come from the control plane and the kernel, not the model), but the measured durations and timestamps differ between runs, so two offline runs are **not byte-identical**.
- A one-line note was added at the end of §12.5 explaining why the offline demo is not byte-identical: the report carries measured facts (durations, timestamps, the event digest), and freezing those measurements would be fabricating a number — the one thing this project exists to avoid.

The two correct bullets above it ("Deterministic and identical on every run", "Not bit-identical") were not touched.

## Why

The TESTER (P3) and my own brief-03 summary both flagged the "byte-identical" claim as false: the report carries measured durations and timestamps, so two runs cannot be byte-identical. Claiming byte-identity would mean freezing measurements — i.e. fabricating a number — which is exactly what the `Measured<T>` type exists to prevent.

## Verification

- `grep -n "byte-identical" docs/architecture/02-phase1-design.md` → two hits, both **clearly scoped as "not byte-identical"** (the corrected bullet and the one-line note). No remaining claim of byte-identity anywhere.
- `git diff --stat` → only `docs/architecture/02-phase1-design.md` changed by this brief, **4 lines added**.
- The document still reads as a judge-facing architecture explanation; no other section was touched.

## Scope respected

Only `docs/architecture/02-phase1-design.md` was edited, and only the one sentence plus the one-line note. No other file was touched. No commit, no push, no subagent.
