# Vultr: Agent Rush Hackathon — BRZ Briefing

> **lablab.ai × Vultr** — "Build AI agents that do real work — safely sandboxed on Vultr."
>
> **Kickoff:** Tuesday, 3 November 2026 · 9:00 PM Bangladesh Standard Time
> **Online build phase:** 3 – 8 November 2026
> **On-site phase:** 8 November 2026 · Salt Lake City, UT
> **Prize pool:** $9,000 cash + $5,000 in Vultr credits

---

## 1. The one-paragraph brief

Your system acts as a **centralized control layer**: it plans a task, dispatches it to an isolated execution environment, and returns verifiable output. Projects must demonstrate **multi-step agentic workflows**, **real executed results rather than described ones**, and a **production-style web application** — all running on Vultr infrastructure.

> **Containment-first is required.** An agent that only chats is a demo; an agent that executes safely is a product.

Every participant receives **$200 in free Vultr credits**.

**Hybrid format:** the hackathon runs on the lablab.ai platform and Discord. If approved for the on-site experience, you may also showcase the project live in Salt Lake City. **Travel and accommodation are not covered.**

---

## 2. Choosing a challenge

Pick **one** path. Both require a **Vultr VM backend** and the **web app deployed on Vultr**. Vultr must be the central system of control and orchestration, not static hosting.

| | **01 · Blast Radius Zero** | **02 · Powering the Future of Work** |
|---|---|---|
| **Build** | A web agent that performs real work — writing and running code, or operating a real browser — with every action contained in an isolated sandbox | An enterprise-focused AI solution coordinating realistic multi-step workflows that improve day-to-day team operations |
| **Best for** | Code execution, browser automation, autonomous agents, sandboxing, verification, safety | Sales ops, finance, HR, customer support, procurement, workflow automation, enterprise AI |
| **Serverless Inference** | **Required** | Optional |
| **Isolated sandbox** | **Required** (Docker strongly recommended) | Not required |
| **GPU** | Not available for this event | Not available for this event |
| **Extra infrastructure** | May use the Vultr API for throwaway instances | May use deployment helpers such as Supabase on Vultr and Coolify on Vultr |
| **Core idea** | Containment-first: plan, dispatch, and **verify** real executed work — not describe it | Build a real platform or operational workflow, not a one-off demo |

> **Hard requirement note.** Challenge 1 requires Vultr Serverless Inference **and** isolated sandbox execution. Challenge 2 requires a Vultr VM backend and web deployment; Serverless Inference is optional. **Vultr GPUs are not available for this event.**

---

## 3. Challenge 01 — Blast Radius Zero

### 3.1 What Vultr is looking for

Your application should use **Vultr as the central control layer**, dispatch real work into isolated execution environments, and return **verifiable output**.

### 3.2 Execution patterns (build against one or both)

**Pattern A · Sandboxed code execution**

```
User asks → model writes code → code runs inside a container → real output returns → model explains the result
```
Errors can be fed back for retries.

**Pattern B · Sandboxed browser use**

```
User gives a goal → model plans → Playwright runs in a container → screenshots return → a vision model verifies → human approval before final actions
```

### 3.3 Example directions

- CSV Analyst
- Prove-It Code Reviewer
- Chart Anything
- File Fixer
- Self-Healing Runner
- Comparison Shopper
- Form Filler
- Site QA Sweep
- Research with Receipts
- Page Watcher

### 3.4 Containment focus

- **Process isolation** — execution never touches the host or the app runtime.
- **Secret hygiene** — no API keys or credentials inside the sandbox.
- **Resource limits** — apply time and memory caps to every run.
- **Lifecycle discipline** — reset or destroy the environment after each task.

### 3.5 Submission expectations (Challenge 01)

- Public GitHub repository with setup and documentation
- Vultr VM backend deployment
- Public demo URL
- Recorded demo video
- Clear architecture and use-case explanation
- **One containment moment shown in the video**

---

## 4. Challenge 02 — Powering the Future of Work

### 4.1 What Vultr is looking for

An enterprise-focused solution with **multi-step agentic or rule-based workflows**, realistic future-of-work use cases, and a production-style web application running on Vultr.

### 4.2 Focus areas

| Area | What it covers |
|---|---|
| **Sales Operations** | Qualify leads, research prospects, update CRM, draft outreach and follow-up |
| **Finance & Accounting** | Process invoices, reconcile transactions, flag anomalies, manage payment follow-ups |
| **HR & Recruitment** | Screen candidates, schedule interviews, coordinate onboarding, track employee workflows |
| **Customer Support** | Resolve tickets across systems, investigate issues, take actions, escalate when human input is needed |
| **Procurement** | Monitor purchasing needs, compare vendors, request quotes, track orders, follow up on delays |

### 4.3 Product expectations

- Accessible through a **public web browser**
- A real product-style experience with **clear user flows**
- **Vultr as the central backend** powering planning, workflows, and operations
- **Platform thinking** rather than a one-off local demo

### 4.4 Submission expectations (Challenge 02)

- Public GitHub repository with setup and documentation
- Vultr VM backend deployment
- Public demo URL
- Recorded demo video
- Clear architecture and use-case explanation

---

## 5. Technology & access

### 5.1 The stack

| Technology | Requirement | Notes |
|---|---|---|
| **Vultr Cloud Compute** | **Both challenges** | Both require a Vultr VM backend; the web application must be deployed on Vultr |
| **Vultr Serverless Inference** | Required for C1 · optional for C2 | OpenAI-compatible API at `https://api.vultrinference.com/v1`. Used for Challenge 1 agent LLM calls |
| **Agent sandboxing** | **Challenge 1** | Docker strongly recommended. OpenSandbox, gVisor, E2B Sandboxes, Microsandbox listed as example approaches |
| **Vultr API** | Optional / recommended | Challenge 1 may use it for throwaway instances. Challenge 2 may use deployment helpers (Supabase on Vultr, Coolify on Vultr) |

### 5.2 Resources

| Area | Links |
|---|---|
| Core Vultr | vultr.com · Serverless Inference docs · Live model list · Vultr API |
| Agent sandboxing | Sandboxing guide · OpenSandbox · gVisor · E2B · Microsandbox |
| App deployment | Supabase on Vultr · Coolify on Vultr |

> The source page listed these as named links; the underlying URLs were not captured in the copy. Re-verify each from the Vultr site before relying on it.

### 5.3 Claiming the hackathon credits

Each participant receives **$200** in free Vultr credits.

**Before you begin:** use a valid email address that has **not** previously been associated with a Vultr account.

1. **Create your Vultr account** — open the Vultr Registration Page, enter a valid active email, create a strong password, review and accept the Terms of Service and Privacy Policy, then click **Create Free Account**.
2. **Verify your email** — check your inbox for Vultr's verification email, click **Verify Your E-mail**. You are redirected to the Vultr Console.
3. **Apply the hackathon gift code** — at kickoff, open the hackathon promotion page in **Billing**, locate **Gift Code**, enter the code shared during kickoff, click **Apply Gift Code**.
4. **Confirm credits** — the account should show **$200.00 in Remaining Credit**. Credits and account access remain active for the whole event.
5. **Keep your deployments** — to continue using deployments afterwards, add a payment method in **Billing**.

**What the credits cover:** Vultr Compute Instances, Managed Databases, Kubernetes clusters, and other Vultr services during the hackathon.

---

## 6. Prizes

**Total value: $14,000** — a combination of cash prizes and Vultr credits to keep building beyond the hackathon.

| Place | Cash | Vultr credits |
|---|---|---|
| 🥇 1st | **$5,000** | + $3,000 |
| 🥈 2nd | **$3,000** | + $1,000 |
| 🥉 3rd | **$1,000** | + $1,000 |
| **Totals** | **$9,000** | **$5,000** |

### Onsite raffle — 3 individual winners

Three onsite attendees each win one of:

- **PlayStation 5** — standard console and controller
- **Apple AirPods 5** — with wireless charging case, open case and earbuds
- **Razer DeathAdder V3 HyperSpeed** — wireless gaming mouse

> **Terms.** Participation in lablab.ai hackathons is voluntary. Prizes and opportunities depend on eligibility, availability, and third-party sponsors. Rules, prizes and terms may change or be cancelled at lablab.ai's discretion. Submissions must be original and MIT-compliant. Prize distribution may take up to 90 days. Full details are in the hackathon rules.

---

## 7. Guidelines

### 7.1 How to participate

- The hackathon runs on the **lablab.ai platform** and the **lablab.ai Discord server**. Register for both.
- To join: click the **Enroll** button at the bottom of the page, and read the **Hackathon Guidelines**, the **Getting Started Guide**, and the **lablab.ai Hackathon Rule Book**.
- **Everyone is welcome**, regardless of previous AI or coding experience.
- Before kickoff, browse the **AI Tech** and **tutorials** pages to get a head start.

### 7.2 Teams

Teams consist of **1–6 people**. No team yet? Use the dashboard or the Discord server to find teammates and bounce ideas around — participants join from all over the world.

### 7.3 What to submit

**📋 Basic information**
- Project title
- Short description
- Long description
- Technology & category tags

**📸 Cover image and presentation**
- Cover image
- Video presentation
- Slide presentation

**💻 App hosting and repository**
- Public GitHub repository
- Demo application platform
- Application URL — *required for Vultr challenges*

**⚡ Vultr challenge requirements**
- Public GitHub repository with setup and documentation
- Vultr VM backend deployment
- Public demo URL
- Recorded demo video
- Clear explanation of the architecture and use case
- *Challenge 1 only:* show one **containment moment** in the demo video

### 7.4 Judging criteria

Each criterion is scored **1–5** (20 points total). Full rubric: `JUDGING-CRITERIA.md`.

| Criterion | What it measures | Gate that caps the score |
|---|---|---|
| **Application of Technology** | How effectively the chosen model(s) are integrated | **No working demo link ⇒ capped at 2. Partial GitHub ⇒ capped at 3.** Needs demo video showing all features + live URL + public, well-thought-out repo |
| **Presentation** | Clarity and effectiveness of the presentation (PDF **and** video) | **Video under 3 min ⇒ capped at 2. Under 5 min but no market analysis / marketing revenue / future plans ⇒ capped at 3** |
| **Business Value** | Impact, practical value, market fit | 3 = addresses a market need with revenue potential; 4 = clear market potential, large customer base, significant revenue, feasible and scalable |
| **Originality** | Uniqueness, creativity, demonstrated behaviours | "An exact copy of existing solutions" = 1. The novel element has to be real, not "we also used AI" |

> **The demo video is a pitch, not a screen recording.** It must carry problem → solution → value proposition → market → revenue → future plans inside five minutes, and it must show one containment moment. The slide PDF is judged alongside the video.

---

## 8. Event schedule

All times are **Bangladesh Standard Time (UTC+6)**. The UTC column is derived for convenience.

| Date (BST) | Time (BST) | Time (UTC) | Event |
|---|---|---|---|
| Tue 3 Nov | 10:00 PM *(9:00 PM in the page header — see note)* | 16:00 UTC *(15:00 UTC)* | **Hackathon Kick-off** |
| Tue 3 Nov | 11:00 PM | 17:00 UTC | **Discord Q&A session** |
| Sun 8 Nov | 11:00 PM | 17:00 UTC | **Doors open** |
| Mon 9 Nov | 12:00 AM | Sun 8 Nov 18:00 UTC | **Welcoming remarks** |
| Mon 9 Nov | 5:00 AM | Sun 8 Nov 23:00 UTC | **⏱ End of submissions** |
| Mon 9 Nov | 8:00 AM | Mon 9 Nov 02:00 UTC | **Door close** |

> **Note on the kickoff time.** The page header states the kickoff is "9:00 PM Bangladesh Standard Time" while the schedule block lists "Nov 3 10:00 PM Bangladesh Standard Time". Both are reproduced above as printed. **Confirm with the lablab.ai event page** before planning around it.

> **Practical deadline.** The online build window closes at the **Doors open** slot (8 Nov, 17:00 UTC). Submissions lock at **8 Nov, 23:00 UTC**.

---

## 9. Constraints checklist for BRZ

Derived from the rules above — use this as the acceptance bar for every brief.

### 9.1 Hard build requirements

- [ ] The **Vultr VM backend** is the central control/orchestration layer, not a place where code is merely hosted.
- [ ] The **web app is deployed on Vultr** and reachable at a public URL.
- [ ] If Challenge 01: agent LLM calls go through **Vultr Serverless Inference** (`https://api.vultrinference.com/v1`).
- [ ] If Challenge 01: every execution runs inside an **isolated sandbox** with process isolation, no secrets inside, time and memory caps, and reset/destroy after each task.
- [ ] If Challenge 01: the **demo video shows one containment moment**.
- [ ] If Challenge 02: the product has **clear user flows** and real multi-step workflows in one of the five focus areas.
- [ ] A **public GitHub repository** with setup and documentation exists.
- [ ] A **recorded demo video** and a **slide presentation** exist.
- [ ] **No Vultr GPU** is used anywhere.

### 9.2 Scoring gates (from `JUDGING-CRITERIA.md`)

- [ ] **Working public demo URL.** Without it, *Application of Technology* is capped at 2/5.
- [ ] **Public repo a judge can read and run.** Without it, capped at 3/5.
- [ ] **Video under 5 minutes** (target 4:00–4:45). Under 3 minutes caps *Presentation* at 2/5.
- [ ] **Video contains**: problem → solution → value proposition → **market analysis** → **marketing revenue** → **future goals and plans** → the containment moment → close. Missing the middle three caps *Presentation* at 3/5.
- [ ] **Slide PDF** exists and is judged alongside the video.
- [ ] **Named buyer, sized market, a price, and a path to scale** — for a 3+/5 on *Business Value*.
- [ ] **A genuinely novel element**, with the containment model as the candidate. "We built an agent" scores 1–2 on *Originality*.
- [ ] All lablab.ai form fields are filled: title, short description, long description, technology & category tags, cover image, video presentation, slide presentation, public repo, demo platform, application URL.
