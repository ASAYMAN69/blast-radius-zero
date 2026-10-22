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

---

## 3. Open questions for the coordinator

| # | Question | Status |
|---|---|---|
| Q-001 | **Local sandbox tier** — bwrap (recommended) vs. install Docker vs. defer | asked |
| Q-002 | **Stack** — TypeScript+Bun+React (recommended) vs. TS+Node+React vs. Python+FastAPI+React vs. Go control plane | asked |
| Q-003 | **Public demo hosting** — Vultr VM + domain (recommended, brief-compliant) vs. Vultr VM + Cloudflare Tunnel vs. Vercel frontend + Vultr API | asked |
| Q-004 | **Vultr account now?** — free account + new email + payment method, so we can verify the real API before kickoff | asked |
| Q-005 | **Repo public from day one?** — the submission judges "setup and documentation" | asked |
| Q-006 | **Inference fallback** — a second provider/key so a demo never dies on a rate limit | asked |
| Q-007 | **Demo video** — who records it, on what machine, and do we build a scripted, repeatable "containment moment" command so it can be re-shot? | asked |
| Q-008 | **Team size (1–6)** and who presents | asked |
| Q-009 | **Domain** — is there one we can point at the demo? | asked |
| Q-010 | **Extra access the coordinator is willing to give**: GitHub token, Vercel/Cloudflare token, a second LLM key, a Vultr card | asked |
| Q-011 | **Flagship workload** — A Self-Healing Runner (recommended) / B Site QA Sweep / C Research with Receipts / own | deferred — coordinator wants prerequisites first |
| Q-012 | **Product scope for the demo** — no auth, single shared deployment, public landing page? | deferred |
| Q-013 | **Do you want the BUSINESS workstream dispatched now?** (brief 02, product-agnostic, runs in parallel with the probe) | asked |
| Q-014 | **Pitch assembly owner** — who turns the outline into the slide PDF and records the video? Needs a named human. | asked |
| Q-015 | **Do we build the pitch/deck tooling** (a scriptable deck generator using `skills/pitch-deck`)? | asked |

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
| Chrome/Chromium | running on this box | Playwright browsers may still need a separate download. |
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
├── STATE.md                 # THIS FILE — session state, decisions, change log
├── README.md                # orientation
├── .env / .env.example      # secrets / template
├── .gitignore
├── scripts/envcheck.sh      # presence check, never prints values
├── AGENTS/
│   ├── delegation_protocol.md · sub_agent_protocol.md · agent_roles.md
│   ├── brief_template.md · scope_ledger.md
│   ├── roles/<AGENT>.md     # standing card per worker
│   ├── permissions/         # PROTOCOL.md + request/decision files
│   ├── briefs/              # ← what a worker reads
│   ├── completion/ · message/<agent>/ · reports/ · features/
├── docs/architecture/       # ARCHITECT output (probe lands here)
├── docs/business/           # BUSINESS output (market lands here)
├── skills/                  # 17 skills
└── (to be created) backend/ frontend/ sandbox/   ← after the stack decision
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

1. **Coordinator answers Q-001…Q-010.** Everything else is blocked on the stack and sandbox decisions.
2. **Dispatch the probe** (already written, product-neutral, no Vultur access needed):
   `INVOKE: ARCHITECT` → `Read AGENTS/briefs/01-vultr-c1-capability-probe.md and start working`
3. **Then the first build brief** — after Q-001/Q-002 land, write brief `02` for the sandbox provider interface + local bwrap tier. Design it so the Vultr tier slots in behind the same interface at kickoff.
4. **Repo init** (D-008): single repo at root, public per Q-005, with a README that already reads like a submission.
5. Keep `AGENT.md` `<projectInfo>` as the append-only log; this file is the live state.
