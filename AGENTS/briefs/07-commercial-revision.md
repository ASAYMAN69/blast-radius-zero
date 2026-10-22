<DONE>

# 07 — Revise the commercial document: four decisions from the coordinator

Agent name: BUSINESS. You are BUSINESS. If no name was given to you, STOP and ask.

**Wave:** 2 (parallel — no write-scope conflict with BACKEND or FRONTEND)
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 02 (`<DONE>`) — you wrote the document; this revises it

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BUSINESS.md`, then this brief. You are in your **existing session** — you wrote `docs/business/01-market-and-monetization.md` and you know its section numbers. Do not re-derive the document; **revise** it.

## Goal
Apply four decisions from the coordinator to the commercial document. The document is strong — **this is a precision pass, not a rewrite**. Every one of the four changes makes a claim *more defensible*; none of them softens the analysis, removes a weakness, or changes a number you derived.

## Why / context
The coordinator reviewed the document and decided four things, and the standing instruction was: *"never settle for less."* Read that as the bar for this brief — **do not take the lazy version of any of the four changes.** Each has a stronger version, and the strong version is the one specified below.

**Do not touch anything else.** §F (the uncomfortable answer), §C.2 (the eight weaknesses), §D.3 (the bear case), §0.3 (no traction), §G (what this does not claim), and every derived number stay exactly as they are. The source register stays. The three spoken sentences stay.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/business/01-market-and-monetization.md` (revise in place)

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/business/01-market-and-monetization.md` — your document
- `docs/architecture/02-phase1-design.md` — the engineering counterpart (read §4 for the sandbox tiers; you need it for change D)
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none.

## The four changes

### Change A — Lead with the beachhead, demote the TAM

**The problem.** The $1.65B TAM is the weakest number in the document (§A.3, §G item 1) and it currently occupies headline slot #1 (§0) and the front of the market slide (§E.3, segment 6). Leading with a low-confidence number is a gift to a skeptical judge.

**The change.**
1. **§0 headline table** — reorder so the **beachhead becomes #1**: *62,381 policy-gated orgs · $396.1M/yr SAM*, with its derivation. The TAM becomes a later entry, still present, still labelled `derived (low)`, and **now framed as the ceiling the policy gate creates** rather than as the headline.
2. **§A** — keep the full TAM arithmetic and the top-down cross-check exactly as they are. Add one framing line near the TAM: it is the *addressable ceiling if the policy gate loosens*, and the beachhead is what we can actually sell into today. The beachhead gets its own short subsection if it does not already have one, with its own derivation and its own caveats.
3. **§E.3, slide segment 6 (the market slide)** — the spoken line becomes the bottom-up chain that **ends at the beachhead** (225M GitHub devs → 26.2% in agent-workflow orgs → 259,921 orgs → 24% policy-gated → **62,381** → **$396M/yr**). The TAM appears afterwards, in one clause, as the upside if the gate loosens — **not** as the number the slide is about.
4. **§G** — keep the TAM caveat, and add a line recording that it was deliberately demoted from the headline and why.

### Change B — The certification dates become costed, budget-flagged plans

**The problem.** The roadmap promises *"SOC 2 Type I readiness (Dec 2026)"* and *"SOC 2 Type II report issued (Sep 2027)"*. We have **no budget for either**, and the coordinator flagged this as promising something unfunded as if it were funded. It is also the one thing in the document a judge can call a lie with a single question.

**The change — do not simply delete the roadmap rows.** The rubric scores *Presentation* 4/5 on **future goals and plans** being concrete and dated, and a gutted roadmap loses that gate. So the dates stay, but every certification date becomes a **costed plan with an explicit funding flag**:
1. **§E.4.1** — for each certification row, state: the **date**, the **cost band** (you already have the sourced numbers — Type I **$7,000–$15,000**, Type II **$15,500–$50,000** plus roughly **$60,000** of engineering time), and an explicit **`requires budget approval — not currently funded`** flag. Rewrite the "why it is on this list" cell so it says what the milestone *unlocks*, not that it is a promise.
2. **§E.4.2, the Jan 2028 row** — the same treatment.
3. **§E.3, slide segment 9 (future plans)** — the spoken line stops naming SOC 2 dates and instead names the milestones **we actually control and will do**: the microVM-grade isolation tier, SSO + RBAC, the second sandbox provider, and evidence export in an auditor-acceptable form. The certification appears as **one** line, framed as a costed plan — e.g. *"SOC 2 Type I scoped for Q1 2027 at roughly $10,000, pending budget approval"* — if the segment has room. If it does not, the certification line is dropped from the spoken line and lives in the slide body only.
4. Anywhere else in the document where SOC 2 reads as a *promise* rather than a *gap or a costed plan*, reclassify it. (Note: §C.2 weakness #2 and the compliance-spend rows in §B.3 and §D.5 are **correct as they are** — they are the honest gap and the budget we displace. Do not weaken them.)

### Change C — The Enterprise tier must not depend on a certification we do not have

**The problem.** §C.2 weakness #2 states plainly that having no certification *"will block enterprise deals outright"* and is *"the single biggest gap between us and the Enterprise tier we are pricing at $3,000/month."* That means the highest price in the ladder is currently gated on something we have not funded and cannot deliver in the first release. **The ladder is commercially incoherent as it stands.**

**The change.** Re-anchor the Enterprise tier's value on what we can deliver **today**, and make certification a future unlock rather than a prerequisite:
1. **§D.1 pricing table** — the Enterprise row's "what you get" column gains explicit **non-certification** value drivers: a **dedicated / isolated Vultr tenancy** (your own account, your own network boundary), a **high included task volume** (15,000/month, already in the table), **audit-log retention** at org level, **evidence export** in an auditor-acceptable form, and a **signed support SLA**. State in the table or immediately beneath it: **the Enterprise tier is sold on tenancy, volume, retention, export, and SLA — not on certifications**, and certifications are a later unlock.
2. **§B (the buyer)** and **§C.1** — where the Enterprise tier's justification currently leans on compliance or certification, re-anchor it on the same five drivers.
3. **§C.2 weakness #2** — **keep the weakness and keep it strong.** Do not soften it. Amend only its consequence sentence so it reads accurately: the absence of certifications **defers** the regulated-segment motion and raises the sales cycle; it does not **block** the tier, because the tier is now sold on tenancy, volume, retention, export, and SLA. Keep the sourced competitor comparison.
4. If any other part of the document says the Enterprise tier requires a certification, fix it to match.

### Change D — The isolation ladder must match the engineering reality

**The problem.** The roadmap has a *"Feb 2027 MicroVM tier"* but says nothing about the isolation ladder that actually exists, and §C.3 says BRZ *"loses this axis outright"* against microVM vendors — which reads as a permanent gap rather than a dated one.

**The change.** ARCHITECT's design (`docs/architecture/02-phase1-design.md` §4) specifies the real ladder:

| Tier | Isolation | When |
|---|---|---|
| **Tier 1** | Linux namespaces (bubblewrap) + cgroup v2 + rlimits, egress denied | **Phase 1 — shipping now** |
| **Tier 2** | **Per-task throwaway Vultr VM** (full VM, own kernel boundary) | **Ships Nov 2026, at the Vultr kickoff** |
| **Tier 3** | microVM-grade isolation (Firecracker / Kata) | 2027, behind the same `SandboxProvider` interface |

1. **§E.4.1** — re-label the Feb 2027 row as **Tier 3**, name it *"microVM-grade isolation"*, and make the "why" cell say it moves BRZ off the weakest rung **after Tier 2 already lands in Nov 2026**. It must be clear that the isolation axis improves on a dated path, not that it is a permanent loss.
2. **§C.3 competitive table, the BRZ row** — add the tier ladder so the reader sees the isolation position improving on a schedule: Tier 1 now, Tier 2 at kickoff, Tier 3 in 2027.
3. **§C.3 axis row on kernel-level isolation** — keep the honest verdict that we lose today, but add the dated path to parity.
4. **§A / §C.1** — if the document anywhere implies the current namespace isolation is the ceiling, fix it.

## Additional required change — a visible revision note

Add a short block at the very top of the document (under the title, above the executive summary) recording: the date, that this is revision 2, that it was revised on the coordinator's instruction, and **the four changes in one line each**. A judge reading a document that has been revised should be able to see that it was revised *and* that the revisions made it more honest, not less.

## Constraints
- **Revise, do not rewrite.** Section numbering, the source register, the derived numbers, the three spoken sentences, §F, §C.2, §D.3, §0.3 and §G keep their content and their structure.
- **No number changes.** Every derived figure in the document recomputes as it did. This brief changes **framing, ordering, and the cost/flag treatment of two roadmap rows** — nothing else.
- **Every claim you add must be sourced or explicitly labelled** with the same `sourced` / `derived` / `assumed` discipline the document already uses. The certification cost bands are already in your source register — cite them.
- **No new traction, no softened weaknesses, no removed caveats.**
- Stay inside your write scope. If you need a file you do not own, request permission per `AGENTS/permissions/PROTOCOL.md` — do not take it.
- Do not commit or push. Do not use the `subagent` tool.

## Acceptance criteria
- [ ] §0 headline table leads with the beachhead; the TAM is present, still labelled low-confidence, and framed as the ceiling the policy gate creates.
- [ ] Slide segment 6's spoken line ends at the beachhead; the TAM appears in one clause after it.
- [ ] Both certification roadmap rows carry a date, a **sourced cost band**, and an explicit **"requires budget approval — not currently funded"** flag.
- [ ] Slide segment 9 no longer names SOC 2 dates as promises; the certification, if mentioned aloud, is a costed plan.
- [ ] The Enterprise tier's value is anchored on **tenancy, volume, retention, export, and SLA** — in the pricing table, the buyer section, and the competitive section — with no dependence on a certification we do not have.
- [ ] §C.2 weakness #2 is still present and still strong; only its consequence sentence changed.
- [ ] The three-tier isolation ladder appears in §E.4.1 and in the competitive table's BRZ row, and matches ARCHITECT's §4.
- [ ] A visible revision note at the top of the document records the four changes.
- [ ] **Every number in the document still recomputes.** Re-run your calculation scripts and paste the result.
- [ ] §F, §C.2, §D.3, §0.3, §G, the source register, and the three spoken sentences are otherwise unchanged — confirm this explicitly in your summary.

## Verification
- Re-run the market, ramp, unit-economics and break-even scripts; paste the output and confirm every figure is unchanged.
- Diff the document against the previous revision and confirm the **only** changes are the four above plus the revision note. Paste a summary of the diff (section-by-section, not a raw patch).
- Search the document for every occurrence of `SOC 2` and confirm each one is now either an honest gap, a sourced cost, or a budget-flagged plan — and that **none** reads as an unfunded promise.
- Search for every occurrence of `1.65` / `TAM` and confirm the framing changed but the number did not.
- Read the whole document once as a judge who distrusts startups, and confirm the changes made it **more** credible, not less.

## Out of scope
- Any change to the architecture, the code, or the roadmap in `docs/architecture/02-phase1-design.md`.
- The slide PDF and the video (still unnamed owner, Q-014).
- The workload choice — ARCHITECT has now decided it: **`self-healing-runner`**. If your §0.5 workload sensitivity mentions the workload being undecided, update that one line to reflect the decision and cite the design doc. **This is the only change outside the four above that you are authorised to make.**

## Notes
- Your §0.5 workload sensitivity analysis is now anchored on a decided workload (`self-healing-runner`, a code-execution workload) — which is the base case your numbers already assume, so **no number moves.** Say that explicitly in your summary.
- The tier ladder in change D is the single most valuable addition in this brief: it converts "we lose the isolation axis" into "we lose it today, and here is the dated path". That is a stronger pitch and it is true.
- Your mailbox is `AGENTS/message/business/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/business/<slug>.md` and wait for the decision. Do not proceed without it.
