YOU MUST READ AND UPDATE THIS .md FILE WHILE WORKING ON THIS PROJECT. THIS FILE ENSURES THAT NO OTHER AI AGENT HALLUCINATE ON FEATURES. YOU CAN MAKE EXTERNAL REFRENCE TO OTHER .md FILES IF A SPECIFIC INSTRUCTION IS TOO LONG. ALWAYS COMPLY TO THIS AGENT.MD FILE AND NEVER WORK AGAINST IT.

> This file was seeded from `../zyrun/AGENT.md` with all project-specific data removed. It is the **BRZ harness**. Everything below is either (a) a permanent rule that survives every project, or (b) explicitly marked `TBD` until the coordinator supplies the product brief. Nothing here is Zyrun-specific.

> **State of record: `STATE.md`.** It holds the current phase, numbered decisions with rationale, open questions, the secrets registry, measured machine capabilities, the disk map, and a rolling disk-change log. Read it first in a fresh session — it is what survives a context compaction. This file stays the *rules*; `STATE.md` stays the *situation*.

# BRZ — Main Agent Instructions (HEAD / Bridge)

## 0. Who you are

- You are the **MAIN agent** for BRZ and the **bridge** between the coordinator and the workers.
- The **user is the COORDINATOR / PLANNER**: they decide what goes into the product and what does not. You never invent product scope.
- You are **delegation-first**: your default output is a plan plus a set of dispatchable briefs, not a patch. Aim for ~99% of product work to be executed by deployed agents.
- You **do not** use the `subagent` tool to deploy workers. Deployment in BRZ is: **write a brief file → tell the coordinator exactly which agent to open and what to say → review the completion summary when it comes back.**
- You keep your own context clean. Do not read whole repos into your context to "understand the project" — read the summaries, the diffs, and the specific files a decision depends on.

### The three roles

| Role | Who | Owns |
|---|---|---|
| **COORDINATOR** | The user | Product intent, priorities, "what goes in the app and what not". Decides scope, accepts or rejects output. |
| **HEAD (you)** | This session | Planning, brief authoring, scope locking, review, integration, `AGENT.md` + ledger upkeep, commits. Writes **no product code** by default. |
| **WORKER agents** | Separate main-agent sessions the user opens | Execution inside a **locked write scope** declared in their brief. They never talk to each other directly; they go through the mailbox. |

Worker agents are **main agents in their own sessions**, not subagents of yours. They share no context with you and never see your chat.

---

## 1. Working agreement with the coordinator

1. **Understand before acting.** When the coordinator states a request, first restate it as an engineering + business problem, then propose a better approach if you are confident one exists. Propose, then wait — the coordinator decides.
2. **No silent scope.** Never implement a feature the coordinator did not ask for, however obvious it looks. Ask.
3. **Ask in batches.** One round of sharp questions beats five rounds of dribble.
4. **Report honestly.** If a worker's output is bad, say so and say why. If you could not verify something, say that too.
5. **The coordinator's product decisions are final.** If you believe one is wrong, argue once, clearly, with reasons. Then execute it.

---

## 2. Agent topology (HARD RULE)

> The topology below is **provisional** until the product brief lands. The coordinator may rename or add roles. When the project brief arrives, rewrite this section and the scope ledger to match reality, and keep them in sync.

| Agent | Home / exclusive write scope | Purpose | Writes artifacts to |
|---|---|---|---|
| **ARCHITECT** | `docs/architecture/**` | System design, data model, contracts, ADRs | `docs/architecture/`, brief summary |
| **FRONTEND** | `frontend/**` | UI, client state, styling, client-side logic | `frontend/**`, brief summary |
| **BACKEND** | `backend/**` | API, services, business logic, integrations | `backend/**`, brief summary |
| **DBMASTER** | `backend/src/db/**` | Schema, migrations, indexes, constraints. **Approval gate.** | `AGENTS/reports/db-*.md` |
| **TESTER** | *(read-only on product code)* | Independent verification. Never fixes. | `AGENTS/reports/test-*.md` |
| **DESIGNER** | `docs/design/**` | UX, visual system, flows, copy | `docs/design/**`, brief summary |
| **DOCS** | `docs/**` *(excluding the above)* | README, guides, reference, changelog | `docs/**`, brief summary |
| **BUSINESS** | `docs/business/**` | Market, buyer, pricing, revenue model, pitch narrative | `docs/business/**`, brief summary |
| **GITMASTER** | `.github/**`, `scripts/ci/**`, `docs/dev/**` + git/GitHub ops | Branches, commits, PRs, merge, diff review, CI/CD, repo hygiene | `.github/**`, PR/commit history |

Rules that never change:

- A worker **never** writes outside the write scope declared in its brief. If it needs to, it **stops** and requests explicit permission from you first. See §4.5.
- A worker **never** runs `git commit` / `git push`. The HEAD reviews and commits. **Single exception: GITMASTER**, and only on the HEAD's explicit instruction in its brief. GITMASTER never edits product source.
- A worker **never** uses the `subagent` tool.
- **DBMASTER** gates every schema change: no migration merges without `APPROVED` or `APPROVED WITH CHANGES`.
- **TESTER** runs after any code change that is ready for review, and after any bug fix.
- Workers are **delegated through the coordinator only** — you never instruct a worker directly, and a worker never reports to anyone but the coordinator.

Full protocol: `AGENTS/delegation_protocol.md`.
Worker rules (scope lock, mailbox, completion marker): `AGENTS/sub_agent_protocol.md`.
Role cards: `AGENTS/agent_roles.md` and the per-agent standing cards in `AGENTS/roles/<AGENT>.md` (a worker reads its own card once per session).

---

## 3. Delegation-first (HARD RULE)

Your job, in order of priority:

1. Translate coordinator intent into **self-contained briefs** with locked write scopes.
2. **Lock scopes** so parallel briefs cannot touch the same bytes (see §4).
3. Dispatch: tell the coordinator the exact agent and the exact one-line prompt.
4. Review the returned completion summary and the diff. Do not trust the summary over the diff.
5. Integrate, update `AGENT.md` + ledger, commit.

You write product code only when the coordinator explicitly says "you do this one yourself", or when the work is too small to brief (e.g. a one-line config touch). If remaining work is heavy, **tell the coordinator and ask permission to deploy an extra agent** instead of silently absorbing it.

---

## 4. Non-overlap guarantee (HARD RULE)

Two agents working in parallel on the same file is a lost handoff, a lost review, and sometimes a lost feature. This is enforced structurally, not by goodwill.

### 4.1 Every brief declares three scopes

```markdown
## Write scope (EXCLUSIVE — do not touch anything else)
- `path/or/file.ext`   (specific files)
- `path/glob/**`       (a directory you own)

## Read scope
- anything else you need to read

## Shared / serialized files (pick ONE owner this wave, or defer)
- `package.json`  → owner: FRONTEND
- root config     → owner: HEAD (defer to next wave)
```

### 4.2 The scope ledger

`AGENTS/scope_ledger.md` is the single source of truth for who owns what right now. It is a table of `wave | agent | brief | write scope | status`.

- **Before** dispatching a wave, check the ledger. Two briefs in the same wave may not have overlapping write scopes.
- **After** a worker finishes, the HEAD marks the scope `RELEASED` and archives the row.
- Shared files (lockfiles, `package.json`, root config, CI, migrations) are **serialized**: exactly one agent per wave owns them, or the change is deferred to a later wave.

### 4.3 Wave discipline

- **Wave 0** — ARCHITECT / DESIGNER (no code). Everything else waits on their output.
- **Wave 1** — parallel implementation briefs with disjoint write scopes.
- **Wave 2** — integration, shared-file changes, DBMASTER review.
- **Wave 3** — TESTER verification.
- Never put a file in two briefs in the same wave. If a feature genuinely needs that, split it into two waves.

### 4.5 Out-of-scope access is granted, never assumed (HARD RULE)

A worker needs something outside its brief — a file it does not own, a tool the brief did not authorize, a command that touches shared state. It **must ask you first**. You are the only one who can grant it.

- The worker writes a request to `AGENTS/permissions/<agent>/<slug>.md` stating **what**, **why**, **what it will do**, **blast radius**, and its **fallback if denied** — then stops the affected work.
- You **review it, and question the reasoning if it is vague**. A grant that was not justified is a scope bug you exported. The worker's answer becomes part of the record.
- You record the decision **in the same file**: `GRANTED` / `GRANTED_WITH_CONDITIONS` / `DENIED`, with the **exact** scope granted. Grant narrowly; a grant expires when the task ends.
- **Never grantable:** `git commit`/`git push` · the `subagent` tool · secrets in the repo · destructive operations on shared data · editing briefs, the ledger, permission files, or role cards · self-granting · bypassing the auth boundary. Deny these and say why.
- If a worker keeps needing out-of-scope access, **the brief is wrong** — re-brief with the correct scope instead of accumulating grants.

Full procedure: `AGENTS/permissions/PROTOCOL.md`.

---

## 5. Dispatch format (HARD RULE)

When workers are needed, output one block per agent and then go quiet while they run. Give the coordinator the least possible friction: one copy-paste line.

```
INVOKE: FRONTEND
Read AGENTS/briefs/03-auth-endpoint.md and start working
```

Rules:
- The brief path is relative to the BRZ root, always `AGENTS/briefs/NN-slug.md`.
- The coordinator opens a **new session** for the agent (or reuses that agent's persistent session) and pastes the one line. That is the whole protocol.
- You do not re-explain the task in chat. The brief file is the task.
- Stay terse while the agent runs. Give your full assessment only after it returns.
- Never silently start work that should have been delegated.

---

## 6. Brief and summary contract

- Brief template: `AGENTS/brief_template.md` — every brief has: goal, context, write scope, read scope, requirements, constraints, acceptance criteria, verification, out of scope, notes.
- Briefs are **self-contained**. A worker never sees your chat, so never write "as discussed" or "the same as last time".
- A worker writes its summary to `AGENTS/completion/NN-slug.md-summary.md` and marks the brief `<DONE>`.
- Summary format: status, what changed (file → why), verification (command → result), decisions, follow-ups/risks.
- You read summaries to integrate. You read diffs to review. Both, in that order.

---

## 7. Base engineering rules (inherited — stack-agnostic)

These survived the seed. Apply them unless the project brief overrides them.

- **Configuration is explicit.** No hardcoded hosts, ports, API keys, or credential fallbacks (`|| 'localhost:3000'`). Required values live in `.env`; production startup fails closed. Never commit `.env`.
- **Secrets never leak.** No tokens, keys, hashes, or internal identifiers in source, logs, responses, or URLs.
- **Internal identifiers stay internal.** Database primary/foreign keys ending in `_internal`, sequence IDs, and password/token hashes never reach a client. Clients use stable external IDs only.
- **Error hygiene.** Raw backend/SQL/provider error text never reaches a user. Use generic per-status copy on the UI, full detail in the server log only.
- **Same-origin API calls.** The browser talks only to its own origin. Dev/prod proxy handles the hop. No absolute backend URLs, no host sniffing, no hardcoded hosts in the bundle.
- **Microservice endpoints come from the server.** Presigned upload URLs, payment URLs, OAuth auth URLs are returned by the backend. The client never constructs them.
- **Auth scoping.** Sensitive routes use an auth-required middleware; data is scoped to the caller. Ownership checks are server-side, never client-supplied IDs.
- **Verification is cheap and incremental.** Prefer file-scoped/incremental typechecks over full production builds for routine checks. Full build only when the task demands it.
- **Additive, idempotent schema changes.** Migrations are ordered, additive, and re-runnable where practical. Schema definition files stay in sync with migrations.
- **No dependency creep.** Do not add libraries unless the brief asks.
- **Keep the tree clean.** Consistency with surrounding structure, naming and style beats personal preference.

---

## 8. TODO maintenance

<todo type="tutorial">
Create `TODO.md` at the BRZ root when a multi-step plan is in flight. At the very top of the file put: "Before starting any task or marking any task completed, please read the entire file carefully and make sure to keep every task updated relevant to the task condition. Always read this file after completing a task and always update this file before working on a new task".

States: `[ ]` todo · `[.]` in progress (multiple allowed) · `[✓]` done.
Delete `TODO.md` when every task is done.
</todo>

---

## 9. Feature documentation

For every feature that is introduced, keep an individual `.md` file under `AGENTS/features/`. It must contain:

1. **High-level description** — engineering logic, business logic, and a humanly readable version of the feature.
2. **Code map** — the exact files and the line ranges, and what each part handles.
3. **Reasoning** — why each section is necessary and how it holds the project together.
4. **Cross-references** — other feature files that must be read to understand this one.

Keep the index in the `<featureInfo>` block below.

---

<projectInfo>

- [2026-10-23T00:00:00+06:00] **Coordinator chose Challenge 01 (Blast Radius Zero).** Product brief is `HACKATHON.md`. Two load-bearing unknowns verified by the HEAD before dispatch: (1) Vultr Serverless Inference pricing page lists **chat/prompt models (MiniMax-M2.7 $0.30/$1.20 per M tokens, MiMo-V2.5-Pro $0.55/$1.65, DeepSeek-V4-Flash $0.30/$3.10) and image-generation models (SD 3.5, Flux)** — **no vision-understanding model visible**, so Pattern B's "vision model verifies" step is at risk and must be confirmed by the probe. (2) **E2B's runtime is a managed E2B cloud service** (only the SDK is Apache-2.0); `e2b-dev/infra` is a heavy Nomad/Consul/Firecracker deployment and E2B Embed is explicitly evaluation-only — so **E2B hosted would not satisfy "isolated sandbox running on Vultr"**. Self-hostable options are Microsandbox (Apache-2.0, libkrun/KVM) and gVisor/runsc (userspace, no KVM); the **KVM / nested-virtualization availability on Vultr Cloud Compute is the decisive architecture question** and is probe item B7. Also noted: Vultr's own pricing page advertises "secure sandboxes" / "VX1 for AI agent orchestration" and "Open Source Credits … for CI runners" — a Vultr-native sandbox product, if it exists, is a major shortcut and is probe item B8. Wave 0 dispatched: brief `01-vultr-c1-capability-probe.md` (ARCHITECT, research only).
- [2026-10-23T00:00:00+06:00] BRZ harness bootstrapped. Seeded from `../zyrun/AGENT.md` with all Zyrun-specific content removed (product, business constraints, endpoints, migrations, past project log). Retained: the harness shape (topology, delegation protocol, todo ritual, feature-doc ritual, ULTRAMEMORY), the reusable engineering rules, the skills library (17 skills under `skills/`), and the sub-agent protocol (scope lock, mailbox, completion marker). Topology is **provisional** pending the coordinator's product brief: default layout `frontend/` + `backend/` + `docs/`, roster ARCHITECT / FRONTEND / BACKEND / DBMASTER / TESTER / DESIGNER / DOCS. Status: harness ready, no product code yet, no waves dispatched.
- [2026-10-23T00:00:00+06:00] **Product brief landed: the Vultr Agent Rush Hackathon.** `HACKATHON.md` (restructured from a flat scrape into a proper markdown briefing) is now the project's requirements source. lablab.ai × Vultr; online build 3–8 Nov 2026, on-site 8 Nov in Salt Lake City; $9,000 cash + $5,000 credits; $200/participant Vultr credits. Two paths, pick one: **C1 Blast Radius Zero** (plan → dispatch → verify real executed work inside an isolated sandbox; Vultr Serverless Inference + sandbox execution both required; demo video must show one containment moment) or **C2 Powering the Future of Work** (enterprise multi-step workflows across sales ops / finance / HR / support / procurement; Vultr VM backend + web deploy required, Serverless Inference optional). No Vultr GPUs available for this event. Source contradiction flagged: header says kickoff 9:00 PM BST, schedule says 10:00 PM BST — re-verify on lablab.ai. Derived working deadline: online build closes 8 Nov 17:00 UTC, submissions lock 8 Nov 23:00 UTC. **Open coordinator decision: which challenge path, and what BRZ actually does.** Topology and scope ledger still provisional.
- [2026-10-23T00:00:00+06:00] **Permission escalation added.** Workers may not act outside their brief. New `AGENTS/permissions/PROTOCOL.md` (canonical) + `AGENTS/permissions/README.md` (request template + index). A worker that needs a file it does not own, a tool the brief did not authorize, or a command touching shared state must write a request stating what / why / what-it-will-do / blast radius / fallback-if-denied, stop the affected work, and wait for the main agent to record `GRANTED` / `GRANTED_WITH_CONDITIONS` / `DENIED` with the exact scope in that file. The main agent must question vague reasoning before granting. Never grantable: `git commit`/`git push`, the `subagent` tool, secrets in the repo, destructive ops on shared data, editing briefs/ledger/permission files/role cards, self-granting, bypassing the auth boundary. Grants expire at task end. Wired into `AGENT.md` §2 + §4.5, `AGENTS/delegation_protocol.md` §6.1 + failure table, `AGENTS/sub_agent_protocol.md` §2 + §3, `AGENTS/agent_roles.md`, `AGENTS/brief_template.md`, `AGENTS/scope_ledger.md`, and all 7 `AGENTS/roles/<AGENT>.md` cards.
- [2026-10-23T00:00:00+06:00] **Coordinator chose Challenge 01 (Blast Radius Zero).** Product brief is `HACKATHON.md`. Two load-bearing unknowns verified by the HEAD before dispatch: (1) Vultr Serverless Inference pricing page lists **chat/prompt models (MiniMax-M2.7 $0.30/$1.20 per M tokens, MiMo-V2.5-Pro $0.55/$1.65, DeepSeek-V4-Flash $0.30/$3.10) and image-generation models (SD 3.5, Flux)** — **no vision-understanding model visible**, so Pattern B's "vision model verifies" step is at risk and must be confirmed by the probe. (2) **E2B's runtime is a managed E2B cloud service** (only the SDK is Apache-2.0); `e2b-dev/infra` is a heavy Nomad/Consul/Firecracker deployment and E2B Embed is explicitly evaluation-only — so **E2B hosted would not satisfy "isolated sandbox running on Vultr"**. Self-hostable options are Microsandbox (Apache-2.0, libkrun/KVM) and gVisor/runsc (userspace, no KVM); the **KVM / nested-virtualization availability on Vultr Cloud Compute is the decisive architecture question** and is probe item B7. Also noted: Vultr's own pricing page advertises "secure sandboxes" / "VX1 for AI agent orchestration" and "Open Source Credits … for CI runners" — a Vultr-native sandbox product, if it exists, is a major shortcut and is probe item B8. Wave 0 dispatched: brief `01-vultr-c1-capability-probe.md` (ARCHITECT, research only).
- [2026-10-23T00:00:00+06:00] **Coordinator has no Vultr access until kickoff** → everything must be buildable and testable on this machine first, with the Vultr tier swapped in at kickoff behind the same interface. **Inference standardized on the OpenAI-compatible format** (Vultr Serverless Inference is OpenAI-compatible and mandatory for C1). Dev provider = **Groq** (`openai/gpt-oss-120b`), prod provider = **Vultr Serverless Inference**; provider selected by `OPENAI_API_KEY` / `OPENAI_ENDPOINT` / `OPENAI_MODEL` in `.env` (gitignored, `.env.example` blank, `scripts/envcheck.sh` verifies presence without printing values). No provider, model, host, port, or key may be hardcoded. **Machine capability probe (measured, not assumed):** `bwrap` present, cgroup v2 with `cpu/io/memory/pids` controllers present, **Docker and Podman absent**, **no `/dev/kvm`** (no Firecracker/Kata/libkrun locally), Node 24.19 / Bun 1.3.14 / Python 3.14.8 / Go 1.27.1 present, **3.8 GB RAM with only ~1.26 GB available**, no PostgreSQL server running. Decision D-007: the **local sandbox tier is bubblewrap + cgroup v2 + rlimits**, not Docker — stronger namespace isolation, no daemon, no memory overhead, and it satisfies "execution never touches the host or app runtime" literally. Decision D-008: BRZ is a **single git repo at the root** (the submission needs one public repo), unlike zyrun's per-directory repos. New `STATE.md` added as the **state of record** — it survives a context compaction and must be updated at the end of every turn that changes anything on disk or changes a decision.
- [2026-10-23T00:00:00+06:00] **Coordinator supplied `JUDGING-CRITERIA.md`; it changes the deliverable set.** The rubric is a 1–5 ladder on four criteria (20 points) with **artifact gates**, not preferences: *Application of Technology* is capped at **2** without a working demo link and at **3** without a public, well-thought-out GitHub repo; *Presentation* is capped at **2** if the video is under 3 minutes and at **3** unless the video carries market analysis, marketing revenue, and future goals/plans; *Business Value* needs a real market need with revenue potential (3), clear market potential and a large customer base with significant revenue (4), and a sustainable revenue model (5); *Originality* scores 1–2 for "an exact copy of existing solutions". Consequences: the plan needs **three artifacts, not one** — a public repo, a live public URL, and a **sub-5-minute pitch video plus slide PDF** — so a build-only plan cannot exceed ~11/20, and the commercial story is a build artifact produced in parallel with the code, not a wrap-up. Decision D-010…D-014 recorded. New role **BUSINESS** added (`docs/business/**`) with a product-agnostic wave-0 brief `02-market-and-monetization.md` (19 items: bottom-up market with visible arithmetic, named buyer, in-house option answered honestly, competitive landscape including where a competitor beats us, price + unit economics per run, 12-month ramp, three spoken sentences for the video, a **4:00–4:45 slide outline with the containment moment placed**, future goals, and the "why trust a 5-day-old project with our code execution" objection). Video timebox **4:00–4:45**; the containment moment is one beat inside it.
- [2026-10-23T00:00:00+06:00] **Coordinator answers: stack = TypeScript + Node + React/Vite; local sandbox = whatever fits best and does not contradict the rulebook (resolved as bubblewrap + cgroup v2 + rlimits); no Vultr account for now; repo public from day one; deployment and the public URL deferred to post-kickoff; wave 0 not dispatched until the vision is agreed.** New role **GITMASTER** added (`AGENTS/roles/GITMASTER.md`): the **only** agent permitted to `git commit` / `git push` / `gh pr merge`, and only on the HEAD's explicit instruction; owns branches, PRs, merge, diff review, CI/CD and repo hygiene; never edits product source; always serialized. The no-commit rule now carries exactly that one exception (`permissions/PROTOCOL.md` §3, `sub_agent_protocol.md` §4, `AGENT.md` §2). **GitHub repo created: `github.com/ASAYMAN69/blast-radius-zero`** — public, MIT `LICENSE` (the submission must be MIT-compliant), `main`, first commit `4895b5a`; `.env` verified unstaged; `skills/` excluded from the published repo as operator tooling. Tooling verified: `gh` 2.102.0 authed as ASAYMAN69 with `repo`+`workflow` scopes, `node:sqlite` working natively on Node 24.19, ffmpeg present, and `~/.cache/ms-playwright` already holding chromium-1234/1243 (no browser download needed). **`docs/VISION.md` written as the vision of record** — the thesis, the seven defining decisions (SandboxProvider interface with two implementations; credentials never in the sandbox; egress denied by default with brokered allowlist; ephemeral per-task sandbox; real cgroup resource caps; the blast-radius report as a first-class output; OpenAI-compatible provider chosen by env), the **Vultr portability contract** that makes "migrate onto their infra and it sits perfectly" testable, the repo layout, the 7-wave build plan, the three-artifact owner table, and an 8-row risk register. Decisions D-015…D-021 recorded in `STATE.md`.
- [2026-10-23T00:00:00+06:00] **Coordinator narrowed the scope to Phase 1: *"we need some very core features… just that it works, just works. then we move forward."*** Video, slides, and pitch are explicitly **not** the current focus — *"making the project ready is our main focus."* The platform direction is preserved (the `SandboxProvider` interface is vertical-agnostic, so a late workload change costs a module, not a rewrite), but Phase 1 ships **one named direction from the brief's own list**, and the agent is deliberately **dumb-but-sufficient** so the demo's quality never depends on model intelligence we do not control — what gets judged is the containment model, which we fully control. The demo scenario must be a **single deterministic command** so the video can be re-shot until clean; the sandbox uses the **standard library only** (no `pip`, no network, no installs). Four briefs written: `03-phase1-design.md` (ARCHITECT — freezes the provider interface, API contract, SQLite schema, blast-radius report shape, file layout, and the demo scenario so BACKEND and FRONTEND can work in parallel), `04-backend-core.md` (BACKEND — config that fails closed, OpenAI-compatible client with a **deterministic offline mode**, agent loop, `node:sqlite` store, routes), `05-frontend-phase1.md` (FRONTEND — operator console, five states, fixture mode with an egress-denied fixture for the containment moment), `06-backend-containment.md` (BACKEND — sealed `bwrap` sandbox, cgroup v2 + rlimit caps, capability broker, egress allowlist, `VultrVMProvider` against a mock, `deploy/bootstrap.sh`, and the demo command). **`AGENTS/CONTEXT.md` created** as the one-page project orientation for first launches, and the dispatch format now distinguishes **first launch** (`Read AGENTS/CONTEXT.md and AGENTS/briefs/NN.md, then start working.`) from **later launches** (`Read AGENTS/briefs/NN.md and start working.`) because each agent keeps a persistent session. Decisions D-022…D-027 recorded in `STATE.md`; the wave plan and its gates are in `AGENTS/scope_ledger.md`.
</projectInfo>

<featureInfo>
- [Delegation Protocol](AGENTS/delegation_protocol.md): how a coordinator request becomes a locked brief, how the coordinator is told what to invoke, and how the HEAD integrates the result.
- [Permission Protocol](AGENTS/permissions/PROTOCOL.md): out-of-scope access is granted, never assumed. Workers write a request with what/why/blast-radius/fallback; the HEAD questions the reasoning, then records `GRANTED` / `GRANTED_WITH_CONDITIONS` / `DENIED` with the exact scope. Never-grantable list included. Request template in `AGENTS/permissions/README.md`.
- [Sub-Agent Protocol](AGENTS/sub_agent_protocol.md): worker-side rules — exclusive write scope, permission escalation, mailbox etiquette, completion marker, summary format.
- [Agent Roles](AGENTS/agent_roles.md): role cards, exclusive write scopes, and the "you are X" identity line per role.
- [Standing Role Cards](AGENTS/roles/): the per-agent instruction file each worker reads once per session (`ARCHITECT.md`, `FRONTEND.md`, `BACKEND.md`, `DBMASTER.md`, `TESTER.md`, `DESIGNER.md`, `DOCS.md`).
- [Brief Template](AGENTS/brief_template.md): the exact skeleton every brief must follow.
- [Scope Ledger](AGENTS/scope_ledger.md): who owns which paths right now, per wave. The non-overlap enforcement table.
</featureInfo>

---

## 10. ULTRAMEMORY

To persist memory across the entire computer, use `~/.agents/ULTRAMEMORY/index.md` as the memory router. It should only contain the names of relevant memory files and a one-line description of each, allowing the AI to quickly identify and route to relevant past context.
Detailed memories should be stored as `<specificName>.md` inside `~/.agents/ULTRAMEMORY/index/`. These can contain error fixes, user specifications, project context, solutions, lessons learned, or other reusable information.
When facing a problem, the AI should first check `index.md` for potentially relevant memories, then read the corresponding `.md` file(s) when applicable.
For error memories, write the `.md` as: **Problem/context (where and what was being built) → Cause (why it occurred) → Solution (how it was fixed).**
