# Summary — 07 Commercial revision: four decisions from the coordinator

**Agent:** BUSINESS
**Status:** complete
**Date:** 2026-10-23

## What changed

- `docs/business/01-market-and-monetization.md` (revised in place, 793 → 907 lines) — the four coordinator decisions, applied as a precision pass. **No derived number moved.**
- `AGENTS/briefs/07-commercial-revision.md` — marked `<DONE>` (was `<WORK IN PROGRESS>`).

**Change A — lead with the beachhead, demote the TAM.**
- §0.1 headline table reordered: **#1 is now 62,381 policy-gated organisations · $396.1M/yr**; the **$1.65B TAM moved to #10**, still `derived (low)`, now framed as *the ceiling the policy gate creates*. One new row (#9) added — the $49.50–$198.00/month managed-sandbox bill vs $5.65 on BRZ — so the table still holds ten numbers.
- A one-line derivation of the new #1 was added directly under the table (225M → 11.9M → 3.12M → 259,921 → 62,381 → $396.1M).
- **New §A.5 "The beachhead, in full"** — standalone derivation, three checks (one explicitly labelled a *consistency* check, not independent), the "filter not a segment" precision (28,071 segment-1 orgs + 34,310 others), and five caveats stated in the section rather than buried in §G.
- §A.2 step 4 relabelled (TAM = ceiling, SAM = headline) plus the "beachhead is 24.0% of the TAM" relationship; §A.3 gained a "what the TAM is and is not" framing paragraph; §E.3 segment 6's chain now **ends at the beachhead** with the TAM in one clause after it; §G item 1 keeps its caveat and records the demotion and why; a note under §G makes the demotion visible.
- **The strongest form of the argument** (beyond the brief's minimum): the TAM is not merely bigger, it is *wrong in composition* — it counts the ~120,000 AI-native startups §A.4 itself calls "a trap… with no budget for a control plane". A number counting organisations we have argued cannot buy is not conservative, it is wrong.

**Change B — certification dates are now costed, budget-flagged plans.**
- §E.4.1 gained a **"Cost and funding status" column**. Type I (Dec 2026): **$7,000–$15,000**, `Requires budget approval — not currently funded`. Type II (Sep 2027): **$15,500–$50,000** audit fee **plus $20,000–$60,000** internal engineering time, year-1 all-in band $50,000–$150,000, same flag. All bands are already in the source register (#39, #40, #41).
- Every "why" cell was rewritten to state **what the milestone unlocks** rather than that it is a promise. §E.4.2's Jan 2028 row carries the same cost + flag.
- §E.3 segment 9 now names only milestones we control (Tier 2 Nov 2026, Tier 3 Feb 2027, SSO+RBAC Mar 2027, second provider Jun 2027) and mentions certification **once, as a costed plan**: *"SOC 2 Type I scoped for December, roughly ten thousand dollars, pending budget approval."* The full roadmap and the Type II band moved to the slide body.
- A note under §E.4.1 states the funding status of the whole table honestly: only the two certificate rows need external cash, but the rest is unbudgeted two-person engineering time, so **every date in the roadmap is a target, not an entitlement**.

**Change C — the Enterprise tier no longer depends on a certification we do not have.**
- §D.1 pricing table: the Enterprise row now carries the five explicit non-certification drivers — **dedicated tenancy on the customer's own Vultr account, 15,000 included tasks/mo, org-level 365-day retention, evidence export in auditor-acceptable form, signed support SLA** — and the sentence "**Not sold on a certification — we have none.**" A note beneath the table states the tier is sold on *tenancy, volume, retention, export, SLA* and adds what ships on day one vs. what is dated roadmap (retention Mar 2027, export Apr 2027) — a stronger, more honest version than the brief asked for.
- §B.1 gained a five-row table of the same drivers with the buyer's reason for each, and the "not sold on a certification" paragraph.
- §C.1 gained "**How the $3,000 tier beats a managed vendor without a certification**" — a head-to-head against E2B Enterprise, which starts at the same $3,000 and does carry SOC 2/HIPAA/SSO.
- **§C.2 weakness #2 is still present and still strong.** Only its consequence sentence changed: "will block enterprise deals outright" → "**defers the regulated segment and lengthens the sales cycle; it does not block the Enterprise tier**", plus "remains the single biggest gap between us and the regulated sub-segment". The sourced competitor comparison is untouched.
- §C.3's certification axis was amended the same way.
- **One consequence I had to fix to make the document coherent** (§C.2 weakness #4): it said SSO/RBAC "blocks the Enterprise tier today", which contradicted the re-anchored tier. It now says what is true — it blocks the *shared multi-tenant* model, and on the *dedicated* model it is a procurement question with a dated answer, not a contradiction.

**Change D — the isolation ladder now matches engineering reality.**
- **Tier 1** namespaces + cgroup v2 + rlimits (shipping now) → **Tier 2** per-task throwaway Vultr VM (Nov 2026, at the Vultr kickoff) → **Tier 3** microVM-grade (`Firecracker`/`Kata`, 2027), behind the same `SandboxProvider` interface, matching ARCHITECT §4.
- The ladder appears in **§C.1** (new table + the BRZ row of the landscape table), **§C.3** (the kernel-isolation axis row now carries the dated path) and **§E.4.1** (new Nov 2026 Tier 2 row; the Feb 2027 row relabelled Tier 3 / microVM-grade, and its "why" says it moves BRZ off the weakest rung *after* Tier 2 has landed). §C.2 weakness #1 gains the dated path while keeping "until Tier 2 ships, the weakness is real".
- §C.3's slide one-liner was corrected: it previously said "E2B gives you a microVM. We give you a microVM-shaped answer…" which is false once Tier 3 ships. It now reads "**E2B gives you a microVM. We give you the document your auditor accepts** — on your own infrastructure, on a dated ladder to microVM-grade isolation", matching the pitch line in §E.3 segment 8.

**Required revision note** — a visible block at the top of the document (under the title, above §0) records the date, that this is revision 2, that it was revised on the coordinator's instruction, and the four changes in one line each, with the note that each change makes the document *more* defensible.

**Authorised out-of-band change** — §0.5 now states that the workload is **decided** (`self-healing-runner`, `docs/architecture/02-phase1-design.md` §2.1) and that it is the code-execution column the document was already sized on, so **no number moves**. The sensitivity table is kept because it shows how much the numbers depend on the choice.

**Also updated for accuracy, flagged in the revision note and in this summary so the coordinator can reverse it:** §G item 12 previously said the workload "is not chosen". It now records the decision and keeps the sensitivity as the caveat. No weakness was softened and no caveat was removed.

## Verification

- `python3 /tmp/opencode/brz_business_calc2.py` (the revision-1 script) → **every figure identical to revision 1**: 11,904,762 devs · 3,119,048 · 259,921 orgs · 62,381 beachhead · $6,349.20 ACV · TAM $1.650B · SAM $396.1M · SOM $3.96M · 9,357 regulated orgs at $15,532.20 = $145.3M · variable cost $0.0257 (86% inference) · M12 MRR $20,473 / ARR $245,676 · break-even 28.0 customers and 89,805 tasks/mo · Starter-only 132 customers.
- `python3 /tmp/opencode/brz_rev2_verify.py` (new) → **50 checks, 0 failures**: the 33 revision-1 figures re-derived from first principles, plus the 17 revision-2 figures (24.0% beachhead/TAM ratio · 748,572 devs = 24.0% · 28,071 / 34,310 split · 0.064% reachability · 3.6–4.0% of Gartner · ±50% elasticity → 31,190 orgs/$198M and 93,571 orgs/$594M · tier/price/ACV figures). Certification bands are restated from the source register, not derived.
- `python3 /tmp/opencode/tblcheck.py` → **45 tables checked, 0 column mismatches**.
- **Section-by-section diff against the committed revision 1** (script over `git show HEAD:…`): **unchanged** — §0.2, §0.3, §0.4, §A.1, §A.4, §B.2, §B.3, §B.4, §D.2, **§D.3**, §D.4, §E.1, **§E.2**, §E.4.3, **§F.1**, **§H source register**. **Changed** — header, §0.1, §0.5, §0.6, §A.2 (3 cells), §A.3, §B.1, §C.1, §C.2 (3 cells), §C.3, §D.1, §E.3, §E.4/§E.4.1/§E.4.2, §G (2 items + 1 note). **New** — §A.5.
- `grep "SOC 2"` → 22 lines, every one now an **honest gap** (§C.2 #2, §F.1, §C.1 comparison), a **sourced cost** (§B.2, §D.1, §H) or a **budget-flagged plan** (§E.4.1, §E.4.2, §E.3 segment 9). None reads as an unfunded promise.
- `grep "1.65|TAM"` → 21 lines; the **framing** changed, the **number** did not.
- Three sentences re-counted: **63 words, 25s @150wpm, 27s @140wpm** — unchanged.
- No TODO/TBD/placeholder text. Document is 907 lines.
- **Judge read-through (the brief's last verification step):** re-read end to end as a sceptic. The changes make the document **more** credible, not less — the headline is now the number that survives two specific questions instead of the one that survives none; the two unfunded promises now carry prices; the $3,000 tier no longer rests on something we cannot deliver; and "we lose the isolation axis" now reads as a dated path instead of a permanent defect. No new claim was made that the evidence does not carry, and no existing weakness was softened.

## Decisions / trade-offs

- **The demotion argument was made on composition, not on magnitude.** Leading with the beachhead because it is "smaller" would be a weaselly argument a judge would ignore. The argument that holds is that the TAM *includes a segment we have already written off* (§A.4 segment 3), so it is wrong, not merely big. §A.5 says exactly that.
- **The 12-developer org-size assumption is shared by the beachhead and the TAM.** Demotion does not remove it, and §A.5 caveat 1 and §G item 1 both say so explicitly. We did not pretend the headline number is assumption-free.
- **One check is labelled a consistency check, not a cross-check.** The 24% organisation filter and the 24% developer filter are the same survey statistic applied to the same population, so they agree by construction. Calling that an independent cross-check would be a lie a judge could catch in ten seconds.
- **The Enterprise tier is re-anchored but not upgraded.** Tenancy, volume, SLA and the artifact ship today; **retention (Mar 2027) and evidence export (Apr 2027) are dated roadmap**, and §D.1 now says so next to the price. Selling the $3,000 tier on a promise of a certificate we do not have would have been worse than the original problem.
- **The roadmap's funding status is disclosed in full, not just for the certificates.** The two certificate rows carry quoted external costs; the other seven are unbudgeted two-person engineering time. The document says so rather than implying the whole roadmap is paid for.
- **The Type I date stayed at Dec 2026** (the brief's example spoke of Q1 2027). Moving it would have broken the "no date changes" constraint and created a mismatch between the spoken line and the roadmap. The Dec 2026 row now reads "scoped, not reported" — an engagement, not a certificate — and carries the price and the flag.

## Follow-ups / risks

- **§C.2 weakness #4 was amended for coherence, not because the brief asked.** It said SSO/RBAC "blocks the Enterprise tier today", which the re-anchored tier contradicts. The weakness is intact and still strong. If the coordinator prefers the old wording, this is the one edit to reverse — but the contradiction would come back with it.
- **§G item 12 was updated for accuracy** (the workload *is* now chosen). Flagged in the revision note inside the document and here. Trivially reversible.
- **The Nov 2026 Tier 2 date is the load-bearing new claim** in this revision. It comes from the brief and from ARCHITECT §4 (`VultrVMProvider`, written against a mock). If the Vultr kickoff slips, the isolation ladder slips with it, and §C.2 weakness #1 stays live for longer. **The coordinator should confirm Tier 2's date against ARCHITECT's §4 and §14 before it is said aloud.**
- **Both certification dates remain unfunded**, now explicitly. The money is real: **$7,000–$15,000 (Type I)** and **$35,500–$110,000 all-in (Type II)**. Either the budget is approved, or §E.3 segment 9's spoken line changes to drop the certification mention entirely. It cannot stay as a dated promise.
- **The pitch assembly owner is still unnamed (Q-014).** The slide outline (4:40, containment moment 1:32–2:20) and the three sentences are unchanged and final; someone still has to build the PDF and record the video.
- **Nothing was committed or pushed**, per the protocol. The working tree holds revision 2; `HEAD` still holds revision 1. GITMASTER needs to commit `docs/business/01-market-and-monetization.md` and the brief's `<DONE>` marker.
- **The §C.3 one-liner was corrected.** "We give you a microVM-shaped answer to a different question" was false once Tier 3 ships. It now matches the pitch line already used in §E.3 segment 8, so the deck and the document say the same words.

## One-line read for the coordinator

> Revision 2 is a precision pass: the same numbers, better ordered, with the two unfunded promises priced and flagged, the $3,000 tier re-anchored on five things we actually deliver, and the isolation weakness converted from a permanent gap into a dated ladder. **The one thing still needing your decision is money: $7,000–$15,000 for a SOC 2 Type I engagement, or the certification line comes out of the spoken plan.**
