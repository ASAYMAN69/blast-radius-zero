<WORK IN PROGRESS>

# 02 — Market, buyer, and monetization for containment-first agent execution

Agent name: BUSINESS. You are BUSINESS. If no name was given to you, STOP and ask.

**Wave:** 0
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** nothing

## Goal
Produce the commercial half of the BRZ pitch: a sourced market definition with checkable arithmetic, a named buyer and the price the work would be bought at, a competitive landscape that a knowledgeable judge will not see through, a revenue model, and a slide-ready narrative with a time budget. This document is what turns a working demo into a score of 4 on Presentation and 3+ on Business Value.

## Why / context
BRZ is entering the **Vultr Agent Rush Hackathon**, **Challenge 01 · Blast Radius Zero**: a web app that acts as a centralized control layer, dispatching real work into an isolated sandbox on Vultr and returning verifiable output. Read these three files first:

- `HACKATHON.md` — the full brief (challenge, tech, submission requirements).
- `JUDGING-CRITERIA.md` — **the scoring ladder you are writing against.**
- `STATE.md` — current state, decisions, and open questions.

**The two rubric facts that make you critical:**

1. *Presentation* reaches only **3/5** unless the presentation contains **market analysis, marketing revenue, and future goals/plans**. You are writing the first two; the third is `ARCHITECT`'s roadmap and the coordinator's call.
2. *Business value* is **1–5** on market need, revenue potential, customer base, and scalability. A 3 needs a real market need with revenue potential; a 4 needs clear market potential and a large customer base.

**The product is deliberately not locked yet** (the coordinator is still choosing the flagship workload). So this brief is scoped to be **product-agnostic on purpose**: the market for *safe, verifiable, contained execution of AI agents* exists regardless of which workload BRZ ships. Where the workload choice would change the numbers, say so and give the range.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/business/01-market-and-monetization.md` (new)

## Read scope
- `HACKATHON.md`, `JUDGING-CRITERIA.md`, `STATE.md`, `AGENT.md`
- `skills/financial-analysis/`, `skills/budget-forecast/`, `skills/company-valuation/`, `skills/cvp-breakeven/`, `skills/pitch-deck/`, `skills/investor-research/` — read the `SKILL.md` of each before you use it, and follow it
- The public web (market reports, pricing pages, competitor sites, filings)

## Shared / serialized files
- none — you own no shared file in this wave.

## Requirements

Answer each numbered item with a **number, a source (URL + access date), and a confidence** (`sourced` / `derived` / `assumed`). Label anything you cannot source as an assumption. A judge will check your numbers — an unsourced number is worse than no number.

**A. The market**
1. **Define the category** in one sentence, precisely enough that you can size it. The honest candidate is *"infrastructure for running untrusted AI-generated code safely"* — but decide and defend it. Include the adjacent categories it draws from (AI code assistants, CI/CD, agent infrastructure, code sandboxing, browser automation infrastructure, secrets management, eBPF/observability).
2. **Size it bottom-up.** Build a number a technical judge can check: how many teams/developers would buy this, at what price, how often. Show every step of the arithmetic. Cross-check with at least one top-down figure and say where they disagree and why.
3. **Segment it.** Which segment is the beachhead? Enterprise platform teams, security/compliance teams, AI-native startups, or regulated industries? Give the sizing for the beachhead separately from the total.

**B. The buyer**
4. **Name the buyer** — role, not "developers". Who owns the budget for this?
5. **What does the job cost them today?** Time, engineer-hours, incident risk, compliance exposure, audit effort. Put numbers on it; a risk avoided has a price.
6. **What is the alternative?** Including *"they would just build it in-house"* — and honestly, when is that the right answer? A judge who works in this space will ask.
7. **Why now?** What changed to make this a 2026 purchase rather than a 2023 one? (Agent-generated code volume, compliance pressure, incident headlines, cloud costs, procurement requirements.) Cite it.

**C. Competition**
8. **Who does this today?** Cover at minimum: the hosted code-execution/sandbox vendors, the browser-automation platforms, the CI vendors, the big cloud providers' sandbox/container offerings, and the in-house option. For each: what it does, its isolation model, whether it runs on your infrastructure, and its pricing shape.
9. **The containment differentiation.** Where is BRZ's containment model genuinely better, and where is it honestly worse? "Better" is not the same as "different". Be explicit about the weaknesses — a judge will find them, and it is better that you name them first.
10. **The competitive analysis for the deck.** A one-page comparison a judge can read in ten seconds: the axes that matter, positioned on the 2×2 that favours BRZ, **plus the axis where a competitor beats us**. The rubric awards a 5 for competitive analysis that shows strengths *and* uniqueness.

**D. Money**
11. **A price with a unit.** Per run? Per sandbox-hour? Per seat? Per environment? Give the number, the unit, and the reasoning. Justify it against the alternatives from §8.
12. **A revenue model.** How BRZ actually charges, and why that model fits the buyer from §4.
13. **A 12-month shape.** A simple, honest monthly ramp with the assumptions written down. Label it a projection, not a forecast. Use the finance skills; show the arithmetic.
14. **Unit economics.** Cost per sandbox run (compute + inference) versus revenue per run, and what volume makes this work. If it does not work at some plausible volume, say so — that is a useful finding, not a failure.

**E. The pitch**
15. **The narrative.** One paragraph: problem → solution → value proposition, in language a non-specialist judge understands, with no jargon and no unexplained acronyms.
16. **Three sentences for the video.** The exact words for the problem, the solution, and the value. They will be spoken aloud, so they must survive being read aloud in under 30 seconds total.
17. **A slide-ready outline with a time budget.** The pitch video must be **under five minutes** (the rubric caps *Presentation* at 2/5 below three minutes). Propose a structure with seconds per section totalling **4:00–4:45**, leaving room for the containment moment. Say which section is the containment moment and how long it gets.
18. **Future goals and plans** — the third rubric line item. Draft concrete, dated goals for 12 months. ARCHITECT supplies the technical roadmap; you supply the commercial and company arc.

**F. The uncomfortable question**
19. **Why should a team trust a 5-day-old hackathon project with their code execution?** This is the objection the containment model must answer, and it is a *business* objection before it is a technical one. Answer it in a way the pitch can use.

## Constraints
- **Research and analysis only.** Do not write product code, do not scaffold anything, do not create accounts, do not spend money.
- **Do not choose the product.** You are not deciding the flagship workload. Where the workload choice changes a number, give the range and say which way it moves.
- **Do not invent traction.** No fake customers, users, revenue, or partnerships. If BRZ has none, say "no traction yet" and frame the commercial case as a hypothesis with a validation plan. A fabricated number in front of a judge is a disqualifying event, not a rounding error.
- **Every number needs a source and an access date.** Distinguish `sourced` from `derived` from `assumed`.
- **Stay inside your write scope.** If you need a file you do not own, request permission per `AGENTS/permissions/PROTOCOL.md` — do not take it.
- Do not commit or push. Do not use the `subagent` tool.
- The document must be readable by a judge, not just by you. Use tables. No wall of prose.

## Acceptance criteria
- [ ] All 19 items answered, each with a number, a source, and a confidence label.
- [ ] The market size is **bottom-up with visible arithmetic** and at least one independent cross-check.
- [ ] The competitive landscape covers the in-house option honestly, and names where a competitor beats BRZ.
- [ ] A price, a revenue model, and unit economics per run (compute + inference vs revenue) are stated, with the assumptions written down.
- [ ] The three sentences for the video exist, are under 30 seconds spoken, and contain no jargon.
- [ ] The slide outline has a time budget totalling **4:00–4:45** and marks where the containment moment goes.
- [ ] Future goals and plans are concrete and dated.
- [ ] The uncomfortable question (§19) is answered in pitch-usable language.
- [ ] A closing "What this document does NOT claim" section listing the weakest assumptions.
- [ ] Written to `docs/business/01-market-and-monetization.md` only.

## Verification
- Every URL was fetched during this task; access dates recorded.
- Re-derive every headline number from the arithmetic in the document. If it does not recompute, fix it.
- Sanity-check the 12-month ramp and the unit economics by recomputing them with a calculator, not by eye.
- Read your own document once as if you were a judge who does not work in this space, looking for jargon, unsourced numbers, and unfalsifiable claims.

## Out of scope
- Choosing the flagship workload.
- Writing the slide deck itself or scripting the video — you supply the outline and the words; someone else assembles.
- Any change to `AGENT.md`, `HACKATHON.md`, `JUDGING-CRITERIA.md`, `STATE.md`, or the harness files.
- Any code.

## Notes
- The rubric you are writing against is `JUDGING-CRITERIA.md` §"What this means for BRZ". Read it twice; the time budget and the three missing rubric items are the whole point of this brief.
- The skills in `skills/` are the house method. `financial-analysis` and `company-valuation` for §13-14, `pitch-deck` for §17, `investor-research` for §8, `cvp-breakeven` if unit economics need it.
- **Priority order if you run short:** 1, 2, 4, 8, 9, 11, 12, 15, 16, 17, 19. The rest can honestly be marked low-confidence.
- Your mailbox is `AGENTS/message/business/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/business/<slug>.md` and wait for the decision. Do not proceed without it.
