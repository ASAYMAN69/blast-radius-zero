<WORK IN PROGRESS>

# 06 — Phase 1 containment: sealed sandbox, capability broker, egress, deploy

Agent name: BACKEND. You are BACKEND. If no name was given to you, STOP and ask.

**Wave:** 3
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 04 (BACKEND) must be `RELEASED` — the control plane and the `SandboxProvider` interface already exist

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BACKEND.md`, then this brief. **Your contract is `docs/architecture/02-phase1-design.md`** — read it in full, especially §4 (the provider interface and both implementations), §5 (the broker), §6 (the blast-radius report), §11 (the portability contract), and §12 (the demo scenario).

## Goal
Replace the stand-in sandbox with a **genuinely sealed** one, add the capability broker and the egress allowlist, fill in the blast-radius report with real measured data, and ship a one-command deployment path. When this brief is done, BRZ's central claim is true: the code the agent writes runs somewhere that **cannot see a secret, cannot reach the network, cannot exceed its caps, and does not outlive the task** — and BRZ can *prove* all four.

## Why / context
This is the brief that makes the product worth scoring. Everything so far proves the machine works; this proves the **boundary** is real.

Read `AGENTS/CONTEXT.md` §"Non-negotiables" — all seven are binding, and this brief implements four of them directly.

**The four containment requirements from the brief, each of which must be satisfied by a specific mechanism:**

| Requirement | Mechanism you must implement | How it is proven |
|---|---|---|
| **Process isolation** — execution never touches the host or the app runtime | `bwrap` with user + mount + PID + IPC + UTS namespaces, a read-only root, an ephemeral tmpfs, `--die-with-parent` | The sandbox's writes land in a throwaway dir; the host filesystem is unchanged; killing the control plane kills the sandbox |
| **Secret hygiene** — no API keys or credentials inside the sandbox | The sandbox is launched with a **scrubbed environment** — an allowlist of nothing but `PATH`, `HOME` (to a throwaway dir), and `LANG`; no inherited env, no key material | The sandboxed process cannot read `OPENAI_API_KEY` because the variable does not exist in its namespace. The containment demo asserts this |
| **Resource limits** — time and memory caps on every run | cgroup v2 `memory.max`, `cpu.max`, `pids.max` **plus** rlimits (`RLIMIT_CPU`, `RLIMIT_AS`, `RLIMIT_FSIZE`, `RLIMIT_NPROC`, `RLIMIT_NOFILE`) and a wall-clock timeout | A run that tries to allocate past the cap is **killed**, and the report shows the kill reason and the usage at death |
| **Lifecycle discipline** — reset or destroy the environment after each task | The sandbox is created per run and **destroyed in a `finally`**, including on timeout, on model error, and on client disconnect | After a run, the throwaway directory is gone and no sandbox process remains. Asserted in tests |

## Write scope (EXCLUSIVE — do not touch anything else)
- `backend/src/sandbox/**`
- `backend/src/broker/**`
- `deploy/**`

You may **read** the rest of `backend/**` and you may **edit** files outside these paths only if you first request permission and receive a `GRANTED` decision. In particular: if the report assembly in brief 04 needs a new field, **do not silently edit it** — request the change and note the ripple.

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/architecture/02-phase1-design.md` — **your contract**
- All of `backend/**` (read freely)
- `AGENTS/permissions/PROTOCOL.md`

> **MONOREPO UPDATE (from HEAD, mid-flight):** the repo is a single npm workspace. The root
> `package.json` and `tsconfig.base.json` **already exist and are HEAD's files** — do not create or
> edit them, and ignore any line in this brief that says "no root package.json". Your workspace
> package owns only `backend/package.json` (or `frontend/package.json`). Each workspace's
> `tsconfig.json` must **extend `../../tsconfig.base.json`** for the shared strictness and set only
> what differs (`module`, `moduleResolution`, `lib`, `types`, `outDir`, `include`). One lockfile, one
> `node_modules`, one `npm install` at the root. Full details: `docs/MONOREPO.md`.

> **MANIFEST + TSCONFIG UPDATE (from HEAD, after wave 1):** the workspace manifests and the
> workspace `tsconfig.json` files are **now written and installed** — `backend/package.json`,
> `frontend/package.json`, `backend/tsconfig.json`, `frontend/tsconfig.json`,
> `frontend/tsconfig.node.json`, the root `package-lock.json`, and the root `.npmrc`. One
> `npm install` at the root has been run; `node_modules/` is populated. **Do not create or edit any
> manifest, any lockfile, or the root `tsconfig.base.json`.** You may edit **your own** workspace
> `tsconfig.json` if you need to, but not the root base.
>
> Two things to know: (1) the `extends` path is `../tsconfig.base.json` — the design doc's `../../`
> assumed `packages/backend` and is wrong for our layout (verified: `TS5083` with `../../`).
> (2) The backend's `build` script is `tsc --noEmit` — there is no emit step, by design (§10.4).
> Run `npm run typecheck --workspace backend` (or `--workspace frontend`) to check your work.

## Shared / serialized files
- `backend/package.json` → **the HEAD's file.** Do not create or edit it.
- root `package-lock.json` → **the HEAD's file.** One lockfile for the whole workspace. If you need a dependency that is not already listed, **request permission** — the HEAD adds it and re-installs. Never create a lockfile inside a package, never run `npm install` inside a package.
- `deploy/**` → owner: **you**

## Requirements

1. **`BwrapProvider`** — the real local tier. The exact `bwrap` invocation from the design doc, with the namespace flags, the read-only root bind, the ephemeral tmpfs, the scrubbed environment, and the network namespace. **Verify every flag against `bwrap --help` on this machine** — you have it, and it is the only sandbox runtime available here.
2. **cgroup v2 resource control.** Create a cgroup per run under the path from the design doc, set `memory.max`, `cpu.max`, `pids.max`, and move the sandboxed process into it. **Verify the cgroup v2 layout on this machine** and record the exact path you use. Handle the case where cgroup v2 is unavailable or not writable: **fall back to rlimits only, and record in the report that the cap was enforced by rlimit rather than by cgroup** — never claim a cap that was not applied.
3. **`VultrVMProvider`** — the production tier, written against a **mocked Vultr API**. It must implement the same interface, use the exact API calls from the design doc (create → wait ready → push/exec → destroy), and be fully unit-tested against a mock that covers: create success, create failure, timeout waiting for readiness, exec failure, destroy success, and **destroy failure** (which must not leave a live instance — it must be retried and then surfaced as an error, and a leaked instance must be reported).
4. **The capability broker** — the protocol from design doc §5, with the sandbox-to-control-plane auth, the allowlist, and the denial path.
5. **The egress allowlist proxy.** The sandbox has **no direct network**; the only path out is the broker, and every attempt is logged with its verdict. Denied attempts must appear in the blast-radius report — they are the evidence of containment.
6. **Fill the blast-radius report with real measured data.** Every field the design doc defines must now carry a measured value or an explicit "not measured" marker. **No fabricated zeros.** Distinguish "no egress attempted" from "egress not measured", and "resource cap not reached" from "resource usage not measured".
7. **`deploy/bootstrap.sh`** — takes a fresh Ubuntu 24.04 instance to a running, health-checked BRZ service. It must: install the runtime and dependencies, install `bubblewrap` and enable the cgroup v2 hierarchy if needed, write the `.env` from a template with placeholders, install and enable a **systemd** unit, bind `0.0.0.0`, and health-check `/healthz`. It must be **idempotent** — a second run is a no-op, not a crash — and it must **fail closed** if required env values are missing. Also ship `deploy/brz.service` (the systemd unit) and `deploy/.env.template`.
7b. **The judge-facing deployment must be access-controlled.** Phase 1 has no user accounts, and ARCHITECT flagged the obvious hole plainly: the control plane binds `0.0.0.0`, so a public deployment would be open to the internet. Do not just document that — **close it**:
   - In production the control plane binds **`127.0.0.1`**, not `0.0.0.0`. The bind address comes from env (`BRZ_BIND`, default `127.0.0.1` in production, `0.0.0.0` in dev only).
   - `deploy/` ships a **Caddy** (or nginx) reverse-proxy config in front of it: **TLS**, **HTTP basic auth** with credentials from env, and only the routes the demo needs exposed. Include the `Caddyfile` and the systemd unit for it.
   - The credentials are **generated by the bootstrap script** if absent, written to a `0600` file, and **never printed to the log** — the script prints the *path* to the credentials file and one line telling the operator how to read it.
   - Ship `deploy/README.md` with the exact judge-facing deploy path: the one command, the URL, and where the credentials are.
   - The application itself must **refuse to start in production without an access-control decision** — either the reverse proxy is present, or `BRZ_ALLOW_UNAUTHENTICATED=true` is set explicitly and the start-up log says so loudly. Fail closed, not open.
7c. **The demo must be re-shootable.** The rubric needs a *recorded demo video*, and a demo that cannot be reproduced is a demo that cannot be re-shot. Ship a **record mode** alongside the demo: it captures the run's blast-radius report, the events, and the console output to a timestamped directory under `deploy/recordings/`, in a form a person can re-shoot from. It must not change the demo's behaviour — the live demo stays live, and the recording is a by-product of the same run.
8. **The demo scenario.** Implement the named, deterministic demo from design doc §12 as a **single command** (a script under `deploy/` or a documented `npm run demo:*` target). It must include the **containment moment**: the operator asks the agent to do something the sandbox must refuse (for example, read the API key from the environment, or reach a host address), the sandbox has no secret and no network, and the blast-radius report shows the attempt and the block. It must be **re-runnable and produce the same result every time**, so the video can be re-shot until it is clean.
9. **Tests** that assert the four containment requirements mechanically, not by inspection: the scrubbed environment really has no key material; the cgroup/rlimit cap really kills an over-budget process; the sandbox is really gone after the run; the egress path really is closed without the broker.

## Constraints
- **Never weaken the sandbox to make something work.** If a task cannot be satisfied inside the sandbox, that is a finding — report it, do not open a hole.
- **Never put a secret into the sandbox.** Not in the env, not in a file, not in an argument. If a task needs a credential, it goes through the broker with an allowlist entry.
- **Do not touch** `backend/src/**` outside `sandbox/` and `broker/`, or `frontend/**`, or `docs/**`, without a granted permission request.
- **No hardcoded hosts, ports, keys, models, or URLs.** The Vultr endpoint comes from env. The local sandbox paths come from a documented constant or env, not a literal buried in code.
- **Do not add dependencies** that the design doc does not list. The manifests are already written and installed by the HEAD. If you need one, request permission with the reason and the HEAD adds it.
- Do not commit or push. Do not use the `subagent` tool.
- **Do not run destructive operations on shared data.** The sandbox's blast radius is the *sandbox*; do not test it against the host.
- Never write a secret into the repo, a log, or a response.

## Acceptance criteria
- [ ] `cd backend && npm run typecheck` → clean.
- [ ] `cd backend && npm test` → all green, including the four containment assertions.
- [ ] A test proves the sandboxed process **cannot see `OPENAI_API_KEY`** — it is absent from its environment, and the test fails if it is present.
- [ ] A test proves an over-budget process is **killed by the cap**, and the report records the reason.
- [ ] A test proves the sandbox is **destroyed after a run**, including when the run times out and when the client disconnects.
- [ ] A test proves the sandbox **cannot reach the network directly**, and that a brokered fetch is logged with its verdict.
- [ ] `VultrVMProvider` is unit-tested against a mock covering all six cases in requirement 3, including destroy failure.
- [ ] `bash deploy/bootstrap.sh` succeeds on a clean Ubuntu 24.04 container or VM, and is **idempotent** — run it twice and paste both outputs.
- [ ] The demo scenario runs as **one command** and produces the same blast-radius report every time. Paste two runs side by side and show they match.
- [ ] **The containment beat is byte-identical across two runs**, even if the agent's prose differs. Show the diff of the two reports and confirm the only differences are prose and durations. (The containment facts, the denial, the caps, the teardown and the verdict must be identical.)
- [ ] The demo has a **record mode** that captures the report, the events and the console output to a timestamped directory, **without changing the demo's behaviour**. Paste the recorded output.
- [ ] **Production binds `127.0.0.1`**, not `0.0.0.0`, and the bind address comes from env. Show the value in production mode and in dev mode.
- [ ] The reverse-proxy config exists and provides **TLS + HTTP basic auth**; the credentials are generated by the bootstrap script, written `0600`, and **not printed in the log**. Paste the bootstrap output showing the path, not the secret.
- [ ] The service **refuses to start in production** without an access-control decision — either the proxy is present, or `BRZ_ALLOW_UNAUTHENTICATED=true` is set explicitly and the start-up log says so. Show both the refusal and the explicit override.
- [ ] `deploy/README.md` documents the exact judge-facing deploy path: one command, the URL, and where the credentials live.
- [ ] The blast-radius report has **no fabricated zeros** — every field is measured or explicitly marked not-measured. Paste the report from the demo run.
- [ ] A grep of `backend/src` for `localhost`, `127.0.0.1`, `http://`, `https://`, `gsk_`, `groq`, `vultr` returns clean.

## Verification
- `cd backend && npm run typecheck` → clean
- `cd backend && npm test` → green, with the four containment tests named in the output
- `bwrap --help` → confirm every flag you used exists
- Inspect the cgroup v2 path you create and paste `cat` of `memory.max` / `cpu.max` / `pids.max` for a live run
- `bash deploy/bootstrap.sh` twice → paste both outputs, show the second is a no-op
- Run the demo command twice → paste both blast-radius reports, show they match
- Run the grep from the Constraints section and paste the clean result

## Out of scope
- The browser/Pattern B tier
- Multi-user, auth, billing, a policy engine, a queue
- A real Vultr instance — you have no access until kickoff. The provider ships **mocked and unit-tested**
- The frontend, the pitch, the deck, the video

## Notes
- The demo scenario is the single most valuable artifact you will produce. It is what the video captures and what the containment moment shows. Make it **boring and deterministic** — that is the point.
- Brief 04 left a deliberate seam for you. The summary of that brief lists what it stubbed. Read `AGENTS/completion/04-backend-core.md-summary.md` before you start.
- Your mailbox is `AGENTS/message/backend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/backend/<slug>.md` and wait for the decision. Do not proceed without it.
