<WORK IN PROGRESS>

# 01 — Vultr C1 capability probe (due diligence, product-neutral)

Agent name: ARCHITECT. You are ARCHITECT. If no name was given to you, STOP and ask.

**Wave:** 0
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** nothing

## Goal
Produce a decision-grade factsheet on the Vultr capabilities that Challenge 01 of the Agent Rush Hackathon depends on, so the BRZ architecture can be chosen without gambling on unknowns. You are doing **research and analysis only** — you are not building the product, and you are not choosing the product.

## Why / context
BRZ is entering **Challenge 01 · Blast Radius Zero** of the Vultr Agent Rush Hackathon (lablab.ai × Vultr). The full brief is in `HACKATHON.md` at the BRZ root — read it, especially §2, §3, and §5. You are not being asked to restate it. You are being asked to answer the questions the brief leaves open, and to kill the ones that cannot be answered.

The build window is short: the online build phase closes **8 Nov 2026 17:00 UTC** and submissions lock **8 Nov 2026 23:00 UTC**. Every unknown you resolve is a day of build time returned.

## Write scope (EXCLUSIVE — do not touch anything else)
- `docs/architecture/01-vultr-c1-capability-probe.md` (new)

## Read scope
- `HACKATHON.md`
- `AGENT.md`
- `AGENTS/permissions/PROTOCOL.md`
- The public web (Vultr docs, Vultr API docs, Vultr Serverless Inference docs, the sandbox projects named in the brief)

## Shared / serialized files
- none — you own no shared file in this wave.

## Requirements

Answer each numbered question with a **verdict**, the **evidence** (URL + quoted text + access date), and a **confidence** (`confirmed` / `likely` / `unknown`). Do not pad. "Unknown" is a valid and useful answer. A confident guess presented as fact is a failure.

**A. Serverless Inference (this decides Pattern B viability)**
1. The full live model list at `https://api.vultrinference.com/v1`. Which models are chat/prompt, which are image generation, and **is there any vision-understanding (image input) model**? This decides whether Pattern B's "a vision model verifies" step is possible on Vultr alone.
2. Does the API support **tool/function calling** and **streaming**? Does it support long context?
3. Is the endpoint genuinely OpenAI-compatible (which SDK, which base-URL/middleware setup)?
4. Pricing per model (input/output tokens), and what a realistic agent loop costs for ~100 runs of ~30k tokens each. Include the actual arithmetic.
5. **Access requirements**: can an account created today call it, or does it need an event credit/gift code/a payment method? Is there a free tier or event grant? Is there a rate limit? **The coordinator will only get Vultr access at kickoff — state exactly what they must do, in order, to be able to make the first inference call, and what the model-id string looks like when they do.**
6. Which **model would you use for the planning step vs. the execution loop**, and why? Cost/quality trade-off, using the real price list.

**B. Sandbox options on Vultr (this decides the isolation architecture)**
7. For each of **Docker, gVisor/runsc, Firecracker, Kata Containers, Microsandbox (libkrun), E2B** — does it require **KVM / nested virtualization**? Does Vultr **Cloud Compute** offer nested virtualization? Which Vultr plan (Cloud Compute, Dedicated Cloud, Bare Metal) supports what? This is the single most important question in the probe.
8. **Does Vultr ship a managed sandbox or secure-execution product** (the pricing page mentions "secure sandboxes" and "VX1 for AI agent orchestration", and "Open Source Credits" mentions "CI runners")? If Vultr already sells a sandbox product, that is a shortcut worth more than anything else in this document. Document what it is, what it does, and whether it satisfies "isolated sandbox running on Vultr" for free or cheaply.
9. Does **E2B hosted** satisfy "isolated sandbox running on Vultr"? (Its infra is E2B's cloud, so likely not.) Does **E2B self-hosted** work on a single Vultr VM, and what does it cost in ops effort? Same question for **Microsandbox self-hosted**.
10. **Vultr API**: the exact endpoints and auth to create, snapshot, and **destroy** a Cloud Compute instance programmatically. How fast is create→ready, and is there a cheaper/faster primitive (Snapshots, "Vultr Functions", container registry, Kubernetes) suited to **per-task throwaway sandboxes**? Cold-start latency decides whether a per-task VM is viable in a 5-day build.
11. Cheapest viable instance for a sandbox: exact plan, $/hr, and the real cost of a 60-second run. Compute the budget against the $200 participant credit, **including** inference cost. State which side of the budget dominates.

**C. Compliance reading of the brief**
12. The brief says "isolated sandbox **running on Vultr**" and names E2B/Microsandbox as examples. Which options would a judge read as **compliant** vs. a **violation**? Give the argument for each side — a reviewer will read the README and the video.
13. "Process isolation: execution never touches the host or app runtime." What is the **minimum defensible** interpretation, and what would a technical judge push back on?

**D. Deadlines and assets**
14. Confirm the live schedule from lablab.ai — especially the **kickoff time contradiction** (header says 9:00 PM BST, schedule says 10:00 PM BST) and the actual submission cutoff in UTC.
15. What must be in the **public GitHub repo** for it to pass as "setup and documentation" to a judge who will try to run it? What is the minimum viable README for a 5-day-built project?
16. Any **published prior entries** for this or similar Vultr hackathons — what did they build, and what did the judges reward? Public GitHub repos, write-ups, post-mortems. Name them.

## Constraints
- **Research only.** Do not create a Vultr account, do not sign up, do not spend money, do not run anything that costs money. Read the public docs and the public web. If an account is required to answer a question, say so and describe the exact steps the coordinator would take instead.
- **The coordinator has no Vultr access until kickoff (3 Nov 2026).** Every question must therefore be answerable from **public documentation**. Where a live call would be needed, document the exact request the coordinator can make at kickoff instead of guessing the result. Do not invent a response.
- **Inference is OpenAI-compatible by design.** The dev provider is Groq (`https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b`); the prod provider is Vultr Serverless Inference (`https://api.vultrinference.com/v1`), swapped by three env lines. So your findings must describe Vultr Inference in terms of **OpenAI compatibility** — base URL, auth header form, whether `/chat/completions` behaves the same, model-id naming, and what diverges. Assume the code will point an OpenAI SDK at it.
- **Do not choose the product.** You are producing facts and recommendations about infrastructure. The product decision is the coordinator's.
- **Do not write product code.** You write one markdown document.
- Stay inside your write scope. If you need a file you do not own, request permission per `AGENTS/permissions/PROTOCOL.md` — do not take it.
- Do not commit or push. Do not use the `subagent` tool.
- Every factual claim gets a URL and an access date. No claim from memory.

## Acceptance criteria
- [ ] All 16 questions answered with verdict + evidence + confidence.
- [ ] Question 7 (KVM / nested virtualization) answered definitively, with a clear statement of which isolation options are actually available on a Vultr Cloud Compute VM.
- [ ] Question 10 includes real endpoint names and a real cold-start number (or an explicit "could not determine" + how the coordinator determines it in 10 minutes).
- [ ] Question 12 ends with a clear recommendation: which sandbox option to build on, and which to name in the README as a considered-and-rejected alternative.
- [ ] A "Decisions this probe forces" section at the end: 3–6 bullet points stating what changes in the BRZ architecture because of what you found.
- [ ] A "Still unknown" section listing what could not be resolved and the cheapest way to resolve it.
- [ ] Document is written to `docs/architecture/01-vultr-c1-capability-probe.md` only.

## Verification
- Every URL in the document was fetched during this task, and the access date is recorded.
- Spot-check: re-fetch 3 random URLs and confirm the quoted text still matches.
- The document states its own confidence per question; no section is silently empty.

## Out of scope
- Choosing the flagship product workload for BRZ.
- Writing any code, scaffolding, or infrastructure.
- Creating accounts, applying for credits, or running anything paid.
- Any change to `AGENT.md`, `HACKATHON.md`, or the harness files.

## Notes
- The brief is `HACKATHON.md` at the BRZ root. §9 of it is the constraints checklist — the probe should say which items are at risk.
- **Priority order if you run short:** questions 7, 10, 1, 8, 11, 12, 14, 16. The rest can be marked `unknown` honestly.
- Your mailbox is `AGENTS/message/architect/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/architect/<slug>.md` and wait for the decision. Do not proceed without it.
