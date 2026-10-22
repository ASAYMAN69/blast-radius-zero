# Summary — 02 Market, buyer, and monetization for containment-first agent execution

**Agent:** BUSINESS
**Status:** complete
**Date:** 2026-10-23

## What changed

- `docs/business/01-market-and-monetization.md` (new, 793 lines) — the full commercial half of the pitch. Covers all 19 items of the brief: category definition, bottom-up market with visible arithmetic, top-down cross-check, segmentation and beachhead, the named buyer, the cost of the job today, the alternatives (including in-house, answered honestly), why now, a 15-player competitive landscape, the containment differentiation (six places better, **eight places honestly worse**), a price with a unit, a revenue model, a 12-month ramp, unit economics, the pitch narrative, the three video sentences, a slide outline with a time budget, dated future goals, and the "why trust a 5-day-old project" objection. §0.6 is a coverage map of all 19 items; §G is a twelve-item "what this does NOT claim" section; §H is a 47-row source register with URLs and the 2026-10-23 access date.
- `AGENTS/briefs/02-market-and-monetization.md` — marked `<DONE>` (was `<WORK IN PROGRESS>`).

## The headline numbers

| # | Number | Confidence |
|---|---|---|
| 1 | **$1.65B/yr** TAM (259,921 orgs running agent workflows × $6,349 blended ACV) | `derived` (low — flagged) |
| 2 | **$396.1M/yr** SAM / beachhead (62,381 policy-gated orgs) | `derived` |
| 3 | **$145.3M/yr** regulated sub-segment (9,357 orgs at 2.45× ACV) | `derived` |
| 4 | **$99 / $499 / $3,000 per month** — Starter / Team / Enterprise, plus per-task overage | `assumed`, anchored on competitor prices |
| 5 | **$0.0257** variable cost per contained task (86% inference, 14% compute) | `derived` |
| 6 | **$20,473 MRR / $245,676 ARR** at month 12 of the base case | `derived` from a stated ramp |
| 7 | **Break-even in month 11 (Sep 2027)** — cross-checked two ways: 28.0 customers, or 89,805 tasks/month | `derived` |
| 8 | **188** verified enterprise AI incidents where an autonomous system caused harm with no attacker in the chain | `sourced` (Cyera Research, May 2026) |

## The three sentences the pitch should say

> **1 — Problem:** "AI assistants now run with your keys and your network, and one deleted a production database in nine seconds."
> **2 — Solution:** "We run every task in a sealed, throwaway workspace — no network, no keys, hard limits — and hand back a report of everything it did."
> **3 — Value:** "That report is what lets a security team say yes, turning an unpriceable risk into a budget line."

63 words total; 25 seconds at 150 wpm, 27 at 140. No acronyms, no jargon.

## Verification

- `python3 /tmp/opencode/brz_business_calc.py` → all market, ramp, unit-economics and break-even arithmetic recomputed. **All 19 acceptance-criteria checks pass.**
- `python3 /tmp/opencode/brz_cost_table.py` → every competitor per-task and per-session cost recomputed on one consistent shape (1 vCPU/2 GiB and 2 vCPU/4 GiB reserved) from published per-unit rates.
- `python3 /tmp/opencode/fix*.py` → targeted edits; final grep scan for stale values returned **clean** (no orphaned $0.0250 / 84.3% / 27.8 / 89,337 / 131-customers).
- Markdown table column-mismatch check across all 60+ tables → **0 mismatches**. No TODO/placeholder text. 793 lines.
- Every URL in §H was fetched during this task on **2026-10-23**; access dates recorded per row. Secondary sources (a competitor blog, a research aggregator, two press corroborations) are flagged as such in the register, and no load-bearing number rests on a secondary source alone.

## Decisions / trade-offs

- **Category: "infrastructure that runs AI-generated code and AI-driven tool calls inside a per-task execution boundary, and produces the evidence that the boundary held."** Four load-bearing properties, so the category can be sized. Rejected "the AI agent market" as unaddressable, and rejected "sandbox compute" as a commodity — see the next point.
- **Sandbox compute is a commodity and we do not compete there.** Fly.io's published figures put a ten-developer team's entire monthly sandbox bill at **$49.50–$198.00** (and BRZ's own would be **$5.65**). Therefore the product is priced as a **platform**, the unit is **one contained task**, and the differentiator is the **blast-radius report** (the artifact a security reviewer signs) plus running on the customer's own Vultr account — not isolation and not price. This is the single most consequential finding in the document and it changed the whole pricing model.
- **Buyer: Head of Platform Engineering / Director of AI Enablement** (budget), **security reviewer** (veto), **CISO** (signatory in regulated orgs). Named as roles, not "developers".
- **The in-house option is answered as a legitimate alternative**, with its cost computed at **$380,744 over 18 months** and the four conditions under which it is the right answer named explicitly. We do not argue it away.
- **Weaknesses named before the judge finds them** — §C.2 lists eight, led by the isolation primitive (namespaces vs. Firecracker microVMs) and the absence of any certification.
- **No traction invented.** §0.3 states plainly that BRZ has no customers, revenue, users, partnerships, pilots, LOIs, or design partners, and that everything commercial is a hypothesis with a validation plan (§E.4.3) with explicit kill criteria.
- **The uncomfortable case is surfaced, not hidden:** the model only works on 4 enterprise customers or 28 mixed ones, and **Starter-only never breaks even** (132 customers needed, 25 at month 12). The bear case is flagged as the one to watch.

## Follow-ups / risks

- **The TAM is the weakest number in the document** and is marked low-confidence. It rests on an assumed 12-developer average org size and a US-derived accounts-per-professional ratio applied globally. If the coordinator wants a stronger number, it needs a primary dataset we do not have.
- **§0.5 gives the workload sensitivity** as required — browser automation cuts the beachhead to ~28,000 orgs (~$178M/yr), research to ~37,000 (~$238M/yr). The base case is stated on the code-execution column, which is the most favourable and therefore the hardest to defend. **The coordinator's workload decision changes these numbers; nothing else in the document depends on it.**
- **The pitch assembly owner is still unnamed (Q-014).** §E.3 gives a 4:40 slide outline with the containment moment at 1:32–2:20 and a 48-second beat sheet, and §E.2 gives the exact words. Someone still has to build the slide PDF and record the video.
- **Two of the pitch's claims need the coordinator's sign-off before they are said out loud:** (a) the microVM tier dated Feb 2027 in §E.4.1, which must be reconciled with ARCHITECT's roadmap — if it slips, the Enterprise tier slips with it; (b) the SOC 2 Type I readiness in Dec 2026 and Type II in Sep 2027, which are a real money commitment not yet budgeted anywhere.
- **The price ladder ($99 / $499 / $3,000) is an assumption.** It is anchored on nine competitor price points and passes a per-developer sanity check ($99–$200 per developer per year, below a Docker Business seat at $288 and far below a Copilot Max seat at $1,200), but it has never been tested with a buyer. §E.4.3 makes the price test one of the first three experiments.
- **Out of my scope and unaddressed by me:** the slide PDF, the video recording, and the choice of flagship workload. I did not write them, per the brief.
- **Commit state needs a hand-off.** A commit (`ba10d27`, "chore: make BRZ a monorepo") landed *while this brief was in progress* and contains a **partial, mid-edit version** of `docs/business/01-market-and-monetization.md`. The working tree holds the final, verified version (793 lines, all corrections applied). **GITMASTER needs to commit the working-tree version to replace the partial one in `main`.** I did not commit anything, per the protocol.

## One-line read for the coordinator

> The commercial story is written and every number in it recomputes. The three things I would put in front of a judge today are the **9-second database deletion**, the **188 autonomous-harm incidents with no attacker in the chain**, and the honest line: *"They give you a microVM. We give you the document your auditor accepts."* The one thing I would **not** put in front of a judge without its caveat attached is the **$1.65B TAM** — it is the weakest number here and §G says so.
