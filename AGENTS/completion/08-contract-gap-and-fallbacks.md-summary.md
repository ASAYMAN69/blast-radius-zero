# Summary — 08: Close the contract gap and make the provider resilient

**Agent:** BACKEND
**Status:** complete
**Date:** 2026-10-23
**Brief:** `AGENTS/briefs/08-contract-gap-and-fallbacks.md` (marked `<DONE>`)
**Continues:** brief 04 (`AGENTS/completion/04-backend-core.md-summary.md`)

---

## Status

**Complete.** The ship blocker is closed: a **sealed** run can now reach `contained`, and a test
proves it. The inference client survives a provider rate limit through a fallback chain, a run
cannot burn through a shared quota because it has a hard token budget, and the three accepted
deviations are recorded in the code.

`npm run typecheck` is clean, **94 tests pass** (28 of them new), the offline demo exits 0, and the
live demo exits 0 against the real provider.

---

## What changed

Only files inside this brief's write scope, plus one flagged exception at the end.

| File | What changed |
|---|---|
| `backend/src/contracts/sandbox.ts` | **`ContainmentVerification` gained exactly two fields** — `namespaces: readonly string[] \| null` and `projectDirectoryVisible: boolean \| null` — both documented as *"not measured"* when `null`. Nothing else in the file changed. |
| `backend/src/runs/report.ts` | The report reads the two fields straight from the contract. `null` → `not-measured` **with a reason naming the field**; a measured value → `measured`. The headline now says so when a run stopped on its token budget. |
| `backend/src/config.ts` | `OPENAI_FALLBACKS` (JSON array of provider entries) and `BRZ_RUN_TOKEN_BUDGET` (default `12000`, `0` disables). Both fail closed with messages that name the variable and never print a value. |
| `backend/src/inference/chain.ts` | **New.** The fallback chain: rotate on `rate_limited`, `timeout` or `upstream_5xx`; never rotate on another 4xx; report the provider that served a call. |
| `backend/src/inference/budget.ts` | **New.** The per-run token accountant. |
| `backend/src/runs/manager.ts` | Composes primary → chain → budget; records the provider and every rotation on the event stream; `token_budget_exhausted` added to the run-error union; the terminal state is persisted *before* the report is assembled; the accepted assembly-order and cancellation deviations are documented at their sites. |
| `backend/src/inference/mock.ts`, `backend/src/demo/run-demo.ts` | The determinism claim, corrected (below). The demo also prints the serving provider and the token usage. |
| `backend/src/runs/standinProvider.ts` | **Flagged exception** — a documented constant (`STANDIN_UNMEASURED_PROBE_FIELDS`, both `null`) and comments. No behaviour change. See the note at the end. |
| `backend/test/**` | 28 new tests (below), plus the harness updated for the two new config fields. |

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck --workspace backend` | **clean** — zero errors. |
| `npm test --workspace backend` | **94 pass, 0 fail** (18 suites). 66 before this brief, **28 new**. |
| `npm run demo:offline --workspace backend` | **exit 0** — pasted below. |
| `npm run demo --workspace backend` (live) | **exit 0** — pasted below. |
| The `byte-identical` grep | **2 hits, both the corrected wording** — pasted below. |
| The rotation log grep for the key | **the key is absent** — pasted below. |

### Requirement 1 — the two probe fields

The type, exactly as it now stands (nothing else in the interface changed):

```ts
export interface ContainmentVerification {
  readonly directNetworkReachable: boolean;
  readonly directNetworkProbe: { readonly attempted: boolean; readonly errno: string | null; readonly message: string; };
  readonly environmentKeys: readonly string[];
  readonly secretMaterialVisible: boolean;
  readonly visibleRootEntries: readonly string[];
  readonly writableOutsideWorkDir: boolean;
  readonly processNamespaceIsolated: boolean;
  readonly brokerReachable: boolean;
  /**
   * The namespace kinds actually in effect inside the sandbox, read from
   * `/proc/self/ns/*` from **inside** it …
   * `null` means **NOT MEASURED**. It never means "no namespaces" …
   */
  readonly namespaces: readonly string[] | null;
  /**
   * Was the operator's project directory — the one that may hold a `.env` —
   * visible inside the sandbox?
   * `null` means **NOT MEASURED**. It never means `false` …
   */
  readonly projectDirectoryVisible: boolean | null;
  readonly measuredAt: string;
  readonly provider: SandboxProviderKind;
}
```

The proof that the gap is closed (`test/unit/report.test.ts`, "a sealed run"):

```
✔ reaches "contained" when the probe measures the two nullable fields
✔ reaches "contained-with-denials" when the broker denied the probe fetch
✔ stays "incomplete" when the probe does not measure the two fields
✔ never writes a fabricated false or empty namespace list
```

The first test builds a **synthetic sealed probe** — `namespaces: ['user','mount','pid','net','ipc','uts']`,
`projectDirectoryVisible: false`, everything else measured — over a `bwrap` run with a create/destroy
pair, and the report's verdict is **`contained`**. The third builds the same run with the two fields
`null` and the verdict is **`incomplete`**, with reasons that name `namespaces` and
`projectDirectoryVisible`. The fourth asserts the not-measured entries carry `value: null` — never
a fabricated `false` and never `[]`.

### Requirement 2 — the fallback chain

```
✔ rotates to the next provider on a rate limit
✔ rotates on a timeout and on a 5xx
✔ does NOT rotate on a 4xx that is not a throttle
✔ reports the ordinary typed error when the chain is exhausted
✔ reports the provider that served the call, and reports it once
✔ never writes a key into the log
✔ behaves exactly like the primary when there are no fallbacks
✔ rotates to the fallback and records the rotation on the event stream   (end to end, through the manager)
```

Config: `OPENAI_FALLBACKS` is optional, parsed with the same rules as the primary (absolute URL,
HTTPS in production), an entry may omit `model` and/or `apiKey` and inherit the primary's, and every
failure names the variable and the entry index:

```
✔ has no fallbacks when OPENAI_FALLBACKS is absent or empty
✔ parses a fallback entry and inherits the primary model and key
✔ fails closed on malformed JSON, without echoing the value
✔ fails closed on a bad endpoint, without echoing the key
✔ requires HTTPS for a fallback in production
✔ keeps a fallback key of its own when it has one
✔ refuses a fallback array that is not an array
```

**The key is absent from the rotation log.** A real chain — the primary rate limited, a genuine
`createLiveClient` fallback whose provider text contains the fallback's key:

```
--- log lines ---
warn inference provider rotated {"from":"primary","to":"fallback-1","reason":"rate_limited"}
warn inference rate limited {"status":429,"detail":"{\"error\":{\"message\":\"rate limited for key [redacted]\"}}"}
--- end ---
key present in the log: false
```

The chain's own log lines carry the provider **labels** and the reason, never an endpoint and never
a key; the live client scrubs its own key out of the provider text before it reaches the log.

**Accounting.** The provider that served a call is recorded on the run's event stream, a rotation is
its own event, and the run's report shows it (through the event projection into the timeline). The
end-to-end test asserts the rotation is on the event stream, that the report's timeline contains
`provider=fallback-1`, and that **no key appears anywhere in the event stream**.

### Requirement 3 — the hard token budget

```
✔ stops the run at the budget and says so in the report
✔ does not stop a run that stays inside the budget
✔ (config) defaults to 12000 tokens
✔ (config) is 0 when it is disabled
✔ (config) rejects a non-numeric budget and names the variable
```

A run whose cumulative usage passes the budget stops with the new run error code
**`token_budget_exhausted`** — a run error, never an HTTP one — and the report says so:

```
headline: Token budget exhausted — 5000 tokens used against a budget of 1000. …
```

The usage that was reached is also on the event stream (`resource.sample` with `tokens` and
`tokenBudget`), so it is in the report's timeline and in the evidence digest.

### The demos

`npm run demo:offline --workspace backend` → **exit 0**

```
--- summary ---
run:        run_01M5JYERKW29RAMX25SVMFZBD1
status:     succeeded (done)
verdict:    incomplete
headline:   Containment not measured. 1 file changed, 2/2 tests passed, egress not measured (0 attempts recorded), sandbox destroyed.
provider:   scripted
tokens:     4985 used (budget 12000)
files:      3 written (1 by the agent)
tests:      2/2 passed
commands:   3
network:    0 denied, 0 allowed, probe not-measured
lifecycle:  destroyed=2026-10-22T23:17:05.911Z teardownVerified=true
containment: not-measured (the non-sealed stand-in cannot measure it)

All demo assertions passed on attempt 1.
```

`npm run demo --workspace backend` (live, the real provider from the repository-root `.env`) →
**exit 0**

```
--- summary ---
run:        run_01M5JYF0NDE500GJRCRGXX8X4B
status:     succeeded (done)
verdict:    incomplete
headline:   Containment not measured. 1 file changed, 2/2 tests passed, egress not measured (0 attempts recorded), sandbox destroyed.
provider:   primary
tokens:     8312 used (budget 12000)
files:      3 written (1 by the agent)
tests:      2/2 passed
commands:   3
network:    0 denied, 0 allowed, probe not-measured
lifecycle:  destroyed=2026-10-22T23:17:18.457Z teardownVerified=true
containment: not-measured (the non-sealed stand-in cannot measure it)

All demo assertions passed on attempt 1.
```

**The live run used 8 312 of the 12 000-token budget.** That is the headroom the HEAD should know
about: a longer transcript on a chatty model would hit the budget and end `token_budget_exhausted`.
`BRZ_RUN_TOKEN_BUDGET` is the knob; the default is the brief's 12 000.

### The "byte-identical" wording

```
$ grep -rn 'byte-identical' backend/src --include='*.ts' -B 2 -A 2
backend/src/demo/run-demo.ts-14- * codes, the verdict, the event sequence, the report's structure — and they
backend/src/demo/run-demo.ts-15- * differ in the measured facts: durations, timestamps and the digest over
backend/src/demo/run-demo.ts:16: * them. The report is not byte-identical between runs, and it must not be:
backend/src/demo/run-demo.ts-17- * freezing a measurement would be exactly the fabricated number this project
backend/src/demo/run-demo.ts-18- * exists to avoid. The *containment beat* — verdict, denial, caps, teardown —
--
backend/src/inference/mock.ts-13- * exit codes, the verdict, the event sequence, the report's structure — and
backend/src/inference/mock.ts-14- * they differ in the measured facts: durations, timestamps, and the digest
backend/src/inference/mock.ts:15: * over them. The report is not byte-identical between runs, and it must not
backend/src/inference/mock.ts-16: * be: freezing a measurement would be a fabricated number.
```

Both hits are the **corrected** claim. There was no "byte-identical" claim in `backend/src` to fix;
what the brief asked for is the corrected wording, and it is now in the two places that talk about
determinism (the demo's header and the mock's header). The only remaining "byte-identical" claim in
the repository is in `docs/architecture/02-phase1-design.md` §12.5, which is **out of this brief's
write scope** — the HEAD amends that sentence.

---

## Decisions / trade-offs

1. **The chain is composed in the run manager, not in the server's client factory.** `server.ts` is
   not this brief's scope, and the manager already owns the per-run client. The composition is
   `primary → chain → budget`, and the manager is the only place that knows about a run. If the HEAD
   prefers the wiring to live in `server.ts`'s `createInferenceFactory`, it is a one-line move — say
   the word and I will make it.
2. **The chain is always used, even with no fallbacks.** It has to be, because the run has to record
   which provider served it, and the chain is what knows. With `OPENAI_FALLBACKS` unset the chain
   delegates to the primary and nothing else changes. The *only* difference from brief 04 is one
   extra accounting event per run (`Provider: primary` / `Provider: scripted`) — which Requirement 2
   asks for. The inference behaviour itself is identical.
3. **`network_error` does not rotate.** The brief lists exactly three rotating conditions
   (`rate_limited`, `timeout`, `5xx`); a transport failure is not one of them, so it does not
   rotate. Stated here so it is a decision and not an accident.
4. **A fallback client does not retry in place** (`maxRetries: 0`): the chain's rotation *is* the
   retry. The two mechanisms are not stacked.
5. **The provider event uses the existing `agent.message` type.** The frozen `RunEventType` union
   has no provider member, and the contracts are frozen in this brief, so the rotation is recorded
   under the closest existing type with an unambiguous label and detail. **The HEAD may want to add
   `provider.rotated` to the union** — it is a one-line backend change and a two-line frontend
   mirror (`frontend/src/lib/types.ts` has a `Record<RunEventType, string>` of tones).
6. **The stand-in cannot return a verification, and that is deliberate.** The brief says the stand-in
   must return `null` for the two new fields. With the other five fields of
   `ContainmentVerification` non-nullable, *any* verification the stand-in returned would have to
   fabricate those five — so the stand-in throws from `verify()` and the report says `not-measured`
   for every containment fact, exactly as §10.2 requires. What the stand-in now carries is
   `STANDIN_UNMEASURED_PROBE_FIELDS` — `namespaces: null`, `projectDirectoryVisible: null` — with
   the reasoning documented, and a test asserts both are `null` and that `verify()` throws.
7. **The token budget is enforced at the call boundary.** The run stops as soon as the cumulative
   usage passes the budget, so at most one call can overshoot it. The budget wrapper counts the
   provider's reported usage; when a provider reports none, the same four-characters-per-token
   estimate the agent loop uses is applied — and that estimate is used **only** for the stop
   decision, never written into the report as a measured fact.
8. **The run's terminal state is persisted before the report is assembled.** The report reads the
   run's error code (that is how the headline knows the budget was exhausted), so the status has to
   be known first. This is the same accepted deviation as the assembly order, applied to the
   status.

---

## Follow-ups / risks

1. **The hand-off to brief 06 — the exact contract the sealed probe must satisfy.** The probe's
   `verify()` must return a `ContainmentVerification` that carries:
   - `namespaces: readonly string[] | null` — the namespace kinds **actually in effect**, read from
     `/proc/self/ns/*` **from inside the sandbox**. `null` when it did not look. Never `[]`, never a
     declared list of what the provider was configured with.
   - `projectDirectoryVisible: boolean | null` — whether the operator's project directory (the one
     that may hold a `.env`) is visible inside the sandbox. `null` when it did not look. Never
     `false` by default.
   Both are **measurements or `null`**. A sealed provider that measures both can reach
   `contained`; one that leaves either `null` stays `incomplete`, honestly.
2. **FRONTEND's mirror needs the two fields on the probe type.** `frontend/src/lib/types.ts`'s
   `ContainmentVerification` (line 163) still has the brief-04 shape. The HEAD already knows; the
   delta is the two nullable fields and nothing else.
3. **The design doc's §12.5 still says the offline report is "byte-identical".** It must be
   amended to the corrected claim; `docs/**` was out of scope here.
4. **The live demo has 3 688 tokens of headroom** against the 12 000-token budget. If the demo
   transcript grows, raise `BRZ_RUN_TOKEN_BUDGET` — the demo will otherwise end
   `token_budget_exhausted`, which is a designed outcome and not a crash.
5. **A fallback provider is only as good as its quota.** The chain turns one shared rate limit into
   a rotation, not into infinite capacity: the quota the fallback is on can be exhausted too. When
   the chain is exhausted the run ends `model_error`, with the same honest report.
6. **Flagged scope exception.** `backend/src/runs/standinProvider.ts` is not in this brief's write
   scope, and Requirement 1 names the stand-in explicitly ("the stand-in provider must return `null`
   for both"). I made the smallest possible change there — a documented exported constant and
   comments, **no behaviour change** — because the requirement cannot be satisfied anywhere else.
   The file is also not in the brief's "not yours" list. Flagging it for the HEAD to confirm.
7. **`backend/src/routes/runs.ts` was not touched** (out of scope). The client-disconnect reasoning
   is already documented there from brief 04, and the "supported way to cancel" statement now lives
   on `RunManager.cancel()`'s doc comment, which is in scope.

---

## Mailbox

`AGENTS/message/backend/quality-bar.md` — read and applied. No other message was waiting.
