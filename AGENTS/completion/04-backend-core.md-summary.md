# Summary — 04: Phase 1 control plane (server, inference, store, agent loop, routes)

**Agent:** BACKEND
**Status:** complete
**Date:** 2026-10-23
**Brief:** `AGENTS/briefs/04-backend-core.md` (marked `<DONE>`)
**Contract:** `docs/architecture/02-phase1-design.md`

---

## Status

**Complete.** The Phase 1 control plane runs end to end on this machine: a task submitted to
`POST /api/v1/runs` produces a real run, a real event stream, a real sandbox execution, a real
verification run decided by the sandbox, and a real blast-radius report — in mock mode and in live
mode against the provider in the repository-root `.env`. Typecheck is clean, 66 tests are green, and
the constraint grep returns only the three lines the design doc itself sanctions (below).

**The one thing to know before you read the rest:** this build runs on the **non-sealed stand-in
provider**. It is not containment, it says so, and every report it produces carries
`verdict: "incomplete"` with `not-measured` containment facts. Brief 06 replaces it.

---

## What changed

All under `backend/**`, which is this brief's exclusive write scope. Nothing else was touched: no
manifest, no lockfile, no `frontend/**`, no `deploy/**`, no `docs/**`, no `backend/src/sandbox/**`,
no `backend/src/broker/**`. No commit, no push.

| File | Lines | What it owns |
|---|---|---|
| `src/contracts/{api,broker,events,report,sandbox,workload}.ts` | 970 | The frozen cross-boundary types (§4, §6, §8). Written once, here, per §10.2. |
| `src/config.ts` | 287 | Env parsing. Fails closed; names the variable, never the value (§10.8). |
| `src/log.ts` | 64 | Structured server-side logging. The only sink for provider text, SQL text and stacks. |
| `src/http/{errors,json,router,validate}.ts` | 394 | The error envelope, the body reader, the router, boundary validation. |
| `src/inference/{types,client,mock}.ts` | 473 | The OpenAI-compatible client, its typed errors, the deterministic offline mode. |
| `src/agent/{prompt,workload,tools,loop}.ts` | 1 185 | The frozen prompt, the one workload and its fixtures, the four tools, the plan→execute→explain loop. |
| `src/db/sqlite.ts`, `src/db/migrate.ts`, `src/db/migrations/001_initial.sql`, `src/db/redact.ts` | 407 | `node:sqlite`, the pragmas, the numbered migration runner, the redaction of `arguments_json`. |
| `src/db/store/{runs,events,toolCalls,sandbox,egress,resources,artifacts,reports,index}.ts` | 1 046 | One typed store per table. No ORM, prepared statements only. |
| `src/runs/ids.ts` | 56 | `run_` + ULID, `sbx_` + 16 chars, the per-run broker token, the digests. |
| `src/runs/standinProvider.ts` | 389 | **STAND-IN — NOT CONTAINED.** The non-sealed provider (§10.2). |
| `src/runs/manager.ts` | 864 | The run state machine, the `AbortController`, the sandbox lifecycle, the verification run, the teardown in a `finally`. |
| `src/runs/report.ts` | 789 | The blast-radius report, assembled from persisted records only. |
| `src/routes/{runs,workloads,fixtures}.ts` | 332 | The eight versioned routes. |
| `src/server.ts` | 368 | `node:http`, the request id, the error envelope, migrate-before-listen, graceful shutdown, the static `frontend/dist` fallback. |
| `src/demo/run-demo.ts` | 331 | The §12 demo scenario, one command, with its assertions. |
| `test/helpers/harness.ts` | 132 | A temporary database, a temporary work root, the stand-in, the scripted client. |
| `test/unit/{config,errors,loop,tools,report,inference,manager}.test.ts` | 1 340 | 60 unit tests. |
| `test/integration/routes.test.ts` | 203 | The HTTP surface, end to end, against a temporary database. |

**No file was created or edited outside `backend/**` and `AGENTS/`.**

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace backend` | **clean** — zero errors, `strict` + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax`, no `any`. |
| `npm test --workspace backend` | **66 pass, 0 fail** (10 suites, ~5 s). Covers config validation, the error-code→status map, the agent loop's stopping conditions, the tool/path rules, the report assembly, the verdict rule, the inference client's retry and error mapping, the run manager, and the routes end to end. |
| `npm run demo:offline --workspace backend` | **exit 0.** Full report printed, all demo assertions passed on attempt 1, verdict `incomplete`, 2/2 tests green. |
| `npm run demo --workspace backend` (live) | **exit 0** on the recorded run. Real provider, real fix, 2/2 tests green. See the excerpt below. |
| `curl` against `localhost:8787` | `/healthz` → 200; `POST /api/v1/runs` → 202; the run → `succeeded`; `GET …/report` → 200 with the report; `GET …/events` → the event stream; 400/404/409/415/429/502 all produce the frozen envelope. |
| The constraint grep | 3 lines, all sanctioned — see below. |

### The live run, actually recorded

`npm run demo --workspace backend`, real `OPENAI_*` from the repository-root `.env`, first attempt:

```
--- summary ---
run:        run_01M5JWED8PATGCD78WWKTT8TT2
status:     succeeded (done)
verdict:    incomplete
headline:   Containment not measured. 1 file changed, 2/2 tests passed, egress not measured (0 attempts recorded), sandbox destroyed.
files:      3 written (1 by the agent)
tests:      2/2 passed
commands:   3
network:    0 denied, 0 allowed, probe not-measured
lifecycle:  destroyed=2026-10-22T22:42:00.773Z teardownVerified=true
containment: not-measured (the non-sealed stand-in cannot measure it)

All demo assertions passed on attempt 1.
```

The model's own words, from the same report:

> The failure was due to **`sum_range`** incorrectly using `range(start, end)`, which excludes the
> end value and also returned 0 for a single‑value range. … Adjusted the range to
> `range(start, end + 1)` to include the end value. … Now the sum is calculated inclusively, and
> all tests pass.

The three commands in the report are real: the first `python3 -m unittest discover -s tests -v`
exited **1** (the real failure), the second exited **0**, and the verification run — the one that
decides the run's status — exited **0** with 2/2 tests green.

**An earlier live invocation failed, and it is worth recording why:** the provider rate-limited the
run (8 000 tokens/minute, shared quota), the client exhausted its retries, and the run ended
`failed` with `errorCode: "model_error"`, an honest report (`0 files changed, 0/2 tests passed,
egress not measured`), and a full teardown. That is the designed failure path, not a crash.

### The constraint grep

```
$ grep -rnE 'localhost|127\.0\.0\.1|http://|https://|gsk_|groq|vultr' backend/src --include='*.ts'
backend/src/agent/workload.ts:69:PROBE_URL = "https://api.github.com/repos/brz-demo/project/releases"
backend/src/contracts/api.ts:134: * union `'bwrap' | 'vultr-vm'`. The design doc requires a stand-in provider
backend/src/contracts/sandbox.ts:28:export type SandboxProviderKind = 'bwrap' | 'vultr-vm' | 'standin';
```

1. **Fixture data.** The frozen containment-probe target from §12.3, inside the self-test fixture.
   The control plane never fetches it; it is the URL the *sandbox* asks the broker for so the
   denial can be recorded.
2. **A comment** in `contracts/api.ts` describing the `provider` deviation below.
3. **A type-only literal** in the frozen `SandboxProviderKind` union, required verbatim by §4.

Design §11.1 C1 sanctions exactly this: *"returns nothing except lines in `contracts/` that are
type-only literals and comments"*. No host, port, key, model or URL is hardcoded anywhere.

---

## Deviations from the design doc — read these

The design doc wins on conflict, and it was followed. These are the places where the doc left a
gap, where this build had to choose, and where the choice is marked in the code.

1. **`SandboxProviderKind` gains a third member, `'standin'`** (additive). §10.2 requires a
   stand-in and §14 requires its report to be `incomplete`, but the frozen union had no label for
   it. Labelling it `'bwrap'` would be a false claim about the tier that ran — in a product whose
   entire value is truthful reports. `RunDetail.provider` and `HealthResponse.provider` were
   widened to match. Brief 06 removes the member. *(Marked in `contracts/sandbox.ts` and
   `contracts/api.ts`.)*

2. **`BRZ_SANDBOX_PROVIDER` defaults to `standin` in this build**; any other value fails closed
   with a message that does not name the sealed tiers. The design's default is `bwrap`, which
   brief 06 has not landed yet, and defaulting to a provider that does not exist would mean the
   control plane cannot start at all. Brief 06 flips the default and deletes the stand-in.

3. **The report is assembled AFTER the teardown, not before.** §7.1's diagram shows
   REPORTING → TEARDOWN, but `lifecycle.*` and `containment.lifecycle` *are* teardown facts (§6.6)
   and the example report carries a real `destroyedAt`. A report written before the destroy could
   only guess those fields. The teardown still happens in a `finally`, always, and the report is
   written from the persisted destroy record.

4. **`NetworkSection.directAccess` is type-forced to `'blocked'`, and for the stand-in that literal
   is not backed by a measurement.** The type (§6.3) has no "not applicable" state, and the
   stand-in does have host network access. The honest outlets are used together: the
   `directMechanism` string says *"NONE — the stand-in has host network access (brief 06 replaces
   this)"*, `network.probe` is `not-measured`, and the verdict is `incomplete`. A stand-in that
   claimed `contained` would be the unforgivable bug; this is the opposite of that.

5. **The frozen `ContainmentVerification` (§4.1) cannot fill the frozen `IsolationFact` (§6.3).**
   `IsolationFact` requires `namespaces` and `SecretHygieneFact` requires
   `projectDirectoryVisible`; the probe type has neither. The report reads both as **optional
   extensions** of the probe record, and if a probe does not carry them the affected fact is
   `not-measured` with a reason naming the missing field. **Brief 06 must extend the probe** to
   carry them, or a sealed run would report `incomplete` forever.

6. **`code.modelClaim` falls back to the closing explanation** when the model never narrated a
   claim alongside a tool call (a real behaviour of `openai/gpt-oss-120b` on the recorded live
   run). The field is a plain `string`, so it cannot say "the agent made no claim" without
   inventing words in the agent's mouth. The fallback keeps the panel from rendering blank.

7. **`code.filesWritten` lists the final state of each path.** When the agent rewrites a seeded
   file, the seed entry is replaced by the agent's version, attributed to `origin: "agent"`. Both
   versions remain in `evidence.artifacts`, so nothing is lost.

8. **Client-disconnect cancellation is honoured only before the `202` is written.** §7.7 lists the
   disconnect as an abort trigger, but the `202` returns immediately, and the console polls the
   run over separate requests. Cancelling on any later socket close would kill healthy runs when
   the console drops an idle connection. After the `202`, cancellation is explicit
   (`POST /api/v1/runs/{id}/cancel`), plus the run's wall-clock budget and shutdown.

9. **The stand-in enforces the rlimits it can and no more.** `prlimit` applies `RLIMIT_CPU`,
   `RLIMIT_FSIZE`, `RLIMIT_NPROC` and `RLIMIT_NOFILE`; it does **not** apply a memory cap, because
   `RLIMIT_AS` is not cgroup `memory.max` and the stand-in claims no memory limit at all — the
   report says `memoryPeakBytes: not-measured`. If `prlimit` is missing, the stand-in **fails
   closed** rather than running a sandbox that cannot hold its limits.

10. **The offline demo is deterministic, not byte-identical.** §12.5 promises a "byte-identical"
    report from the scripted mock. Ours is deterministic in everything the control plane decides —
    the transcript, the commands, the exit codes, the verdict, the event sequence, the structure —
    but the report also contains *measured* facts (durations, timestamps, the event digest), so two
    offline runs differ in those bytes. Claiming byte-identity would mean freezing measurements,
    which is exactly the "fabricated number" this project exists to avoid.

11. **The demo asserts what is true in this build.** D3–D12 are containment assertions that the
    stand-in cannot satisfy by construction, so the demo asserts D1, D2, D13, the `incomplete`
    verdict, the `not-measured` containment facts, and the absence of a containment measurement —
    and says so in its output. **D3–D12 belong to brief 06's containment tests.**

12. **Three frozen error codes are never raised by this build**: `provider_unavailable`,
    `not_ready` and `sandbox_error` (as an HTTP status). A run is asynchronous — a provider
    failure surfaces in the *run* (`errorCode: "sandbox_error"`, `model_error`), not in the HTTP
    response, and the server migrates before it binds, so it is never "not ready". The codes stay
    in the frozen map for brief 06 and the deploy tier.

---

## Decisions / trade-offs

- **The report is assembled from persisted records only** (§6.6), never from in-memory guesses.
  Every field traces to a row: files → `artifacts`, commands → `sandbox_lifecycle` (`exec`),
  the verification run → the `verification-run` artifact, containment → the `probe` row, network →
  `egress_attempts`, lifecycle → the `create`/`destroy` rows, evidence → `run_events` +
  `artifacts`, timeline → `run_events` projected.
- **`Measured<T>` is the load-bearing type and it is used literally.** A field with no backing
  record is `not-measured` with a reason naming the missing record. A `0` is only ever written
  when something was actually measured as zero. The demo asserts this by walking the whole report
  and failing if any `Measured` is `measured` without a value, or `not-measured` without a reason.
- **"No egress attempted" and "egress not measured" are different facts** (§6.1). The headline
  says `egress not measured (0 attempts recorded)` rather than a tidy "0 attempts denied" when the
  probe never ran.
- **The sandbox decides success, never the model** (§7.5). A model that says "done" without a
  green verification run ends `failed` with `errorCode: "tests_not_green"`.
- **The repair budget is enforced before the model gets another turn**: the test command runs at
  most `maxRepairs + 1` times (3 by default) and the run then ends
  `repair_budget_exhausted`. A fourth attempt is never made.
- **Every route validates at the boundary.** An invalid body is a 400 with a machine code and
  field-level details; a malformed run id is a 404; a report that does not exist yet is a 409.
  No input path reaches the store without validation.
- **The broker token is never stored, logged or written to disk.** Only its SHA-256 goes into the
  `runs` row (§9.3). The stand-in does not start a broker; brief 06 does.
- **The control plane serves `frontend/dist` when it exists**, so production has no proxy hop
  (§8.1). In development Vite proxies `/api` and the backend serves nothing but JSON.

---

## Follow-ups / risks — what the HEAD and brief 06 must handle

1. **Brief 06 replaces `src/runs/standinProvider.ts`** with `BwrapProvider` (+ the cgroup layer,
   the probe script, the broker and the egress allowlist). It must:
   - flip the `BRZ_SANDBOX_PROVIDER` default back to `bwrap` and delete the stand-in;
   - **extend the probe record with `namespaces` and `projectDirectoryVisible`** — without them a
     sealed run can never leave `incomplete` (deviation 5);
   - make the broker real, so `network.attempts` records the denied `host_not_allowlisted` fetch
     the demo scenario is built around, and `deniedCount >= 1` becomes true;
   - supply the cgroup read-back so `memoryPeakBytes`, `cpuSeconds` and `maxProcessesObserved`
     stop being `not-measured`.
2. **`backend/src/contracts/` is frozen and shared.** FRONTEND builds against it; the only
   additive change in this brief is the `'standin'` member of `SandboxProviderKind` and the
   widened `RunDetail.provider` / `HealthResponse.provider`. Both are removable in brief 06.
   **Action for FRONTEND:** the hand-copied mirror in `frontend/src/lib/types.ts` still declares
   `provider: 'bwrap' | 'vultr-vm'` (lines 445 and 496). The runtime value in this build is
   `'standin'` — it renders as a plain string today (`RunView.tsx` prints `run.provider`
   verbatim), but the mirror should gain the same additive member so the types stay true. The
   demo's *offline* fixtures in `frontend/src/lib/fixtures.ts` still show a `bwrap` /
   `contained-with-denials` report, which is brief 06's world, not this build's.
3. **The demo's containment assertions D3–D12 live in brief 06's `test/containment/`.** The demo
   script prints which assertions it applied.
4. **`deploy/` (brief 06)** needs the systemd unit: the server exits non-zero on a config error,
   migrates before it binds, and shuts down gracefully on `SIGTERM` (abort every run, write the
   teardown and the report, close the database). `BRZ_DB_PATH` and `BRZ_WORK_ROOT` must be
   writable by the service user; the per-run work dir is removed and verified after teardown.
5. **The provider's tokens-per-minute quota is the demo's real risk.** The live demo failed once
   for exactly this reason and passed twice. The demo already retries the whole run up to 3 times
   in live mode, which is the §12.5 behaviour.
6. **The frontend needs the report to be readable in five seconds** (`AGENTS/message/backend/quality-bar.md`).
   The backend side of that is: the verdict is one unambiguous word, `not-measured` is
   structurally distinct from `0`, the headline is one human sentence, and
   `evidence.artifacts` carries the actual file contents and test output.
7. **No secrets are in the repo, the logs, the reports or the tests.** The `.env` values are read
   with `--env-file` and never printed; the inference client scrubs the key out of any provider
   text it logs; the config error messages name variables, not values.

---

## Mailbox

`AGENTS/message/backend/quality-bar.md` — read and applied (the report is the deliverable, "not
measured" must be visibly different from "zero", the unhappy path is designed rather than
accidental). No other message was waiting.
