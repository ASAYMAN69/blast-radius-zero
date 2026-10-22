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

**Wave 1 is DONE** — ARCHITECT (design, 2,900 lines) and BUSINESS (market, 793 lines) both delivered. The workload is now decided by ARCHITECT: **`self-healing-runner`** (named direction #5), chosen because the answer is in the error message — `AssertionError: 10 != 15` — so a thin agent's job is one comparison and one edit.

**Wave 2 is dispatched.** BACKEND and FRONTEND in parallel, against the frozen contracts.

```
INVOKE: BACKEND
Read AGENTS/CONTEXT.md and AGENTS/briefs/04-backend-core.md, then start working.

INVOKE: FRONTEND
Read AGENTS/CONTEXT.md and AGENTS/briefs/05-frontend-phase1.md, then start working.
```

Both are first launches for their agents, so both prompts point at `AGENTS/CONTEXT.md`.

**The plan, in order**

| Wave | Brief | Agent | What it produces | Gate to the next wave |
|---|---|---|---|---|
| 1 | `03-phase1-design.md` | ARCHITECT | The frozen contracts: provider interface, API, schema, report shape, file layout, demo scenario. **DONE** | accepted |
| 1 | `02-market-and-monetization.md` | BUSINESS | Market, buyer, pricing, pitch narrative. **DONE** | — (parallel) |
| 2 | `04-backend-core.md` | BACKEND | Control plane: server, config, inference client, agent loop, store, routes | A real task runs end to end |
| 2 | `05-frontend-phase1.md` | FRONTEND | The operator console with the blast-radius report panel | The console is usable in fixture mode |
| 3 | `06-backend-containment.md` | BACKEND | Sealed sandbox, broker, egress allowlist, real report, `deploy/bootstrap.sh` | The containment claims are mechanically proven |
| 4 | CI + PR hygiene | GITMASTER | `.github/workflows/**`, branch and PR discipline | CI green on every push |
| 4 | UI design review | DESIGNER | A concrete polish spec against the built console | — (parallel) |
| 5 | UI polish | FRONTEND | The polish applied | The console looks deliberate |
| 6 | Phase 1 verification | TESTER | An independent verdict against the acceptance criteria | PASS |
| — | `01-vultr-c1-capability-probe.md` | ARCHITECT | Vultr facts for the production tier | **HOLD** — same agent as wave 1 |

**Still waiting on the coordinator**

- Q-011 the flagship workload — ARCHITECT decides it in the design brief against explicit constraints, so this is no longer blocking.
- Q-016 a second LLM key for fallback, Q-019 permission for npm installs, Q-020 the 8 Nov code freeze.
- Any correction to `docs/VISION.md`.

**Rules of the road**

- Keep `AGENT.md` `<projectInfo>` as the append-only log; this file is the live state.
- The HEAD commits until GITMASTER takes over in wave 4.
