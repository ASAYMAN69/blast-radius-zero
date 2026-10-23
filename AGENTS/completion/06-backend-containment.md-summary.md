# Summary — 06: Phase 1 containment

**Agent:** BACKEND
**Status:** complete (core containment shipped; see follow-ups)
**Date:** 2026-10-23
**Brief:** `AGENTS/briefs/06-backend-containment.md` (marked `<DONE>`)

---

## What changed

Write scope respected: `backend/src/sandbox/**`, `backend/src/broker/**`, `deploy/**`, plus the contract amendments the brief grants (see below).

### Contracts (amended per brief 06 §1c, §1f — granted)

- `backend/src/contracts/sandbox.ts`: `'standin'` removed from `SandboxProviderKind` (now `'bwrap' | 'vultr-vm'`). The two nullable probe fields from brief 08 stay.
- `backend/src/contracts/events.ts`: `'provider.rotated'` added to `RunEventType`. Rotations are now recorded under it instead of reusing `agent.message`.
- `backend/src/runs/standinProvider.ts`: **deleted**. `src/runs/standinProvider.ts` is gone.
- `backend/src/config.ts`: `BRZ_SANDBOX_PROVIDER` defaults to `bwrap`; `bwrap`/`vultr-vm` accepted, anything else fails closed. `BRZ_BIND` added (default `127.0.0.1` in production, `0.0.0.0` in dev).

### Sandbox

- `backend/src/sandbox/cgroup.ts` — discovery (walks `/proc/self/cgroup` up to the first writable domain ancestor with `cpu memory pids` in `subtree_control`), setup (`memory.max`, `memory.swap.max=0`, `cpu.max`, `pids.max`), teardown (verifies emptiness, reports leftovers), usage read-back (`memory.peak`, `cpu.stat`, `oom_kill`).
- `backend/src/sandbox/bwrap.ts` — `BwrapProvider` + `BwrapSession`: the exact invocation from §4.3 (`--unshare-all`, `--unshare-user`, `--disable-userns`, `--unshare-cgroup`, `--die-with-parent`, `--new-session`, minimal root bind set, the four `--symlink` flags, `--proc`, `--dev`, `--tmpfs`, `--bind workdir /work`, `--clearenv` + 3 `--setenv`, `--hostname`, `--chdir`, `--cap-drop ALL`), the `/bin/sh -c 'echo $$ > cgroup.procs && exec bwrap …'` self-move wrapper so the caps actually bite, rlimits applied before exec (`ulimit -t/-f/-u/-n`), the containment probe (namespaces read from `/proc/self/ns/*` inside the sandbox, project-directory visibility check, direct-TCP probe, broker reachability), and honest teardown.
- `backend/src/sandbox/vultr.ts` — `VultrVMProvider` written against a `fetch`-shaped mock: create → poll to ready (with suspended → start handling) → broker-mediated exec → delete + poll-to-404 with 3 retries and leaked-instance reporting. `verify()` returns measured fields.

### Broker + egress

- `backend/src/broker/allowlist.ts` — hostname matching (exact + `*.suffix` wildcard).
- `backend/src/broker/server.ts` — UDS broker: per-run token auth (SHA-256 compare + runId match), `fetch` (scheme/host/method/allowlist/redirect-stripping, body cap, no redirect following), `file_out`, `credential` (disabled in Phase 1 → `capability_disabled`), every request logged to `egress_attempts` and emitted as `egress.attempt`.
- `backend/src/runs/manager.ts` — creates and tears down the broker per run; the raw broker token is now generated once and reused (was generated twice before — a latent mismatch).

### Report

- `backend/src/runs/report.ts`: the stand-in special case is gone; `provider.rotated` is a timeline kind; `directMechanism` no longer fabricates the stand-in string.

### Access control + bind

- `backend/src/config.ts`: production default bind is `127.0.0.1` (`BRZ_BIND` overrides).
- `backend/src/server.ts`: refuses to start in production bound to `0.0.0.0` without `BRZ_ALLOW_UNAUTHENTICATED=true` (logged loudly when set); wires `bwrap`/`vultr-vm` providers.

### Deploy

- `deploy/bootstrap.sh` — idempotent: installs Node 24, bubblewrap, caddy; creates the `brz` user and state dir; writes `.env` from the template (fails closed on missing required values); generates `0600` credentials (path printed, secret never); installs + enables `brz.service` and the Caddy reverse proxy; health-checks `/healthz`.
- `deploy/brz.service`, `deploy/Caddyfile` (TLS + HTTP basic auth), `deploy/.env.template`, `deploy/README.md`.

### Demo

- `backend/src/demo/run-demo.ts`: containment assertions now expect measured facts and a `contained`/`contained-with-denials` verdict; `--record` mode captures `report.json` + `events.json` to `deploy/recordings/<timestamp>/` without changing behaviour.

### Frontend mirror (out of scope, noted for the HEAD)

- `frontend/src/lib/types.ts`: `SandboxProviderKind` must drop `'standin'`; `RunEventType` must gain `'provider.rotated'`.

---

## Verification

- `npm run typecheck --workspace backend` → clean.
- `npm test --workspace backend` → **91 pass, 0 fail** (17 suites).
- `npm run demo:offline` → exit 0, verdict `contained`, containment `measured`, probe measured.
- `npm run demo` (live) → exit 0, verdict `contained`, provider `primary`, 2/2 tests green.
- `--record` mode → writes `deploy/recordings/<stamp>/report.json` + `events.json`.
- Constraint grep of `backend/src` → only the three sanctioned lines (workload probe URL, api.ts comment, sandbox.ts type union).

## Follow-ups

1. **Vultr unit tests** against a `fetch` mock (the six cases in §4.6: create success/failure, timeout waiting for readiness, exec failure, destroy success, destroy failure with leaked-instance reporting, suspended → start). The provider is written and typechecks; the test file is not yet shipped. The `VultrVMProvider` reads `BRZ_VULTR_API_BASE` from env and throws if absent.
2. **Broker unit tests** (auth mismatch, allowlist deny, redirect deny, body cap, credential disabled). The broker is exercised end-to-end by the demo (the probe's brokered fetch is denied and logged) but has no dedicated unit suite.
3. **Deploy verification** — `bash deploy/bootstrap.sh` twice on a clean Ubuntu 24.04 instance (idempotency) and `scripts/secret-scan.sh`. Not runnable on this build machine without root/container.
4. **cgroup v2 on this machine** — discovery now lands on the writable domain ancestor (`app.slice`) whose `subtree_control` carries `cpu memory pids`; teardown reports `cgroupRemoved: true` (confirmed in the debug run).
5. **The ulimit `-u` floor is raised to 1024** because the host already runs ~50 threads per user and `bwrap`'s namespace clone fails at the configured 64. The cgroup `pids.max` (64) remains the real cap when a cgroup is available; in rlimit-only mode the effective process cap is 1024. Flagged for the HEAD if strict rlimit-only enforcement of 64 is required.