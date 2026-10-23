# Summary — 09 Commercial decisions: the money, the Tier 2 date, and two confirmations

**Agent:** BUSINESS
**Status:** complete
**Date:** 2026-10-23

## What changed

- `docs/business/01-market-and-monetization.md` (revised in place, 907 → 916 lines) — three surgical changes and nothing else. **No number moved.**
- `AGENTS/briefs/09-commercial-decisions.md` — marked `<DONE>` (was `<WORK IN PROGRESS>`).

**Decision 1 — the money: the certification leaves the spoken line, the costed row stays.**
- §E.4.1 is untouched: both certification rows keep their sourced cost band (**$7,000–$15,000** Type I; **$15,500–$50,000** + **$20,000–$60,000** engineering time for Type II) and their `requires budget approval — not currently funded` flag. The cost is the reason the row is honest, so it stays.
- **Slide segment 9's spoken line no longer contains a dollar figure or a promised report.** It now reads: *"Dated, and ours to control: our own VM per task from kickoff — the day our Vultr account opens. MicroVM-grade isolation in February. Single sign-on and role-based access in March. A second sandbox provider in June. And we're scoping SOC 2."* — the permitted half-sentence, with no figure and no promise of a report. **41 words, 16.4s at 150 wpm / 20.5s at a slow 120 wpm, against a 23s budget.**
- The cost band and the budget flag moved to the **slide body** of segment 9, where a judge can read them without the pitch spending its time on an unfunded number. §E.4.1 remains the artifact of record.

**Decision 2 — the Tier 2 date: a milestone, not a date.**
- The ladder now reads, identically in **§C.1, §C.3 and §E.4.1**: **Tier 2 ships with the code and is exercised on our own Vultr account from kickoff.** "Nov 2026" no longer appears as Tier 2's timing anywhere.
- The one-line reason appears where the ladder appears, citing the design document: *"There is no Vultr account until kickoff, so the moment Tier 2 runs against real infrastructure is set by a third party, not by us. The tier ships written and unit-tested against a mock, and the swap at kickoff is a config flag"* (`docs/architecture/02-phase1-design.md` §1.2, §14 #37).
- The places touched: §C.1's BRZ row, §C.1's ladder table and its note, §C.2 weakness #1, §C.3's kernel-isolation axis row, §E.4.1's Tier 2 row (date cell → **"From kickoff"**, with the milestone, not a date), §E.4.1's Tier 3 row ("after Tier 2 has already shipped and been exercised from kickoff"), and §E.4.1's one-line ladder.

**The two confirmations — no change, as instructed.** §C.2 weakness #4 and §G item 12 are **byte-identical** to revision 2 (verified: zero changed lines matching either).

**Revision note** — the document now carries a third visible block, "📌 Revision 3 — 2026-10-23", recording both decisions and the confirmation, directly under the revision-2 note. A reader can see the document was revised twice and why.

## Verification

- `python3 /tmp/opencode/brz_business_calc2.py` → **every revision-1 figure identical**: 11,904,762 devs · 3,119,048 · 259,921 orgs · 62,381 beachhead · $6,349.20 ACV · TAM $1.650B · SAM $396.1M · SOM $3.96M · 9,357 regulated orgs at $15,532.20 = $145.3M · variable cost $0.0257 (86% inference) · M12 MRR $20,473 / ARR $245,676 · break-even 28.0 customers and 89,805 tasks/mo · Starter-only 132 customers.
- `python3 /tmp/opencode/brz_rev2_verify.py` → **50 checks, 0 failures.**
- `python3 /tmp/opencode/tblcheck.py` → **45 tables, 0 column mismatches.**
- **Section-by-section diff against HEAD (revision 2):** only the header (revision note), **§C.1, §C.2 (weakness #1 only), §C.3, §E.3 and §E.4.1** differ. Every other section — §0.1–§0.6, §A.1–§A.5, §B.1–§B.4, §C.2's other seven weaknesses, §D.1–§D.4, §E.1, §E.2, §E.4.2, §E.4.3, §F.1, §G, §H — is byte-identical. Total diff: **20 insertions, 11 deletions.**
- `grep "Nov 2026"` → 5 hits, none of them Tier 2's timing: the revision-3 note (quoting the removed wording so the change is visible), the §0.6 roadmap range "Nov 2026 – Jan 2028", §D.3's "Selling starts | Nov 2026", the §D.3 M1 ramp row, and §E.4.2's Nov 2026 commercial milestone. `grep "November 2026"` → 1 hit, inside §D.3 (unchanged).
- `grep "SOC 2"` → 22 lines, each classified: **honest gap** (7), **sourced cost** (5), **competitor fact** (5), **budget-flagged plan** (3), **coverage/record** (2), **the spoken line** (1 — no figure, no promised report). No spoken line anywhere in §E.3 contains a certification figure or promise.
- Spoken lines read aloud: **segment 9 = 41 words, 16.4s @150 wpm / 17.6s @140 / 20.5s @120 (budget 23s)**; **segment 6 = 54 words, 21.6s @150 / 23.1s @140 / 27.0s @120 (budget 30s)**. Neither contains an acronym we invented; "SOC 2" is a framework name, and "SSO" was expanded to "single sign-on" so the spoken line carries no acronym of ours.

## Decisions / trade-offs

- **The certification is mentioned, not dropped.** The HEAD allowed either. A bare "and we're scoping SOC 2" is stronger than silence: it shows awareness, promises nothing, and costs five words. The figure — the thing that reads as weakness — is in the slide body and in §E.4.1.
- **Tier 2's row lost its date rather than gaining a softer one.** "Nov 2026" became **"From kickoff"** in the date cell, with the milestone spelled out in the cell next to it. A roadmap row that pretends to a date it cannot keep is worse than one that names a milestone, and the HEAD's reasoning is recorded in the document rather than left implicit.
- **Two small consistency edits, both forced by the decisions, flagged here:** (a) §C.2 weakness #1's path sentence changed from "in Nov 2026" to "ships with the code and is exercised from kickoff", so the ladder is worded the same way in §C.2 as in §C.1/§C.3/§E.4.1; (b) §0.6's coverage row 18 no longer says "all dated Nov 2026 – Jan 2028" but "with **Tier 2 keyed to kickoff rather than a date**", which is what is now true.
- **Segment 6's spoken line was written out explicitly.** It was previously slide content with no quoted line, and the brief asks for the spoken lines of segments 6 and 9 to be read aloud and timed. The chain, the order, and the "TAM after the beachhead" rule are unchanged; only the words are now on the page. It came in at 22s against a 30s budget.

## Follow-ups / risks

- **The remaining Nov 2026 mentions are all revenue-plan dates**, not engineering dates: §D.3's "Selling starts | Nov 2026" and the M1 ramp row, plus §E.4.2's "Hackathon result published". If selling slips, those move — but they are our dates and we control them. No action.
- **§E.4.1's first row is now a milestone, not a date.** The rubric's "future goals and plans" gate is served by eight dated rows plus one milestone row, so nothing was lost — but if the coordinator wants a date in that cell, the honest date is "3 Nov 2026 **at the earliest**, set by when our Vultr account opens", and I would not write it as a commitment.
- **The certification still costs real money and is still unbudgeted.** Removing the figure from the spoken line fixed the *pitching* problem, not the *money* problem: the $7,000–$15,000 Type I engagement and the $35,500–$110,000 Type II cost still need a decision, and §E.4.1 says so in the place a judge will read it. If the answer is no budget, the row becomes a documented gap rather than a plan — that is a one-line edit whenever you want it.
- **The pitch assembly owner is still unnamed (Q-014).** The slide outline (4:40, containment moment 1:32–2:20) and the three video sentences are final and unchanged.
- **Nothing was committed or pushed**, per the protocol. The working tree holds revision 3; `HEAD` still holds revision 2. GITMASTER needs to commit `docs/business/01-market-and-monetization.md` and the brief's `<DONE>` marker.
- **No further restructuring was attempted**, per the brief. One observation for the coordinator, not acted on: §E.4.1's table would read better with the funding flag as its own column rather than inline in a prose cell — but that is a change of shape, not of content, and this pass was a trim.

## One-line read for the coordinator

> Revision 3 is a trim: the spoken line no longer spends 23 seconds on an unfunded dollar figure, and Tier 2 no longer promises a date a third party sets. **The document is now final for the pitch — 916 lines, every number recomputes, and the only unresolved item is money: $7,000–$15,000 for a SOC 2 Type I engagement, or the row becomes a documented gap.**
