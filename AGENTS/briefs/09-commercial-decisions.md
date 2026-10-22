<WORK IN PROGRESS>

# 09 — Two decisions from the HEAD, and one date to fix

Agent name: BUSINESS. You are BUSINESS. If no name was given to you, STOP and ask.

**Wave:** 2 (parallel — no write-scope conflict; FRONTEND is finished, BACKEND is on brief 08)
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 07 (`<DONE>`) — you are in your existing session

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BUSINESS.md`, then this brief. You are in your **existing session** and you have the document open in your head. This is a short, surgical pass — **not** another revision.

## Goal
Two decisions you asked for, one date that has to change, and two of your judgment calls confirmed.

## Why / context
Your brief-07 summary was excellent. The revision note is at the top, the beachhead leads, the certifications are costed and budget-flagged, the Enterprise tier is re-anchored, and the isolation ladder matches engineering. You raised exactly two things that need a decision, and both are mine to make. You also raised two judgment calls of your own that I am confirming.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/business/01-market-and-monetization.md` (revise in place)

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/business/01-market-and-monetization.md` — your document
- `docs/architecture/02-phase1-design.md` — read §4 and the Vultr tier table, for the date fix below
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none.

## Decision 1 — the money

**Your question.** *"$7,000–$15,000 for the Type I engagement, or the certification line comes out of the spoken plan — it cannot stay as an unfunded dated promise."*

**The decision: keep the costed row in the document, take the certification out of the spoken line.**

- **§E.4.1 keeps the row**, with the cost band and the `requires budget approval — not currently funded` flag. That table is the artifact a judge *reads*. A dated, costed, honestly-flagged plan is a strength there — it shows we know what compliance costs.
- **Slide segment 9 loses the certification from the spoken line.** The segment has 23 seconds. Spending them on an unfunded dollar figure is bad pitching: it is a weakness in a spot where the audience is deciding whether to believe us. The spoken line should name only the milestones we control and will do.
- If the segment has a spare half-sentence, it may say *"and we're scoping SOC 2 for next year"* — **without a figure, without a promise of a report**. If it does not fit, the certification is absent from the spoken line entirely. Both are acceptable; the figure is not.

**Do not delete the cost band from §E.4.1.** The cost is the reason the row is honest.

## Decision 2 — the Tier 2 date

**Your question.** *"Tier 2's Nov 2026 date should be confirmed against ARCHITECT §4/§14 before it is said aloud; if the kickoff slips, the isolation ladder slips with it."*

**You were right to check, and the check changes the date.** ARCHITECT's design does **not** commit to a Nov 2026 production date for Tier 2. What it commits to is:

> *"There is no Vultr account until kickoff (3 Nov 2026). The tier ships **written and unit-tested against a mock**; the swap at kickoff is a config flag."*

and the cold start is **measured at kickoff**, not promised. So the honest statement is not a date — it is a milestone we control.

**The change: replace "Nov 2026" with "from kickoff" wherever Tier 2's timing appears** — §C.1, §C.3, and §E.4.1's ladder. The wording should read as: **Tier 2 ships with the code, and is exercised on our own Vultr account from kickoff.** A date we cannot keep, because a third party sets it, is worse than a milestone we do control. State the reasoning in one line where the ladder appears.

## Your two judgment calls — both confirmed

1. **§C.2 weakness #4** — you amended the consequence from *"blocks the Enterprise tier today"* to something consistent with the re-anchored tier, leaving the weakness itself intact. **Confirmed, and it was necessary** — the old sentence contradicted the change you made in §D.1.
2. **§G item 12** — you changed "the workload is not chosen" to record the decision and kept the sensitivity as the caveat. **Confirmed.** The decision is `self-healing-runner` (ARCHITECT brief 03, §2), which is the code-execution base case your numbers already assume, so no figure moved.

## Constraints
- **Three surgical changes.** Decision 1, Decision 2, and the two confirmations (which need no change — just leave them as they are). **No other edit.** The document is 907 lines and it is right; do not improve it further.
- **No number changes.** Every figure recomputes exactly as it did.
- Stay inside your write scope. If you need a file you do not own, request permission per `AGENTS/permissions/PROTOCOL.md` — do not take it.
- Do not commit or push. Do not use the `subagent` tool.

## Acceptance criteria
- [ ] The certification appears in §E.4.1 with its cost band and funding flag, and **not** in the spoken line of slide segment 9.
- [ ] "Nov 2026" no longer appears as Tier 2's timing anywhere; the ladder says Tier 2 ships with the code and is exercised from kickoff, with the one-line reason.
- [ ] The ladder wording is consistent across §C.1, §C.3 and §E.4.1.
- [ ] §C.2 weakness #4 and §G item 12 are unchanged from your revision 2.
- [ ] **Every number still recomputes.** Re-run your scripts and paste the result.
- [ ] The revision note at the top of the document gains a short line recording this pass, so a reader can see the document was revised twice and why.

## Verification
- Re-run the calculation scripts; paste the output and confirm every figure is unchanged.
- Grep for `Nov 2026` and paste every hit with its line, then show the corrected wording for each.
- Grep for `SOC 2` and confirm each occurrence is now an honest gap, a sourced cost, a budget-flagged plan, or the spoken-line removal — and that **no spoken line contains a certification figure or promise**.
- Read the spoken lines of segments 6 and 9 aloud. They should take under 30 seconds each and contain no jargon.

## Out of scope
- The architecture, the code, the roadmap in `docs/architecture/02-phase1-design.md`.
- The slide PDF and the video (owner still unnamed, Q-014).
- Any further reframing. You have earned the document; this pass is a trim, not a rewrite.

## Notes
- This is the last revision before the pitch is assembled. If you find yourself wanting to restructure something, do not — note it in your summary instead and the coordinator will decide.
- Your mailbox is `AGENTS/message/business/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/business/<slug>.md` and wait for the decision. Do not proceed without it.
