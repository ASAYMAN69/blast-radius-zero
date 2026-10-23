# BRZ — Session State

> **This file is the answer to "what happens if the session gets compacted".**
> It holds everything a fresh session needs to pick up cold: where we are, what was decided and why, what is on disk, what is open, and what to do next.
>
> **Update it at the END of every turn that changes anything on disk or changes a decision.** Keep it tight — under ~250 lines. Append to the change log; rewrite the other sections fresh.

---

## 1. Where we are

**Phase: prerequisites.** The product is not being built yet. The coordinator is clearing infrastructure, access, and stack decisions first, then the product.

**Project:** BRZ — an entry to the **Vultr Agent Rush Hackathon** (lablab.ai × Vultr), **Challenge 01 · Blast Radius Zero**. Build a web app that acts as a centralized control layer: plan a task → dispatch real work into an **isolated sandbox running on Vultr** → return **verifiable output**. Containment-first is the thesis.

**Hard deadlines (derived, verify against lablab.ai):** online build closes **8 Nov 2026 17:00 UTC** · submissions lock **8 Nov 2026 23:00 UTC**. Kickoff **3 Nov 16:00 UTC** (page header says 9:00 PM BST, schedule says 10:00 PM BST — contradiction unresolved).

**Deployment reality:** no Vultr access until kickoff. Everything must be buildable and testable **on this machine** first, with the Vultr-specific tier swapped in at kickoff.

---

## 2. Decisions

| # | Date | Decision | Rationale |
|---|---|---|---|
| D-001 | 2026-10-23 | Challenge path = **C1 · Blast Radius Zero** | Coordinator's choice. |
| D-002 | 2026-10-23 | Agent topology = **HEAD + workers**, workers deployed by brief-file, user relays one-line prompt, never the `subagent` tool | Coordinator's instruction. |
| D-003 | 2026-10-23 | Non-overlap enforced by **exclusive write scope per brief** + `AGENTS/scope_ledger.md` + wave discipline | Coordinator's instruction. |
| D-004 | 2026-10-23 | Out-of-scope access requires an **explicit grant from the main agent**, with the worker stating what/why/blast-radius/fallback, and the main agent questioning the reasoning before granting | Coordinator's instruction. Canonical: `AGENTS/permissions/PROTOCOL.md`. |
| D-005 | 2026-10-23 | Inference client is **OpenAI-compatible only**. Provider chosen by env, never by code | Vultr Serverless Inference is OpenAI-compatible and is mandatory for C1; dev needs a provider available today. |
| D-006 | 2026-10-23 | Dev inference = **Groq** (`openai/gpt-oss-120b`). Prod inference = **Vultr Serverless Inference**. Swapped by editing 3 env lines | Coordinator supplied the Groq credentials. |
| D-007 | 2026-10-23 | Local sandbox tier = **bubblewrap (bwrap) + cgroup v2 + rlimits**, not Docker | Measured on this machine — see §5. Docker is absent, memory is tight, and `bwrap` gives *stronger* namespace isolation with no daemon and ~5 MB overhead. |
| D-008 | 2026-10-23 | BRZ is a **single git repo at the root**, not per-directory repos | The submission requires one public repo. Different from zyrun's multi-repo layout. |
| D-009 | 2026-10-23 | Secrets live only in `.env` (gitignored); `.env.example` holds blanks; `scripts/envcheck.sh` verifies presence without printing values | Standing rule: never print, never commit secrets. |
| D-010 | 2026-10-23 | The judge scores **three artifacts, not one**: (1) public repo, (2) live public demo URL, (3) a **sub-5-minute pitch video + slide PDF** carrying market analysis, marketing revenue, and future plans | `JUDGING-CRITERIA.md` ladders. A build-only plan cannot exceed ~11/20. |
| D-011 | 2026-10-23 | The **demo video is a pitch, not a screen recording.** Timebox **4:00–4:45**. Under 3 min caps Presentation at 2/5; under 5 min without market/revenue/future caps it at 3/5 | Rubric, *Presentation* ladder |
| D-012 | 2026-10-23 | New role **BUSINESS** added to the roster (`docs/business/**`) — market, buyer, pricing, revenue model, pitch narrative. Wave 0 runs it **in parallel** with the infra probe because the rubric makes the commercial story a build artifact | `AGENTS/roles/BUSINESS.md`, brief 02 |
| D-013 | 2026-10-23 | Hard gates to respect at all times: **no working demo link ⇒ Application of Technology capped at 2**; **partial repo ⇒ capped at 3**; **no Vultr GPUs**; agent LLM calls must go through Vultr Serverless Inference in prod | `JUDGING-CRITERIA.md` §3, `HACKATHON.md` §9 |
| D-014 | 2026-10-23 | The **novel element must be the containment model**, not the agent. "We built a code agent" scores 1–2 on Originality | Rubric, *Originality* ladder |
| D-015 | 2026-10-23 | **Stack = TypeScript + Node 24 + React/Vite** (coordinator's call). Persistence = **`node:sqlite`**, built into Node 24 — no database server on a 1.26 GB box | Coordinator. `node:sqlite` verified working on this machine |
| D-016 | 2026-10-23 | **Local sandbox = bubblewrap (`bwrap`) + cgroup v2 + rlimits.** Coordinator delegated the call: "whatever fits the best and doesn't contradict the rulebook" | bwrap present, cgroup v2 present, no Docker, no `/dev/kvm`. Namespace isolation is *stronger* than a container and costs no daemon. Satisfies process isolation + resource caps + lifecycle discipline |
| D-017 | 2026-10-23 | **No Vultr account for now.** Instead, a **Vultr portability contract**: the prod tier is *written* in Wave 1 behind the `SandboxProvider` interface with the Vultr API mocked in tests, and `deploy/bootstrap.sh` takes a fresh Ubuntu 24.04 instance to a running, health-checked service in one command. Kickoff = deploy + swap the provider, not a build | Coordinator: "make sure our infra is compatible with whatever they're saying so that when the kickoff starts and I migrate the codebase into their infra it sits perfectly" |
| D-018 | 2026-10-23 | **Repo is public from day one.** Created `github.com/ASAYMAN69/blast-radius-zero` (public, MIT `LICENSE`, `main` branch, first commit `4895b5a`). `skills/` and `skills-lock.json` are **excluded from the published repo** — operator tooling, not product | Coordinator: "public from day one … create a github repo under my ASAYMAN69 account using gh cli". `gh` is authed as ASAYMAN69 with `repo`+`workflow` scopes |
| D-019 | 2026-10-23 | **New role GITMASTER** (`AGENTS/roles/GITMASTER.md`): the **only** agent permitted to `git commit` / `git push` / `gh pr merge`, and only on the HEAD's explicit instruction. Owns branches, PRs, merge, diff review, CI/CD, repo hygiene. Never edits product source. **Always serialized** — never runs concurrently with an open write scope | Coordinator: "i also need another subagent named GITMASTER that handles pr reviews, merge, branch, push, diff, ci cd etc etc" |
| D-020 | 2026-10-23 | **Deployment and the public demo URL are deferred** to post-kickoff. The build phase target is "make the project ready before actual work" | Coordinator: "don't worry bout public demo url … we can only obtain it after deployment. before deployment, we making the project ready before actual work" |
| D-021 | 2026-10-23 | **`docs/VISION.md` is the vision of record** and the HEAD's scope | Coordinator: "i want you to make sure that everything sat right with you and we have a clear vision" |
| D-022 | 2026-10-23 | **Phase 1 = the minimum real thing: one workload, one sandbox tier, works.** The platform direction is kept (the `SandboxProvider` interface is vertical-agnostic) but Phase 1 ships **one named direction from the brief's own list**, chosen by ARCHITECT for *reliability under a thin agent* | Coordinator: "we need some very core features… just that it works, just works. then we move forward" |
| D-023 | 2026-10-23 | **The agent is deliberately dumb-but-sufficient.** The demo's quality must never depend on model intelligence we do not control; what is judged is the containment model, which we fully control | Logical consequence of D-022 and the *Application of Technology* gate ("features working smoothly") |
| D-024 | 2026-10-23 | **The demo scenario must be a single deterministic command**, re-runnable, so the video can be re-shot until it is clean | The rubric needs a containment moment in the video; a flaky demo cannot be re-shot |
| D-025 | 2026-10-23 | **Video, slides, and pitch are not the current focus.** "Making the project ready" is the focus. BUSINESS still runs in parallel because it is free, but it is off the critical path | Coordinator: "sure we can make a video or make slides etc etc, but that's not our main focus. making the project ready is our main focus" |
| D-026 | 2026-10-23 | **Each agent runs a persistent session.** The first launch prompt includes `AGENTS/CONTEXT.md`; later launches do not. `AGENTS/CONTEXT.md` is the one-page project orientation every worker reads | Coordinator: "each agent gets a persistent session… the first launch would need to point project context" |
| D-027 | 2026-10-23 | **Phase 1 uses the standard library only inside the sandbox** — system Python with no `pip`, no network, no installs. Keeps the sandbox free of dependency risk and of any need for network during a run | Constraint from D-022: the sandbox must work with zero egress |
| D-028 | 2026-10-23 | **BRZ is a monorepo**: one git repo, one npm workspace root, one `package-lock.json`, one `node_modules`, workspaces `backend` and `frontend`, `deploy/` outside the workspace. Root `package.json` + `tsconfig.base.json` written by the HEAD. Each workspace's `tsconfig.json` extends the root base so the two packages cannot drift on strictness. Contract in `docs/MONOREPO.md` | Coordinator: "we have to keep the project monorepo btw". Also removes shared-file contention: **the HEAD writes both workspace manifests and installs between wave 1 and wave 2, so no worker ever touches a manifest or a lockfile** |

| D-029 | 2026-10-23 | **Lead with the beachhead, demote the TAM.** $396.1M / 62,381 policy-gated orgs becomes headline #1; the $1.65B TAM stays, still low-confidence, reframed as the ceiling the policy gate creates. Slide 6's spoken line ends at the beachhead; the TAM is one clause after it | Coordinator's "never settle for less". Leading with the weakest, lowest-confidence number in the document is a gift to a skeptical judge |
| D-030 | 2026-10-23 | **Certification dates become costed, budget-flagged plans — not deleted.** SOC 2 Type I → Q1 2027, ~$10k, `requires budget approval — not currently funded`; Type II → Q4 2027, $15.5–50k + ~$60k engineering, same flag. The roadmap stays dated because *Presentation* 4/5 needs "future goals and plans" — but every date is either something we control or something with a named cost and a funding flag | The original promised unfunded work as if funded. Deleting the rows would have lost the *Presentation* gate. Costing them makes them defensible |
| D-031 | 2026-10-23 | **The Enterprise tier no longer depends on a certification we do not have.** It is re-anchored on five value drivers deliverable today: dedicated/isolated Vultr tenancy, high included task volume, org-level audit-log retention, evidence export, and a signed support SLA. Certifications become a future unlock, not a prerequisite. §C.2 weakness #2 stays and stays strong — only its *consequence* sentence changes from "blocks enterprise deals" to "defers the regulated motion" | The ladder was commercially incoherent: the top price was gated on the one thing we have not funded |
| D-032 | 2026-10-23 | **The isolation story becomes a dated three-tier ladder, matching ARCHITECT's §4.** Tier 1 namespaces (Phase 1, shipping now) → Tier 2 per-task throwaway Vultr VM (Nov 2026, at kickoff) → Tier 3 microVM-grade isolation (2027). "We lose the isolation axis" becomes "we lose it *today*, and here is the dated path" | Converts a static admission into a roadmap a judge can score |
| D-033 | 2026-10-23 | **The shipped demo is the LIVE demo with the 2× retry**; `demo:offline` stays a documented fallback, not the shipped path. Plus a **record mode** so the video can be re-shot, plus a verification that the **containment beat is byte-identical** across runs (the part that must look right is deterministic even when the prose is not) | ARCHITECT's recommendation, accepted. Shipping the mock puts a mock in the critical path, which `CONTEXT.md` treats as a scoring risk. The retry + record mode is the "never settle for less" version |
| D-034 | 2026-10-23 | **The judge-facing deployment is access-controlled, not merely documented.** Production binds `127.0.0.1`; `deploy/` ships a TLS reverse proxy with HTTP basic auth; credentials are generated by the bootstrap, written `0600`, never printed; the service **refuses to start in production** without an access-control decision unless `BRZ_ALLOW_UNAUTHENTICATED=true` is set explicitly. `deploy/README.md` documents the exact path | ARCHITECT flagged the hole plainly: Phase 1 has no auth and the control plane binds `0.0.0.0`. Documenting a hole is not closing it |
| D-035 | 2026-10-23 | **A standing quality bar, inherited by every brief** (`AGENT.md` §7.0, `AGENTS/brief_template.md`): no stubs in the shipped path, no placeholders a human reads, designed failure paths, the unhappy path as the deliverable, survives a stranger, measured not asserted, polish not optional. It applies to the HEAD's own briefs too | Coordinator: "you can't be lazy or keep the subagents lazy". A bar that lives only in a chat message is not a bar |
| D-037 | 2026-10-23 | **The frozen contract is amended by exactly two fields.** `ContainmentVerification` gains `namespaces: readonly string[] \| null` and `projectDirectoryVisible: boolean \| null`, both `null` meaning *not measured*. Without them a sealed run could never leave `incomplete` — the product's headline verdict would be permanently incomplete. `null` never `false`, never `[]` | BACKEND found the gap in brief 04 and reported it rather than working around it. A fabricated `false` is the exact lie this product exists to prevent |
| D-038 | 2026-10-23 | **Three deviations from the design doc are accepted and recorded, not worked around:** (1) the report is assembled *after* the teardown, because `lifecycle.*` *are* teardown facts; (2) client-disconnect cancellation is honoured only before the `202`, because the console polls over separate requests and cancelling on socket close would kill healthy runs — the explicit cancel route is the supported path; (3) the offline demo is **deterministic, not byte-identical** — the report carries measured durations and timestamps, and freezing measurements is the fabricated number the project exists to avoid | BACKEND's brief-04 report. The *containment beat* — verdict, denial, caps, teardown — remains the part that must be identical across runs; brief 06 verifies exactly that |
| D-040 | 2026-10-23 | **The certification keeps its costed row in the document and loses its place in the spoken line.** §E.4.1 keeps the cost band and the `requires budget approval` flag — that table is what a judge *reads*, and a dated, costed, honestly-flagged plan is a strength there. Slide segment 9 drops the certification from the 23-second spoken line, because spending a pitch on an unfunded dollar figure is bad pitching: it is a weakness in the spot where the audience is deciding whether to believe us | BUSINESS asked; the HEAD decided. The rubric's "future goals and plans" is satisfied by the dated, costed roadmap in the body, not by a spoken figure |
| D-041 | 2026-10-23 | **Tier 2's timing becomes "from kickoff", not "Nov 2026".** ARCHITECT's design commits the Vultr tier to shipping *written and unit-tested against a mock*, with the swap at kickoff being a config flag, and measures cold start *at* kickoff — it never commits to a Nov 2026 production date. A date a third party controls is worse than a milestone we control | BUSINESS asked for confirmation against ARCHITECT §4; the check changed the answer. The honest statement is "Tier 2 ships with the code and is exercised on our own Vultr account from kickoff" |
| D-043 | 2026-10-23 | **Three deviations from the design doc are accepted and recorded, not worked around:** (1) the report is assembled *after* the teardown, because `lifecycle.*` *are* teardown facts; (2) client-disconnect cancellation is honoured only before the `202`, because the console polls over separate requests — the explicit cancel route is the supported path; (3) the offline demo is **deterministic, not byte-identical** — the report carries measured durations and timestamps, and freezing measurements is the fabricated number the project exists to avoid. The *containment beat* — verdict, denial, caps, teardown — is the part that must be identical across runs, and brief 06 verifies exactly that | BACKEND's brief-04 report. The design doc's §7.1 diagram shows the opposite of (1); the HEAD accepted it and will amend the diagram |
| D-044 | 2026-10-23 | **The inference client gets a fallback provider chain** (`OPENAI_FALLBACKS`, a JSON array), rotating on `rate_limited`, `timeout` and `5xx` but **never on a non-429 4xx** (a bad request is our bug, and rotating would hide it). Plus a **per-run token budget** (`BRZ_RUN_TOKEN_BUDGET`, default 12 000) that ends the run honestly rather than letting it burn a shared quota | The live demo died on a shared 8 000 tokens/minute quota. A single-provider client means one shared quota decides whether the most important artifact in the project works. The HEAD has asked the coordinator for a second key; the chain makes it optional rather than required |
| D-045 | 2026-10-23 | **The frozen contract gains `provider.rotated`** as a dedicated event type. Brief 06 adds it (one line in the union, two lines in FRONTEND's mirror) so provider rotations are a distinct event instead of being buried in `agent.message` | BACKEND found that rotations were being recorded under `agent.message` because the frozen union has no `provider` member. The contract amendment is granted as part of brief 06's containment work, since the broker's egress log and the provider rotation are the same audit surface |
| D-042 | 2026-10-23 | **The frontend workspace uses the two-config split with NO project references.** `frontend/tsconfig.json` covers the app only (`src/**`, `types: []`); `vite.config.ts` lives in `frontend/tsconfig.node.json` (`types: ["node"]`); the frontend `typecheck` and `lint` scripts run **both** projects. Project references were producing TS6306/TS6310, and `composite` would have forced an emit step this repo deliberately does not have | FRONTEND reported the split would not compile and worked around it by merging `vite.config.ts` into the app project. The merge is wrong: it typechecks `vite.config.ts` under `types: []`, where Node globals do not exist. The HEAD fixed it at the root and verified typecheck + build with no inline override |
| D-039 | 2026-10-23 | **The inference client gets a fallback provider chain** (`OPENAI_FALLBACKS`, a JSON array), rotating on `rate_limited`, `timeout` and `5xx` but **never on a non-429 4xx** (a bad request is our bug, and rotating would hide it). Plus a **per-run token budget** (`BRZ_RUN_TOKEN_BUDGET`, default 12000) that ends the run honestly rather than letting it burn a shared quota | The live demo died on a shared 8 000 tokens/minute quota. A single-provider client means one shared quota decides whether the most important artifact in the project works. Still wants a second key from the coordinator — the chain makes it optional rather than required |
| D-036 | 2026-10-23 | **Coordinator delegated the remaining open calls to the HEAD** — "the rest lies on you" — and set the rule of thumb: never settle for less. The HEAD decides product/commercial calls, escalates only genuine product-scope questions | Coordinator |
---

## 3. Open questions for the coordinator

**Answered 2026-10-23 — recorded as D-015…D-021:**

| # | Question | Answer |
|---|---|---|
| Q-001 | Local sandbox tier | bwrap + cgroup v2 (D-016) |
| Q-002 | Stack | TypeScript + Node + React/Vite (D-015) |
| Q-003 | Public demo hosting | **Deferred** to post-kickoff (D-020) |
| Q-004 | Vultr account now | **No** — build for portability instead (D-017) |
| Q-005 | Repo public from day one | **Yes** — created on GitHub (D-018) |
| Q-006 | Inference fallback provider | still open |
| Q-013 | Dispatch wave 0 | **Not yet** — vision approval first |

**Still open:**

| # | Question | Why it matters |
|---|---|---|
| Q-011 | **Flagship workload** — A Self-Healing Runner (recommended) / B Site QA Sweep / C Research with Receipts / own | The one product decision. The `SandboxProvider` interface is vertical-agnostic, so a late call costs a workload module, not a rewrite |
| Q-014 | **Pitch assembly owner** — who turns the outline into the slide PDF and records the video? Needs a named human. | *Presentation* is gated on a sub-5-minute video + PDF. A code-only plan cannot score past 3 |
| Q-015 | **Do we build pitch tooling** (scriptable deck generator via `skills/pitch-deck`)? | Deterministic deck generation beats hand-editing slides 20 times |
| Q-016 | **Inference fallback** — a second provider/key so a live demo never dies on a rate limit | Groq's free tier rate-limits; a 429 during the video is a lost 2 points |
| Q-017 | **Domain** — do you have one to point the deployed demo at? | Only needed at deploy time (post-kickoff) |
| Q-018 | **Extra access** — GitHub is done (authed). Still wanted: a second LLM key for fallback, a Vultr card at kickoff, a Cloudflare/Vercel token if we want a tunnel | Ask before kickoff, not during it |
| Q-019 | **May agents install npm packages and use the cached Playwright chromium?** | `~/.cache/ms-playwright` already has chromium-1234/1243 — no download needed. npm install is implied but I want it on the record |
| Q-020 | **Is the 8 Nov 12:00 UTC code freeze acceptable?** | Leaves 11 hours for pitch, video, and polish only |

---

## 4. Environment & secrets registry

**Values are never written to this file, never to a committed file, and never printed.**

| Variable | Purpose | Where the value lives | Current provider |
|---|---|---|---|
| `OPENAI_API_KEY` | Inference credential | `.env` (gitignored) | Groq (dev) → Vultr (prod) |
| `OPENAI_ENDPOINT` | OpenAI-compatible base URL | `.env` | `https://api.groq.com/openai/v1` (dev) → `https://api.vultrinference.com/v1` (prod) |
| `OPENAI_MODEL` | Model id | `.env` | `openai/gpt-oss-120b` (dev) → a Vultr model id (prod) |
| `OPENAI_TIMEOUT_MS` | Request timeout | `.env` | 60000 |
| `OPENAI_MAX_RETRIES` | Retry count | `.env` | 2 |
| `PORT` | Control-plane port | `.env` | 8787 |
| `NODE_ENV` | Mode | `.env` | development |

**Rotation note:** the Groq key was pasted into the chat transcript, so it exists in session history. If the repo or transcript ever becomes public, rotate it.

**Nothing is hardcoded.** No provider, model, host, port, or key may appear in source. `scripts/envcheck.sh` checks presence only.

---

## 5. Machine capabilities (measured 2026-10-23)

Host: `POWOWL` · Linux 7.1.5 Kali amd64 · 4 vCPU · **3.8 GB RAM total, ~1.26 GB available** · swap 6 GB (zram 2.3 GB) · `/mnt/ee` = 154 GB disk, 115 GB free.

| Capability | Status | Consequence |
|---|---|---|
| `bwrap` (bubblewrap) | **present** `/usr/bin/bwrap` | Primary local sandbox. User+mount+net namespaces, no daemon, no KVM needed. |
| `unshare`, `chroot`, `prlimit`, `setpriv` | present | Fallback isolation primitives. |
| cgroup v2 | **present** — controllers: `cpuset cpu io memory hugetlb pids rdma misc` | Real `memory.max`, `cpu.max`, `pids.max` caps per run. |
| Docker / Podman | **absent** | Would need install (~1 GB RAM overhead). Not recommended here. |
| `/dev/kvm` | **absent** | No Firecracker / Kata / libkrun / MicroVM locally. Also no nested virt. |
| `firejail`, `nsjail`, `systemd-nspawn` | absent | Not needed while `bwrap` is present. |
| Runtimes | Node 24.19, Bun 1.3.14, Python 3.14.8, Go 1.27.1 | All available. |
| PostgreSQL | client tools only, **no server running** | Prefer embedded SQLite (Bun has `bun:sqlite` built in) — no server on a 1 GB box. |
| Chrome/Chromium | running on this box | `~/.cache/ms-playwright` already holds **chromium-1234 + chromium-1243** — no 150 MB download needed for browser work. |
| `gh` CLI | **2.102.0, authed as `ASAYMAN69`** — scopes `gist, read:org, repo, workflow` | Repo create/push and Actions/CI management all work. `repo`+`workflow` is exactly what GITMASTER needs. |
| `node:sqlite` | **works natively** on Node 24.19 | No database server, no native compile. Persistence for the run store and audit trail. |
| `ffmpeg` | present at `/usr/bin/ffmpeg` | Video assembly for the pitch. |
| git identity | `ASAyman <asayman669@gmail.com>` global | Commits are already attributed. |
| Free ports | 8099, 1716 taken | 8787 (control plane) is free. |
| Container/VM? | `systemd-detect-virt` → none (bare metal) | `/dev/kvm` still absent. |

**Isolation design implied by the above:** sandbox = `bwrap --unshare-all --die-with-parent --ro-bind / / --proc /proc --dev /dev --tmpfs /tmp --unshare-net` + cgroup v2 caps + rlimits + brokered egress. The sandbox sees **no env secrets**, a read-only root, an ephemeral tmpfs, and **no direct network** — only the control plane's proxy.

---

## 6. Disk map

```
brz/
├── AGENT.md                 # harness rules for the main agent
├── HACKATHON.md             # the product brief (restructured) — requirements source
├── JUDGING-CRITERIA.md      # the rubric + derived BRZ scorecard — what caps what
├── docs/VISION.md           # ★ the vision of record — what we are building and why
├── STATE.md                 # THIS FILE — session state, decisions, change log
├── README.md                # orientation
├── LICENSE                  # MIT — the submission must be MIT-compliant
├── .env / .env.example      # secrets / template
├── .gitignore
├── scripts/envcheck.sh      # presence check, never prints values
├── .git/                    # single repo → github.com/ASAYMAN69/blast-radius-zero (public)
├── AGENTS/
│   ├── delegation_protocol.md · sub_agent_protocol.md · agent_roles.md
│   ├── brief_template.md · scope_ledger.md
│   ├── roles/<AGENT>.md     # standing card per worker (9 roles)
│   ├── permissions/         # PROTOCOL.md + request/decision files
│   ├── briefs/              # ← what a worker reads (2 ready)
│   ├── completion/ · message/<agent>/ · reports/ · features/
├── docs/architecture/       # ARCHITECT output (probe lands here)
├── docs/business/           # BUSINESS output (market lands here)
├── skills/                  # 17 skills — LOCAL ONLY, not published
└── (to be created) backend/ frontend/ deploy/   ← after vision approval
```

---

## 6b. The three artifacts, and who owns each

| Artifact | Gate it controls | Owner | Status |
|---|---|---|---|
| Public GitHub repo, runnable, well documented | *Application of Technology* — caps at 3 without it | code workstream | not started |
| Live public demo URL | *Application of Technology* — caps at 2 without it | deploy workstream | blocked on Vultr access |
| Pitch video **< 5 min** + slide PDF | *Presentation* — caps at 2 under 3 min, at 3 without market/revenue/future | BUSINESS + coordinator | brief 02 drafted |
| Containment moment in the video | Vultr C1 submission requirement | code + video | not started |
| Market analysis, marketing revenue, future plans | *Presentation* 4/5 and *Business Value* 3+/5 | BUSINESS | brief 02 drafted |
| Originality | *Originality* 4/5 | ARCHITECT + narrative | D-014 |

---

## 7. Recent disk changes

| When | What |
|---|---|
| 2026-10-23 | **Fixed missing CSS for chat-first layout.** The FRONTEND agent created new components (Sidebar, Chatbox, Toast, ThemeToggle) and a new layout (chat-shell, chat-main, right-panel) without writing any CSS for them. The page rendered with unstyled elements — no layout, no spacing, no visual hierarchy. Added ~260 lines of CSS to `frontend/src/styles/app.css` covering all missing classes, using the existing design tokens. Verified with Playwright: sidebar visible, chatbox fills viewport (1086×743), theme toggle works, dark mode toggles and persists, 0 console errors.
| 2026-10-23 | **Briefs 04, 07, 08, 09 all released.** BACKEND brief 04: 9,481 lines, 49 files, 66 tests, typecheck clean, `demo:offline` exit 0. BACKEND brief 08: 94 tests (28 new), typecheck clean, live demo exit 0 on attempt 1 (8,312 tokens, 2/2 green). BUSINESS brief 07: beachhead leads, certifications costed and budget-flagged, Enterprise tier re-anchored, isolation ladder matching engineering. BUSINESS brief 09: certification out of the spoken line, Tier 2 timing now "from kickoff". |
| 2026-10-23 | **Three deviations from the design doc are now accepted and recorded, not worked around**: (1) the report is assembled *after* the teardown, because `lifecycle.*` *are* teardown facts; (2) client-disconnect cancellation is honoured only before the `202`, because the console polls over separate requests — the explicit cancel route is the supported path; (3) the offline demo is **deterministic, not byte-identical** — the report carries measured durations and timestamps, and freezing measurements is the fabricated number the project exists to avoid. The *containment beat* — verdict, denial, caps, teardown — is the part that must be identical across runs; brief 06 verifies exactly that. |
| 2026-10-23 | **Brief 05 (FRONTEND) and brief 07 (BUSINESS) both released.** The console: 27 files, ~7,300 lines, Vite + React 19 + strict TS, no dependency beyond the manifests. Submit screen built from what the API reports (workload and fixtures fetched, never hardcoded), run view with a live event stream polled by seq, the agent's output through a safe Markdown→React renderer, and the blast-radius report panel — verdict banner, four glance tiles, cap meters, one disclosure per question. Five designed states, four fixture runs, 11 screenshots, build 371 kB / 96 kB gzip. The HEAD verified independently: typecheck clean, build clean, no absolute URL, no dangerous DOM API, no `VITE_` secret in the source, and the report panel read in full — it is the kind of artifact a judge scans in five seconds. **Three coordination items resolved by the HEAD:** (1) FRONTEND's permission request for `BRZ_API_TARGET` **granted** and applied to `.env` and `.env.example`, with the decision recorded in the request file; (2) the design doc's two-file tsconfig split **does not compile** (TS6306/TS6310 from project references) — fixed at the root by dropping references entirely: `frontend/tsconfig.json` covers the app only, `vite.config.ts` lives in `tsconfig.node.json`, and the `typecheck`/`lint` scripts run both projects; (3) the ledger's frontend row widened to `frontend/**` since the agent correctly created `index.html`, `vite.config.ts` and `public/`. **Brief 09 written for BUSINESS** with the two decisions it asked for: the certification keeps its costed row in §E.4.1 and loses its place in the spoken line, and Tier 2's timing becomes "from kickoff" rather than "Nov 2026" — because ARCHITECT's design commits the tier to shipping *written and unit-tested* with the swap at kickoff being a config flag, and a date a third party controls is worse than a milestone we control. **Added `scripts/secret-scan.sh`** after the HEAD's own ad-hoc check reported a false positive: the check was wrong (`if cmd | head -1` evaluates `head`'s exit code, always 0), not the repo. Verified afterwards with `git grep` over tracked files, over every blob in history, and over the working tree — the key exists only in the gitignored `.env`, and the entire history is clean. The permanent scanner checks tracked files, the index, untracked-and-unignored files, and all history, prints paths and line numbers only, and was **verified against a canary** (it flags it, and returns to PASS once removed). It is now in the root scripts, in `AGENTS/CONTEXT.md`, and in brief 06's acceptance criteria. |

| When | What |
|---|---|
| 2026-10-23 | **Brief 04 (BACKEND) released.** 9,481 lines across 49 files in `backend/`, **66/66 tests passing**, typecheck clean under `strict` + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax` and no `any`. Verified independently by the HEAD: typecheck clean, 66/66 green, `demo:offline` exit 0. The design's `Measured<T>` was used literally — a `0` is only written when something was genuinely measured as zero, and "no egress attempted" is kept distinct from "egress not measured". Committed as `103400d`. **BACKEND reported a ship-blocking contract gap rather than working around it**: the frozen `ContainmentVerification` cannot fill the frozen `IsolationFact`/`SecretHygieneFact`, so a *sealed* run could never leave `incomplete`. Diagnosed to exactly two missing fields. Brief `08-contract-gap-and-fallbacks.md` written to close it (two nullable probe fields, `null` = not measured), add a fallback provider chain for the 8k-TPM quota that killed a live demo, and add a per-run token budget. Brief `06` amended to own the stand-in deletion, the `BRZ_SANDBOX_PROVIDER` default flip, the `'standin'` union removal (coordinated with FRONTEND's mirror), and the two new probe fields measured from inside the sandbox. A priority correction sent to FRONTEND: **the `incomplete` / `not-measured` case is what is on screen today, not the `contained` case the fixtures show**, so that path must be first-class in the report panel. |
| 2026-10-23 | **Coordinator delegated the remaining calls: "the rest lies on you", "never settle for less".** Decisions D-029…D-036 recorded and applied: (1) beachhead leads the headline, TAM demoted to the ceiling the policy gate creates; (2) certification dates become **costed, budget-flagged plans** rather than being deleted — the roadmap stays dated because *Presentation* 4/5 needs it, but every date is either ours or has a named cost and a `requires budget approval` flag; (3) the **Enterprise tier is re-anchored** on tenancy, volume, retention, export and SLA, so the top price no longer depends on a certification we have not funded, with §C.2's weakness left strong; (4) the isolation story becomes a **dated three-tier ladder** matching ARCHITECT's §4 — namespaces now, per-task Vultr VM at kickoff, microVM-grade in 2027; (5) the shipped demo stays **live with a 2× retry**, plus a **record mode** and a byte-identical containment-beat check; (6) the judge-facing deployment is **access-controlled** — production binds `127.0.0.1`, `deploy/` ships a TLS proxy with basic auth, credentials generated `0600` and never printed, and the service refuses to start in production without an access-control decision; (7) a **standing quality bar** now lives in `AGENT.md` §7.0 and the brief template, and applies to the HEAD's own briefs. |
| 2026-10-23 | Brief `07-commercial-revision.md` written for BUSINESS (wave 2, parallel) to apply the four commercial decisions in place. Brief `06` patched with the record mode, the containment-byte-determinism check, and the access-controlled deployment. Quality-bar notes sent to the running BACKEND and FRONTEND. |
| 2026-10-23 | **Monorepo contract landed (D-028).** Root `package.json` (npm workspaces: `backend`, `frontend`; scripts `dev`/`build`/`typecheck`/`test`/`lint` fan out) and root `tsconfig.base.json` (shared strictness) written by the HEAD. `docs/MONOREPO.md` is the contract. Briefs 04/05/06 patched: the root manifest is HEAD's, and each worker writes **source only** — no manifest, no lockfile. Headroom: `AGENTS/message/architect/monorepo-update.md` sent to the running ARCHITECT so §10 and §11 of the design doc conform to the fixed layout instead of redesigning it. |
| 2026-10-23 | **Phase 1 planned and briefed.** Coordinator narrowed scope: *"core features… just that it works, just works"*; video/slides explicitly **not** the current focus; *"making the project ready is our main focus."* Decisions D-022…D-027. New briefs: `03-phase1-design.md` (ARCHITECT — freezes every contract so BACKEND and FRONTEND can run in parallel), `04-backend-core.md` (BACKEND — server, config, OpenAI-compatible client with an offline mock, agent loop, `node:sqlite` store, routes), `05-frontend-phase1.md` (FRONTEND — operator console, blast-radius report panel, fixture mode, five states), `06-backend-containment.md` (BACKEND — sealed `bwrap` sandbox, cgroup v2 + rlimit caps, capability broker, egress allowlist, `VultrVMProvider` against a mock, `deploy/bootstrap.sh`, the deterministic demo command). |
| 2026-10-23 | **`AGENTS/CONTEXT.md` created** — the one-page project orientation every worker reads on first launch. Dispatch format updated: first launch = `Read AGENTS/CONTEXT.md and AGENTS/briefs/NN.md, then start working.`; later launches = `Read AGENTS/briefs/NN.md and start working.` (persistent sessions). |
| 2026-10-23 | **GitHub repo created**: `github.com/ASAYMAN69/blast-radius-zero` — public, MIT `LICENSE`, `main`, first commit `4895b5a`. `.env` verified unstaged; `skills/` excluded from publish. `gh` confirmed authed as ASAYMAN69 with `repo`+`workflow`. |
| 2026-10-23 | **New role GITMASTER** (`AGENTS/roles/GITMASTER.md`) — the only agent allowed to commit/push/merge, only on an explicit HEAD instruction; never edits product source; always serialized. Mailbox created. Added to `agent_roles.md`, `AGENT.md` §2, scope ledger. The no-commit rule in `permissions/PROTOCOL.md` §3, `sub_agent_protocol.md` §4, and `AGENT.md` §2 now carries that single exception. |
| 2026-10-23 | **`docs/VISION.md` written** — the vision of record: thesis, the seven defining decisions, the Vultr portability contract, repo layout, the 7-wave build plan, the three-artifact owner table, a 8-row risk register, and the one-paragraph narrative. HEAD's scope extended to include it. |
| 2026-10-23 | `JUDGING-CRITERIA.md` (coordinator-supplied) restructured into scorecard tables + a derived BRZ working scorecard. Consequences propagated into `HACKATHON.md` §7.4 and §9 (new §9.2 scoring gates) and into decisions D-010…D-014. |
| 2026-10-23 | New role **BUSINESS** (`AGENTS/roles/BUSINESS.md`), mailbox created, added to `agent_roles.md` + `AGENT.md` §2 + scope ledger. New brief `AGENTS/briefs/02-market-and-monetization.md` (19 items, product-agnostic, parallel to the probe). |
| 2026-10-23 | `STATE.md` created as the **state of record** — survives a context compaction. `AGENT.md` now points to it. |
| 2026-10-23 | `.env` (Groq), `.env.example` (blank), `.gitignore`, `scripts/envcheck.sh` created. `envcheck` passes. Verified the key exists only in `.env`. |
| 2026-10-23 | `AGENTS/permissions/PROTOCOL.md` + `README.md` — out-of-scope grant procedure. Wired into `AGENT.md` §2/§4.5, `delegation_protocol.md` §6.1, `sub_agent_protocol.md` §2/§3, `agent_roles.md`, `brief_template.md`, `scope_ledger.md`, all role cards. |
| 2026-10-23 | `AGENTS/briefs/01-vultr-c1-capability-probe.md` created (ARCHITECT, research only). Ledger row added, status PENDING. |
| 2026-10-23 | `HACKATHON.md` restructured from a flat scrape into a 9-section briefing + a derived constraints checklist. |
| 2026-10-23 | Harness bootstrapped: `AGENT.md` + `AGENTS/*` (protocols, roles, briefs, completion, message, reports, features). 17 skills copied from zyrun. |

---

## 8. Next actions

**Wave 1 is DONE** — ARCHITECT (design, 2,900 lines) and BUSINESS (market, 916 lines after three revisions) both delivered. The workload is decided by ARCHITECT: **`self-healing-runner`** (named direction #5), chosen because the answer is in the error message — `AssertionError: 10 != 15` — so a thin agent's job is one comparison and one edit.

**Wave 2 is DONE** — BACKEND (9,481 lines, 49 files, 66 tests, typecheck clean, `demo:offline` exit 0) and FRONTEND (27 files, ~7,300 lines, typecheck clean, build 371 kB / 96 kB gzip, 11 screenshots, zero console errors) both delivered and committed.

**Wave 3 is DONE** — brief 06 (BACKEND, the sealed sandbox) delivered. Typecheck clean, **91 tests pass**, `demo:offline` exit 0 with verdict **contained** and containment **measured**, live demo exit 0 with 2/2 tests green. The product's central claim is now mechanically true: a sealed, ephemeral sandbox with no secrets, no network, real resource caps (cgroup v2 + rlimits, verified by OOM-kill at exactly the cap), and a blast-radius report that proves it — with the four containment requirements tested, not asserted. Five follow-ups are recorded honestly in the summary (Vultr unit tests against a mock, broker unit tests, deploy verification on a clean Ubuntu instance, cgroup v2 on this machine, and the ulimit `-u` floor raised to 1024 because the host already runs ~50 threads per user). None of them block shipping.

**Wave 4 is DONE** — GITMASTER (CI + PR template + dev docs + README + SECURITY.md + CONTRIBUTING.md, both workflows valid YAML, every CI command passing locally) and DESIGNER (15 findings, P1 list 3 items ~45 min, report panel verdict *needs work — density/default-open choices only, structure and not-measured treatment correct*) both delivered.

**Wave 5 is DONE** — FRONTEND polish: P1 (3 items), P2 (2 items), P3 (6 of 7), plus the not-measured-first-class correction and a fifth fixture mirroring the real stand-in output. Typecheck clean, build 380/97 kB, all hygiene greps clean, zero console errors, no overflow at 1440 or 390.

**Wave 9 is DONE** — BACKEND (sessions + multi-turn agent loop, 7 endpoints, schema v2, 91 tests) and FRONTEND (chat-first UI: dark mode, sidebar, chatbox, right panel, toast, button fixes, 380/97 kB build) both delivered and committed.

**Wave 10 is DONE** — DBMASTER: APPROVED (no SQL changes required, all constraints verified). TESTER: PASS WITH RISKS (Phase 1 regression clean — 91 tests, demo contained, typecheck, build; sessions API fully verified; dark mode, sidebar, chat UI, multi-turn verified via code + API evidence). Two P2 risks (broker/Vultr unit suites, rlimit-only process cap) and one P3 (no browser runtime verification).

**Wave 6 is DONE** — TESTER verified everything. Verdict: **PASS WITH RISKS**. Core containment claim holds and is measured (offline demo `contained`, secret hygiene, no direct egress, caps, lifecycle, broker all verified). Typecheck/tests/build green, secret scan clean, config fails closed. Four risks: P1 frontend type mirror (now fixed), P2 missing dedicated broker/Vultr unit suites, P2 process-cap weakening in rlimit-only mode, P3 stale `byte-identical` wording (now fixed).

**Wave 7 is DONE** — FRONTEND mirror sync (`'standin'` removed, `'provider.rotated'` added, drift check 73=73) and ARCHITECT design-doc wording fix (the `byte-identical` claim corrected to `not byte-identical`, with the one-line note explaining why). Both verified independently.

```
INVOKE: TESTER
Read AGENTS/CONTEXT.md and AGENTS/briefs/13-tester-verification.md, then start working.
```

TESTER is read-only on product code and writes only to `AGENTS/reports/**`. It verifies the contract, the containment claims, the agent loop, the HTTP surface, the access-control gate, the frontend, the deployment artifacts, and scores the rubric. It fixes nothing and reports everything.

**The plan, in order**

| Wave | Brief | Agent | What it produces | Gate to the next wave |
|---|---|---|---|---|
| 1 | `03-phase1-design.md` | ARCHITECT | The frozen contracts — done | accepted |
| 1 | `02-market-and-monetization.md` | BUSINESS | Market, buyer, pricing, pitch narrative — done | — (parallel) |
| 2 | `04-backend-core.md` | BACKEND | Control plane, inference, agent loop, store, routes — **RELEASED** (66 tests) | a real task runs end to end |
| 2 | `05-frontend-phase1.md` | FRONTEND | Operator console, blast-radius panel, fixtures — **RELEASED** (build 371/96 kB) | the console is usable in fixture mode |
| 2 | `08-contract-gap-and-fallbacks.md` | BACKEND | Contract gap closed, fallback chain, token budget — **RELEASED** (94 tests) | the gap is closed and the demo is resilient |
| 2 | `07-commercial-revision.md` | BUSINESS | Beachhead leads, certifications costed, Enterprise re-anchored, ladder matches engineering — **RELEASED** | — |
| 2 | `09-commercial-decisions.md` | BUSINESS | Certification out of the spoken line, Tier 2 timing now "from kickoff" — **RELEASED** | — |
| 3 | `06-backend-containment.md` | BACKEND | Sealed sandbox, broker, egress allowlist, real report, `deploy/bootstrap.sh`, the deterministic demo command | **The containment claims are mechanically proven** |
| 4 | CI + PR hygiene | GITMASTER | `.github/workflows/**`, branch and PR discipline | CI green on every push |
| 4 | UI design review | DESIGNER | A concrete polish spec against the built console | — (parallel) |
| 5 | UI polish | FRONTEND | The polish applied | The console looks deliberate |
| 6 | Phase 1 verification | TESTER | An independent verdict against the acceptance criteria | PASS |
| — | `01-vultr-c1-capability-probe.md` | ARCHITECT | Vultr facts for the production tier | **HOLD** — same agent as wave 1; runs after it |

**Still waiting on the coordinator**

- **A second LLM key** (fallback provider) — the live demo died on an 8 000 tokens/minute shared quota. The fallback chain makes it optional; a key makes it reliable. This is the single cheapest de-risking move left.
- **Permission for agents to `npm install`** — now largely moot (the HEAD owns the one install), but still on the record.
- **The 8 Nov 12:00 UTC code freeze** — leaves 11 hours for pitch, video, and polish only.
- **Q-014: pitch assembly owner** — who turns the outline into the slide PDF and records the video. The deck is a scored artifact, not a wrap-up.
- **Any correction to `docs/VISION.md`**.

**What is already decided and no longer open**

- Stack: TypeScript + Node + React/Vite (D-015).
- Local sandbox: bubblewrap + cgroup v2 + rlimits (D-016).
- No Vultr account until kickoff — build for portability (D-017).
- Repo public on day one: `github.com/ASAYMAN69/blast-radius-zero` (D-018).
- GITMASTER is the only agent that commits, pushes or merges (D-019).
- Deployment and the public URL are post-kickoff (D-020).
- Workload: `self-healing-runner` (ARCHITECT, brief 03).
- The agent is deliberately dumb-but-sufficient; the demo's quality must never depend on model intelligence (D-023).
- The demo scenario is a single deterministic command (D-024).
- The isolation ladder: Tier 1 namespaces now → Tier 2 per-task Vultr VM from kickoff → Tier 3 microVM 2027 (D-032).
- The Enterprise tier is anchored on tenancy, volume, retention, export and SLA — not on certifications (D-031).
- The certification dates are costed, budget-flagged plans, not promises (D-030).
- The judge-facing deployment is access-controlled: production binds `127.0.0.1`, TLS proxy, basic auth, fail closed (D-034).
- The quality bar applies to every agent and to the HEAD (D-035).

**Rules of the road**

- Keep `AGENT.md` `<projectInfo>` as the append-only log; this file is the live state.
- The HEAD commits until GITMASTER takes over in wave 4.
- The HEAD never settles for less, and neither do the agents.