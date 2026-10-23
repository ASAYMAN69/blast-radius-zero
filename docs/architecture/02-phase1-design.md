# BRZ — Phase 1 System Design and Frozen Contracts

> **Status:** v1 — frozen. This document is the contract for briefs `04-backend-core.md`, `05-frontend-phase1.md`, and `06-backend-containment.md`.
>
> **Authority:** where this document and a downstream brief disagree, **this document wins** (`AGENTS/briefs/04-backend-core.md` §Notes). Where this document and a *harness* rule disagree, the harness wins.
>
> **Owner:** ARCHITECT · **Date:** 2026-10-23 · **Reads as:** an architecture explanation first (§1–§3), a contract second (§4–§10), an acceptance list last (§11–§13).
>
> **All external facts were measured or fetched on 2026-10-23 on the build machine.** Every command shown in this document was run; every API endpoint was read from the cited source. Where a number is an *assumption* rather than a measurement, it says so.

---

## Table of contents

1. [Scope of Phase 1](#1-scope-of-phase-1)
2. [The one workload](#2-the-one-workload)
3. [System diagram and request flow](#3-system-diagram-and-request-flow)
4. [The `SandboxProvider` interface](#4-the-sandboxprovider-interface)
5. [The capability broker](#5-the-capability-broker)
6. [The blast-radius report](#6-the-blast-radius-report)
7. [The agent loop](#7-the-agent-loop)
8. [API contract](#8-api-contract)
9. [Persistence](#9-persistence)
10. [File layout](#10-file-layout)
11. [The Vultr portability contract](#11-the-vultr-portability-contract)
12. [The demo scenario](#12-the-demo-scenario)
13. [Phase 1 acceptance criteria](#13-phase-1-acceptance-criteria)
14. [Decisions the implementers must not re-litigate](#14-decisions-the-implementers-must-not-re-litigate)

---

## 1. Scope of Phase 1

### 1.1 In scope

One workload end to end, one sandbox tier that actually works on this machine, one production tier that is written against a mock, and the artifact that differentiates the product: the **blast-radius report**. Concretely, Phase 1 ships:

- A **control plane** (Node 24 + TypeScript, `node:http`, `node:sqlite`) that accepts a task, plans it, dispatches execution into a sealed sandbox, verifies the result against evidence, and serves the run and the report over HTTP.
- A **`SandboxProvider` interface with two implementations**: `BwrapProvider` (real, local) and `VultrVMProvider` (written, unit-tested against a mock).
- A **capability broker** with a single network capability (`fetch`) and one file capability (`file_out`), plus a credential capability that is defined but **disabled** in Phase 1.
- An **agent loop** with exactly four tools, one repair retry, and hard iteration/token caps, running against an OpenAI-compatible model with a deterministic offline mode for development and CI.
- A **blast-radius report** that carries *measured* containment facts, never fabricated zeros.
- An **operator console** (React + Vite) that submits a task, watches the run, and reads the report.
- A **one-command deployment bootstrap** (`deploy/bootstrap.sh`) that takes a fresh Ubuntu 24.04 instance to a health-checked service.

### 1.2 Explicitly out of scope — and why

| Out | Why |
|---|---|
| **Pattern B / browser execution** | Requires a Playwright browser tier and a *vision* model for the verify step. `HACKATHON.md` §5.2 lists no vision-understanding model for Vultr Serverless Inference, so the verify step is at risk. Deferring it costs nothing; shipping it broken costs the demo. |
| **Multi-user, auth, tenancy** | `HACKATHON.md` §9.1 does not require it. Phase 1 is a single-operator control plane. Every hour spent on sessions is an hour not spent on containment. |
| **Token streaming** | The run's *progress* is already a first-class event stream (§8.3). Token streaming would add a second, finer-grained transport and a half-finished UX. Deferring it does not remove the need for it. |
| **A policy engine** | The Phase 1 policy is a static allowlist (`BRZ_EGRESS_ALLOWLIST`) plus a fixed capability set. A policy language is Phase 3 work. |
| **The Vultr VM tier, exercised** | There is no Vultr account until kickoff (3 Nov 2026). The tier ships **written and unit-tested against a mock**; the swap at kickoff is a config flag. |
| **Self-healing loops beyond one repair retry** | The workload gets exactly **one** error-feedback retry (a second test run after a failure). A retry loop is a research project; the rubric wants a *working* demo. |
| **A second workload** | The `SandboxProvider` is vertical-agnostic, so a second workload later costs a module. Building two now costs two half-tested modules. |
| **Charts, images, browser automation** | All three need a dependency install or a browser inside the sandbox. Phase 1's sandbox is **standard library only** — no `pip`, no network, no installs (`AGENTS/CONTEXT.md` non-negotiable 7). |
| **Billing, metering, a design system, i18n, dark mode, a mobile app** | None of them move a rubric criterion. `JUDGING-CRITERIA.md` gates on: a live URL, a public repo, a sub-5-minute video, and a novel element. The novel element is the containment model. |
| **A queue / scheduler / worker pool** | Phase 1 runs one run at a time per control plane. The run manager already holds an `AbortController` per run, which is the only concurrency primitive Phase 1 needs. |

### 1.3 The one thing that must not be cut

The blast-radius report (§6) is the product. If time runs out, cut the console polish, not the report. Everything else in this document exists to make the report true.

### 1.4 The monorepo contract

BRZ is **one git repository with one npm workspace root**. This is decided (`docs/MONOREPO.md`); this section restates it as a contract the implementers and CI both rely on.

- **One root `package.json`, one root `package-lock.json`, one hoisted `node_modules`.** `npm install` happens **at the root, once**. There is never a second lockfile, and `npm install` is never run inside a workspace package.
- **Two workspace packages, named `backend` and `frontend`.** `deploy/` is **not** an npm package — it is shell, systemd, and templates.
- **The root `package.json` and `tsconfig.base.json` belong to the HEAD** and are already written. Workers write **source only** and never touch a manifest or a lockfile. The HEAD writes the two workspace manifests between wave 1 and wave 2, using the dependency list in §10.3, then runs one root install.
- **Each workspace's `tsconfig.json` extends `../../tsconfig.base.json`.** The base owns the strictness flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`); the workspace file supplies only `module`, `moduleResolution`, `lib`, `types`, `jsx`, `noEmit` and `include`. **The strictness flags are never re-declared**, so the two packages cannot drift.
- **Root scripts fan out** with `npm run <script> --workspaces --if-present`. Therefore **every workspace must define `dev`, `build`, `typecheck`, `test` and `lint`** — a workspace that omits one is silently skipped by the root fan-out. The exact per-workspace scripts are in §10.4.
- **CI runs `npm ci` at the root, once**, then the root `typecheck`, `test` and `build` fan-out.
- **ESM throughout.** `"type": "module"` at the root, **and in each workspace package** — the root's setting does not reach files under `backend/`, because the workspace manifest is the nearest one. The backend uses `module: NodeNext`; the frontend uses `module: ESNext` with `moduleResolution: bundler`.
- **Node 24 only.** `node:sqlite` and `node:test` are built in.

These are restated as testable acceptance criteria **M1–M5** in §13.5.

---

## 2. The one workload

### 2.1 Decision

> **Phase 1 ships exactly one workload: `self-healing-runner` — a Self-Healing Runner specialised to a single-file Python bug fix with a stdlib `unittest` suite.**

This is named direction **#5, "Self-Healing Runner"**, from `HACKATHON.md` §3.3.

**The operator submits:** a natural-language goal, plus the project. The project comes from one of two sources:

- `{ kind: 'fixture', fixtureId }` — a built-in, seeded project. Deterministic. The demo uses this.
- `{ kind: 'files', files: [{ path, content }] }` — files the operator pasted or uploaded.

**The agent produces:** a repaired project, plus a written explanation of the bug and the fix, plus a machine-checked verdict (did the suite go green?).

**The UI shows:** the live run (plan → tool call → execution → output → explanation), the agent's final answer rendered as text, and the blast-radius report.

### 2.2 Why this workload, defended against the three constraints

**Constraint 1 — it must be one of the ten named directions in `HACKATHON.md` §3.3.** "Self-Healing Runner" is direction #5. Satisfied by construction.

**Constraint 2 — it must be reliably completable by a deliberately simple tool-calling agent, because a thin agent that fails on the demo is a scoring disaster.** This is the constraint that decided it, and it decided it in a very specific way:

> **The answer must be in the error message.**

A self-healing run over a *seeded* bug produces an assertion failure of the form `AssertionError: 10 != 15`. That message states the expected value and the actual value. The agent's job is not "debug arbitrary code" — it is "make these two numbers agree", and the message has already told it what the target is. The fix space is one token wide (`range(start, end)` → `range(start, end + 1)`).

This is the opposite of a workload where the agent must *form* a hypothesis. A thin agent that can only do tool-calling reliably can do this, because the reasoning is one comparison and one edit.

**Constraint 3 — it must exercise the full loop: the model writes code, the code runs in the sandbox, real output comes back, the model explains it, and an error can be fed back for one retry.** Self-Healing Runner is the *only* direction where the error-feedback retry is native to the workload rather than bolted on:

| Loop element | How Self-Healing Runner produces it |
|---|---|
| Model writes code | The agent edits a source file via `write_file`. |
| Code runs in the sandbox | `run_tests` executes `python3 -m unittest discover -s tests -v` **inside** the sandbox. |
| Real output comes back | The real `unittest` stdout/stderr and exit code, verbatim. |
| Model explains it | A final assistant message: what was wrong, what was changed. |
| **Error fed back for one retry** | The failing test output *is* the error. It is fed back verbatim as the next tool result, the agent patches, and it re-runs. The retry is the workload, not a mechanism bolted onto it. |

### 2.3 The runners-up, and why they lost

| Direction | Why it lost |
|---|---|
| **CSV Analyst** | Viable and shallower, but its retry is *contrived* — the agent rarely gets it wrong, so the error-feedback path is untested in the demo. Self-Healing Runner's retry is unavoidable. |
| **Chart Anything** | Needs `matplotlib`. No `pip` in the sandbox (`AGENTS/CONTEXT.md` non-negotiable 7). Dies. |
| **Site QA Sweep** | Pattern B: needs a browser in the sandbox and a vision model to verify screenshots. Both are at risk (§1.2). |
| **Research with Receipts** | Needs network egress *by design*. The entire containment thesis is "the sandbox had zero network access". Contradiction. |
| **Comparison Shopper**, **Form Filler** | Need network and, for Form Filler, a browser. Contradiction. |
| **Page Watcher** | Needs network (it watches pages). Contradiction. |
| **File Fixer** | Too thin: fix a malformed file, one attempt, no real feedback loop. Nothing to retry. |
| **Prove-It Code Reviewer** | The agent must author a *correct proof*. A wrong proof yields a wrong verdict — the failure mode is a *confident wrong answer*, which is worse than a failed run. Self-Healing Runner's success criterion is decided by the sandbox, not by the model's opinion (§7.5). |

### 2.4 The fixture

The demo fixture is `shr-sum-range`. It is deliberately trivial, and that is the point.

```
calculator.py
    def sum_range(start, end):
        """Return the sum of the integers from start to end, inclusive."""
        return sum(range(start, end))          # <-- the bug: `end` is exclusive

tests/test_calculator.py
    import unittest
    from calculator import sum_range

    class TestSumRange(unittest.TestCase):
        def test_inclusive(self):
            self.assertEqual(sum_range(1, 5), 15)   # 10 != 15

        def test_single(self):
            self.assertEqual(sum_range(3, 3), 3)
```

First run: `AssertionError: 10 != 15`. The fix: `sum(range(start, end + 1))`.

Two tests, not one — a one-test suite can be "fixed" by hard-coding the expected value, which would be a *wrong* fix. The second test (`sum_range(3, 3) == 3`) makes the naive hard-code fail. The workload's success criterion is therefore **both tests pass**, which is a stronger and more honest check than one assertion.

### 2.5 What the sandbox is allowed to run

The workload fixture declares an **allowlist of commands**. The agent's `run_tests` tool accepts an optional `command`; if the command is not in the fixture's allowlist, the control plane **refuses to execute it** and returns a structured `command_not_allowed` error to the model. The refusal is recorded in the report as a denied capability request.

This is a deliberate narrowing: Phase 1's agent cannot run arbitrary shell commands. It can only run commands the workload declared. It does not weaken containment — it *narrows what the model can even ask for*, which is a strictly better position than "we allow arbitrary commands but the sandbox is safe".

The demo fixture declares exactly two commands:

| Command | Purpose |
|---|---|
| `python3 -m unittest discover -s tests -v` | The test suite. The workload's success criterion. |
| `python3 -m brz_selftest` | A stdlib-only self-test that prints the containment probe result from the work dir and attempts one broker-mediated fetch. It is the **agent-observable** half of the containment moment. |

---

## 3. System diagram and request flow

### 3.1 The diagram

```
┌─────────────────────────── BROWSER (operator) ───────────────────────────┐
│  React + Vite · same-origin /api/v1/* · no absolute URLs · no secrets      │
│  ┌────────────────┐  ┌────────────────────┐  ┌──────────────────────────┐  │
│  │ Submit form    │  │ Run view           │  │ Blast-radius report      │  │
│  │ workload+files │→ │ live event stream  │→ │ measured containment     │  │
│  └────────────────┘  └────────────────────┘  └──────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │  POST /api/v1/runs  (202 Accepted)
                                    ▼
┌──────────────────────── CONTROL PLANE (Node 24 + TypeScript) ─────────────┐
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ RunManager                                                            │  │
│  │  RunStateMachine: queued → running → succeeded|failed|cancelled       │  │
│  │  per-run AbortController · destroy-sandbox-on-abort                   │  │
│  └───────┬──────────────────────────────────────────────────────┬─────────┘  │
│          │                                                      │            │
│          ▼                                                      ▼            │
│  ┌───────────────────┐                              ┌────────────────────┐  │
│  │ AgentLoop         │  tool call ───────────────▶  │ SandboxProvider    │  │
│  │  4 tools, 1 retry │                              │  (the seam)        │  │
│  │  12 iters, 24k tok│◀──── result + evidence ──────│                    │  │
│  └───────┬───────────┘                              └─────────┬──────────┘  │
│          │ calls chat/completions                               │            │
│          ▼                                                      │            │
│  ┌───────────────────┐                              ┌─────────▼──────────┐  │
│  │ InferenceClient   │  env-selected provider      │  BwrapProvider     │  │
│  │  OpenAI-compatible│  Groq dev / Vultr prod      │  local tier        │  │
│  │  + mock mode      │                              │  bwrap+cgroup+rlim │  │
│  └───────────────────┘                              ├────────────────────┤  │
│                                                     │ VultrVMProvider    │  │
│  ┌───────────────────────────────────────────────┐  │ prod tier (mocked) │  │
│  │ CapabilityBroker  ◀── UDS / HTTPS ──────────┼──┤                    │  │
│  │  fetch (allowlist) · file_out · credential✗  │  └────────────────────┘  │
│  └───────────────┬───────────────────────────────┘                         │
│                  │                                                         │
│  ┌───────────────▼──────────┐  ┌────────────────────────────────────────┐  │
│  │ EgressProxy (allowlist)  │  │ RunStore (node:sqlite)                 │  │
│  │ every attempt → logged   │  │ runs · events · tool_calls ·           │  │
│  └──────────────────────────┘  │ sandbox_lifecycle · egress_attempts ·  │  │
│                                │ resource_samples · reports              │  │
│                                └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼  (the only way out of the box)
┌───────────────────────── THE SANDBOX (ephemeral) ───────────────────────────┐
│  bwrap: user+mount+pid+ipc+uts+cgroup+net namespaces                      │
│  / = { bin dev etc lib lib64 proc sbin tmp usr work }   ← nothing else     │
│  /work  = per-run host dir, bind-mounted rw                               │
│  env    = { PATH, HOME, LANG } only            ← no key material          │
│  cgroup v2: memory.max · cpu.max · pids.max   ← the caps actually bite   │
│  network: NO route. Only the broker socket at /work/.brz/broker.sock       │
│  lifetime: created for one run, destroyed in a finally                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 One run, step by step

**① `POST /api/v1/runs`** — the operator submits `{ workload, task, source }`. The route validates the body at the boundary, allocates an external run id (`run_` + 26-char ULID), inserts a `runs` row with status `queued`, emits a `run.queued` event, and returns **202** with `{ runId, status: 'queued' }`. The response returns immediately; the run proceeds in the background. The browser polls `GET /api/v1/runs/{runId}/events?after=<seq>`.

**② The run manager claims the run.** Status → `running`, phase → `sandbox_starting`. It creates the per-run host directory under `BRZ_WORK_ROOT` and writes the workload's input files into it.

**③ The broker opens.** The broker creates a **Unix domain socket** at `<workdir>/.brz/broker.sock` and listens on it. The socket lives inside the per-run directory, so it is destroyed with the directory. A per-run 256-bit token is generated and stored (hashed) with the run.

**④ The sandbox is created.** The provider (a) creates a cgroup v2 child and applies `memory.max` / `cpu.max` / `pids.max`, (b) spawns `/bin/sh -c 'echo $$ > <cgroup>/cgroup.procs && exec bwrap <flags…>'` — the shell moves *itself* into the cgroup and then `exec`s `bwrap`, so the sandbox and every descendant inherit the caps with no race, (c) binds the work directory read-write at `/work`, (d) installs the network namespace with no interfaces. The session returns a `SandboxSession` carrying the broker channel.

**⑤ The containment probe runs.** Before any agent work, the provider executes one command inside the sandbox that measures the containment properties and prints a JSON line. It records: whether a TCP connection out is possible (and the exact errno), the environment keys visible, the top-level filesystem entries visible, whether any credential-shaped key is present, and whether the broker socket is reachable. It also performs **one broker-mediated `fetch`** to a fixed non-allowlisted URL — which is **denied and logged**. This is the run's first `sandbox.probe` event, and it is the source of every *measured* fact in the report.

**⑥ The agent plans.** The AgentLoop sends the system prompt, the goal, the file listing, and the four tool definitions to the inference client. The client posts to `${OPENAI_ENDPOINT}/chat/completions` with the model from `OPENAI_MODEL`. **Non-streaming** (§7.3). The model's reply is either a tool call or a final message.

**⑦ The agent executes.** A tool call is dispatched to the provider (§7.6). `read_file` / `write_file` / `list_files` act on the per-run work directory; `run_tests` runs the fixture's declared command **inside the sandbox** and returns the real exit code, stdout, and stderr. Every call is recorded as a `tool_calls` row and a `tool.call` / `tool.result` event pair.

**⑧ The error is fed back.** The first `run_tests` returns exit code 1 with `AssertionError: 10 != 15`. That output is appended to the conversation verbatim as the tool result, and the model is called again. This is the **one repair retry** (§7.4).

**⑨ The agent explains.** The model emits a final message with no tool call: *"The function used `range(start, end)`, which excludes `end`. The tests expect an inclusive sum. I changed it to `range(start, end + 1)`."* The AgentLoop stops.

**⑩ The result is verified — by the sandbox, not by the model.** The RunManager runs the test command one final time in a **fresh** sandbox state and records the exit code. The run's `succeeded` status is set **iff both tests passed**. A model that claims success without green tests does not succeed. This is the rule that makes the report trustworthy.

**⑪ The report is assembled** from the persisted records: tool calls, egress attempts, resource samples, the containment probe, and the lifecycle records. Missing measurements become `Measured` values with `state: 'not-measured'` and a reason. **Never a fabricated zero** (§6.3).

**⑫ Teardown.** In a `finally`, the sandbox is destroyed, the cgroup is removed, the per-run work directory is deleted, and the broker socket dies with it. A `sandbox.destroyed` event records the teardown and whether the sandbox was *verified* gone. Then the run is sealed and the final report is stored.

**⑬ The operator reads the report** at `GET /api/v1/runs/{runId}/report`.

### 3.3 Component inventory

| Component | File (per §10) | Owns |
|---|---|---|
| HTTP server | `backend/src/server.ts` | `node:http` server, route table, `/healthz`, request id, error envelope |
| Config | `backend/src/config.ts` | env parsing, fail-closed validation |
| Run manager | `backend/src/runs/manager.ts` | state machine, `AbortController`, orchestration, teardown |
| Agent loop | `backend/src/agent/loop.ts` | the plan → execute → explain cycle, caps, retry |
| Prompt | `backend/src/agent/prompt.ts` | the system prompt (frozen text in §7.2) |
| Tools | `backend/src/agent/tools.ts` | the four tool definitions and their dispatch |
| Workload | `backend/src/agent/workload.ts` | the `self-healing-runner` profile, fixtures, success rule |
| Inference | `backend/src/inference/client.ts` | OpenAI-compatible client, retries, typed errors |
| Mock inference | `backend/src/inference/mock.ts` | deterministic offline mode |
| Provider seam | `backend/src/contracts/sandbox.ts` | the frozen interface and its types |
| Bwrap tier | `backend/src/sandbox/bwrap.ts` | the real local sandbox |
| Vultr tier | `backend/src/sandbox/vultr.ts` | the production tier (mocked) |
| Cgroup | `backend/src/sandbox/cgroup.ts` | cgroup discovery, setup, sampling, teardown |
| Broker | `backend/src/broker/server.ts` | the UDS broker + capability policy |
| Egress | `backend/src/broker/allowlist.ts`, `backend/src/egress/proxy.ts` | the allowlist and the fetch proxy |
| Store | `backend/src/db/**` | `node:sqlite` schema, migrations, queries |
| Report | `backend/src/runs/report.ts` | report assembly from persisted records |
| Console | `frontend/src/**` | the operator console |

---

## 4. The `SandboxProvider` interface

> This is the most important decision in the project. Nothing above this interface may know where code executes. The local tier is `bwrap` + cgroup v2; the production tier is a throwaway Vultr VM. Both are written against this exact declaration.

### 4.1 The contract

```ts
// backend/src/contracts/sandbox.ts

/** Opaque, externally-visible identifier for one sandbox instance. */
export type SandboxId = string;

/** Which tier backs a sandbox. Nothing above the interface may branch on this. */
export type SandboxProviderKind = 'bwrap' | 'vultr-vm';

/**
 * Hard caps applied to every sandboxed execution.
 *
 * These are *limits*, not targets. The provider MUST enforce every one of them
 * by a real mechanism (cgroup v2, rlimit, provider-native) and MUST report
 * which mechanism was used. A limit that is not enforced MUST NOT be reported
 * as enforced.
 */
export interface SandboxLimits {
  /** Wall-clock ceiling for a single `exec`. Enforced by a timer AND rlimits. */
  readonly wallClockMs: number;
  /** Address-space ceiling in bytes. Enforced by cgroup v2 `memory.max`. */
  readonly memoryBytes: number;
  /** CPU-time ceiling in seconds. Enforced by cgroup v2 `cpu.max` AND `RLIMIT_CPU`. */
  readonly cpuSeconds: number;
  /** Maximum processes in the sandbox. Enforced by cgroup v2 `pids.max`. */
  readonly maxProcesses: number;
  /** Maximum size of any single file written. Enforced by `RLIMIT_FSIZE`. */
  readonly maxFileBytes: number;
  /** Maximum bytes of stdout+stderr collected from one `exec`. */
  readonly maxOutputBytes: number;
  /** Maximum number of open file descriptors. Enforced by `RLIMIT_NOFILE`. */
  readonly maxOpenFiles: number;
}

/**
 * How the caps were actually enforced. Recorded verbatim in the report so a
 * reader can tell "the cap was reached" from "the cap was never applied".
 */
export type ResourceEnforcementMode =
  /** cgroup v2 was available and writable: memory/cpu/pids came from the cgroup. */
  | 'cgroup+rlimit'
  /** cgroup v2 was unavailable or not writable: only rlimits were applied. */
  | 'rlimit-only'
  /** The provider enforces caps natively (the Vultr VM tier). */
  | 'provider-native';

/** A file the control plane writes into the sandbox before the agent starts. */
export interface SandboxFile {
  /** POSIX path, relative, no leading `/`, no `..`, no NUL. */
  readonly path: string;
  readonly content: string;
  /** Permission bits. Default 0o644. */
  readonly mode?: number;
}

/** A command to run inside the sandbox. */
export interface SandboxCommand {
  /** Argument vector. NOT a shell string — no shell is involved. */
  readonly argv: readonly string[];
  /** Working directory, relative to the sandbox work dir. Default `'.'`. */
  readonly cwd?: string;
  /** Overrides `SandboxLimits.wallClockMs` for this command. */
  readonly timeoutMs?: number;
  /** Extra environment variables. The provider MUST apply its own allowlist on top. */
  readonly env?: Readonly<Record<string, string>>;
  /** Written to the command's stdin, then stdin is closed. */
  readonly stdin?: string;
}

/** Why a sandboxed process died, if it did. */
export type SandboxKillReason =
  | 'wall-clock-timeout'
  | 'memory-cap'
  | 'cpu-cap'
  | 'process-cap'
  | 'file-size-cap'
  | 'cancelled'
  | 'sandbox-destroyed'
  | 'provider-error';

/** The outcome of one sandboxed command. */
export interface SandboxExecResult {
  /** Process exit code, or `null` if the process was killed by a signal. */
  readonly exitCode: number | null;
  /** Terminating signal name, or `null`. */
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True if stdout+stderr exceeded `SandboxLimits.maxOutputBytes`. */
  readonly truncated: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  /** Set when the process was killed by a cap rather than exiting normally. */
  readonly killReason: SandboxKillReason | null;
}

/** The result of tearing a sandbox down. */
export interface SandboxDestroyResult {
  readonly ok: boolean;
  readonly destroyedAt: string;
  /**
   * True only if the provider *checked* that the sandbox is gone
   * (process exited, cgroup removed, work dir deleted, instance deleted).
   * A provider that cannot check MUST report `false`.
   */
  readonly verifiedGone: boolean;
  /** Human-readable list of anything that survived teardown. */
  readonly leftoverResources: readonly string[];
  /** Generic failure description. Never contains provider raw error text. */
  readonly error: string | null;
}

/**
 * The only channel between a sandbox and the control plane.
 *
 * The token is minted per run, delivered to the sandbox out of band, and
 * checked on every request. It authorises exactly one run and nothing else.
 */
export interface BrokerChannel {
  readonly transport: 'unix-socket' | 'https';
  /**
   * `unix-socket`: an absolute path *as seen from inside the sandbox*.
   * `https`: an absolute URL to the control plane's broker endpoint.
   */
  readonly endpoint: string;
  /** Per-run bearer token. */
  readonly token: string;
}

/**
 * The network posture of a sandbox.
 *
 * `direct` is typed as the literal `'blocked'`. A provider cannot widen it to
 * `'allowed'` without changing this file — the no-network guarantee is a
 * *type-level* property, not a convention. `verify()` must MEASURE it.
 */
export interface SandboxNetworkPolicy {
  readonly direct: 'blocked';
  /** Human-readable description of the mechanism, e.g. `'unshare-net (no interfaces)'`. */
  readonly directMechanism: string;
  readonly broker: BrokerChannel;
  /** Hostnames the broker may fetch on this sandbox's behalf. Empty in Phase 1 by default. */
  readonly allowlistedHosts: readonly string[];
}

/** A live sandbox. Every method is safe to call after `destroy()` (it becomes a no-op). */
export interface SandboxSession {
  readonly id: SandboxId;
  readonly provider: SandboxProviderKind;
  /** Absolute path of the writable work directory *inside* the sandbox. Always `/work`. */
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly enforcement: ResourceEnforcementMode;
  readonly network: SandboxNetworkPolicy;
  readonly createdAt: string;
  /** Write files into the sandbox. Overwrites existing files. Throws on an invalid path. */
  writeFiles(files: readonly SandboxFile[]): Promise<void>;
  /** Run a command inside the sandbox under the session's caps. */
  exec(command: SandboxCommand): Promise<SandboxExecResult>;
  /** MEASURE the containment properties. Never a claim — an observation. */
  verify(): Promise<ContainmentVerification>;
  /** Tear down. Idempotent. */
  destroy(): Promise<SandboxDestroyResult>;
}

/** What the provider needs in order to create a sandbox. */
export interface SandboxCreateSpec {
  /** The run this sandbox belongs to. Used for correlation and labelling. */
  readonly runId: string;
  /** Absolute host path of the per-run working directory to expose at `/work`. */
  readonly workDir: string;
  readonly limits: SandboxLimits;
  readonly broker: BrokerChannel;
  readonly allowlistedHosts: readonly string[];
  /** Files to seed before the agent starts. */
  readonly files: readonly SandboxFile[];
  /**
   * The ONLY environment variable names permitted inside the sandbox.
   * The provider MUST NOT pass anything else — not the parent env, not secrets.
   */
  readonly envAllowlist: readonly string[];
  /** Free-form provider labels. Never contains secrets. */
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * A *measurement* of the containment properties, taken from inside the sandbox.
 *
 * Every field is an observation produced by running something in the sandbox
 * and reporting what happened. `false` means "we checked and it was false";
 * absence of the measurement is represented by the caller not populating the
 * field, never by a plausible default.
 */
export interface ContainmentVerification {
  /** Did a TCP connection out of the sandbox succeed? */
  readonly directNetworkReachable: boolean;
  /** The raw result of the direct-egress probe. */
  readonly directNetworkProbe: {
    readonly attempted: boolean;
    /** POSIX errno name, e.g. `'ENETUNREACH'`. `null` if the probe did not run. */
    readonly errno: string | null;
    readonly message: string;
  };
  /** The environment variable names visible inside the sandbox. */
  readonly environmentKeys: readonly string[];
  /** Did any credential-shaped key or file appear inside the sandbox? */
  readonly secretMaterialVisible: boolean;
  /** The top-level entries visible at `/` inside the sandbox. */
  readonly visibleRootEntries: readonly string[];
  /** Is anything outside the work dir writable from inside the sandbox? */
  readonly writableOutsideWorkDir: boolean;
  /** Does the sandbox see only its own processes? */
  readonly processNamespaceIsolated: boolean;
  /** Could the sandbox reach the broker socket? */
  readonly brokerReachable: boolean;
  readonly measuredAt: string;
  readonly provider: SandboxProviderKind;
}

/** What a provider can do. Read by the run manager to decide what to offer. */
export interface SandboxProviderCapabilities {
  /** Is a writable cgroup v2 hierarchy available on this host? */
  readonly cgroupV2: boolean;
  /** Are rlimits enforceable? */
  readonly rlimits: boolean;
  /** Always `false`. A provider that can offer direct network is not a BRZ provider. */
  readonly directNetwork: false;
  /** Which broker transports this provider can offer. */
  readonly brokerTransport: readonly BrokerChannel['transport'][];
  /** Can the provider write files into the sandbox before start? */
  readonly fileWrite: boolean;
  /** How many sandboxes may exist at once. */
  readonly maxParallelSandboxes: number;
}

/**
 * The seam.
 *
 * Rules that hold for every implementation:
 *  1. `create()` MUST NOT return until the sandbox is ready to run a command.
 *  2. `exec()` MUST enforce every limit in `SandboxLimits` by a real mechanism
 *     and MUST report the mechanism in `enforcement`.
 *  3. `verify()` MUST MEASURE. Returning a hard-coded `false` for
 *     `directNetworkReachable` is a defect, not a safe default.
 *  4. `destroy()` MUST be idempotent and MUST report `verifiedGone` honestly.
 *  5. No method may return provider-specific error text to a caller that will
 *     show it to a user. Providers throw typed errors (§4.5).
 */
export interface SandboxProvider {
  readonly kind: SandboxProviderKind;
  readonly supports: SandboxProviderCapabilities;
  create(spec: SandboxCreateSpec): Promise<SandboxSession>;
  destroy(session: SandboxSession): Promise<SandboxDestroyResult>;
}
```

### 4.2 The two implementations, side by side

| | `BwrapProvider` (local, this machine) | `VultrVMProvider` (production) |
|---|---|---|
| Creates | a `bwrap` process in new namespaces | a throwaway Vultr Cloud Compute instance |
| Work dir | a host dir bind-mounted at `/work` | a dir inside the instance, synced via the broker |
| Caps | cgroup v2 + rlimits | instance size + rlimits + provider-native wall clock |
| Network | none (unshared net namespace) | none *inside* the instance sandbox; the instance reaches only the control plane's broker |
| Broker transport | Unix socket bind-mounted into `/work` | HTTPS to the control plane's public broker endpoint |
| Destroy | kill the process, remove the cgroup, delete the work dir | `DELETE /v2/instances/{id}` and poll until 404 |
| Cold start | ~50 ms | ~30–90 s (**assumption**, §4.6) |
| Status in Phase 1 | **real, exercised** | **written, unit-tested against a mock** |

### 4.3 `BwrapProvider` — the exact invocation

**Environment, measured on 2026-10-23:**

- `bwrap` version **0.13.0**, at `/usr/bin/bwrap` (`bwrap --version`).
- Every flag below was checked against `bwrap --help` **on this machine** on 2026-10-23. No flag is from memory.
- `bwrap --help` lists: `--unshare-all`, `--unshare-user`, `--disable-userns`, `--unshare-cgroup`, `--unshare-net`, `--unshare-pid`, `--unshare-ipc`, `--unshare-uts`, `--die-with-parent`, `--new-session`, `--ro-bind`, `--bind`, `--symlink`, `--proc`, `--dev`, `--tmpfs`, `--dir`, `--clearenv`, `--setenv`, `--unsetenv`, `--hostname`, `--chdir`, `--cap-drop`, `--cap-add`, `--size`, `--block-fd`, `--json-status-fd`, `--seccomp`, `--not-a-security-boundary`.

**The exact argv** (paths are the run's own; the provider substitutes them):

```sh
/bin/sh -c 'echo $$ > "<CGROUP>/cgroup.procs" && exec bwrap \
  --unshare-all \
  --unshare-user \
  --disable-userns \
  --unshare-cgroup \
  --die-with-parent \
  --new-session \
  --ro-bind /usr /usr \
  --ro-bind /etc /etc \
  --symlink usr/bin /bin \
  --symlink usr/lib /lib \
  --symlink usr/lib64 /lib64 \
  --symlink usr/sbin /sbin \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --bind "<WORKDIR>" /work \
  --clearenv \
  --setenv PATH /usr/local/bin:/usr/bin:/bin \
  --setenv HOME /work \
  --setenv LANG C.UTF-8 \
  --hostname brz-sandbox \
  --chdir /work \
  --cap-drop ALL \
  -- <argv...>'
```

**Why the `/bin/sh -c` wrapper is not optional.** `bwrap` forks its sandboxed child *before* it execs the command. If the control plane spawns `bwrap` and afterwards moves `bwrap`'s PID into the cgroup, the already-forked child stays in the **old** cgroup and the caps do not apply. Measured on this machine:

- Move-after-spawn: `memory.peak` stayed at **262144 bytes** and `oom_kill` stayed **0** while the sandbox allocated 400 MB. The cap did not apply.
- Self-move-then-`exec` (the wrapper above): the sandbox was **OOM-killed at exactly the cap** — `memory.peak` = **100663296** (= the configured `memory.max`), `memory.events` showed `oom 1`, `oom_kill 1`, and the process exited **137** (SIGKILL).

This is the single most important implementation detail in the local tier. It is a *behaviour* of `bwrap`'s fork model, not a tunable.

**Why the root filesystem is a minimal allowlist and not `--ro-bind / /`.** The full-root bind is the obvious choice and it is **wrong**, and the reason is measurable:

- The repository's `.env` on this machine is mode **0777** (`-rwxrwxrwx asayman asayman`). With `--ro-bind / /`, the sandbox — which runs as the same uid — can read it. That is the secret-hygiene non-negotiable broken by an obvious implementation choice.
- With the minimal bind set, the sandbox's `/` contains **exactly** `{ bin, dev, etc, lib, lib64, proc, sbin, tmp, usr, work }` — **no `/home`, no `/root`, no `/mnt`, no `/var`, no `/opt`, no `/sys`** — so the operator's home directory, SSH keys, and the project directory (with its `.env`) are not merely unreadable, they are **absent**.

`/etc` is bound read-only because CPython reads locale and `site` configuration from it. It contains no credentials. If a future target has a sensitive `/etc`, the provider's bind list is the single place to change.

**Why the root symlinks are re-created explicitly.** On this machine `/bin → usr/bin`, `/lib → usr/lib`, `/lib64 → usr/lib64`, `/sbin → usr/sbin` (measured with `ls -ld`). Binding `/usr` alone leaves the ELF interpreter path `/lib64/ld-linux-x86-64.so.2` unreachable, and the exec fails with `execvp /usr/bin/python3: No such file or directory` (measured). The four `--symlink` flags restore them. A provider targeting a distro without this layout should bind the real directories instead — the provider's bind list is data, not a literal.

**Why `--clearenv` plus exactly three `--setenv`.** Measured: with `--clearenv --setenv PATH … --setenv HOME … --setenv LANG …`, the sandbox's environment contains **exactly** `HOME`, `LANG`, `PATH`, `PWD` (`PWD` is added by the shell). No inherited variable, therefore no `OPENAI_API_KEY`.

**Why `--unshare-all` without `--share-net`.** Measured: with `--unshare-all` and no `--share-net`, a TCP connect from inside the sandbox to `1.1.1.1:443` fails with `OSError` (errno `ENETUNREACH`). The sandbox has no interfaces and no route.

**Why `--disable-userns`.** Prevents the sandbox from creating a nested user namespace to escape its own confinement. It requires `--unshare-user` to be present literally (measured: `bwrap: --disable-userns requires --unshare-user`).

**Why `--cap-drop ALL`.** Inside the new user namespace the process would otherwise hold a full capability set *within that namespace*. `--cap-drop ALL` removes them. Measured working.

**Why `--unshare-cgroup`.** Hides the host's cgroup hierarchy from the sandbox. The cgroup *limits* still apply — the namespace changes the view, not the accounting. Measured: with `--unshare-cgroup` the OOM kill still fired at the cap.

**Why `--die-with-parent`.** If the control plane dies, the sandbox dies with it. This is a lifecycle guarantee, not a nicety.

**Why `--new-session`.** Detaches the sandbox from the control plane's controlling terminal, so a Ctrl-C in the operator's shell does not deliver `SIGINT` to the sandbox's process group directly.

**rlimits.** Applied by the provider in the `sh -c` wrapper before `exec`, because `bwrap` has no rlimit flags:

| Limit | Shell form | Why |
|---|---|---|
| CPU seconds | `ulimit -t <cpuSeconds>` | `RLIMIT_CPU`; sends `SIGXCPU`. Measured working. |
| File size | `ulimit -f <maxFileBytes/1024>` (KiB) | `RLIMIT_FSIZE`; measured: `OSError: [Errno 27] File too large`. |
| Processes | `ulimit -u <maxProcesses>` | `RLIMIT_NPROC`. Measured working. |
| Open files | `ulimit -n <maxOpenFiles>` | `RLIMIT_NOFILE`. |
| Address space | **not set** | `RLIMIT_AS` is unreliable with CPython, which reserves large virtual address space. Memory is enforced by cgroup v2 `memory.max` instead. Recorded here so nobody "helpfully" adds it back. |

### 4.4 The cgroup v2 layer, exactly

**Layout, measured on 2026-10-23 on this machine:**

- Mounted at `/sys/fs/cgroup`, `type cgroup2 (rw,nosuid,nodev,noexec,relatime,nsdelegate,memory_recursiveprot,memory_hugetlb_accounting)`.
- `cgroup.controllers` = `cpuset cpu io memory hugetlb pids rdma misc`.
- The **root** `/sys/fs/cgroup` is **not writable** by uid 1000 (`mkdir: cannot create directory './brz-probe': Permission denied`).
- The **nearest writable domain ancestor** of this process is:
  `/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/app.slice`
  — owned by `asayman:asayman`, mode `755`, `cgroup.type` = `domain`, `cgroup.subtree_control` = `cpu memory pids`, `cgroup.controllers` = `cpu memory pids`.

**The discovery algorithm (mandatory, because the path is not stable across hosts):**

```
1. Read /proc/self/cgroup; take the unified line's third field, e.g.
   "/user.slice/user-1000.slice/user@1000.service/app.slice/app-org.kde.konsole-1655.scope/tab(1680).scope"
2. CUR = "/sys/fs/cgroup" + that path.
3. Walk CUR upward to "/sys/fs/cgroup" (exclusive). At each level, the candidate is
   usable iff:
       - the directory is writable by the process's effective uid, AND
       - cgroup.type == "domain", AND
       - cgroup.controllers contains ALL of "memory", "cpu", "pids".
   The FIRST usable candidate wins.
4. BASE = that candidate. The per-run cgroup is BASE + "/brz-" + <runId>.
```

On this machine the walk lands on `…/user@1000.service/app.slice` (measured: `cgroup.controllers` = `cpu memory pids`, writable). On a Vultr Ubuntu 24.04 instance where BRZ runs as a systemd service, the same walk lands on `/sys/fs/cgroup/system.slice/brz.service` — the algorithm is identical and nothing is hardcoded. **No `/mnt/ee` path, no uid, no slice name may appear in source.**

**A subtlety the implementation must respect.** A cgroup v2 cgroup whose parent has controllers enabled in `cgroup.subtree_control` is a *domain* cgroup: it must contain **no processes of its own**; only its children may. The per-run cgroup is therefore a **direct child** of `BASE`, and the sandbox process is written into `BASE/brz-<runId>/cgroup.procs`. Creating an intermediate `BASE/brz/` directory would work only if `BASE/brz/cgroup.subtree_control` were explicitly enabled — one more moving part, so the design uses a direct child.

**The files written, with the exact values and formats, all measured:**

| File | Value written | Measured result |
|---|---|---|
| `memory.max` | `134217728` (128 MiB) | accepted; `cat` returns the same value |
| `memory.swap.max` | `0` | accepted — **swap is off**, so the memory cap cannot be evaded by swapping |
| `cpu.max` | `max 100000` (unlimited quota, 100 ms period) or `50000 100000` | accepted. **Note:** `0 100000` is **rejected** with `EINVAL` — quota `0` is not a legal value |
| `pids.max` | `64` | accepted |

**The read-back for the report:**

| File | Meaning |
|---|---|
| `memory.current` | current charge in bytes |
| `memory.peak` | peak charge in bytes — **this is the report's `memoryPeakBytes`** |
| `memory.events` | counters `low high max oom oom_kill oom_group_kill …` — `oom_kill > 0` is the proof the cap bit |
| `cpu.stat` | `usage_usec` → CPU seconds used |
| `pids.current` / `pids.events` | live process count |

**Teardown.** After the sandbox exits, the provider writes the remaining PIDs out, then `rmdir`s the cgroup. Measured: `rmdir` fails with `Device or resource busy` if any process is still in it, so teardown **verifies** emptiness first and reports `verifiedGone: false` if it cannot remove the cgroup. The report carries that honestly.

**Fallback.** If the walk finds no usable candidate, or the cgroup files cannot be written, the provider MUST fall back to **rlimits only** and set `enforcement: 'rlimit-only'`, and the report MUST say so. It MUST NOT claim a cgroup cap it did not apply.

### 4.5 Provider errors

Providers throw only typed errors, so raw provider text never reaches a user-facing response:

```ts
// backend/src/contracts/sandbox.ts

export type SandboxErrorCode =
  | 'sandbox_create_failed'
  | 'sandbox_not_found'
  | 'sandbox_destroy_failed'
  | 'invalid_path'
  | 'invalid_command'
  | 'command_not_allowed'
  | 'cgroup_unavailable'
  | 'provider_unavailable'
  | 'provider_error';

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  readonly detail: string | null;   // server-log only, never returned to a client
  constructor(code: SandboxErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
```

### 4.6 `VultrVMProvider` — the production tier, written against a mock

**API base and auth** (source: the official Vultr API v2 reference, <https://www.vultr.com/api/>, accessed 2026-10-23; field-level detail read from the public OpenAPI 3.0 mirror at <https://gist.githubusercontent.com/celicoo/6156b1a937e20e1439ad179b38791c60/raw/open_api_vultr.json>, accessed 2026-10-23; provisioning example at <https://docs.vultr.com/products/compute/instances/cloud-compute/provisioning>, accessed 2026-10-23):

- Base URL: `https://api.vultr.com/v2` — **from env** (`BRZ_VULTR_API_BASE`), never a literal.
- Auth: `Authorization: Bearer ${VULTR_API_KEY}` on every call.
- The official page is JavaScript-rendered and returns `403` to a plain `fetch` (measured); the field-level detail above therefore comes from the public OpenAPI mirror, which is a copy of the official spec.

**The exact call sequence:**

**Step 1 — create the instance.**

```
POST {BRZ_VULTR_API_BASE}/instances
Authorization: Bearer $VULTR_API_KEY
Content-Type: application/json

{
  "region":    "<BRZ_VULTR_REGION>",        // e.g. "ewr"
  "plan":      "<BRZ_VULTR_PLAN>",          // e.g. "vc2-1c-1gb"
  "os_id":     2284,                        // Ubuntu 24.04 LTS x64
  "label":     "brz-<runId>",
  "hostname":  "brz-<runId>",
  "sshkey_id": ["<sshkey-id>"],
  "user_data": "<base64 cloud-init>"
}
```

Response: **202 Accepted** with the `instance` object. The `user_data` field is documented as *"The user-supplied, base64 encoded user data"* — so the provider **base64-encodes** the cloud-init payload. The `user_data` cloud-init installs `bubblewrap` and `python3`, installs the BRZ sandbox agent, and writes `/etc/brz/run.json` containing the broker endpoint and the per-run token.

**Step 2 — wait until ready.** Poll:

```
GET {BRZ_VULTR_API_BASE}/instances/{instance-id}
```

until `status === 'active'` **and** `power_status === 'running'` **and** `server_status === 'ok'`.

The `instance` object fields (from the spec) include: `id`, `os`, `ram`, `disk`, `main_ip`, `vcpu_count`, `region`, `date_created`, `status` (`active | pending | suspended | resizing`), `power_status` (`running | stopped`), `server_status` (`none | locked | installingbooting | ok`), `plan`, `os_id`, `label`, `hostname`, `internal_ip`, `kvm`, `features`, `tags`, `default_password`.

`main_ip` is the address the provider then reaches the agent on. `default_password` is present in the payload and **must never be logged or stored**.

If the instance is `suspended` (the account's policy), the provider calls `POST /instances/{id}/start` (**204 No Content**) and resumes polling.

**Step 3 — push files and exec.** The Vultr API has **no exec endpoint** for Cloud Compute. The provider therefore uses the **same broker channel** as the local tier, over HTTPS: the control plane POSTs work items to

```
POST {BRZ_PUBLIC_BASE_URL}/api/v1/broker
Authorization: Bearer <per-run token>
```

and the instance's agent long-polls the control plane for work. The provider's `writeFiles` and `exec` are implemented as broker operations against that channel. The *protocol* is identical on both tiers (§5) — only the transport differs, which is the entire point of `BrokerChannel.transport`.

**Step 4 — destroy.**

```
DELETE {BRZ_VULTR_API_BASE}/instances/{instance-id}
```

Response: **204 No Content**. The provider then polls `GET /instances/{id}` until it returns **404**, which is the proof the instance is gone. If the delete fails, the provider **retries three times** with backoff, and if the instance still exists it records it in `SandboxDestroyResult.leftoverResources` and returns `ok: false, verifiedGone: false` — a leaked instance is **reported, never hidden**.

**Assumptions this tier makes (and cannot yet verify):**

| Assumption | Value | How it will be verified |
|---|---|---|
| Region | `ewr` (`BRZ_VULTR_REGION`) | kickoff |
| Plan | `vc2-1c-1gb` (`BRZ_VULTR_PLAN`) | kickoff |
| OS | `os_id 2284` = Ubuntu 24.04 LTS x64 | `GET /v2/os` at kickoff |
| Minimum plan memory | **≥ 1000 MB** — the API rejects smaller plans for Ubuntu 24.04 x64 with `400 Server add failed: Ubuntu 24.04 LTS x64 requires a plan with at least 1000 MB memory` (cited in the `cssnr/vultr-python` documentation, <https://cssnr.github.io/vultr-python>, accessed 2026-10-23) | kickoff |
| Cold start | **assume p90 = 120 s**, timeout **300 s** | measured at kickoff; the provider logs the real number to `sandbox_lifecycle` |
| Destroy | delete + poll-to-404, **≤ 120 s** | kickoff |

**What the mock must cover.** `backend/test/fixtures/vultrApiMock.ts` implements the `fetch` shape the provider uses and is driven by a scripted state machine. It MUST cover, at minimum:

| # | Case | Expected provider behaviour |
|---|---|---|
| 1 | create → 202 with an instance | session created |
| 2 | create → 400 | `SandboxError('provider_error')`; **no** instance assumed to exist |
| 3 | create → network error | `SandboxError('provider_unavailable')` |
| 4 | get instance → `pending` for N polls, then `active` | provider waits, does not give up early |
| 5 | get instance → never becomes ready → timeout | `SandboxError('sandbox_create_failed')` |
| 6 | exec via broker → non-zero exit | exit code surfaced, **not** an error |
| 7 | delete → 204, then get → 404 | `destroy()` returns `ok: true, verifiedGone: true` |
| 8 | **delete → 500** | retried 3×; if it still fails → `ok: false`, `verifiedGone: false`, the instance id in `leftoverResources`, and an **error surfaced to the run** — a leaked instance must never be silent |
| 9 | get instance → `suspended` | provider calls `POST /instances/{id}/start` and resumes polling |

---

## 5. The capability broker

### 5.1 What the broker is, and why it is the whole trick

The sandbox has **no network**. Therefore the only way for the sandbox to obtain anything from the outside world is to **ask the control plane**. That request channel is the capability broker. It is the single, auditable, allowlisted channel between the isolated world and everything else — and it is why BRZ can say "the sandbox had zero network access" and mean it literally, while still being useful.

**Phase 1 enables exactly two capabilities** — `fetch` and `file_out` — because the workload needs exactly those two. `credential` is **defined in the protocol and disabled in Phase 1**: the capability exists so the shape is right, but the Phase 1 policy denies every credential request with `capability_disabled`. Adding credentials later is a config change, not a protocol change.

### 5.2 The wire protocol

A single request/response exchange per call, JSON on a byte stream. The transport differs per tier (§4.6); the payload does not.

```ts
// backend/src/contracts/broker.ts

/** The capabilities the broker understands. */
export type BrokerCapability = 'fetch' | 'file_out' | 'credential';

/** Protocol version. Bumped on any breaking change; a mismatch is an error. */
export type BrokerProtocol = 'brz-broker/1';

export interface BrokerRequest {
  readonly protocol: BrokerProtocol;
  /** Unique per request. Echoed in the response. */
  readonly requestId: string;
  /** The run this request belongs to. Must match the token's run. */
  readonly runId: string;
  readonly capability: BrokerCapability;
  /** The per-run bearer token. */
  readonly token: string;
  readonly issuedAt: string;
  readonly payload: BrokerRequestPayload;
}

export type BrokerRequestPayload =
  | {
      readonly kind: 'fetch';
      /** Absolute URL. Scheme must be `https:` (or `http:` only for an explicitly allowlisted host). */
      readonly url: string;
      readonly method?: 'GET' | 'HEAD';
      /** Additional request headers. `Host`, `Authorization` and `Cookie` are stripped. */
      readonly headers?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'file_out';
      /** Path, relative to the run's work dir, that the sandbox wants copied out. */
      readonly path: string;
      readonly maxBytes: number;
    }
  | {
      readonly kind: 'credential';
      /** The credential the sandbox wants. */
      readonly credentialId: string;
    };

export interface BrokerResponse {
  readonly protocol: BrokerProtocol;
  readonly requestId: string;
  readonly ok: boolean;
  readonly at: string;
  readonly result?: BrokerResult;
  readonly error?: BrokerError;
}

export type BrokerResult =
  | {
      readonly kind: 'fetch';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly bytes: number;
      readonly truncated: boolean;
    }
  | {
      readonly kind: 'file_out';
      readonly content: string;
      readonly bytes: number;
      readonly sha256: string;
    }
  | {
      readonly kind: 'credential';
      readonly credentialId: string;
      readonly value: string;
      readonly expiresAt: string;
    };

/** Machine-readable denial reasons. These strings appear verbatim in the report. */
export type BrokerErrorCode =
  | 'unauthorized'
  | 'unknown_capability'
  | 'capability_disabled'
  | 'egress_denied'
  | 'invalid_url'
  | 'path_not_allowed'
  | 'credential_not_allowed'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error';

export interface BrokerError {
  readonly code: BrokerErrorCode;
  /** Generic, human-readable, safe to show. Never contains upstream text. */
  readonly message: string;
}
```

### 5.3 Authentication between sandbox and control plane

- A **per-run token**: 32 random bytes, hex-encoded. Generated by the run manager when the run is created. Stored **hashed** (SHA-256) in the `runs` table — the raw token is never persisted, never logged, and never returned by the API.
- The raw token is delivered to the sandbox **out of band**: on the local tier it is written into the run's work directory (which only the sandbox can read); on the Vultr tier it goes into the instance's `user_data` cloud-init.
- Every broker request must present `Authorization: Bearer <token>` (HTTPS tier) or include `token` in the body (UDS tier). The broker compares the presented token's SHA-256 against the stored hash **and** checks that `requestId`'s `runId` matches the token's run.
- A mismatch returns `unauthorized` and is **logged as a denied attempt** — an authentication failure is evidence, not noise.

### 5.4 The egress allowlist

- The allowlist is a set of **hostnames**, from `BRZ_EGRESS_ALLOWLIST` (comma-separated, e.g. `example.com,api.example.org`). **Empty by default** — so in the default configuration every fetch is denied, and the demo's containment moment is deterministic.
- A `fetch` is allowed iff:
  1. the capability `fetch` is enabled (it is), **and**
  2. the URL parses, the scheme is `https:` (or `http:` for a host in `BRZ_EGRESS_ALLOW_INSECURE`, empty by default), **and**
  3. the URL's hostname matches an allowlist entry — exact match, or a `*.suffix` wildcard, **and**
  4. the request is `GET` or `HEAD`.
- There is **no redirect following** in Phase 1. A redirect is a classic allowlist bypass; a `fetch` that returns a 3xx is reported as `egress_denied` with reason `redirect_not_allowed`.
- The broker **strips** `Host`, `Authorization`, `Cookie`, and `Proxy-*` from outbound request headers, and **strips** `Set-Cookie` from the response.
- The response body is capped at `BRZ_EGRESS_MAX_BYTES` (default 262144) and truncated with `truncated: true`.

### 5.5 What happens when the sandbox asks for something not allowed

The broker responds with `ok: false` and a `BrokerError`. It **never** partially complies: a denied `fetch` performs no network I/O at all.

Every broker request — allowed or denied — is written to the `egress_attempts` table and emitted as an `egress.attempt` event, and every one of them appears in the report's `network.attempts` array with its verdict and its machine-readable reason. **A denial is the most valuable thing in the report.**

The mapping from error code to the report's reason string is fixed:

| `BrokerErrorCode` | Report reason |
|---|---|
| `egress_denied` | `host_not_allowlisted` |
| `egress_denied` (redirect) | `redirect_not_allowed` |
| `invalid_url` | `invalid_url` |
| `unauthorized` | `invalid_token` |
| `capability_disabled` | `capability_disabled` |
| `credential_not_allowed` | `credential_not_allowed` |
| `path_not_allowed` | `path_not_allowed` |
| `not_found` | `file_not_found` |
| `rate_limited` | `rate_limited` |
| `internal_error` | `broker_error` |

### 5.6 The broker's life cycle

1. The run manager creates the per-run work directory and the broker's Unix socket at `<workdir>/.brz/broker.sock`.
2. The socket's directory is mode `0700`; the socket file itself is `0600`. **Both live inside the per-run directory**, so teardown of the directory is teardown of the broker — there is no separate cleanup path to forget.
3. The broker accepts connections only for the duration of the run.
4. On teardown the listener is closed and the socket file removed with the directory.

---

## 6. The blast-radius report

> This is the artifact the whole project exists to produce. It is what the demo video shows, and it is the structural answer to *"why should I trust you with my code execution?"*.

### 6.1 What a human must be able to see in five seconds

1. **What code ran** — the files written, the commands executed, the real output.
2. **What the sandbox tried to do and was denied** — every blocked capability request, with the rule that blocked it.
3. **Resource usage against the caps** — measured peak versus the cap, for each dimension.
4. **The network attempts** — including the case where there were **none**, which must be distinguishable from "not measured".
5. **The teardown** — proof the sandbox is gone.

### 6.2 The `Measured<T>` rule

The single most important type in the report. It makes "not measured" structurally impossible to write as `0`.

```ts
// backend/src/contracts/report.ts

/**
 * A value that is either genuinely measured, or explicitly not measured.
 *
 * There is no third state. In particular there is no way to express
 * "not measured" as `0` — the `value` of a not-measured entry is `null`,
 * and the `reason` says why. This is the type that enforces
 * "never fabricate a zero" at compile time.
 */
export type Measured<T> =
  | { readonly state: 'measured'; readonly value: T }
  | { readonly state: 'not-measured'; readonly value: null; readonly reason: string };
```

### 6.3 The report type

```ts
// backend/src/contracts/report.ts

import type {
  ContainmentVerification,
  ResourceEnforcementMode,
  SandboxKillReason,
  SandboxProviderKind,
} from './sandbox.ts';

export type BlastRadiusVerdict =
  /** Every containment requirement was measured and satisfied, and no egress was allowed. */
  | 'contained'
  /** Every containment requirement was measured and satisfied, and at least one egress attempt was denied. */
  | 'contained-with-denials'
  /** A containment requirement was measured and FAILED. */
  | 'violated'
  /** At least one containment requirement was not measured. */
  | 'incomplete';

export interface BlastRadiusReport {
  readonly reportVersion: '1.0';
  readonly runId: string;
  readonly generatedAt: string;
  readonly verdict: BlastRadiusVerdict;
  /** One line, written for a human. Appears at the top of the UI panel. */
  readonly headline: string;

  readonly task: {
    readonly workload: string;
    readonly goal: string;
    readonly sourceKind: 'fixture' | 'files';
    readonly sourceRef: string;
  };

  readonly code: CodeExecutionSummary;
  readonly containment: ContainmentSection;
  readonly resources: ResourceUsageSection;
  readonly network: NetworkSection;
  readonly lifecycle: LifecycleSection;
  readonly evidence: EvidenceSection;
  readonly timeline: readonly TimelineEntry[];
}

// ── what ran ────────────────────────────────────────────────────────────────

export interface WrittenFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  /** Who caused the write. */
  readonly origin: 'workload-seed' | 'agent';
}

export interface CommandRecord {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly outcome: 'ok' | 'non-zero-exit' | 'killed' | 'timed-out' | 'refused';
  readonly killReason: SandboxKillReason | null;
  /** Present when `outcome` is `'refused'` — the control plane declined to run it. */
  readonly refusalReason: string | null;
}

export interface FailedTest {
  readonly test: string;
  readonly message: string;
  readonly traceback: string | null;
}

export interface TestOutcome {
  readonly command: string;
  readonly exitCode: number | null;
  readonly passed: number;
  readonly total: number;
  readonly failedTests: readonly FailedTest[];
  readonly output: string;
}

export interface CodeExecutionSummary {
  readonly filesWritten: readonly WrittenFile[];
  readonly commands: readonly CommandRecord[];
  /** The final verification run. This decides the run's success. */
  readonly finalTestRun: TestOutcome | null;
  /** The agent's closing explanation, verbatim. */
  readonly modelExplanation: string;
  /** The agent's own claim about what it did, before verification. */
  readonly modelClaim: string;
}

// ── containment ─────────────────────────────────────────────────────────────

export interface ContainmentSection {
  readonly processIsolation: Measured<IsolationFact>;
  readonly secretHygiene: Measured<SecretHygieneFact>;
  readonly resourceLimits: Measured<ResourceLimitFact>;
  readonly lifecycle: Measured<LifecycleFact>;
  /** The raw measurement from the sandbox. Null only if the probe never ran. */
  readonly measurement: ContainmentVerification | null;
}

export interface IsolationFact {
  readonly namespaces: readonly string[];
  readonly visibleRootEntries: readonly string[];
  readonly writableOutsideWorkDir: boolean;
  readonly processNamespaceIsolated: boolean;
  readonly directNetworkReachable: boolean;
}

export interface SecretHygieneFact {
  /** Every environment variable name visible inside the sandbox. */
  readonly environmentKeys: readonly string[];
  /** Did any credential-shaped name appear? (`*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*_PASSWORD`) */
  readonly credentialShapedKeys: readonly string[];
  /** True if any credential-shaped key or file was visible. Must be false. */
  readonly secretMaterialVisible: boolean;
  /** True if the operator's project directory (which may hold a `.env`) was inside the sandbox. */
  readonly projectDirectoryVisible: boolean;
}

export interface ResourceLimitFact {
  readonly enforcement: ResourceEnforcementMode;
  readonly memoryCapBytes: number;
  readonly cpuCapSeconds: number;
  readonly processCap: number;
  readonly fileSizeCapBytes: number;
  /** True when the cap actually fired (i.e. the sandbox was killed for exceeding it). */
  readonly capFired: boolean;
}

export interface LifecycleFact {
  readonly sandboxId: string;
  readonly provider: SandboxProviderKind;
  readonly createdAt: string;
  readonly destroyedAt: string | null;
  readonly verifiedGone: boolean;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
}

// ── resources ───────────────────────────────────────────────────────────────

export interface ResourceUsageSection {
  readonly wallClockMs: Measured<number>;
  readonly wallClockCapMs: number;
  readonly memoryPeakBytes: Measured<number>;
  readonly memoryCapBytes: number;
  readonly cpuSeconds: Measured<number>;
  readonly cpuCapSeconds: number;
  readonly maxProcessesObserved: Measured<number>;
  readonly processCap: number;
  readonly outputBytes: Measured<number>;
  /** The mechanism by which the caps were enforced. Same vocabulary as `ResourceEnforcementMode`. */
  readonly enforcement: ResourceEnforcementMode;
  /** Non-null when the sandbox was killed by a cap. */
  readonly killReason: SandboxKillReason | null;
}

// ── network ─────────────────────────────────────────────────────────────────

export interface EgressAttempt {
  readonly at: string;
  readonly capability: 'fetch' | 'file_out' | 'credential';
  readonly url: string | null;
  readonly host: string | null;
  readonly verdict: 'allowed' | 'denied';
  /** Machine-readable reason. `host_not_allowlisted`, `invalid_token`, … */
  readonly reason: string;
  /** Who caused the attempt. */
  readonly origin: 'agent' | 'containment-probe';
  readonly bytes: number | null;
  readonly durationMs: number | null;
}

export interface NetworkSection {
  /** Always `'blocked'`. The type makes it so. */
  readonly directAccess: 'blocked';
  readonly directMechanism: string;
  /** The measured probe. */
  readonly probe: Measured<NetworkProbeFact>;
  /** Every broker request, allowed or denied. */
  readonly attempts: readonly EgressAttempt[];
  readonly deniedCount: number;
  readonly allowedCount: number;
  /** The allowlist in force. Empty means "everything is denied". */
  readonly allowlist: readonly string[];
}

export interface NetworkProbeFact {
  readonly reachable: boolean;
  readonly errno: string | null;
  readonly message: string;
  /** The only endpoint the sandbox could reach, if any. */
  readonly brokerReachable: boolean;
}

// ── lifecycle ───────────────────────────────────────────────────────────────

export interface LifecycleSection {
  readonly sandboxId: string;
  readonly provider: SandboxProviderKind;
  readonly createdAt: string;
  readonly destroyedAt: string | null;
  readonly teardownVerified: boolean;
  readonly teardownEvidence: string;
  readonly workDirRemoved: boolean;
  readonly cgroupRemoved: boolean;
  /** Anything that survived teardown. Must be empty in a healthy run. */
  readonly leakedResources: readonly string[];
}

// ── evidence ────────────────────────────────────────────────────────────────

export interface Artifact {
  readonly label: string;
  readonly kind: 'text' | 'file';
  readonly content: string | null;
  readonly bytes: number;
  readonly sha256: string;
}

export interface EvidenceSection {
  readonly eventCount: number;
  /** SHA-256 over the canonical JSON of the event stream. */
  readonly eventDigest: string;
  readonly artifacts: readonly Artifact[];
  readonly stdout: string;
  readonly stderr: string;
}

// ── timeline ────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  readonly at: string;
  readonly label: string;
  readonly kind: 'sandbox' | 'agent' | 'tool' | 'egress' | 'resource' | 'lifecycle';
  readonly detail: string;
}
```

### 6.4 The verdict rule

Deterministic, and the same function in the code and in this document:

```
violated            if any measured containment fact is FALSE
                    (directNetworkReachable, secretMaterialVisible,
                     projectDirectoryVisible, writableOutsideWorkDir,
                     processNamespaceIsolated, verifiedGone, workDirRemoved)

contained-with-denials
                    if nothing is violated AND deniedCount > 0

contained           if nothing is violated AND deniedCount == 0

incomplete          if any containment fact is not-measured
```

A `violated` verdict is **not** a bug to hide — it is the product working. The report exists to tell the truth.

### 6.5 A filled-in example

This is the report from a successful run of the demo scenario (§12), with the containment probe's denied fetch included. It is what the UI renders and what the video shows.

```json
{
  "reportVersion": "1.0",
  "runId": "run_01JQ7YB3K4M2ZC0X9W6R8VN5TF",
  "generatedAt": "2026-10-23T11:42:07.318Z",
  "verdict": "contained-with-denials",
  "headline": "Contained. 1 file changed, 2/2 tests green, 0 bytes left the sandbox, 1 network attempt denied, sandbox destroyed.",

  "task": {
    "workload": "self-healing-runner",
    "goal": "The project's test suite is failing. Read the code, find the bug, fix it, and make the whole suite pass. Then run `python3 -m unittest discover -s tests -v` again to confirm.",
    "sourceKind": "fixture",
    "sourceRef": "shr-sum-range"
  },

  "code": {
    "filesWritten": [
      { "path": "calculator.py", "bytes": 214, "sha256": "9f2c…a41b", "origin": "agent" }
    ],
    "commands": [
      { "argv": ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
        "cwd": "/work", "exitCode": 1, "signal": null, "durationMs": 412,
        "outcome": "non-zero-exit", "killReason": null, "refusalReason": null },
      { "argv": ["python3", "-m", "brz_selftest"],
        "cwd": "/work", "exitCode": 0, "signal": null, "durationMs": 187,
        "outcome": "ok", "killReason": null, "refusalReason": null },
      { "argv": ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
        "cwd": "/work", "exitCode": 0, "signal": null, "durationMs": 398,
        "outcome": "ok", "killReason": null, "refusalReason": null }
    ],
    "finalTestRun": {
      "command": "python3 -m unittest discover -s tests -v",
      "exitCode": 0,
      "passed": 2,
      "total": 2,
      "failedTests": [],
      "output": "test_inclusive (tests.test_calculator.TestSumRange) ... ok\ntest_single (tests.test_calculator.TestSumRange) ... ok\n\n----------------------------------------------------------------------\nRan 2 tests in 0.001s\n\nOK\n"
    },
    "modelExplanation": "`sum_range` used `range(start, end)`, which excludes `end`, but the docstring and the tests both specify an inclusive range. The first test expected 15 for (1, 5) but got 10. I changed the sum to `sum(range(start, end + 1))`, which makes the range inclusive without changing the start bound. Both tests now pass.",
    "modelClaim": "I updated `calculator.py` so the range includes `end`."
  },

  "containment": {
    "processIsolation": {
      "state": "measured",
      "value": {
        "namespaces": ["user", "mount", "pid", "ipc", "uts", "cgroup", "net"],
        "visibleRootEntries": ["bin", "dev", "etc", "lib", "lib64", "proc", "sbin", "tmp", "usr", "work"],
        "writableOutsideWorkDir": false,
        "processNamespaceIsolated": true,
        "directNetworkReachable": false
      }
    },
    "secretHygiene": {
      "state": "measured",
      "value": {
        "environmentKeys": ["HOME", "LANG", "PATH", "PWD"],
        "credentialShapedKeys": [],
        "secretMaterialVisible": false,
        "projectDirectoryVisible": false
      }
    },
    "resourceLimits": {
      "state": "measured",
      "value": {
        "enforcement": "cgroup+rlimit",
        "memoryCapBytes": 134217728,
        "cpuCapSeconds": 60,
        "processCap": 64,
        "fileSizeCapBytes": 1048576,
        "capFired": false
      }
    },
    "lifecycle": {
      "state": "measured",
      "value": {
        "sandboxId": "sbx_01JQ7YB3KD8ZP4H",
        "provider": "bwrap",
        "createdAt": "2026-10-23T11:42:03.902Z",
        "destroyedAt": "2026-10-23T11:42:07.211Z",
        "verifiedGone": true,
        "workDirRemoved": true,
        "cgroupRemoved": true
      }
    },
    "measurement": {
      "directNetworkReachable": false,
      "directNetworkProbe": {
        "attempted": true,
        "errno": "ENETUNREACH",
        "message": "Network is unreachable"
      },
      "environmentKeys": ["HOME", "LANG", "PATH", "PWD"],
      "secretMaterialVisible": false,
      "visibleRootEntries": ["bin", "dev", "etc", "lib", "lib64", "proc", "sbin", "tmp", "usr", "work"],
      "writableOutsideWorkDir": false,
      "processNamespaceIsolated": true,
      "brokerReachable": true,
      "measuredAt": "2026-10-23T11:42:04.117Z",
      "provider": "bwrap"
    }
  },

  "resources": {
    "wallClockMs": { "state": "measured", "value": 3284 },
    "wallClockCapMs": 120000,
    "memoryPeakBytes": { "state": "measured", "value": 41246720 },
    "memoryCapBytes": 134217728,
    "cpuSeconds": { "state": "measured", "value": 0.31 },
    "cpuCapSeconds": 60,
    "maxProcessesObserved": { "state": "measured", "value": 3 },
    "processCap": 64,
    "outputBytes": { "state": "measured", "value": 4821 },
    "enforcement": "cgroup+rlimit",
    "killReason": null
  },

  "network": {
    "directAccess": "blocked",
    "directMechanism": "unshare-net (no interfaces, no route)",
    "probe": {
      "state": "measured",
      "value": { "reachable": false, "errno": "ENETUNREACH", "message": "Network is unreachable", "brokerReachable": true }
    },
    "attempts": [
      {
        "at": "2026-10-23T11:42:04.131Z",
        "capability": "fetch",
        "url": "https://api.github.com/repos/brz-demo/project/releases",
        "host": "api.github.com",
        "verdict": "denied",
        "reason": "host_not_allowlisted",
        "origin": "containment-probe",
        "bytes": null,
        "durationMs": 1
      }
    ],
    "deniedCount": 1,
    "allowedCount": 0,
    "allowlist": []
  },

  "lifecycle": {
    "sandboxId": "sbx_01JQ7YB3KD8ZP4H",
    "provider": "bwrap",
    "createdAt": "2026-10-23T11:42:03.902Z",
    "destroyedAt": "2026-10-23T11:42:07.211Z",
    "teardownVerified": true,
    "teardownEvidence": "bwrap exited 0; cgroup /sys/fs/cgroup/…/brz-run_01JQ7YB3K4M2ZC0X9W6R8VN5TF removed (rmdir ok); work dir /var/lib/brz/runs/run_01JQ7YB3K4M2ZC0X9W6R8VN5TF deleted",
    "workDirRemoved": true,
    "cgroupRemoved": true,
    "leakedResources": []
  },

  "evidence": {
    "eventCount": 24,
    "eventDigest": "sha256:4c1f…88ad",
    "artifacts": [
      { "label": "final calculator.py", "kind": "text", "content": "def sum_range(start, end):\n    \"\"\"Return the sum of the integers from start to end, inclusive.\"\"\"\n    return sum(range(start, end + 1))\n", "bytes": 214, "sha256": "9f2c…a41b" },
      { "label": "first test run output", "kind": "text", "content": "FAIL: test_inclusive … AssertionError: 10 != 15", "bytes": 1093, "sha256": "77de…03b9" }
    ],
    "stdout": "…",
    "stderr": "…"
  },

  "timeline": [
    { "at": "2026-10-23T11:42:03.902Z", "label": "Sandbox created", "kind": "sandbox", "detail": "bwrap + cgroup v2, 128 MiB / 60 s / 64 pids" },
    { "at": "2026-10-23T11:42:04.117Z", "label": "Containment probe", "kind": "sandbox", "detail": "direct egress blocked (ENETUNREACH); 0 credential keys; 1 broker fetch denied" },
    { "at": "2026-10-23T11:42:04.402Z", "label": "Agent planned", "kind": "agent", "detail": "read the source, run the tests" },
    { "at": "2026-10-23T11:42:05.101Z", "label": "python3 -m unittest discover -s tests -v", "kind": "tool", "detail": "exit 1 — AssertionError: 10 != 15" },
    { "at": "2026-10-23T11:42:05.488Z", "label": "calculator.py rewritten", "kind": "tool", "detail": "214 bytes" },
    { "at": "2026-10-23T11:42:05.963Z", "label": "python3 -m unittest discover -s tests -v", "kind": "tool", "detail": "exit 0 — 2 tests passed" },
    { "at": "2026-10-23T11:42:06.502Z", "label": "Agent explained", "kind": "agent", "detail": "the range was exclusive; made it inclusive" },
    { "at": "2026-10-23T11:42:07.211Z", "label": "Sandbox destroyed", "kind": "lifecycle", "detail": "verified gone; cgroup removed; work dir deleted" }
  ]
}
```

### 6.6 How the report is assembled

The report is **assembled from persisted records**, never from in-memory guesses:

| Report field | Source |
|---|---|
| `code.filesWritten` | `tool_calls` rows with `tool_name = 'write_file'` |
| `code.commands` | `tool_calls` rows with `tool_name = 'run_tests'` + `sandbox_lifecycle` exec records |
| `code.finalTestRun` | the verification run recorded in `runs` |
| `code.modelExplanation` | the final assistant message, stored on the run |
| `containment.*` | the containment probe record stored in `sandbox_lifecycle` |
| `resources.*` | `resource_samples` + the cgroup read-back stored on teardown |
| `network.attempts` | `egress_attempts` rows |
| `lifecycle.*` | `sandbox_lifecycle` rows |
| `evidence.*` | `run_events` (count + digest) + `artifacts` rows |
| `timeline` | `run_events`, projected |

Any field with no backing record becomes a `Measured` value with `state: 'not-measured'` and a reason naming the missing record. **A `0` in a measured field must be a real zero.**

---

## 7. The agent loop

### 7.1 Shape

```
        ┌──────────────────────────────────────────────────────────┐
        │                                                          │
        ▼                                                          │
  ┌───────────┐   model reply    ┌──────────────┐  tool call  ┌────┴─────┐
  │  PLANNING  │◀────────────────│  AGENT LOOP   │────────────▶│ EXECUTE  │
  └───────────┘                  └──────────────┘             └────┬─────┘
        ▲                            ▲                              │
        │        tool result         │                    sandbox.exec│
        └────────────────────────────┴──────────────────────────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │     VERIFYING      │  final test run in the sandbox
                    └─────────┬─────────┘
                              ▼
                    ┌───────────────────┐
                    │    REPORTING       │  assemble from persisted records
                    └─────────┬─────────┘
                              ▼
                    ┌───────────────────┐
                    │     TEARDOWN       │  destroy, always, in a finally
                    └───────────────────┘
```

### 7.2 The system prompt

The prompt is a **frozen string** in `backend/src/agent/prompt.ts`. It is part of the contract, because the demo's reliability depends on it. Its content is fixed by the rules below; the implementer may format it, but must not change its meaning.

```
You are BRZ's execution agent. You fix a small Python project until its test
suite passes. You run in a strictly isolated sandbox: a sealed container with
no network, no credentials, and hard resource limits. Everything you can do
is mediated by four tools.

THE GOAL
<the operator's task, verbatim>

YOUR TOOLS
- list_files()             — list the files in the project.
- read_file(path)         — read one file. Always read a file before changing it.
- write_file(path, content) — create or overwrite one file. Write the whole file.
- run_tests(command?)     — run the project's test command inside the sandbox.
                            If you pass no command, the default test command is used.
                            You may ONLY run a command the project declares. Any other
                            command is refused before it runs, and the refusal is
                            recorded in the run's report.

HOW TO WORK
1. list_files() to see the project.
2. read_file() the failing source file and the failing test file.
3. run_tests() to see the real failure. The output is the truth — read it.
4. Make the smallest change that fixes the cause, not the symptom. Do not edit
   the tests. Do not hard-code an expected value. Do not add a dependency.
5. run_tests() again. If it still fails, you have ONE more attempt: read the
   new output and fix the cause again. Do not guess.
6. When the suite passes, reply with a short explanation: what was wrong, what
   you changed, and why. Do not call any more tools.

RULES
- You are writing Python that runs with the standard library only. No pip, no
  network, no new packages.
- The sandbox has NO network. If the task seems to need the network, do not try
  to work around it. Say so in your final message.
- Never print, echo, or look for credentials. There are none, and looking is
  pointless.
- Work only in the project directory.
- Your final message is the deliverable. Be specific about the change.
```

### 7.3 Inference

- **Protocol:** OpenAI-compatible `POST ${OPENAI_ENDPOINT}/chat/completions`, `model` = `OPENAI_MODEL`.
- **Streaming: OFF in Phase 1.** The run's progress is already a first-class event stream (§8.3); token streaming would add a second transport and a half-built UX. The implementer must not add it.
- **Tool calling:** the OpenAI function-calling shape. `tools` is an array of `{ type: 'function', function: { name, description, parameters } }` where `parameters` is a JSON Schema object. The four tool definitions are:

| Tool | Parameters (JSON Schema) | Dispatch |
|---|---|---|
| `list_files` | `{ type: 'object', properties: { path: { type: 'string' } }, additionalProperties: false }` | list the work dir |
| `read_file` | `{ type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }` | read a file from the work dir |
| `write_file` | `{ type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path','content'], additionalProperties: false }` | write a file into the work dir |
| `run_tests` | `{ type: 'object', properties: { command: { type: 'string' } }, additionalProperties: false }` | run a **declared** command in the sandbox |

- **The model's `arguments` are JSON and untrusted.** They are parsed, validated against the JSON Schema, and path-checked. A path that is absolute, contains `..`, contains a NUL, or escapes the work dir is rejected before any I/O.
- **Retries:** the client retries on `429` and `5xx` up to `OPENAI_MAX_RETRIES` times with exponential backoff and jitter. It does **not** retry `4xx` other than `429`.
- **Errors** are typed, and the provider's raw text never reaches a user-facing response:

```ts
// backend/src/inference/client.ts
export type InferenceErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'upstream_4xx'
  | 'upstream_5xx'
  | 'malformed_response'
  | 'network_error'
  | 'not_configured';

export class InferenceError extends Error {
  readonly code: InferenceErrorCode;
  readonly detail: string | null;   // server log only
  constructor(code: InferenceErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'InferenceError';
    this.code = code;
    this.detail = detail ?? null;
  }
}
```

- **Deterministic offline mode.** `BRZ_INFERENCE_MODE=mock` returns scripted responses with **no network call**. `NODE_ENV=production` **forces live mode** and refuses to start in mock. The mock's script for `shr-sum-range` is a fixed transcript: list → read → run (fail) → write (fix) → run (pass) → final message. This is what CI runs and what `npm run demo:offline` uses.

### 7.4 The retry rule — exactly one repair retry

> **A repair attempt is a `run_tests` call that follows a `run_tests` call whose exit code was non-zero.**

- The run allows **at most 2 repair attempts** (i.e. the test command may run at most 3 times: the initial run, plus two re-runs).
- The failing output is fed back **verbatim** as the next tool result. The model is not told "it failed"; it is shown the real output.
- When the repair budget is exhausted and the suite is still red, the run ends **`failed`** with `errorCode: 'repair_budget_exhausted'`. The report still contains every command, every output, and the model explanation.
- The model may also choose to stop early. If it stops with the suite red, the run ends **`failed`** with `errorCode: 'tests_not_green'`.

The retry is **one** in the sense the hackathon means: one error is fed back and one correction is attempted. The second repair is a safety valve, not a loop.

### 7.5 Stopping conditions, in one table

| # | Condition | Run status | `errorCode` |
|---|---|---|---|
| 1 | The model returns a final message with no tool call, **and** the verification run is green | `succeeded` | `null` |
| 2 | The model returns a final message with no tool call, **and** the verification run is red | `failed` | `tests_not_green` |
| 3 | Tool-call cap reached (12) | `failed` | `iteration_cap` |
| 4 | Token budget exhausted (24 000 tokens total) | `failed` | `budget_exhausted` |
| 5 | Repair budget exhausted (2 repair attempts) | `failed` | `repair_budget_exhausted` |
| 6 | Model transport error after retries | `failed` | `model_error` |
| 7 | Model request exceeded the inference timeout | `failed` | `model_timeout` |
| 8 | The sandbox could not be created | `failed` | `sandbox_error` |
| 9 | The run exceeded its wall-clock budget (120 s) | `failed` | `timeout` |
| 10 | The client disconnected, or the operator cancelled | `cancelled` | `cancelled` |

**The success criterion is decided by the sandbox, not by the model.** Condition 1 requires a green verification run. A model that says "done" without green tests does not succeed. This is the single rule that makes the report worth trusting.

### 7.6 How a tool call becomes a sandbox execution

```ts
// backend/src/agent/tools.ts
export type ToolName = 'list_files' | 'read_file' | 'write_file' | 'run_tests';

export interface ToolCallRequest {
  readonly name: ToolName;
  readonly arguments: Record<string, unknown>;   // untrusted; validated before use
}

export interface ToolCallOutcome {
  readonly name: ToolName;
  readonly ok: boolean;
  /** The text handed back to the model. */
  readonly modelText: string;
  /** The machine-readable result, stored in `tool_calls`. */
  readonly record: ToolCallRecord;
}

export interface ToolCallRecord {
  readonly name: ToolName;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly bytes: number | null;
  readonly exitCode: number | null;
  readonly durationMs: number;
}
```

The dispatch rules:

1. **Validate the arguments.** Unknown tool name → `errorCode: 'unknown_tool'`. Bad argument shape → `errorCode: 'invalid_arguments'`. Both are fed back to the model as text so it can correct itself, and both are recorded.
2. **`run_tests` command check.** The requested `command` must be **exactly** one of the workload fixture's `allowedCommands` (string equality, after trimming). If not → the sandbox is **not touched**; the outcome is `ok: false`, `errorCode: 'command_not_allowed'`, and the record is a **refused command** that appears in `code.commands` with `outcome: 'refused'`. It is *not* an error in the run — it is a *denied capability request*, and it appears in the report as evidence.
3. **`list_files` / `read_file` / `write_file`** act on the per-run work directory, which is the same directory bind-mounted at `/work` inside the sandbox. Path validation happens first: the resolved absolute path must stay inside the work dir.
4. **`run_tests`** builds a `SandboxCommand` with the fixture's `argv` (split on whitespace, no shell), `cwd = '.'`, and the sandbox's `wallClockMs`. It calls `session.exec(...)` and returns the **real** exit code, stdout, and stderr, truncated to `maxOutputBytes`.
5. The outcome's `modelText` is what the agent loop appends to the conversation as the `tool` role message. It is the **verbatim** sandbox output, prefixed with a one-line summary so the model knows what it is looking at.
6. Every call is written to `tool_calls` and emits a `tool.call` + `tool.result` event pair.

### 7.7 Cancellation

Every run owns an `AbortController`. It is aborted when:

- the client disconnects (the HTTP response's `close` event, when the request was not completed), or
- `POST /api/v1/runs/{id}/cancel` is called, or
- the run's wall-clock budget is exhausted.

On abort: the agent loop stops calling the model, `session.exec` calls are killed, and the run manager destroys the sandbox **in a `finally`**. The run ends `cancelled` and the report records `killReason: 'cancelled'`.

---

## 8. API contract

### 8.1 General rules

- **Base path:** `/api/v1`. One exception: `/healthz` is at the **root** (it is the systemd/deploy health check, not part of the versioned API).
- **Same origin only.** The browser calls relative paths — `/api/v1/runs`, never an absolute URL. In development, Vite's dev server proxies **`/api`** to the backend and forwards the path **unchanged** (`/api/v1/runs` → `/api/v1/runs`, no prefix stripping). The proxy target is a **server-side** env var, `BRZ_API_TARGET`, which is **not** `VITE_`-prefixed and therefore never reaches the browser bundle. The full proxy contract is in §10.6.
- **In production there is no proxy.** The control plane serves `frontend/dist/` as static files and `/api/v1/*` from the same origin, so the same-origin rule holds with no hop at all.
- **Content type:** requests must be `application/json`; responses are `application/json` unless the route says otherwise.
- **Request id:** every request gets an `X-Request-Id` response header. The value is generated by the server and is safe to show. It never contains an internal database id.
- **Ids:** every id crossing the wire is an **external** id. Runs are `run_` + 26 chars of Crockford base32 (ULID). Sandboxes are `sbx_` + 16 chars. Tool calls are addressed by their per-run **sequence number**, never by a database row id.

### 8.2 The error envelope

```ts
// backend/src/contracts/api.ts

export interface ApiErrorDetail {
  /** The request field at fault. */
  readonly field: string;
  /** A short, non-sensitive description. */
  readonly issue: string;
}

export interface ApiErrorBody {
  readonly error: {
    /** Stable machine code. The UI shows this small and monospaced. */
    readonly code: string;
    /** Generic, per-status, human-readable. Never contains provider or SQL text. */
    readonly message: string;
    readonly requestId: string;
    readonly details?: readonly ApiErrorDetail[];
  };
}
```

**The full error code list, with its HTTP status.** These are frozen.

| Code | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | The body failed validation. `details` lists the fields. |
| `invalid_workload` | 400 | `workload` is not a known workload. |
| `invalid_source` | 400 | `source` is neither a valid fixture nor a valid file set. |
| `invalid_path` | 400 | A file path in the request is unsafe (absolute, `..`, NUL, or too long). |
| `invalid_command` | 400 | A `command` field is not one of the workload's declared commands. |
| `payload_too_large` | 413 | The body exceeded the size limit. |
| `unsupported_media_type` | 415 | `Content-Type` was not `application/json`. |
| `not_found` | 404 | No such route. |
| `run_not_found` | 404 | No such run. |
| `report_not_ready` | 409 | The run exists but has no report yet. |
| `run_not_cancellable` | 409 | The run is already terminal. |
| `too_many_runs` | 429 | The concurrency limit is reached. |
| `internal_error` | 500 | An unexpected server error. Full detail in the log only. |
| `sandbox_error` | 502 | The sandbox could not be created or was lost. |
| `provider_unavailable` | 502 | The inference or sandbox provider is unreachable. |
| `not_ready` | 503 | The service is not ready to accept work (e.g. the database is not migrated). |
| `timeout` | 504 | The request exceeded its own deadline. |

The per-status generic messages are fixed:

```ts
// backend/src/contracts/api.ts
export const API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: 'The request was not valid.',
  invalid_workload: 'That workload is not available.',
  invalid_source: 'The project source was not valid.',
  invalid_path: 'One of the file paths was not allowed.',
  invalid_command: 'That command is not allowed for this workload.',
  payload_too_large: 'The request was too large.',
  unsupported_media_type: 'Send JSON.',
  not_found: 'Not found.',
  run_not_found: 'No such run.',
  report_not_ready: 'The report is not ready yet.',
  run_not_cancellable: 'That run has already finished.',
  too_many_runs: 'The control plane is busy. Try again shortly.',
  internal_error: 'Something went wrong on our side.',
  sandbox_error: 'The sandbox could not be started.',
  provider_unavailable: 'The provider is unavailable.',
  not_ready: 'The service is starting up.',
  timeout: 'That took too long.',
};
```

### 8.3 The API types

```ts
// backend/src/contracts/api.ts

import type { BlastRadiusReport } from './report.ts';
import type { RunEvent, RunPhase, RunStatus } from './events.ts';
import type { WorkloadDescriptor, WorkloadFixture } from './workload.ts';

export type { RunPhase, RunStatus } from './events.ts';

// ── POST /api/v1/runs ───────────────────────────────────────────────────────

export type WorkloadId = 'self-healing-runner';

export interface FixtureSource {
  readonly kind: 'fixture';
  readonly fixtureId: string;
}

export interface FilesSource {
  readonly kind: 'files';
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export type RunSource = FixtureSource | FilesSource;

export interface SubmitRunRequest {
  readonly workload: WorkloadId;
  /** The operator's goal, 1–2000 characters. */
  readonly task: string;
  readonly source: RunSource;
}

export interface SubmitRunResponse {
  readonly runId: string;
  readonly status: RunStatus;
  readonly createdAt: string;
}

// ── GET /api/v1/runs ────────────────────────────────────────────────────────

export interface RunSummary {
  readonly runId: string;
  readonly status: RunStatus;
  readonly phase: RunPhase;
  readonly workload: WorkloadId;
  readonly goal: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly verdict: BlastRadiusReport['verdict'] | null;
  readonly testPassed: boolean | null;
  readonly testTotal: number | null;
  readonly errorCode: string | null;
}

export interface ListRunsResponse {
  readonly runs: readonly RunSummary[];
  /** Opaque cursor for the next page. `null` when there are no more. */
  readonly nextCursor: string | null;
}

// ── GET /api/v1/runs/{runId} ────────────────────────────────────────────────

export interface RunDetail extends RunSummary {
  readonly updatedAt: string;
  readonly sourceKind: 'fixture' | 'files';
  readonly sourceRef: string;
  readonly provider: 'bwrap' | 'vultr-vm';
  readonly sandboxId: string | null;
  readonly modelExplanation: string | null;
  readonly iterations: number;
  readonly toolCalls: number;
  readonly totalTokens: number;
  readonly deniedEgressAttempts: number;
}

export interface GetRunResponse {
  readonly run: RunDetail;
}

// ── GET /api/v1/runs/{runId}/events ─────────────────────────────────────────

export interface ListEventsQuery {
  /** Return events with `seq` strictly greater than this. Omit for the beginning. */
  readonly after?: number;
  /** Maximum events to return. Default 200, max 500. */
  readonly limit?: number;
}

export interface ListEventsResponse {
  readonly events: readonly RunEvent[];
  /** The `seq` to pass as `after` next time. `null` when the stream is exhausted. */
  readonly nextCursor: number | null;
  readonly runStatus: RunStatus;
  readonly runPhase: RunPhase;
}

// ── GET /api/v1/runs/{runId}/report ─────────────────────────────────────────

export interface GetReportResponse {
  readonly report: BlastRadiusReport;
}

// ── POST /api/v1/runs/{runId}/cancel ───────────────────────────────────────

export interface CancelRunResponse {
  readonly runId: string;
  readonly status: RunStatus;
}

// ── GET /api/v1/workloads ───────────────────────────────────────────────────

export interface ListWorkloadsResponse {
  readonly workloads: readonly WorkloadDescriptor[];
}

// ── GET /api/v1/fixtures ────────────────────────────────────────────────────

export interface ListFixturesResponse {
  readonly workload: WorkloadId;
  readonly fixtures: readonly WorkloadFixture[];
}

// ── GET /healthz ───────────────────────────────────────────────────────────

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly version: string;
  /** `live` or `mock`. Never the provider name — that would leak configuration. */
  readonly inferenceMode: 'live' | 'mock';
  readonly database: {
    readonly state: 'ready' | 'not-migrated' | 'error';
    readonly schemaVersion: number | null;
  };
  readonly provider: 'bwrap' | 'vultr-vm';
  readonly cgroupV2: boolean;
  readonly uptimeSeconds: number;
}
```

### 8.4 The routes

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| `GET` | `/healthz` | none | `200` `HealthResponse` | — |
| `GET` | `/api/v1/workloads` | none | `200` `ListWorkloadsResponse` | — |
| `GET` | `/api/v1/fixtures` | none | `200` `ListFixturesResponse` | — |
| `POST` | `/api/v1/runs` | none | `202` `SubmitRunResponse` | `400` `invalid_request` / `invalid_workload` / `invalid_source` / `invalid_path` · `413` `payload_too_large` · `415` `unsupported_media_type` · `429` `too_many_runs` · `500` `internal_error` |
| `GET` | `/api/v1/runs` | none | `200` `ListRunsResponse` | `400` `invalid_request` |
| `GET` | `/api/v1/runs/{runId}` | none | `200` `GetRunResponse` | `404` `run_not_found` |
| `GET` | `/api/v1/runs/{runId}/events` | none | `200` `ListEventsResponse` | `400` `invalid_request` · `404` `run_not_found` |
| `GET` | `/api/v1/runs/{runId}/report` | none | `200` `GetReportResponse` | `404` `run_not_found` · `409` `report_not_ready` |
| `POST` | `/api/v1/runs/{runId}/cancel` | none | `202` `CancelRunResponse` | `404` `run_not_found` · `409` `run_not_cancellable` |

**Auth: none in Phase 1.** This is explicit and deliberate (§1.2). The control plane binds `0.0.0.0` and is reachable by anyone who can reach it — which is why Phase 1 must be deployed behind the platform's own access control, and why auth is the first Phase 2 item. The judge-facing deployment must therefore have an ingress restriction of some kind; `deploy/bootstrap.sh` does **not** implement auth and this document does not pretend otherwise.

### 8.5 Route semantics that are easy to get wrong

- **`POST /api/v1/runs` returns `202`, not `201`.** The run has been accepted and recorded; it has not completed. The body is `SubmitRunResponse`, **not** a run detail.
- **`GET /api/v1/runs/{runId}/report` returns `409 report_not_ready`**, not `404`, when the run exists but is still going. A `404` would be indistinguishable from a typo'd id.
- **`GET /api/v1/runs` is newest-first**, paginated by `cursor` (an opaque, base64url-encoded `createdAt|id`). The default page size is 20.
- **`GET /api/v1/runs/{runId}/events` is a poll, not a stream.** `after` is a `seq` integer, so a poll is cheap and cannot miss an event. The `nextCursor` is `null` exactly when the run is terminal and all events have been delivered.
- **The `runId` in a path is validated** with a strict pattern (`^run_[0-9A-HJKMNP-TV-Z]{26}$`) before it reaches the store. A non-matching id returns `404 run_not_found` — not a `500`.
- **Every response carries `X-Request-Id`.**

### 8.5a The five UI states, and which HTTP outcome produces each

The console must render five distinct states. The control plane has **no auth in Phase 1**, so it never returns `401` itself. The mapping is therefore fixed like this, and the frontend must implement it exactly:

| UI state | Triggered by | What the console shows |
|---|---|---|
| **loading** | A request is in flight. | A skeleton or a spinner in the region being loaded. Never a blank panel. |
| **empty** | `GET /api/v1/runs` returns `runs: []`, or the fixture list is empty. | A deliberate empty state explaining what to do next. Not "No data". |
| **error** | Any `4xx` or `5xx` from the API. | The **generic** `error.message` from the envelope, prominently. The `error.code` small and monospaced. The `X-Request-Id` shown small, so a report can reference it. **Never** a stack, a provider message, or a raw body. |
| **success** | A `2xx` with data. | The data. |
| **unauthorized** | An HTTP `401` from the **reverse proxy or ingress** in front of the control plane, or a `403`. | "This deployment is access-controlled. Sign in or use the allowed access path." The console must not attempt to log in — Phase 1 has no auth flow. It must not loop on a 401. |

A `409 report_not_ready` is **not** an error state — it is a "not ready yet" state that the console renders as an in-progress placeholder on the report panel, and it retries on the next poll.

A `404 run_not_found` **is** an error state, distinct from the empty state: the run id was wrong or the run was never created.

### 8.6 The event stream

```ts
// backend/src/contracts/events.ts

/** Per-run monotonic sequence number. `after` in the events query is this. */
export type EventSeq = number;

/**
 * The run's lifecycle state. `queued` → `running` → a terminal status.
 * `phase` is the finer-grained position *within* `running`.
 */
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** The position within a run. `done` is the terminal phase of a finished run. */
export type RunPhase =
  | 'queued'
  | 'sandbox_starting'
  | 'containment_probe'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'reporting'
  | 'teardown'
  | 'done';

export type RunEventType =
  | 'run.queued'
  | 'run.started'
  | 'sandbox.created'
  | 'sandbox.probe'
  | 'agent.plan'
  | 'agent.message'
  | 'tool.call'
  | 'tool.result'
  | 'egress.attempt'
  | 'resource.sample'
  | 'sandbox.destroyed'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

export interface RunEvent {
  readonly seq: EventSeq;
  readonly runId: string;
  readonly at: string;
  readonly type: RunEventType;
  readonly phase: RunPhase;
  /** A short human label for the UI's event list. */
  readonly label: string;
  /** Type-specific detail. Always JSON-safe and free of secrets. */
  readonly detail: Readonly<Record<string, unknown>>;
}
```

**Phase 1 guarantees:** the event sequence is monotonic per run and never skips a number. The UI renders `type` to pick an icon and `label` for the text, and does not depend on the shape of `detail` beyond the fields it knows.

### 8.7 The workload descriptor

```ts
// backend/src/contracts/workload.ts

export interface WorkloadToolDescriptor {
  readonly name: string;
  readonly description: string;
  /** The JSON Schema for the tool's arguments. */
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface WorkloadDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The only source kind this workload accepts in Phase 1. */
  readonly sourceKinds: readonly ('fixture' | 'files')[];
  /** Limits the operator may choose from, and their defaults. */
  readonly limits: {
    readonly memoryBytes: readonly number[];
    readonly cpuSeconds: readonly number[];
    readonly wallClockMs: readonly number[];
  };
  /** The tools the model will be given. */
  readonly tools: readonly WorkloadToolDescriptor[];
  /** The objective success criterion, described for the operator. */
  readonly successCriterion: string;
}

export interface WorkloadFixture {
  readonly id: string;
  readonly workload: string;
  readonly name: string;
  readonly description: string;
  /** The task text pre-filled in the submit form. */
  readonly task: string;
  /** The project's files, so the operator can preview them. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
  /** The commands the agent is permitted to run. */
  readonly allowedCommands: readonly string[];
  /** The command that decides success. */
  readonly testCommand: string;
}
```

**The frontend must not hardcode the workload, the fixtures, or the tool list.** It fetches `/api/v1/workloads` and `/api/v1/fixtures` and builds the form from them. That is what makes adding a second workload in Phase 2 a backend change.

---

## 9. Persistence

### 9.1 The engine and the rules

- **`node:sqlite`** — built into Node 24. **No ORM, no query builder, no database server.** (Measured on this machine: `DatabaseSync` works natively on Node **24.19**, SQLite **3.53.3**.)
- The database file lives at `BRZ_DB_PATH` (default `path.join(os.tmpdir(), 'brz', 'brz.db')` in development, `/var/lib/brz/brz.db` under the systemd unit).
- **Pragmas**, set on every open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

- **WAL** because the control plane writes events continuously while the UI reads runs; WAL lets readers proceed during a write.
- **Every statement is prepared** and reused. No string interpolation into SQL anywhere.

### 9.2 The schema

The exact initial migration. This is the whole Phase 1 schema.

```sql
-- backend/src/db/migrations/001_initial.sql

CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL,
  checksum    TEXT    NOT NULL
);

CREATE TABLE runs (
  id                TEXT    PRIMARY KEY,              -- external id: run_<ULID>
  status            TEXT    NOT NULL,                 -- queued|running|succeeded|failed|cancelled
  phase             TEXT    NOT NULL,                 -- see RunPhase
  workload          TEXT    NOT NULL,
  goal              TEXT    NOT NULL,
  source_kind       TEXT    NOT NULL,                 -- fixture|files
  source_ref        TEXT    NOT NULL,                 -- fixture id, or a digest of the file set
  provider          TEXT    NOT NULL,                 -- bwrap|vultr-vm
  sandbox_id        TEXT,
  verdict           TEXT,                            -- contained|contained-with-denials|violated|incomplete
  error_code        TEXT,
  error_message     TEXT,                            -- generic, safe to show
  model_claim       TEXT,
  model_explanation TEXT,
  test_passed       INTEGER,                         -- 0|1|NULL (NULL = not measured)
  test_total        INTEGER,
  test_failures     INTEGER,
  iterations        INTEGER NOT NULL DEFAULT 0,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  denied_attempts   INTEGER NOT NULL DEFAULT 0,
  broker_token_hash TEXT    NOT NULL,                 -- sha256 of the per-run token; never the token
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  started_at        TEXT,
  finished_at       TEXT,
  wall_clock_ms     INTEGER
);

CREATE TABLE run_events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at           TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  phase        TEXT    NOT NULL,
  label        TEXT    NOT NULL,
  detail_json  TEXT    NOT NULL                       -- JSON object, no secrets
);

CREATE TABLE tool_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,   -- internal; never exposed
  run_id        TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,                    -- per-run ordinal, exposed
  tool_name     TEXT    NOT NULL,
  arguments_json TEXT   NOT NULL,                    -- redacted
  ok            INTEGER NOT NULL,                    -- 0|1
  error_code    TEXT,
  error_message TEXT,
  exit_code     INTEGER,
  signal        TEXT,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  stdout        TEXT    NOT NULL DEFAULT '',
  stderr        TEXT    NOT NULL DEFAULT '',
  bytes         INTEGER,
  outcome       TEXT    NOT NULL                     -- ok|non-zero-exit|killed|timed-out|refused
);

CREATE TABLE sandbox_lifecycle (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at         TEXT    NOT NULL,
  action     TEXT    NOT NULL,                       -- create|write|exec|destroy|probe
  provider   TEXT    NOT NULL,
  sandbox_id TEXT,
  ok         INTEGER NOT NULL,                       -- 0|1
  detail     TEXT,                                   -- generic; no provider raw text
  -- The containment probe result, stored as JSON on the 'probe' action.
  measurement_json TEXT
);

CREATE TABLE egress_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at          TEXT    NOT NULL,
  capability  TEXT    NOT NULL,                      -- fetch|file_out|credential
  url         TEXT,
  host        TEXT,
  verdict     TEXT    NOT NULL,                      -- allowed|denied
  reason      TEXT    NOT NULL,                      -- machine code
  origin      TEXT    NOT NULL,                      -- agent|containment-probe
  bytes       INTEGER,
  duration_ms INTEGER
);

CREATE TABLE resource_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at            TEXT    NOT NULL,
  wall_clock_ms INTEGER NOT NULL,
  memory_bytes  INTEGER,
  cpu_ms        INTEGER,
  process_count INTEGER
);

CREATE TABLE artifacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  kind       TEXT    NOT NULL,                       -- text|file
  content    TEXT,
  bytes      INTEGER NOT NULL DEFAULT 0,
  sha256     TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE blast_radius_reports (
  run_id        TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  report_version TEXT   NOT NULL,
  generated_at  TEXT   NOT NULL,
  verdict       TEXT   NOT NULL,
  report_json   TEXT   NOT NULL                      -- the full BlastRadiusReport
);

CREATE INDEX idx_run_events_run_seq     ON run_events (run_id, seq);
CREATE INDEX idx_tool_calls_run_seq     ON tool_calls (run_id, seq);
CREATE INDEX idx_egress_attempts_run_at ON egress_attempts (run_id, at);
CREATE INDEX idx_resource_samples_run_at ON resource_samples (run_id, at);
CREATE INDEX idx_runs_created_at        ON runs (created_at DESC);
CREATE INDEX idx_runs_status            ON runs (status);
CREATE INDEX idx_lifecycle_run_at       ON sandbox_lifecycle (run_id, at);
```

### 9.3 Column and constraint notes

| Note | Why it matters |
|---|---|
| `runs.id` **is** the external id. There is no surrogate key on `runs`. | Nothing internal is ever exposed. There is no mapping table to get wrong. |
| `tool_calls.id` is a surrogate key and is **never** exposed. The API addresses tool calls by `tool_calls.seq` (per-run ordinal). | Same rule as `AGENT.md` §7: internal identifiers stay internal. |
| `runs.broker_token_hash` stores the **SHA-256** of the per-run broker token. The raw token is never written to the database. | A database dump must not grant broker access. |
| `runs.test_passed` is `NULL` when the test run was never performed. It is **not** `0`. | "Not measured" and "measured as failing" are different facts. The report's `Measured<T>` encodes the same distinction. |
| `runs.source_ref` for a `files` source is a **digest** of the file set (SHA-256 over path+content, sorted), not the file contents. | The submitted project is stored once, in the run's work directory and in `artifacts`; the `runs` row stays small. |
| `sandbox_lifecycle.measurement_json` holds the containment probe on the `probe` action. | The report's containment facts come from a persisted record, not from memory. |
| `blast_radius_reports.report_json` stores the whole report. | The report is immutable once written. It is the evidence. |
| `ON DELETE CASCADE` on every child table. | Deleting a run removes its evidence. A run is never deleted in Phase 1; the cascade is a safety net. |
| `detail_json` and `arguments_json` are JSON **text**, not a JSON column. | `node:sqlite` has no JSON type; text + a typed accessor in the store layer is the honest choice. |

### 9.4 The migration mechanism

- Migrations are **numbered, ordered SQL files** in `backend/src/db/migrations/`: `001_initial.sql`, `002_<name>.sql`, …
- `backend/src/db/migrate.ts`:
  1. opens the database and applies the pragmas,
  2. creates `schema_migrations` if it does not exist,
  3. reads the applied versions,
  4. applies every migration file whose version is greater than the highest applied version, **in ascending order**, each in its own transaction,
  5. records `version`, `name`, `applied_at` (ISO 8601), and `checksum` (SHA-256 of the file text) in `schema_migrations`,
  6. **fails loudly** if a recorded checksum does not match the file on disk — that means a migration was edited after being applied.
- Migrations are **additive and re-runnable where practical**: use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE … ADD COLUMN` for evolutions. A migration that rewrites an already-applied migration is forbidden (`AGENTS/permissions/PROTOCOL.md` §3).
- The migration runner runs at **server startup**, before the listener binds. If it fails, the server does **not** start and `/healthz` reports `database.state: 'error'`. It never starts in a half-migrated state.
- `DBMASTER` still gates schema changes. Phase 1's schema above is the reviewed initial migration; DBMASTER's brief verifies it (§13).

### 9.5 The queries the implementers will need

Every one of these is answerable directly from §9.2. The store layer exposes one typed function per row:

| Function | SQL |
|---|---|
| `createRun(run)` | `INSERT INTO runs (…) VALUES (…)` |
| `getRun(runId)` | `SELECT * FROM runs WHERE id = ?` |
| `listRuns(cursor, limit)` | `SELECT * FROM runs WHERE (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?` |
| `updateRun(runId, patch)` | `UPDATE runs SET … WHERE id = ?` |
| `appendEvent(event)` | `INSERT INTO run_events (run_id, at, type, phase, label, detail_json) VALUES (?, ?, ?, ?, ?, ?)` |
| `listEvents(runId, after, limit)` | `SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?` |
| `appendToolCall(rec)` | `INSERT INTO tool_calls (…) VALUES (…)` |
| `listToolCalls(runId)` | `SELECT * FROM tool_calls WHERE run_id = ? ORDER BY seq ASC` |
| `appendLifecycle(rec)` | `INSERT INTO sandbox_lifecycle (…) VALUES (…)` |
| `getProbe(runId)` | `SELECT measurement_json FROM sandbox_lifecycle WHERE run_id = ? AND action = 'probe' ORDER BY id DESC LIMIT 1` |
| `appendEgressAttempt(rec)` | `INSERT INTO egress_attempts (…) VALUES (…)` |
| `listEgressAttempts(runId)` | `SELECT * FROM egress_attempts WHERE run_id = ? ORDER BY at ASC` |
| `appendResourceSample(s)` | `INSERT INTO resource_samples (…) VALUES (…)` |
| `lastResourceSample(runId)` | `SELECT * FROM resource_samples WHERE run_id = ? ORDER BY id DESC LIMIT 1` |
| `appendArtifact(a)` | `INSERT INTO artifacts (…) VALUES (…)` |
| `listArtifacts(runId)` | `SELECT * FROM artifacts WHERE run_id = ? ORDER BY id ASC` |
| `putReport(report)` | `INSERT INTO blast_radius_reports (…) VALUES (…) ON CONFLICT(run_id) DO UPDATE SET …` |
| `getReport(runId)` | `SELECT report_json FROM blast_radius_reports WHERE run_id = ?` |

**Cursor pagination.** The cursor is `base64url(JSON.stringify([createdAt, id]))`. The comparison `(created_at, id) < (?, ?)` is a row-value comparison, which SQLite supports.

**Redaction.** `arguments_json` is written with a redactor that replaces the value of any key matching `/token|key|secret|password|authorization/i` with `"[redacted]"`, and truncates any string value over 4 KiB. The redactor is applied **before** the insert, every time.

---

## 10. File layout

> The repository is a **single npm workspace** rooted at the repo root (`docs/MONOREPO.md`, `package.json`, `tsconfig.base.json` — the last two are **HEAD's files and are already written**). This section describes the files **inside** each workspace. The top-level layout is fixed and is not redesigned here.

```
brz/
├── package.json                  # ★ HEAD's — root workspace manifest. Already written.
├── tsconfig.base.json            # ★ HEAD's — shared strictness. Already written.
├── package-lock.json             # ★ HEAD's — ONE lockfile for the whole repo.
├── node_modules/                 # hoisted — ONE install, at the root.
├── backend/                      # workspace package "backend"   → BACKEND owns everything here
├── frontend/                     # workspace package "frontend"  → FRONTEND owns everything here
├── deploy/                       # NOT an npm package: shell + systemd + templates → BACKEND (brief 06)
├── docs/                         # ARCHITECT · BUSINESS · DESIGNER
└── AGENTS/                       # the harness
```

```
backend/                          ← workspace package "backend"
├── package.json                  # ★ HEAD's — name "backend", type:module, scripts, deps (§10.3)
├── tsconfig.json                 # extends ../../tsconfig.base.json; adds only what differs (§10.4)
├── src/
│   ├── server.ts                 # node:http server, route table, /healthz, request id
│   ├── config.ts                 # env parsing; fails closed; nothing hardcoded
│   ├── contracts/                # ★ the frozen cross-boundary types (§10.1)
│   │   ├── api.ts                # request/response types, error envelope, messages
│   │   ├── events.ts             # RunEvent, RunEventType, RunStatus, RunPhase
│   │   ├── report.ts             # BlastRadiusReport + Measured<T>
│   │   ├── sandbox.ts            # ★ SandboxProvider and every sandbox type
│   │   ├── broker.ts             # the broker wire protocol
│   │   └── workload.ts           # WorkloadDescriptor, WorkloadFixture
│   ├── http/
│   │   ├── router.ts             # tiny method+path router over node:http
│   │   ├── errors.ts             # ApiError, the code→status map, the envelope
│   │   ├── validate.ts           # boundary validation; throws ApiError(400)
│   │   └── json.ts               # body read (size-capped) + safe parse
│   ├── inference/
│   │   ├── client.ts             # OpenAI-compatible client; typed errors; retries
│   │   ├── types.ts              # ChatCompletion request/response shapes
│   │   └── mock.ts               # deterministic offline mode (BRZ_INFERENCE_MODE=mock)
│   ├── agent/
│   │   ├── loop.ts               # plan→execute→explain; caps; the repair retry
│   │   ├── prompt.ts             # the frozen system prompt (§7.2)
│   │   ├── tools.ts              # the 4 tool definitions + dispatch + validation
│   │   └── workload.ts           # the self-healing-runner profile + fixtures
│   ├── runs/
│   │   ├── manager.ts            # state machine, AbortController, orchestration
│   │   ├── report.ts             # report assembly from persisted records
│   │   ├── standinProvider.ts    # ★ the NON-SEALED stand-in (brief 04 only) — see §10.2
│   │   └── ids.ts                # ULID-style external id generation
│   ├── db/
│   │   ├── sqlite.ts             # open + pragmas
│   │   ├── migrate.ts            # the migration runner; also runnable as a script
│   │   ├── migrations/
│   │   │   └── 001_initial.sql   # the schema of §9.2, verbatim
│   │   └── store/
│   │       ├── runs.ts           # runs table
│   │       ├── events.ts         # run_events table
│   │       ├── toolCalls.ts      # tool_calls table
│   │       ├── sandbox.ts        # sandbox_lifecycle table
│   │       ├── egress.ts         # egress_attempts table
│   │       ├── resources.ts      # resource_samples table
│   │       ├── artifacts.ts      # artifacts table
│   │       └── reports.ts        # blast_radius_reports table
│   ├── sandbox/                  # ← BRIEF 06 ONLY
│   │   ├── bwrap.ts              # BwrapProvider: the real local tier
│   │   ├── vultr.ts              # VultrVMProvider: the prod tier (mocked)
│   │   ├── vultrApi.ts           # the Vultr API client (base URL from env)
│   │   ├── cgroup.ts             # cgroup discovery, setup, sampling, teardown
│   │   ├── limits.ts             # the default limits and the rlimit table
│   │   └── probe.ts              # the containment probe script + its parser
│   ├── broker/                   # ← BRIEF 06 ONLY
│   │   ├── server.ts             # the UDS broker + capability policy
│   │   ├── allowlist.ts          # the egress allowlist
│   │   └── helper.ts             # generates the brz_net.py helper module
│   ├── egress/
│   │   └── proxy.ts              # the allowlist-enforcing fetch proxy
│   ├── routes/
│   │   ├── runs.ts               # the /api/v1/runs routes
│   │   ├── workloads.ts          # /api/v1/workloads
│   │   └── fixtures.ts           # /api/v1/fixtures
│   └── demo/
│       └── run-demo.ts           # the §12 demo scenario, one command
└── test/
    ├── unit/                     # config, error mapping, agent loop, report assembly
    ├── integration/              # routes end to end against a temp database
    ├── containment/              # the four containment assertions (brief 06)
    └── fixtures/
        ├── vultrApiMock.ts       # the scripted Vultr API mock (§4.6)
        ├── inferenceScripts.ts   # the mock inference transcripts
        └── workloads.ts          # the fixture projects
```

```
frontend/                         ← workspace package "frontend"
├── package.json                  # ★ HEAD's — name "frontend", type:module, scripts, deps (§10.3)
├── tsconfig.json                 # extends ../../tsconfig.base.json; the APP. types: [] (§10.4)
├── tsconfig.node.json            # extends ../../tsconfig.base.json; vite.config.ts; types: ["node"]
├── vite.config.ts                # the dev proxy; the target comes from BRZ_API_TARGET (§10.6)
├── index.html
└── src/
    ├── main.tsx                  # the React entry
    ├── App.tsx                   # the shell: list ↔ run ↔ report
    ├── lib/
    │   ├── types.ts              # ★ hand-copied mirror of backend/src/contracts/* (§10.5)
    │   ├── api.ts                # the fetch client; relative paths only
    │   ├── fixtures.ts           # the offline fixture set (4 fixtures)
    │   └── format.ts             # bytes, durations, timestamps
    ├── hooks/
    │   ├── useRuns.ts            # list + poll
    │   └── useRun.ts             # one run + its event stream
    ├── components/
    │   ├── RunList.tsx
    │   ├── SubmitForm.tsx
    │   ├── RunView.tsx
    │   ├── EventStream.tsx
    │   ├── ResultPanel.tsx
    │   ├── ReportPanel.tsx       # ★ the five-second panel
    │   ├── States.tsx            # loading / empty / error / success / unauthorized
    │   └── tokens.css            # the spacing, type, and colour tokens
    └── styles/                   # app.css
```

### 10.1 One line per file, saying what it owns

The tree above annotates the non-obvious ones. The rule for the rest:

> **A file owns exactly one thing. If a file's name does not tell you what it owns, rename it.**

### 10.2 The scope boundary that matters — `contracts/` vs `sandbox/`

Brief `04` may write `backend/**` **except** `backend/src/sandbox/**` and `backend/src/broker/**`; brief `06` owns those two subtrees plus `deploy/**`. The `SandboxProvider` interface must live **somewhere both can reach without either one owning a file the other also owns**.

> **Decision: the frozen interface and every cross-boundary type live in `backend/src/contracts/`, which brief 04 owns. Brief 06 owns only the *implementations*.**

- `backend/src/contracts/sandbox.ts` — the `SandboxProvider` interface and all sandbox types. **Written once, in brief 04. Not re-declared anywhere.**
- `backend/src/sandbox/**` — `BwrapProvider`, `VultrVMProvider`, the cgroup helper, the limits, the probe. **Brief 06 only.**
- `backend/src/broker/**` — the broker server, the allowlist, the helper generator. **Brief 06 only.**

**Brief 04 therefore implements a stand-in provider** so the system runs end to end, and places it at `backend/src/runs/standinProvider.ts` — **inside brief 04's own scope**, not inside `sandbox/`. It MUST be named and documented as a **non-sealed stand-in**:

```
/**
 * STAND-IN — NOT CONTAINED.
 *
 * This implementation exists only so the control plane runs end to end
 * before the sealed tier lands. It does NOT satisfy the containment
 * requirements: it has no namespace isolation, no cgroup caps, and no
 * network namespace. Brief 06 replaces it with BwrapProvider.
 *
 * The report produced by this stand-in MUST carry
 *   containment.*.state = 'not-measured'
 * and verdict = 'incomplete'.
 */
```

**This is a hard requirement, and it is mechanically checkable:** a report produced by the stand-in **must not** claim `verdict: 'contained'`. It must be `incomplete`. A stand-in that claims containment is a false claim in a product whose entire value is truthful reports.

### 10.3 Dependencies — the exact list the HEAD writes into the workspace manifests

**The manifests are HEAD's.** Per `docs/MONOREPO.md` rule 2, the HEAD writes `backend/package.json`, `frontend/package.json`, and the root lockfile **between wave 1 and wave 2**, using the dependency list below, then runs **one** `npm install` at the root. Workers write **source only** and never touch a manifest or a lockfile. This section is the input the HEAD needs.

**Backend — runtime dependencies: none.** Node 24 provides `node:http`, `node:sqlite`, `node:crypto`, `node:child_process`, `node:test`, and native `fetch`. There is no Express, no Zod, no ORM, no `dotenv` (`--env-file` is built in).

**Backend — devDependencies:**

| Package | Why |
|---|---|
| `typescript` | `tsc --noEmit` for the typecheck gate. |
| `@types/node` | Node's own types. |

**Frontend — dependencies:**

| Package | Why |
|---|---|
| `react`, `react-dom` | The stack decision. |
| `vite`, `@vitejs/plugin-react` | The stack decision. |

**Frontend — devDependencies:** `typescript`, `@types/react`, `@types/react-dom`, `@types/node`.

> **`@types/node` in the frontend is for `vite.config.ts` only** — it needs `process` and `node:url`. It is **not** part of the app's type environment: the app's `tsconfig.json` sets `"types": []`, so `NodeJS.Timeout` and friends never leak into React components. The standard two-file Vite split is used (§10.4).

**No router, no state library, no CSS framework, no component library, no markdown renderer, no test framework.** The agent's output is rendered as **text** in a `<pre>`-styled block or as a real table — never as HTML.

**The frontend's `package.json` must not import from `backend/`.** There is no shared package. The types are **hand-copied** from `backend/src/contracts/*` into `frontend/src/lib/types.ts`, and a drift check in CI compares the two files' exported type names.

**The backend's `package.json` must set `"type": "module"`.** The root manifest's `"type": "module"` does **not** apply to files under `backend/`, because `backend/package.json` is the nearest manifest. This is required by `verbatimModuleSyntax` (measured: `TS1287 — a top-level 'export' modifier cannot be used on value declarations in a CommonJS module when 'verbatimModuleSyntax' is enabled`).

### 10.4 How the code runs — no build step, and why it cannot have one

Node 24 runs TypeScript directly via native type stripping. Measured on this machine (Node **24.19**, `process.features.typescript === 'strip'`):

- `node src/server.ts` works.
- **Relative imports must carry the `.ts` extension** (`import { f } from './mod.ts'`). Without it: `ERR_MODULE_NOT_FOUND`. Measured.
- **Non-erasable syntax is rejected** — `enum` fails. Measured. `backend/tsconfig.json` therefore adds `"erasableSyntaxOnly": true` so the compiler catches it too.
- **A `tsc` emit build is impossible for the backend, and this is a hard constraint, not a preference.** With `.ts` import specifiers, `allowImportingTsExtensions` must be on — and TypeScript then refuses to emit: `TS5096 — Option 'allowImportingTsExtensions' can only be used when either 'noEmit' or 'emitDeclarationOnly' is set.` **Measured.** The backend therefore has **no emit step** and no `dist/`.

**Workspace `tsconfig.json` files.** Each extends the root base and supplies only what differs — the base owns the strictness flags, so the two packages cannot drift.

`backend/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "noEmit": true,                      // no emit step — see above
    "allowImportingTsExtensions": true,  // required by the .ts import specifiers
    "erasableSyntaxOnly": true           // required by Node's type stripping
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`frontend/tsconfig.json` — the **app**. `"types": []` keeps the Node globals out of the React code:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": [],            // no Node globals in app code
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json` — the **build config** (`vite.config.ts`). This is where `@types/node` is allowed:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

**The workspace scripts.** The root fans out with `--workspaces --if-present`, so **every workspace must define `typecheck`, `test`, `build`, `dev` and `lint`**, or the root fan-out silently skips it.

`backend/package.json` scripts:

| Script | Command | Notes |
|---|---|---|
| `dev` | `node --env-file-if-exists=../.env --watch src/server.ts` | `--env-file-if-exists` is used in dev so a missing `.env` does not crash the watcher; `config.ts` still fails closed on a missing required variable. Measured: Node 24 prints `./nonexistent.env not found. Continuing without it.` and exits 0. |
| `typecheck` | `tsc --noEmit` | The backend's typecheck **is** its build. |
| `build` | `tsc --noEmit` | There is nothing to emit (§10.4). The script exists so the root fan-out does not skip the backend. |
| `test` | `node --test test/**/*.test.ts` | |
| `lint` | `tsc --noEmit` | No linter dependency. The typechecker is the gate; a real linter is Phase 2. |
| `start` | `node --env-file=../.env src/server.ts` | |
| `migrate` | `node --env-file=../.env src/db/migrate.ts` | Also runnable directly; `deploy/bootstrap.sh` calls it explicitly. |
| `demo` | `node --env-file=../.env src/demo/run-demo.ts` | The §12 scenario. |
| `demo:offline` | `BRZ_INFERENCE_MODE=mock node --env-file=../.env src/demo/run-demo.ts` | The byte-deterministic variant. |

`frontend/package.json` scripts: `dev` → `vite` · `typecheck` → `tsc --noEmit` · `build` → `vite build` · `test` → a no-op that exits `0` (the frontend has no test framework in Phase 1) · `lint` → `tsc --noEmit` · `preview` → `vite preview`.

**The root `build` therefore fans out to: `backend` → `tsc --noEmit`, `frontend` → `vite build`.** The only artifact produced is the frontend bundle in `frontend/dist/`. The backend ships as source, and the systemd unit runs `node …/src/server.ts`.

### 10.5 The type mirror, and why there is no shared package

`frontend/src/lib/types.ts` is a **hand-copied** mirror of `backend/src/contracts/*.ts`. It is not imported from `backend/`.

The alternative — a third workspace package, e.g. `@brz/contracts` — was rejected for three reasons:

1. **It would be a file two agents would both want to create**, which is exactly what the scope-lock rules exist to prevent (§10.7).
2. **A shared package forces a build step** for the backend, and §10.4 shows the backend cannot have one.
3. **The types are the contract, and the contract is this document.** The drift check (§13, M5) is a five-line CI job that compares the exported type names in the two files. A shared package would make drift *impossible* but would also make the contract implicit; keeping it explicit and checked is the better trade for a five-day build.

### 10.6 The dev proxy — the only hop between browser and backend

The browser calls **relative paths only** (`/api/v1/runs`). Vite's dev server proxies `/api` to the backend.

```ts
// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv with an EMPTY prefix loads EVERY variable from .env, including
  // non-VITE_ ones. Only VITE_-prefixed variables reach the browser bundle.
  //
  // envDir is resolved relative to the CWD, and the dev server's CWD is
  // `frontend/` — so '../' is the REPOSITORY ROOT, where .env lives in a
  // monorepo. It is not `process.cwd()`: that would be `frontend/` and would
  // silently miss the root .env.
  const env = loadEnv(mode, '../', '');
  const target = env.BRZ_API_TARGET;
  if (!target) {
    throw new Error(
      'BRZ_API_TARGET is not set. Point it at the control plane, e.g. ' +
      'BRZ_API_TARGET=http://127.0.0.1:8787 . It is read server-side only ' +
      'and is never exposed to the browser.',
    );
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
```

**Rules for the proxy, all testable:**

- The proxy path is **`/api`**, and it forwards the path **unchanged**: the browser's `/api/v1/runs` arrives at the backend as `/api/v1/runs`. There is no prefix stripping.
- The target comes from **`BRZ_API_TARGET`**, a **server-side** env var. It is **not** `VITE_`-prefixed, so Vite never inlines it into the bundle.
- `BRZ_API_TARGET` is **required**. Vite **fails to start** without it — fail closed, no default target baked into the config.
- No absolute backend URL, no port literal, and no `VITE_` secret appears anywhere in `frontend/src` or `frontend/vite.config.ts`. A CI grep asserts it (§13, H2).
- The **production** build is served by the control plane itself, which serves `frontend/dist/` as static files and `/api/v1/*` from the same origin. In production there is no proxy at all — the same origin does the work.

### 10.7 Ownership — and the answer to "is there a file both would want to create?"

| Path | Owner | Brief |
|---|---|---|
| `backend/**` (except `backend/src/sandbox/**`, `backend/src/broker/**`) | **BACKEND** | 04 |
| `backend/src/sandbox/**` | **BACKEND** | 06 |
| `backend/src/broker/**` | **BACKEND** | 06 |
| `deploy/**` | **BACKEND** | 06 |
| `frontend/**` | **FRONTEND** | 05 |
| `package.json`, `tsconfig.base.json`, `package-lock.json`, `backend/package.json`, `frontend/package.json` | **HEAD** | between wave 1 and wave 2 |

**Files both agents would want to create — and how each is resolved:**

| Contended file | Resolution |
|---|---|
| The shared type definitions | **`backend/src/contracts/` is BACKEND's.** FRONTEND hand-copies the types into `frontend/src/lib/types.ts` (§10.5). The *source of truth* is this document, not a file either agent edits twice. |
| A `README` for the repo | **DOCS owns it.** Neither backend nor frontend writes a root README. |
| The environment template | **HEAD owns `.env.example`**; `deploy/.env.template` is BACKEND's (brief 06). They must agree — `deploy/.env.template` is generated from `.env.example`'s variable list, and a CI check compares the variable names. |
| A CI workflow | **GITMASTER owns `.github/**`.** It runs the root `npm ci` and the root fan-out scripts. |
| The demo script | **BACKEND owns `backend/src/demo/run-demo.ts` and `deploy/demo.sh`.** FRONTEND does not write a demo; the demo drives the API, and the console is a separate artifact. |

**The answer: there is exactly one contended file — the type definitions — and it is resolved by a one-way copy plus a CI drift check.** No file is written by both agents in the same wave.

### 10.8 The environment contract

**Every value is from the environment. Nothing is hardcoded — no host, no port, no key, no model, no URL.**

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | — | Inference credential. Never enters the sandbox. |
| `OPENAI_ENDPOINT` | yes | — | OpenAI-compatible base URL. Must be `https://` in production. |
| `OPENAI_MODEL` | yes | — | Model id. |
| `OPENAI_TIMEOUT_MS` | no | `60000` | Per-request inference timeout. |
| `OPENAI_MAX_RETRIES` | no | `2` | Retries on `429`/`5xx`. |
| `PORT` | no | `8787` | Control-plane port. |
| `HOST` | no | `0.0.0.0` | Bind address. |
| `NODE_ENV` | no | `development` | `production` forces live inference and disables mock mode. |
| `BRZ_INFERENCE_MODE` | no | `live` | `mock` for the deterministic offline mode. Ignored in production. |
| `BRZ_DB_PATH` | no | `<tmpdir>/brz/brz.db` | The SQLite file. |
| `BRZ_WORK_ROOT` | no | `<tmpdir>/brz/runs` | The parent of the per-run work directories. |
| `BRZ_SANDBOX_PROVIDER` | no | `bwrap` | `bwrap` or `vultr-vm`. |
| `BRZ_FORCE_CGROUP` | no | `auto` | `auto` discovers the cgroup; `off` forces the rlimit-only path (used by C6b); `on` fails the run if no cgroup is available. |
| `BRZ_EGRESS_ALLOWLIST` | no | *(empty)* | Comma-separated hostnames. **Empty means everything is denied.** |
| `BRZ_EGRESS_MAX_BYTES` | no | `262144` | Cap on a brokered response body. |
| `BRZ_MAX_TOOL_CALLS` | no | `12` | Iteration cap. |
| `BRZ_MAX_REPAIRS` | no | `2` | Repair attempts. |
| `BRZ_MAX_TOTAL_TOKENS` | no | `24000` | Token budget for one run. |
| `BRZ_RUN_WALL_CLOCK_MS` | no | `120000` | The run's wall-clock budget. |
| `BRZ_SANDBOX_MEMORY_BYTES` | no | `134217728` | cgroup `memory.max`. |
| `BRZ_SANDBOX_CPU_SECONDS` | no | `60` | cgroup `cpu.max` quota, in seconds per 100 ms period. |
| `BRZ_SANDBOX_MAX_PROCESSES` | no | `64` | cgroup `pids.max`. |
| `BRZ_SANDBOX_MAX_FILE_BYTES` | no | `1048576` | `RLIMIT_FSIZE`. |
| `BRZ_SANDBOX_MAX_OUTPUT_BYTES` | no | `65536` | Collected output cap. |
| `BRZ_SANDBOX_MAX_OPEN_FILES` | no | `256` | `RLIMIT_NOFILE`. |
| `BRZ_VULTR_API_BASE` | tier 2 only | — | Vultr API base URL. |
| `BRZ_VULTR_API_KEY` | tier 2 only | — | Vultr API key. |
| `BRZ_VULTR_REGION` | tier 2 only | — | Region id. |
| `BRZ_VULTR_PLAN` | tier 2 only | — | Plan id. |
| `BRZ_VULTR_SSHKEY_ID` | tier 2 only | — | SSH key id installed on the instance. |
| `BRZ_PUBLIC_BASE_URL` | tier 2 only | — | The control plane's public URL, for the HTTPS broker transport. |
| `BRZ_API_TARGET` | frontend only | — | The dev proxy's backend target, read from the **repository-root** `.env`. **Required**; Vite fails to start without it. |

**Where the values live.** The **repository-root `.env`** holds the values for local development. It is gitignored; `.env.example` is the blank template; `scripts/envcheck.sh` verifies presence without printing values. In production, the values live in `/etc/brz/.env`, mode `0600`, owned by `brz` — and the systemd unit points at it with an absolute `--env-file`.

**Fail-closed rules**, enforced in `config.ts` at startup:

1. A missing required variable → the process **exits with a non-zero code** and a message naming the **variable name** (never its value).
2. `OPENAI_ENDPOINT` must start with `https://` when `NODE_ENV=production`. In development, `http://` is allowed.
3. `NODE_ENV=production` and `BRZ_INFERENCE_MODE=mock` → **refuse to start**. The mock must never be reachable in production.
4. There is **no default provider, model, host, or key**. The only defaults in the table above are for ports, limits, and paths.


## 11. The Vultr portability contract

> "When the kickoff starts and I migrate the codebase onto their infrastructure, it should sit perfectly." — `docs/VISION.md` §4

`docs/VISION.md` §4 lists **nine** rules. Rule 6 contains **two** independently testable obligations, so this document states **ten** criteria. The count difference is deliberate and is recorded here so nobody thinks a rule went missing.

### 11.1 The ten criteria, and how each is verified

| # | Criterion | How it is verified |
|---|---|---|
| **C1** | **All config is env. No host, port, key, model, or URL in source.** | `grep -rnE 'localhost\|127\.0\.0\.1\|0\.0\.0\.0\|https?://\|gsk_\|groq\|vultr' backend/src --include='*.ts' \| grep -v '^\s*//'` returns **nothing** except lines in `contracts/` that are **type-only literals** (`'unix-socket'`, `'https'` as a transport tag) and comments. A CI job runs this and fails the build. |
| **C2** | **The inference client is provider-agnostic.** Changing to Vultr = editing 3 lines of `.env`. No code change, no rebuild. | `cp .env .env.dev && sed -i 's|OPENAI_ENDPOINT=.*|OPENAI_ENDPOINT=https://api.vultrinference.com/v1|; s|OPENAI_MODEL=.*|OPENAI_MODEL=<vultr-model>|' .env && npm run start --workspace backend` → the control plane starts and a run reaches the model. `git diff --stat` shows **no source change**. |
| **C3** | **The sandbox is behind an interface.** Swapping `BwrapProvider` → `VultrVMProvider` is a config flag, not a rewrite. | `BRZ_SANDBOX_PROVIDER=vultr-vm npm start` → the run manager creates a `VultrVMProvider`. Assert: `grep -rn "BwrapProvider\|VultrVMProvider" backend/src --include='*.ts'` returns hits **only** in `sandbox/`, `config.ts`, and the provider factory. No business-logic file names either provider. |
| **C4** | **One-command deployment.** A fresh Vultr Ubuntu 24.04 instance + `bash deploy/bootstrap.sh` = a running, health-checked service. | On a clean Ubuntu 24.04 container: `bash deploy/bootstrap.sh` exits `0` and `curl -fsS http://<host>:8787/healthz` returns `200` with `status: "ok"`. |
| **C5** | **Bind `0.0.0.0`; `PORT` from env; `/healthz` exists.** No `localhost` assumption anywhere in the server. | `ss -ltnp \| grep :8787` shows the socket bound to `0.0.0.0:8787`, not `127.0.0.1`. `PORT=9999 npm run start --workspace backend` → the listener is on `9999`. `curl -fsS /healthz` → `200`. |
| **C6a** | **No local-only paths in production code.** | `grep -rn '/mnt/ee\|/home/asayman\|/tmp/opencode' backend/src frontend/src deploy --include='*.ts' --include='*.sh'` returns nothing. Work directories come from `BRZ_WORK_ROOT`; the database from `BRZ_DB_PATH`. |
| **C6b** | **cgroup v2 is optional. The system works without it, and says so.** | `BRZ_FORCE_CGROUP=off npm test` → the containment suite still passes, and every report produced under that flag carries `resources.enforcement: "rlimit-only"` and `containment.resourceLimits.value.enforcement: "rlimit-only"`. **A run must never claim a cgroup cap it did not apply.** |
| **C7** | **Idempotent bootstrap.** A second run is a no-op, not a crash. | `bash deploy/bootstrap.sh && bash deploy/bootstrap.sh` → the second run exits `0`, prints `already installed` / `already active` for each step, and changes nothing. Assert: `systemctl is-enabled brz` is `enabled` after both. |
| **C8** | **Clean-clone reproducible.** `git clone → write .env → run` works with no hidden state. | `git clone <repo> /tmp/brz-clean && cd /tmp/brz-clean && cp .env.example .env && $EDITOR .env && npm ci && npm run typecheck && npm test` → all green, from a directory that has never run BRZ. **One `npm ci` at the root** — never `npm ci` inside a workspace. The database directory is created by the app if missing. |
| **C9** | **The Vultr tier ships written but untested, with the Vultr API behind a mock in unit tests.** | `npm test` includes the `VultrVMProvider` suite against the scripted mock, covering all nine cases in §4.6 — **including destroy failure**. A test asserts a leaked instance is reported, not hidden. |
| **C10** | **The control plane is `node:sqlite` only.** No database server, no ORM, no migration tool, no build step. | `grep -rn 'better-sqlite3\|prisma\|typeorm\|knex\|sequelize\|drizzle\|pg\|mysql' backend/package.json` returns nothing. `backend/package.json` has **no** `dependencies` block at all. `node --test` runs the suite directly from `.ts` sources. |

### 11.2 What `deploy/bootstrap.sh` must do on a fresh Ubuntu 24.04 instance

Idempotent at every step. Each step prints `→ <action>` or `  already <state>, skipping`.

| Step | Action | Idempotence check |
|---|---|---|
| 1 | **Assert the OS.** `lsb_release -ds` must contain `Ubuntu` and the version must be `24.04`. Otherwise: print the detected version and **exit 1**. | — |
| **2** | **Install the runtime.** Node 24 from NodeSource (`https://deb.nodesource.com/setup_24.x` + `apt-get install -y nodejs`). Verify `node --version` starts with `v24`. | `command -v node && node --version \| grep -q '^v24'` → skip. |
| 3 | **Install `bubblewrap`.** `apt-get install -y bubblewrap`. | `command -v bwrap` → skip. |
| 4 | **Ensure the cgroup v2 hierarchy.** Check `stat -fc %T /sys/fs/cgroup` is `cgroup2fs`. If it is `tmpfs`, mount it: `mount -t cgroup2 none /sys/fs/cgroup` and persist it in `/etc/fstab`. If the hierarchy is not writable by the service user, **do not fail** — the provider will fall back to rlimits and say so (C6b). | `stat -fc %T /sys/fs/cgroup \| grep -q cgroup2fs` → skip. |
| 5 | **Create the service user and directories.** `brz` system user, no login shell. `install -d -o brz -g brz /opt/brz /var/lib/brz /var/lib/brz/runs /etc/brz`. | `id brz` → skip. |
| 6 | **Install the application.** Copy the repo (or the tarball the operator provides) to `/opt/brz`. `npm ci --omit=dev --workspace backend --include-workspace-root=false` **at the repo root** — never `npm ci` inside a workspace, and never a second lockfile. | `/opt/brz/node_modules` exists and the root `package-lock.json` is unchanged → skip. |
| 7 | **Write `.env` from `deploy/.env.template`.** Fill in `OPENAI_API_KEY`, `OPENAI_ENDPOINT`, `OPENAI_MODEL` from the environment if present; **otherwise leave the placeholders and fail closed at the end**. Set `PORT`, `BRZ_DB_PATH=/var/lib/brz/brz.db`, `BRZ_WORK_ROOT=/var/lib/brz/runs`. `chmod 600`, `chown brz:brz`. | `.env` exists and is not the template → skip (but still report missing required values). |
| 8 | **Install the systemd unit** `deploy/brz.service` to `/etc/systemd/system/brz.service`, then `systemctl daemon-reload` and `systemctl enable --now brz`. The unit sets `WorkingDirectory=/opt/brz/backend`, `ExecStart=/usr/bin/node --env-file=/etc/brz/.env /opt/brz/backend/src/server.ts`, `User=brz`, `Restart=on-failure`, `RestartSec=5`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/brz`, `PrivateTmp=no` (the work root is outside `/tmp`), `LimitNOFILE=4096`. | `systemctl is-enabled brz` is `enabled` and `systemctl is-active brz` is `active` → skip. |
| 9 | **Run the migrations.** The server does this at startup; the bootstrap also runs `node --env-file=/etc/brz/.env /opt/brz/backend/src/db/migrate.ts` explicitly so a migration failure surfaces at provision time, not at first request. | The `schema_migrations` table has the expected version → skip. |
| 10 | **Health-check.** Poll `http://127.0.0.1:${PORT}/healthz` for up to 60 s. Require `200` **and** `status: "ok"` **and** `database.state: "ready"`. | The service is already healthy → skip. |
| 11 | **Print the summary.** The public URL, the health URL, the service status, the provider, and whether cgroup v2 was available. | — |

**Bootstrap rules:**

- **It must be re-runnable.** Every step is guarded by an "already in the desired state" check. The second run must be a no-op.
- **It must fail closed.** If `OPENAI_API_KEY`, `OPENAI_ENDPOINT`, or `OPENAI_MODEL` are missing from the environment and `.env` is still the template, it **exits 1** with a message naming the missing **variable names** — and it does so *before* starting the service.
- **It must not require a database server, Docker, or a build step.**
- **It must not hardcode the provider, the model, or the host.** Everything comes from `.env`.

---

## 12. The demo scenario

> **Name: `SHR-1 — One-Line Fix, One Blocked Fetch.**
> **Single command: `npm run demo --workspace backend` from the repo root** (equivalently `cd backend && npm run demo`, or `bash deploy/demo.sh` from the repo root).

### 12.1 What the operator does

The operator opens the console, sees the submit form pre-filled with the `shr-sum-range` fixture, and presses **Run**. Or, headless, they run one command:

```sh
npm run demo --workspace backend
```

The script reads the repository-root `.env` (the backend's `demo` script uses `--env-file=../.env`, and `--env-file-if-exists` is used for `dev` so a missing `.env` does not crash the watcher — `config.ts` still fails closed on a missing required variable).

The command:

1. **Starts the control plane** on an ephemeral port (or reuses a running one via `BRZ_API_TARGET`), with a **temporary** database under a temporary directory — the demo never touches the developer's real database.
2. **Submits** the demo run with the `shr-sum-range` fixture and the frozen demo task.
3. **Polls** `GET /api/v1/runs/{runId}/events` and prints each event as it arrives, so the operator sees the run happen in the terminal.
4. On completion, prints the **full blast-radius report** as pretty JSON, then a **one-screen human summary**.
5. **Asserts the containment invariants** and exits **0** only if all of them hold.

### 12.2 The frozen demo task text

> The project's test suite is failing. Read the code, find the bug, fix it, and make the whole suite pass. Then run `python3 -m unittest discover -s tests -v` again to confirm.

This is the **specific command the operator asks the agent to run**: `python3 -m unittest discover -s tests -v`.

### 12.3 The containment moment, step by step

This is the beat the video captures. It is **deterministic** and it happens on **every** run, whether or not the model misbehaves.

| Beat | What happens | Where it shows |
|---|---|---|
| **1. The box closes** | The sandbox starts with an empty network namespace and a scrubbed environment. | The event stream: `sandbox.created` |
| **2. The probe measures the box** | Before any agent work, the containment probe runs inside the sandbox: it tries to open a TCP connection out (**fails**, `ENETUNREACH`), enumerates its environment (**exactly** `HOME`, `LANG`, `PATH`, `PWD`), enumerates `/` (**ten entries, no `/home`, no `/root`, no `/mnt`**), and attempts **one broker-mediated fetch** to `https://api.github.com/repos/brz-demo/project/releases`. | The event stream: `sandbox.probe` — *"direct egress blocked (ENETUNREACH); 0 credential keys; 1 broker fetch denied"* |
| **3. The denial is recorded** | The broker refuses the fetch because the host is not on the allowlist (**the allowlist is empty**), performs **no network I/O**, and writes the attempt with the verdict and the reason. | The report: `network.attempts[0]` → `verdict: "denied"`, `reason: "host_not_allowlisted"` |
| **4. The agent works** | The model reads the code, runs the tests, sees `AssertionError: 10 != 15`, fixes the file, and re-runs. | The event stream: `tool.call` / `tool.result` |
| **5. The agent may try the network itself** | If the model attempts a fetch of its own accord, it goes through the same broker and is denied the same way, recorded with `origin: "agent"`. | The report: a second `network.attempts` entry |
| **6. The caps hold** | Memory peaked at 39.3 MiB against a 128 MiB cap; 3 processes against a cap of 64; the whole run took 3.3 s against a 120 s budget. | The report: `resources` |
| **7. The box dies** | The sandbox is destroyed in a `finally`, the cgroup is removed, the work directory is deleted, and the teardown is **verified**. | The event stream: `sandbox.destroyed`; the report: `lifecycle.teardownVerified: true` |
| **8. The verdict** | `contained-with-denials`. | The report header |

### 12.4 The assertions the demo makes

The demo **exits non-zero** if any of these is false. These are the same checks the acceptance criteria in §13 use.

| # | Assertion |
|---|---|
| D1 | The run reached a terminal state. |
| D2 | The verification test run exited `0` and **2 of 2** tests passed. |
| D3 | `containment.secretHygiene.value.secretMaterialVisible === false`. |
| D4 | `containment.secretHygiene.value.credentialShapedKeys` is empty. |
| D5 | `containment.processIsolation.value.directNetworkReachable === false`. |
| D6 | `containment.processIsolation.value.writableOutsideWorkDir === false`. |
| D7 | `containment.processIsolation.value.processNamespaceIsolated === true`. |
| D8 | `network.probe.value.reachable === false` and `network.probe.value.errno === "ENETUNREACH"`. |
| D9 | `network.deniedCount >= 1` and every denied attempt has a reason. |
| D10 | `network.allowedCount === 0`. |
| D11 | `lifecycle.teardownVerified === true` and `lifecycle.leakedResources` is empty. |
| D12 | `verdict === "contained-with-denials"`. |
| D13 | No field anywhere in the report is a fabricated zero: every `Measured` field is either `measured` or `not-measured` with a reason. |

### 12.5 Determinism, stated honestly

- **Deterministic and identical on every run:** the containment facts, the denial, the resource *limits*, the teardown, the verdict, the event sequence, and the report's structure. These are produced by the control plane and the kernel, not by the model.
- **Not bit-identical:** the exact text of the agent's explanation, the exact byte count of the patched file, and the exact durations and memory peak. These come from a live model and a live kernel.
- **The demo retries the whole run up to 2 times** if assertion **D2** fails (the suite is red). The demo reports which attempt succeeded. This keeps the *video* re-shootable without faking anything: a run that the model could not fix is reported as a failure, not hidden.
- **`npm run demo:offline`** runs the identical scenario against the scripted inference mock. The **containment facts, the denial, the resource limits, the teardown, the verdict, the event sequence and the report's structure are identical on every run** — they come from the control plane and the kernel, not the model — but the measured durations and timestamps differ between runs, so two offline runs are **not byte-identical**. This is what CI runs and what the operator uses when the live provider is rate-limited. It is a **development affordance**, and the shipped demo is the live one.

> The offline demo is deterministic, not byte-identical: the report carries measured facts (durations, timestamps, the event digest), and freezing those measurements would be fabricating a number — the one thing this project exists to avoid.

---

## 13. Phase 1 acceptance criteria

Every criterion is checkable by a command or an assertion. `TESTER` runs this list; the numbering is stable and is referenced from the briefs.

### 13.1 The happy path

| # | Criterion | Check |
|---|---|---|
| A1 | The control plane starts with a valid `.env` and listens on `0.0.0.0:${PORT}`. | `npm start` then `ss -ltnp \| grep :$PORT` shows `0.0.0.0:$PORT`. |
| A2 | `GET /healthz` returns `200` with `status: "ok"` and a `database.state` of `"ready"`. | `curl -fsS localhost:$PORT/healthz \| jq -e '.status=="ok" and .database.state=="ready"'`. |
| A3 | A submitted run produces a real result end to end. | `POST /api/v1/runs` → `202`; poll `GET /api/v1/runs/{id}` until terminal; `status == "succeeded"`. |
| A4 | The verification test run is green and is what decided the success. | The report's `code.finalTestRun.exitCode == 0` and `passed == total == 2`. |
| A5 | The run's events are monotonic and complete. | The events response `seq` values are strictly increasing with no gaps. |
| A6 | The blast-radius report exists, is complete, and every field is either measured or explicitly not-measured. | `jq` walks the report; no `Measured` field has `state: "measured"` with a `null` value. |
| A7 | `npm run typecheck` passes with zero errors in strict mode, for **both** workspaces. | `npm run typecheck` at the repo root (the fan-out covers `backend` and `frontend`). |
| A8 | `npm test` passes. | `npm test --workspace backend` (the root fan-out also runs it). |
| A9 | The frontend builds and typechecks. | `npm run build --workspace frontend` → `frontend/dist/` exists; `npm run typecheck --workspace frontend` is clean. |
| A10 | The console works in fixture mode with no backend at all, showing all four fixtures. | `npm run dev --workspace frontend` with the API unreachable → the console renders the four fixtures and shows the honest error state, not a blank screen. |

### 13.2 The containment checks — the ones that matter

| # | Criterion | Check |
|---|---|---|
| **C-1** | **No secrets in the sandbox.** The sandboxed process cannot see `OPENAI_API_KEY`; it is absent from its environment, and the test **fails if it is present**. | A test runs `env` inside the sandbox and asserts the key is absent. Additionally, the report's `secretHygiene.value.environmentKeys` contains no credential-shaped name, and `secretMaterialVisible == false`. |
| **C-2** | **The project directory is not in the sandbox.** The operator's `.env` is unreachable because the whole directory is absent, not merely unreadable. | The report's `secretHygiene.value.projectDirectoryVisible == false`, and the containment probe's `visibleRootEntries` contains no `/home`, `/root`, or `/mnt`. |
| **C-3** | **No direct egress.** The sandbox cannot reach the network without the broker, and a brokered fetch is logged with its verdict. | The probe records `directNetworkReachable == false` and `errno == "ENETUNREACH"`. A test asserts a raw `socket.create_connection` inside the sandbox fails, and that a brokered fetch to a **non-allowlisted** host is denied with `egress_denied` and recorded in `egress_attempts`. |
| **C-4** | **The resource caps actually bite.** A run that tries to allocate past the cap is **killed**, and the report shows the kill reason and the usage at death. | A test sets `memory.max` to 64 MiB, has the sandbox allocate 200 MiB, and asserts: the process is **killed** (exit 137 / SIGKILL), `memory.events` shows `oom_kill >= 1`, and `memory.peak` equals the cap. **The exact numbers were measured on this machine**: cap `100663296` → `oom_kill 1`, `memory.peak` = `100663296`, exit `137`. |
| **C-5** | **The sandbox is actually destroyed after the run** — including on timeout and on client disconnect. | After a completed run, no sandbox process remains (`pgrep -f brz-sandbox` is empty), the cgroup path no longer exists, and the work directory is gone. The same is asserted for a **timed-out** run and a **cancelled** run. |
| **C-6** | **The cgroup is what enforces the caps** (not a `setTimeout`). | The report's `resources.enforcement == "cgroup+rlimit"`, and the cgroup's `memory.max` / `cpu.max` / `pids.max` are readable while the sandbox is live, with the values from §4.4. |
| **C-7** | **The environment is scrubbed.** No inherited variable reaches the sandbox. | The probe's `environmentKeys` is exactly `["HOME", "LANG", "PATH", "PWD"]` (the `PWD` is added by the shell). The `brz_selftest` command prints the same list, and the test asserts it. |
| **C-8** | **The broker denies what is not allowlisted, and does no I/O for it.** | A denied fetch produces no outbound connection. Asserted by pointing the allowlist at a host that does not exist and observing that the denial is immediate and recorded. |
| **C-9** | **The `VultrVMProvider` is unit-tested against a mock** covering all nine cases in §4.6, **including destroy failure**, and a leaked instance is reported rather than hidden. | `npm test` includes the Vultr suite; the destroy-failure case asserts `ok == false`, `verifiedGone == false`, and the instance id in `leftoverResources`. |
| **C-10** | **No fabricated zeros.** Every report field is measured or explicitly marked not-measured. | A test walks a report produced by the **stand-in** provider and asserts `containment.*.state == "not-measured"` and `verdict == "incomplete"`. A test walks a real report and asserts no `Measured` field is `measured` with a `null` value. |

### 13.3 The hygiene checks

| # | Criterion | Check |
|---|---|---|
| H1 | No hardcoded host, port, key, model, or URL in `backend/src`. | The grep in C1 returns nothing. |
| H2 | No absolute backend URL, port literal, or `VITE_` secret in the frontend bundle. | `grep -rnE 'localhost\|127\.0\.0\.1\|VITE_[A-Z_]*(KEY\|TOKEN\|SECRET)' frontend/src frontend/vite.config.ts` returns nothing; `grep -c 'http://' frontend/dist/assets/*.js` returns `0`. |
| H3 | No secret appears in any log line, error response, or test fixture. | `grep -rnE 'gsk_[A-Za-z0-9]|Bearer [A-Za-z0-9]{20}' backend/src frontend/src backend/test` returns nothing; the redaction test asserts a token-shaped value is replaced with `[redacted]` before it is written. |
| H4 | No raw provider, SQL, or stack text reaches a client. | The error-mapping test asserts every route's error body contains only the generic message and the machine code. |
| H5 | The browser bundle contains no absolute backend URL and no host sniffing. | `grep -rn 'window.location\|document.location' frontend/src` returns nothing. |
| H6 | The frontend never renders server output as HTML. | `grep -rn 'dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function\|document.write' frontend/src` returns nothing. |
| H7 | No `git commit` or `git push` from a worker. | The HEAD owns commits. |

### 13.4 The portability checks

All ten criteria from §11.1, run as a script. `deploy/verify-portability.sh` runs them and prints `PASS`/`FAIL` per criterion.

### 13.5 The monorepo checks

| # | Criterion | Check |
|---|---|---|
| **M1** | **One root manifest, one lockfile, one `node_modules`.** | `ls package-lock.json backend/package-lock.json frontend/package-lock.json` → **only** the root one exists. `find . -name node_modules -maxdepth 3 -not -path './node_modules*'` → nothing but the root. `npm ls --workspaces` resolves from the root. |
| **M2** | **One install, one CI install.** | `npm ci` at the root succeeds. A CI job asserts `npm ci` is the only install step and that no workflow runs `npm install` or `npm ci` inside a workspace directory. |
| **M3** | **Each workspace extends the root base, and the base owns the strictness flags.** | `backend/tsconfig.json` and `frontend/tsconfig.json` both contain `"extends": "../../tsconfig.base.json"`. Neither file re-declares `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, or `isolatedModules`. **Assert with a grep for those keys in the two workspace files — they must be absent.** |
| **M4** | **The root fan-out reaches every workspace.** | Every workspace defines `dev`, `build`, `typecheck`, `test` and `lint`. Assert: `node -e "for (const w of ['backend','frontend']) { const p=require('./'+w+'/package.json'); for (const s of ['dev','build','typecheck','test','lint']) if (!p.scripts[s]) { console.error(w+' missing '+s); process.exit(1) } }"` exits `0`. And `npm run typecheck` at the root typechecks **both** packages. |
| **M5** | **The type mirror has not drifted.** | The exported type names in `backend/src/contracts/*.ts` and in `frontend/src/lib/types.ts` are the same set. A CI job extracts the exported names from both and diffs them. A mismatch fails the build. |
| **M6** | **ESM throughout.** | `backend/package.json` and `frontend/package.json` both contain `"type": "module"`. `tsc --noEmit` passes in both workspaces under `verbatimModuleSyntax` (measured: a CommonJS-style `export` in a workspace without `"type": "module"` fails with `TS1287`). |
| **M7** | **The dev proxy target is server-side only.** | `BRZ_API_TARGET` is read in `frontend/vite.config.ts` via `loadEnv(mode, cwd, '')` (empty prefix). The built bundle contains no absolute backend URL: `grep -c 'http://' frontend/dist/assets/*.js` returns `0`. `vite build` **fails** when `BRZ_API_TARGET` is unset. |

---

## 14. Decisions the implementers must not re-litigate

Each of these was decided, with a reason, in this document. If one of them looks wrong, **say so in the completion summary and implement the closest reasonable reading** — do not silently deviate.

| # | Decision | The one-line reason |
|---|---|---|
| 1 | **The workload is `self-healing-runner`**, specialised to a single-file Python bug fix with a stdlib `unittest` suite. | The answer is in the error message (`AssertionError: 10 != 15`), so a thin agent can finish it. |
| 2 | **The workload fixture is `shr-sum-range`**, two tests, one exclusive-range bug. | Two tests, not one — a one-test suite can be "fixed" by hard-coding the answer. |
| 3 | **The agent has exactly four tools**: `list_files`, `read_file`, `write_file`, `run_tests`. | The demo's reliability must not depend on model intelligence. |
| 4 | **`run_tests` accepts only the workload's declared commands.** | The model cannot even *ask* for arbitrary execution. A refusal is report evidence. |
| 5 | **The success criterion is decided by the sandbox**, not by the model. | A report that trusts the model's word is worthless. |
| 6 | **Exactly one repair retry** (the workload gets two repair attempts; the hackathon's "one" is the first). | §7.4. More is a research project. |
| 7 | **The agent cannot run arbitrary shell commands in Phase 1.** | Narrower capability, strictly better containment posture. |
| 8 | **The `SandboxProvider` interface lives in `backend/src/contracts/sandbox.ts`**, not in `backend/src/sandbox/`. | It resolves the brief-04/brief-06 write-scope collision without either brief owning a file the other also owns. |
| 9 | **The stand-in provider lives at `backend/src/runs/standinProvider.ts`** and is labelled non-sealed. | Brief 04 cannot write into `sandbox/`. |
| 10 | **A stand-in-produced report has `verdict: "incomplete"`** and `not-measured` containment facts. | A false containment claim would poison the entire product. |
| 11 | **The frozen types are hand-copied into `frontend/src/lib/types.ts`.** No shared package, no third workspace package. | A shared package would be a file two agents both own, and would force a backend build step the backend cannot have (§10.4, §10.5). |
| 12 | **The backend has no emit build.** It runs from `.ts` sources via Node 24's native type stripping; its `build` script is `tsc --noEmit`. | Measured: `allowImportingTsExtensions` cannot be combined with emit (`TS5096`), so a `tsc` build is impossible once imports carry `.ts`. |
| 12a | **The repo is one npm workspace** with two packages, `backend` and `frontend`; the root manifest, the lockfile, and both workspace manifests belong to the HEAD. | `docs/MONOREPO.md`. One install, one lockfile, one CI install. |
| 12b | **The dev proxy is at `/api`** and forwards the path unchanged; the target comes from the server-side `BRZ_API_TARGET`, which is required. | Same-origin is a non-negotiable; the target must never reach the bundle. |
| 12c | **Both workspace `tsconfig.json` files extend the root base** and never re-declare a strictness flag. | One place owns the strictness, so the two packages cannot drift. |
| 13 | **Relative imports carry the `.ts` extension.** | Required by native type stripping. Measured: `ERR_MODULE_NOT_FOUND` without it. |
| 14 | **`erasableSyntaxOnly: true`; no `enum`, no `namespace`, no parameter properties.** | Node's type stripping rejects non-erasable syntax. Measured. |
| 15 | **The backend has zero runtime dependencies.** | `node:http`, `node:sqlite`, `node:crypto`, `node:test` and native `fetch` cover everything. |
| 16 | **The frontend has React, React DOM, Vite and the React plugin. No router, no state library, no CSS framework, no markdown renderer.** | Nothing else is needed for eight routes and a report panel. |
| 17 | **The `bwrap` root is a minimal allowlist** (`/usr`, `/etc`, four root symlinks, `/proc`, `/dev`, a tmpfs `/tmp`, and the work dir) — **not** `--ro-bind / /`. | Measured: the repo's `.env` is mode `0777`, so a whole-root bind would expose it. |
| 18 | **The sandbox is started through `/bin/sh -c 'echo $$ > <cgroup>/cgroup.procs && exec bwrap …'`.** | `bwrap` forks before it execs; moving its PID afterwards does not move the child. Measured: the cap did not apply. |
| 19 | **`RLIMIT_AS` is not set.** Memory is enforced by cgroup v2 `memory.max`. | `RLIMIT_AS` is unreliable with CPython, which reserves large virtual address space. |
| 20 | **The cgroup path is discovered at runtime** by walking up from `/proc/self/cgroup` to the nearest writable domain ancestor with `memory`, `cpu` and `pids`. | No `/mnt/ee`, no uid, no slice name in source. C6a. |
| 21 | **If no usable cgroup exists, fall back to rlimits and record `rlimit-only` in the report.** | Never claim a cap that was not applied. C6b. |
| 22 | **The broker is a Unix socket inside the per-run work directory.** | The socket dies with the directory, so there is no second cleanup path. Verified reachable from inside a netns-unshared sandbox. |
| 23 | **The broker's enabled capabilities in Phase 1 are `fetch` and `file_out`.** `credential` is defined but **disabled**. | Exactly as much as the workload needs (§5.1). |
| 24 | **The egress allowlist is empty by default**, so every fetch is denied. | The containment moment must be deterministic. |
| 25 | **The broker does not follow redirects** in Phase 1. | A redirect is an allowlist bypass. |
| 26 | **The per-run broker token is stored hashed**; the raw token is never persisted or logged. | A database dump must not grant broker access. |
| 27 | **`Measured<T>` is the only way a measurement is represented.** | "Not measured" must never be written as `0`. |
| 28 | **Every run starts with a containment probe** that measures the box. | The report must carry observations, not claims. |
| 29 | **The API is unauthenticated in Phase 1**, and the deployment must therefore sit behind an access control. | Stated plainly rather than papered over. Auth is Phase 2. |
| 30 | **`POST /api/v1/runs` returns `202`; the report route returns `409 report_not_ready`.** | A `404` would be indistinguishable from a typo'd id. |
| 31 | **Polling, not streaming.** The event stream is polled by `seq`. | A cursor poll cannot miss an event and needs no second transport. |
| 32 | **The run id is `run_` + a 26-char ULID; tool calls are addressed by per-run `seq`.** | Only external ids cross the wire. |
| 33 | **The database is `node:sqlite` with WAL, prepared statements, and ordered numbered SQL migrations.** | No database server on a 1.26 GB box. |
| 34 | **`deploy/bootstrap.sh` is idempotent, fails closed, and needs no database, Docker, or build.** | C4, C7. |
| 35 | **The demo is `npm run demo --workspace backend`**, with `npm run demo:offline --workspace backend` as the byte-deterministic variant. | The video must be re-shootable. |
| 36 | **The demo retries the whole run up to 2 times** if the suite comes back red, and says which attempt succeeded. | Reliability without faking anything. |
| 37 | **The Vultr tier is written against an injected `fetch`** and unit-tested against a scripted mock covering nine cases. | No Vultr account until kickoff. |
| 38 | **Every external fact in this document is cited with a URL and an access date, or was measured on the build machine.** | No claim from memory. |
| 39 | **A report produced by the stand-in provider is `incomplete`, never `contained`.** | A false containment claim would poison the entire product. (Restated because it is the single easiest thing to get wrong under deadline pressure.) |

---

## Appendix A — Facts measured on the build machine (2026-10-23)

Every value in this document that is not an assumption was produced by running a command on the build machine.

| Fact | How it was established |
|---|---|
| `bwrap` **0.13.0** at `/usr/bin/bwrap` | `bwrap --version` |
| Every `bwrap` flag used | `bwrap --help` — `--unshare-all`, `--unshare-user`, `--disable-userns`, `--unshare-cgroup`, `--die-with-parent`, `--new-session`, `--ro-bind`, `--bind`, `--symlink`, `--proc`, `--dev`, `--tmpfs`, `--clearenv`, `--setenv`, `--hostname`, `--chdir`, `--cap-drop`, `--block-fd` all present |
| `--disable-userns` requires `--unshare-user` | `bwrap: --disable-userns requires --unshare-user` |
| The sandbox's `/` contains exactly `{bin,dev,etc,lib,lib64,proc,sbin,tmp,usr,work}` | `os.listdir('/')` inside the sandbox |
| The sandbox's environment is exactly `{HOME, LANG, PATH, PWD}` | `os.environ` inside the sandbox |
| Direct TCP egress fails with `ENETUNREACH` | `socket.create_connection(('1.1.1.1',443))` inside the sandbox → `OSError` |
| A Unix socket in the bind-mounted work dir **is** reachable from inside the netns-unshared sandbox | a broker `AF_UNIX` round trip succeeded from inside `bwrap` |
| A host Unix socket under `/run` is **not** reachable | `connect('/run/user/1000/pulse/native')` → `FileNotFoundError` (the path is not bound) |
| The repo's `.env` is mode **0777** | `ls -l .env` → `-rwxrwxrwx asayman asayman` |
| The cgroup v2 root is **not** writable by uid 1000 | `mkdir /sys/fs/cgroup/brz-probe` → `Permission denied` |
| The nearest writable domain ancestor is `…/user@1000.service/app.slice` | the walk in §4.4; `cgroup.controllers` = `cpu memory pids`, writable |
| `memory.max`, `memory.swap.max`, `pids.max` are writable in a child cgroup | `echo … > <cg>/memory.max` and `cat` round-tripped |
| `cpu.max` accepts `max 100000` and `50000 100000`; `0 100000` is **rejected** | `echo` → `EINVAL` on `0 100000` |
| The memory cap **bites**: cap `100663296` → `oom_kill 1`, `memory.peak` = `100663296`, exit **137** | the run in §4.3 |
| Moving a `bwrap` PID into the cgroup **after** spawn does **not** cap the already-forked child | `memory.peak` stayed at `262144`; `oom_kill` stayed `0` while 400 MB was allocated |
| `ulimit -f` produces `OSError: [Errno 27] File too large` | a test write |
| `ulimit -t` kills on CPU time; `ulimit -u` is accepted | test runs |
| `node:sqlite` works natively; SQLite **3.53.3** | `new DatabaseSync(':memory:')` on Node **24.19** |
| Node 24 strips types natively; `process.features.typescript === 'strip'` | `node --version`, `node -e "console.log(process.features.typescript)"` |
| Relative imports need the `.ts` extension | `ERR_MODULE_NOT_FOUND` without it |
| `enum` is rejected by type stripping | the Node error |
| `node --test` runs `*.test.ts` files | a sample test ran and reported `pass 1` |
| `node --env-file=.env` loads environment variables | `process.env.FOO` printed `bar` |

## Appendix B — External sources (accessed 2026-10-23)

| Source | URL | Used for |
|---|---|---|
| Vultr API v2 reference | <https://www.vultr.com/api/> | Endpoint paths, request/response codes, `instance` object fields. **JavaScript-rendered; returns `403` to a plain `fetch`** (measured). |
| Vultr API v2 — public OpenAPI 3.0 mirror | <https://gist.githubusercontent.com/celicoo/6156b1a937e20e1439ad179b38791c60/raw/open_api_vultr.json> | Field-level detail for `POST /instances` and the `instance` schema, including `status`, `power_status`, `server_status` enums and the `user_data` base64 requirement. |
| Vultr — Cloud Compute provisioning | <https://docs.vultr.com/products/compute/instances/cloud-compute/provisioning> | The canonical `curl` example for `POST https://api.vultr.com/v2/instances`, and the `Authorization: Bearer` scheme. |
| Vultr Python client (community) | <https://cssnr.github.io/vultr-python> | The `os_id=2284` / `vc2-1c-0.5gb-v6` example and the API's own rejection message: *"Ubuntu 24.04 LTS x64 requires a plan with at least 1000 MB memory."* |
| `bubblewrap` man page / `--help` | local binary, `/usr/bin/bwrap` 0.13.0 | Every flag, verified on the build machine. |

*No claim in this document rests on memory. Where a number could not be measured, it is labelled an assumption and given a verification plan.*
