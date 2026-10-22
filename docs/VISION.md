# BRZ — Vision

> **Status:** v1, for coordinator approval. Nothing here is built yet.
> **Purpose:** one page that says what BRZ is, why it should score, how it is put together, how it survives the move to Vultr, and what it will take. If you disagree with something in here, say so and it changes.

---

## 1. The one sentence

**BRZ is a containment-first control plane for AI agents.** You hand it a task; it plans the work, dispatches the real execution into an isolated sandbox on Vultr, verifies the result against evidence, and hands back a report that proves the blast radius was zero.

**Not** "an agent that does stuff." **A control plane that makes agent execution safe** — which is precisely what Challenge 01 asks for: *"Your system acts as a centralized control layer."*

---

## 2. Why this should score

The rubric is a ladder with gates, so we build toward the gates.

| Criterion | Target | The thing that earns it |
|---|---|---|
| **Application of Technology** | 4/5 | Public repo a judge can read and run + a live URL + a demo video with every feature working. No working URL caps this at 2 — so **deployment is a scored deliverable, not an afterthought**. |
| **Presentation** | 4/5 | A **sub-5-minute pitch video** (target 4:00–4:45) plus a slide PDF, carrying problem → solution → value prop → market → revenue → future plans. Under 3 min caps it at 2; missing the middle three caps it at 3. |
| **Business Value** | 3–4/5 | A named buyer, a bottom-up market number, a price with a unit, and unit economics per run. |
| **Originality** | 4/5 | The novel element is the **containment model** — an execution boundary that is *provable and screenable*, not a chat wrapper. "We built a code agent" scores 1–2. |
| **Vultr C1 requirement** | pass | One **containment moment** visible in the video — a beat that is a *byproduct of the architecture*, not a staged stunt. |

**Three artifacts, three owners.** The code (repo), the deployed thing (live URL), and the pitch (video + PDF). A build-only plan cannot exceed ~11/20. The pitch and the deploy are part of the build.

---

## 3. The architecture

```
┌─ Browser ──────────────────────────────────────────────┐
│  React + Vite  ·  same-origin /api  ·  no absolute URLs │
└───────────────────────────┬────────────────────────────┘
                            │  /api/v1
┌─ Control plane (Node + TypeScript) ────────────────────┐
│  THE ONLY PLACE CREDENTIALS EXIST.                     │
│                                                         │
│  ┌ InferenceClient ── OpenAI-compatible ─────────────┐  │
│  │  dev: Groq    prod: Vultr Serverless Inference    │  │  ← swapped by 3 env lines
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌ SandboxProvider (interface) ───────────────────────┐  │
│  │   ├─ BwrapProvider    local: bubblewrap + cgroup v2│  │  ← same code runs on Vultr
│  │   └─ VultrVMProvider  prod: per-task throwaway VM  │  │  ← written now, exercised at kickoff
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌ CapabilityBroker ─ the ONLY channel out of a box ─┐  │
│  ┌ EgressProxy ── allowlist + full log ───────────────┐  │
│  ┌ RunStore ─── node:sqlite: runs, events, evidence ─┐  │
└─────────────────────────────────────────────────────────┘
```

### The seven decisions that define BRZ

| # | Decision | Why it is the right call |
|---|---|---|
| 1 | **One `SandboxProvider` interface, two implementations.** Nothing above the interface knows where code runs. | The single highest-leverage decision in the project. It is what makes "no Vultr until kickoff" survivable: we build and test the *whole product* locally, and kickoff becomes a backend swap. |
| 2 | **Credentials never enter the sandbox.** The control plane holds the keys; the sandbox gets scoped, short-lived capabilities from the broker. | Directly satisfies "no API keys or credentials inside the sandbox" — and is *architecturally* true rather than a disclaimer. It is also the answer to "why should I trust you with my code execution". |
| 3 | **Egress denied by default.** The sandbox has no direct network. The only way out is the broker, and every call is logged. | Turns containment from a claim into a **provable, screenable property**: "this box had zero network access; the only thing it could do was compute and answer." That is the containment moment. |
| 4 | **The sandbox is ephemeral per task.** bwrap = throwaway namespaces; Vultr tier = throwaway VM, destroyed after the run. | Required by "reset or destroy the environment after each task" — and it is the most cinematic thing in the demo. |
| 5 | **Resource caps are real.** cgroup v2 `memory.max` / `cpu.max` / `pids.max` + rlimits (wall clock, file size, process count). | "Time and memory caps to every run" is a rubric line. A cap that is only a `setTimeout` is not a cap. |
| 6 | **Every run emits a blast-radius report**: what executed, what was denied, resource usage vs. cap, and the evidence trail. | This is the control plane made visible. It is the demo, the Originality argument, and the Business Value answer in one artifact. |
| 7 | **Inference is OpenAI-compatible, provider chosen by env only.** | Vultr Serverless Inference is OpenAI-compatible and mandatory for C1; Groq gives us a working provider today. Nothing in the code knows which. |

### The product shape (one narrow vertical, done properly)

The control plane is the product; **one workload** is the demo. The recommendation stands at **A — Self-Healing Runner**: paste a repo with a failing suite, the agent diagnoses, patches, and re-runs until green, with a fresh sandbox per attempt.

Why A: containment is self-evident (the agent writes code that runs itself, repeatedly); "errors fed back for retries" is the spec's own wording for Pattern A; CI pain is legible in ten seconds of video; and it needs only chat models — **no dependency on a vision model that Vultr may not offer**. Pattern B stays architecturally supported but undemoed.

**This is the one product decision still open. It is yours.**

---

## 4. The Vultr portability contract

Your instruction: *when the kickoff starts and I migrate the codebase onto their infrastructure, it should sit perfectly.* That is a contract every brief inherits, and it is testable:

| Rule | Test |
|---|---|
| All config is env. No host, port, key, model, or URL in source. | `grep` for literals in `backend/src` finds none. |
| The inference client is provider-agnostic. | Changing to Vultr = editing 3 lines of `.env`. No code change, no rebuild. |
| The sandbox is behind an interface. | Swapping `BwrapProvider` → `VultrVMProvider` is a config flag, not a rewrite. |
| One-command deployment. | A fresh Vultr Ubuntu 24.04 instance + `bash deploy/bootstrap.sh` = a running, health-checked service. |
| Bind `0.0.0.0`; `PORT` from env; `/healthz` endpoint. | No `localhost` assumption anywhere in the server. |
| No local-only assumptions in prod paths. | No `/mnt/ee` paths, no hardcoded UID, no assumption that cgroup v2 exists (fall back to rlimits). |
| Idempotent bootstrap. | A second run is a no-op, not a crash. |
| Clean-clone reproducible. | `git clone → write .env → run` works with no hidden state. |
| The Vultr tier ships **written but untested**, with the Vultr API behind a mock in unit tests. | We find out at kickoff that the API shape is off — not that the product is missing. |

**The Vultr tier is written in Wave 1, not at kickoff.** That is the whole point of the interface.

---

## 5. Repo layout

```
brz/
├── backend/                 # control plane — Node 24 + TypeScript
│   └── src/
│       ├── server.ts
│       ├── inference/       # OpenAI-compatible client (provider from env)
│       ├── sandbox/         # SandboxProvider + bwrap/ + vultr/
│       ├── broker/          # capability broker (the only channel out)
│       ├── egress/          # allowlist proxy + log
│       ├── db/              # node:sqlite schema + migrations
│       ├── runs/            # run store, evidence, audit
│       └── routes/
├── frontend/                # React + Vite
├── deploy/                  # bootstrap.sh · systemd unit · .env.template · healthcheck
├── scripts/                 # envcheck, dev helpers
├── docs/                    # architecture · business · design
└── AGENTS/                  # the harness (published — it shows rigor)
```

**Stack: TypeScript + Node + React/Vite** (coordinator's call). `node:sqlite` is built into Node 24 — **no database server on a box with 1.26 GB free RAM**. No Docker, no KVM: the local sandbox is **bubblewrap + cgroup v2**, which is present, gives *stronger* namespace isolation than a container, and costs no daemon.

**Roles:** ARCHITECT · DESIGNER · FRONTEND · BACKEND · DBMASTER · TESTER · DOCS · BUSINESS · **GITMASTER** (the only agent that may commit, push, or merge).

---

## 6. Build plan

| Wave | Who | Output | Gate to the next wave |
|---|---|---|---|
| **0** | ARCHITECT, BUSINESS | Vultr C1 capability factsheet; market/buyer/pricing/pitch narrative | Coordinator approves the plan |
| **1** | BACKEND | SandboxProvider + BwrapProvider + VultrVMProvider (mocked) + inference client + broker + run store + `deploy/bootstrap.sh` | Control plane runs a real task locally |
| **2** | FRONTEND | The operator console: submit a task, watch the run, read the blast-radius report | A task can be driven end to end |
| **3** | DBMASTER → BACKEND | SQLite schema/migrations gated by review | Schema approved and applied |
| **4** | TESTER | Independent verification: happy path, abuse paths, containment proofs | Verdict PASS |
| **5** | BUSINESS + coordinator | Pitch outline → slide PDF → sub-5-minute video with the containment moment | Video under 4:45 |
| **6** | GITMASTER | Branches, PRs, CI green, merge to `main`, repo hygiene | `main` green, public repo polished |

Waves 1 and 2 overlap where scopes allow. **Wave 5 does not wait for wave 6** — the pitch is written while the code lands.

---

## 7. The three artifacts and their owners

| Artifact | Gate it controls | Owner | Earliest ready |
|---|---|---|---|
| Public repo, runnable, documented | *Application of Technology* — caps at 3 without it | GITMASTER + code | Wave 6, then improving daily |
| Live public demo URL | *Application of Technology* — caps at 2 without it | coordinator, at deployment | after kickoff + deploy |
| Pitch video **< 5 min** + slide PDF | *Presentation* — caps at 2 under 3 min, 3 without market/revenue/future | BUSINESS + coordinator | Wave 5 |
| Containment moment in the video | Vultr C1 submission requirement | code + coordinator | Wave 5 |
| Market analysis, marketing revenue, future plans | *Presentation* 4/5, *Business Value* 3+/5 | BUSINESS | Wave 0 |
| Originality | *Originality* 4/5 | ARCHITECT + narrative | continuous |

---

## 8. Risk register

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| **No Vultr access until kickoff** | prod tier untested | Provider interface + mocked API tests + one-command bootstrap written in Wave 1 | ARCHITECT, BACKEND |
| **Vultr Inference has no vision model** | Pattern B's verify step impossible | Workload A needs chat only; verify step designed to be optional | ARCHITECT |
| **Demo video scope creep** | *Presentation* drops to 2 or 3 | Timeboxed 4:00–4:45 outline from BUSINESS; the demo and the pitch are separate artifacts | BUSINESS, coordinator |
| **1.26 GB free RAM** | dev environment thrashes | bwrap not Docker; no local DB server; no local model | BACKEND |
| **"Why trust a 5-day-old project with our code execution"** | kills *Business Value* and *Originality* | The blast-radius report + the containment moment are the structural answer, not a promise | ARCHITECT, BUSINESS |
| **Deadline slip** | misses the 8 Nov 23:00 UTC lock | Code freeze at **8 Nov 12:00 UTC**; the last 11 hours are pitch, video, and polish only | coordinator |
| **"We built a code agent"** | *Originality* 1–2 | The novel element is the containment model. Keep the agent generic and the containment loud | ARCHITECT, coordinator |
| **Solver decides too late** | the vertical is chosen after the architecture is built | The interface is vertical-agnostic on purpose — a late decision costs a workload module, not a rewrite | coordinator |

---

## 9. Explicitly out of scope

Auth and multi-tenancy · billing · a mobile app · a design system · more than one vertical · Pattern B browser execution (unless the vision question resolves) · anything that does not help the three scored artifacts.

---

## 10. What I need from you

1. **The workload** — A (recommended) / B / C / your own. Everything else is ready.
2. **Approve this vision**, or tell me which part is wrong.
3. **Then I dispatch Wave 0** — the two product-agnostic briefs already written:
   ```
   INVOKE: ARCHITECT
   Read AGENTS/briefs/01-vultr-c1-capability-probe.md and start working

   INVOKE: BUSINESS
   Read AGENTS/briefs/02-market-and-monetization.md and start working
   ```
   They write to different files, so they cannot collide, and they unblock the two hardest decisions in parallel.
4. **GITMASTER** — approved as specified in `AGENTS/roles/GITMASTER.md`: the only agent that may commit, push, or merge, and only on the HEAD's explicit instruction. It never edits product source.

---

## 11. The narrative in one paragraph (draft, pending BUSINESS)

Every company that wants agents to touch real code faces the same problem: the agent writes code, and that code runs somewhere. Usually it runs somewhere with your credentials, your network, and your blast radius. BRZ inverts it. The agent's work is dispatched into a sealed, ephemeral environment with no network, no secrets, hard resource caps, and a full audit trail of everything it tried to do — and BRZ shows you the report afterward. The result is not just an answer; it is an answer with provable boundaries, which is the only thing that makes agent execution something a security team can approve.
