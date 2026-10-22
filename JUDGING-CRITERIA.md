# Judging Criteria — Vultr Agent Rush Hackathon

> **Source:** the lablab.ai event page, reproduced in full below. Restructured into tables for readability; no content removed or softened.
>
> **Read this next to `HACKATHON.md`.** This file says how you *score*. `HACKATHON.md` says what you must *build*.

---

## How scoring works

Each of the four criteria is scored **1–5**. Events and tracks can set their own criteria, weights, and score ranges — the event page states which apply, and for this event these four apply.

**20 points total.** 10/20 is a 3 average (adequate); 16+/20 is where the prizes start.

---

## 1. Presentation — scored on the PDF and the video

| Score | Label | What it actually requires |
|---|---|---|
| 1 | Poor | No description of problem or gaps to fill. |
| 2 | Limited | Problem and solution are **not effectively communicated** and difficult to understand. **Presentation video is less than 3 min.** |
| 3 | Adequate | Effectively communicates the problem, solution, and value proposition in **less than 5 min**. Absent market analysis and/or marketing revenue. No future goals or plans. |
| 4 | Strong | Effectively communicates the problem, solution, and value proposition in **less than 5 min**. **Explains market analysis and marketing revenue. Explains future goals and plans.** |
| 5 | Excellent | Exceptional in every aspect. Well-crafted and flawlessly communicates problem, solution, and value proposition. **Effectively shows the project's strengths and uniqueness through competitive analysis.** |

**Ladder summary**
- Under 3 minutes → **capped at 2**, no matter how good the content.
- 3–5 min, no market/revenue/future → **3**.
- 3–5 min **with** market analysis + marketing revenue + future goals and plans → **4**.
- Add competitive analysis that shows strengths and uniqueness → **5**.

> **The demo video is a pitch, not a screen recording.** It must carry problem → solution → value proposition → market → revenue → future plans, and still be under five minutes.

---

## 2. Business value

| Score | Label | What it actually requires |
|---|---|---|
| 1 | Limited Business Value | Little or no potential for practical or commercial viability. Not addressing a significant problem or market need. |
| 2 | Some Business Value | Some potential for business value. Uncertain market feasibility, scalability, or revenue generation. Addresses a niche market with limited demand. |
| 3 | Moderate Business Value | Shows reasonable business value. **Addresses market need with potential to generate revenue.** Requires further development or validation. |
| 4 | High Business Value | High business value, **with clear market potential**. Potential to attract a large customer base and generate significant revenue. Strong market feasibility and scalability. |
| 5 | Exceptional Business Value | Stands out as having exceptional business value. Potential to disrupt the industry or create a new market. Presents a **clear sustainable revenue generation** and long-term business success. |

**Ladder summary:** "we might build a business" = 2-3 · "here is the market, the buyer, the price, and the path to scale" = 4 · "here is a durable revenue model in a large market" = 5.

---

## 3. Application of technology

| Score | Label | What it actually requires |
|---|---|---|
| 1 | Poor Application | **Demo video is not available** in video presentation. **Demo link is not available. Github is not available.** |
| 2 | Limited Application | Demo video may be shown in presentation but **not with full features of the idea**. Framework is not clearly shown. **Demo link is not available or working. Github code is not available or shown.** |
| 3 | Adequate Application | Demo video is shown with all features tried. **Demo link is available and working as expected**, but there may be minor areas for improvement or optimization. **Github code is not available or partly available.** |
| 4 | Strong Application | Demo video is shown with all features tried. **Demo link is working and is well-executed**, with features and functionalities working smoothly. **Github code is available and well thought of.** |
| 5 | Excellent Application | Demonstrates exceptional application of AI technology through **demo link, video and GitHub code**. The technical implementation is flawless, and the project **utilizes technology in a way that surpasses expectations**. |

**Ladder summary — this is a set of hard gates:**

| Artifact | Required for |
|---|---|
| Demo video showing **all features** | score ≥ 2 |
| **Working** public demo link | score ≥ 3 |
| **Public, well-thought-out GitHub repo** | score ≥ 4 |
| Flawless implementation + tech used in a surprising way | score 5 |

> **A missing artifact does not just cost points — it caps the score.** No working demo link ⇒ cannot exceed 2. A partial repo ⇒ cannot exceed 3.

---

## 4. Originality

| Score | Label | What it actually requires |
|---|---|---|
| 1 | Not Original | App is an **exact copy** of existing solutions without any novel approaches. |
| 2 | Limited Originality | Idea is **common or lacks differentiation** from existing solutions in the field. |
| 3 | Moderately Original | Exhibits **some unique idea or approach** that distinguishes it from existing non-AI solutions like decreasing cost or time. |
| 4 | Highly Original | **Unique perspective or innovative idea employing unconventional methods** to solve the problem. Novel elements, creative combinations, or unexpected applications. |
| 5 | Exceptionally Original | Stands out as exceptionally original, offering a **transformative idea or approach**. Completely new perspective. Has potential to disrupt the industry or solve the problem in a completely unprecedented way. |

---

## What this means for BRZ — the working scorecard

Derived target, to be validated against the workload decision.

| Criterion | Target | What must be true | Owner |
|---|---|---|---|
| **Application of technology** | 4/5 | Public repo with real setup docs + a **live public URL** + a demo video showing every feature, working smoothly | code + deploy |
| **Presentation** | 4/5 | Video **under 5 min** (target 4:00–4:45) carrying problem → solution → value prop → market → revenue → future plans, plus a **slide PDF** judged alongside it | pitch workstream |
| **Business value** | 3–4/5 | Named buyer, sized market, a price, and a path to scale — not a vague "this could be big" | business workstream |
| **Originality** | 4/5 | The novel element is the **containment model**, not the agent. "We built a code agent" scores 1–2 here | architecture + narrative |
| **Vultr requirement** | pass | One **containment moment** visible in the video, with the containment behaviour shown, not described | code + video |

### The three artifacts, and they are different jobs

1. **The code** — a public GitHub repo that a judge can read and (ideally) run. Judged under *Application of technology*. Must not be a dump.
2. **The live demo** — a working public URL. Judged under *Application of technology*. Its absence caps that criterion at 2.
3. **The pitch** — a **sub-5-minute video plus a slide PDF**. Judged under *Presentation* and *Business value*. This is a *separate deliverable* from the demo; a screen recording of the demo will not reach 4.

> Three of the four criteria are gated by artifacts that are **not** the product code. A build-only plan cannot score above ~11/20. The pitch and the deployment are part of the build.
