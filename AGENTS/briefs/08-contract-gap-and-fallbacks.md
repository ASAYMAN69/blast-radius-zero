<WORK IN PROGRESS>

# 08 — Close the contract gap and make the provider resilient

Agent name: BACKEND. You are BACKEND. If no name was given to you, STOP and ask.

**Wave:** 2 (parallel — no write-scope conflict with FRONTEND or BUSINESS)
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 04 (`<DONE>`) — you wrote the code; this is a focused follow-up in your own session

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/BACKEND.md`, then this brief. You are in your **existing session** — you wrote `backend/**` and you know it. Re-read `AGENTS/completion/04-backend-core.md-summary.md` first; this brief exists because of what you found in it.

## Goal
Three fixes, in priority order.

1. **Close a contract gap you found** so that a *sealed* run can leave `incomplete` and reach `contained`. Right now it cannot, and that would ship a product whose report is permanently incomplete.
2. **Make the inference client survive a provider rate limit** by adding a fallback provider chain.
3. **Put a hard token budget on a run** so a demo can never burn through a shared quota.

## Why / context
Your brief-04 summary reported a deviation that is not yours to fix and is not a detail — it is a **ship blocker**:

> *"The frozen `ContainmentVerification` (§4.1) cannot fill the frozen `IsolationFact` (§6.3). `IsolationFact` requires `namespaces` and `SecretHygieneFact` requires `projectDirectoryVisible`; the probe type has neither. … Brief 06 must extend the probe to carry them, or a sealed run would report `incomplete` forever."*

You were right, and the gap is exactly **two fields**. You also reported that a live run died on an 8 000 tokens/minute provider quota, ending `failed` / `model_error` — an honest failure, but a failure. The demo is the most valuable artifact in the whole project and it is competing for a shared quota. Fix both.

## Write scope (EXCLUSIVE — do not touch anything else)
- `backend/src/contracts/sandbox.ts`
- `backend/src/contracts/report.ts`
- `backend/src/inference/**`
- `backend/src/config.ts`
- `backend/src/runs/report.ts`
- `backend/src/runs/manager.ts`
- `backend/src/demo/**`
- `backend/test/**`

You may **read** everything else. `backend/src/db/**`, `backend/src/agent/**`, `backend/src/http/**`, `backend/src/routes/**` and `backend/src/server.ts` are **not** yours in this brief — if a change is needed there, request permission and say why.

> **Note on `backend/src/contracts/`.** FRONTEND hand-copies from it. Any change you make to a contract type **must be mirrored by FRONTEND**. The HEAD has already told FRONTEND about the two fields below, and FRONTEND's mirror already carries `namespaces` and `projectDirectoryVisible` on the report types. What FRONTEND does **not** yet have is the two new fields on the **probe** type. Keep the change to exactly those two fields so the mirror stays a two-line edit for them.

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `AGENTS/completion/04-backend-core.md-summary.md` — your own report
- `docs/architecture/02-phase1-design.md` — the frozen contract (§4, §6, §7, §8, §9, §12, §14)
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- none. No manifest, no lockfile, no tsconfig.

## Requirement 1 — the two missing probe fields (highest priority)

**The gap, precisely.** `ContainmentVerification` (`contracts/sandbox.ts`) is what a provider's `verify()` returns. `IsolationFact` (`contracts/report.ts`) is what the report's `processIsolation` needs. Four of `IsolationFact`'s five fields already have a source in the probe. **Two do not:**

| Missing field | Needed by | How the sealed tier can genuinely measure it |
|---|---|---|
| `namespaces: readonly string[]` | `IsolationFact.namespaces` | The probe runs **inside** the sandbox and reads `/proc/self/ns/*` — the namespace kinds actually in effect. ARCHITECT already measured the sandbox's `/` and its environment from inside; this is the same technique. A `bwrap` sandbox should report `['user', 'mount', 'pid', 'net', 'ipc', 'uts']` (or whatever it actually entered — **measure, do not declare**) |
| `projectDirectoryVisible: boolean` | `SecretHygieneFact.projectDirectoryVisible` | The probe checks whether the operator's project directory path (which may hold a `.env`) exists inside the sandbox. With the minimal bind set it does **not** — and that is the point: this fact is the proof that a `.env` cannot be read |

**The change.**
- Add **exactly two fields** to `ContainmentVerification`:
  ```ts
  /** The namespace kinds in effect inside the sandbox. `null` when not measured. */
  readonly namespaces: readonly string[] | null;
  /** Was the operator's project directory (which may hold a `.env`) visible inside
   *  the sandbox? `null` when not measured. */
  readonly projectDirectoryVisible: boolean | null;
  ```
  `null` means **"not measured"** — never `false`, never `[]`. A fabricated `false` or `[]` would be exactly the lie this product exists to prevent. Document it that way in the doc comment.
- The **stand-in provider must return `null` for both** — it cannot measure either.
- The **report derivation** must map `null` → `not-measured` **with a reason naming the missing field**, using the same machinery you already built. `IsolationFact.namespaces` and `SecretHygieneFact.projectDirectoryVisible` must then become `measured` when the probe carries them and `not-measured` when it does not.
- **The verdict rule must be re-checked against this.** Today a sealed run is `incomplete` because the facts are missing. Once the probe carries them, a sealed run that satisfies everything must be able to reach `contained` (or `contained-with-denials` when the broker denied the probe's egress attempt). Add a test that proves a **synthetic probe carrying both fields** produces `contained`, and that a probe missing them still produces `incomplete`. Without the first test, the gap could silently reopen.
- **Do not change any other contract type.** The union members, the routes, the error codes and the report shape stay as they are.

**Hand-off to brief 06.** Brief 06 implements the sealed provider. Tell it, in your summary, the exact contract it must satisfy: the two fields, their names, their `null` semantics, and the fact that the probe must **measure** them from inside the sandbox rather than declare them. The HEAD will carry this into brief 06.

## Requirement 2 — a fallback provider chain

**The problem.** The live demo died on a shared 8 000 tokens/minute quota. A single-provider client means one shared quota decides whether the single most important artifact in the project works.

**The change.**
- **Config.** One new env var, `OPENAI_FALLBACKS`, holding a **JSON array** of provider entries:
  ```json
  [{"endpoint":"https://api.groq.com/openai/v1","apiKey":"...","model":"openai/gpt-oss-120b"}]
  ```
  Absent or empty → **no fallbacks, and today's behaviour is unchanged**. Parsed once at startup, validated with the **same** rules as the primary (absolute URL, HTTPS in production), and a malformed entry must **fail closed with a message that names the variable and never prints a value**. A fallback entry may omit `model` and inherit the primary's; it may omit `apiKey` and inherit the primary's.
- **Client behaviour.** On a **`rate_limited`** response, or a **`timeout`**, rotate to the next provider in the chain and retry the same request. On any other `4xx` **do not rotate** — a bad request is our bug, and rotating would hide it. On a `5xx`, rotate.
- **Accounting.** The provider that actually served a call is recorded on the run's event stream, and a rotation is recorded as its own event. A run's report must show which provider served it. **Never log a key** — the client already scrubs the primary key out of provider text; do the same for every fallback key.
- **No behaviour change on the happy path.** The primary is tried first, every time. A fallback is only reached on `rate_limited`, `timeout` or `5xx`.
- Add tests: rotation on 429, **no** rotation on a 400, exhaustion of the chain produces the existing `model_error` shape, and the config parser rejects a malformed `OPENAI_FALLBACKS` without echoing a secret.

## Requirement 3 — a hard token budget per run

- **Config:** `BRZ_RUN_TOKEN_BUDGET` (default `12000`, `0` disables). The budget covers **the whole run** — prompt and completion tokens summed across every call.
- **Behaviour:** when the run's cumulative usage would exceed the budget, the run stops and ends with a dedicated, honest error code — add `token_budget_exhausted` to the run-error union, and make it a **run** error, not an HTTP one. The report records the usage reached and the budget, and the headline says the budget was exhausted. A budget-stopped run is not a crash; it is a designed outcome.
- Add a test that a run stops at the budget and that the report says so.

## Requirement 4 — record the three accepted amendments

Your summary reported three deviations that are **correct and are now accepted**. Do not change the behaviour — **record them** so the design doc and the code do not disagree silently:

1. **The report is assembled after the teardown.** Accept it — `lifecycle.*` and `containment.lifecycle` *are* teardown facts, and a report written before the destroy could only guess them. Add a short comment at the assembly site explaining exactly this, and note it in your summary so the HEAD can amend the design doc's §7.1 diagram.
2. **Client-disconnect cancellation is honoured only before the `202`.** Accept it — the console polls over separate requests, so cancelling on any later socket close would kill healthy runs. Ensure the comment in the code says *why*, and that the explicit `POST /api/v1/runs/{id}/cancel` route is documented in the API doc comment as the supported way to cancel.
3. **The offline demo is deterministic, not byte-identical.** Accept it — the report carries measured durations and timestamps, and freezing measurements is the "fabricated number" this project exists to avoid. **Adjust the claim, not the code**: any comment, doc string, or printed output that says "byte-identical" must be corrected to say **deterministic in everything the control plane decides — transcript, commands, exit codes, verdict, event sequence, structure — while measured durations and timestamps differ between runs.** The HEAD has separately recorded that the **containment beat** (verdict, denial, caps, teardown) is the part that must be identical, and that is what brief 06 will verify.

## Constraints
- **The design doc wins on conflict** — except for the two probe fields in Requirement 1, which the HEAD is explicitly amending, and the three accepted deviations in Requirement 4.
- **Never fabricate a measurement.** `null` means not measured. A `0` is only ever written when something was genuinely measured as zero.
- **Strict TypeScript**, no `any`, no new dependencies. The fallback chain needs no library.
- **No new env var beyond `OPENAI_FALLBACKS` and `BRZ_RUN_TOKEN_BUDGET`.** If you need a third, request permission with the reason.
- **Never print or log a key** — primary or fallback.
- Do not touch `frontend/**`, `docs/**`, `deploy/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.

## Acceptance criteria
- [ ] `npm run typecheck --workspace backend` → clean.
- [ ] `npm test --workspace backend` → all green, with the new tests: a synthetic probe carrying both fields yields `contained`; a probe missing them yields `incomplete`; rotation on 429; **no** rotation on 400; chain exhaustion → `model_error`; malformed `OPENAI_FALLBACKS` → fail closed without echoing a secret; the run stops at the token budget and the report says so.
- [ ] `ContainmentVerification` gained **exactly** the two specified fields, both nullable, both documented as "not measured" when `null`.
- [ ] The stand-in returns `null` for both.
- [ ] The report maps `null` → `not-measured` with a reason naming the missing field, and never writes a fabricated `false` or `[]`.
- [ ] `OPENAI_FALLBACKS` is optional; with it unset, behaviour is **identical** to brief 04.
- [ ] A rotation is visible on the event stream and in the report; no key appears in any log line.
- [ ] The "byte-identical" wording is corrected everywhere it appears in code, comments and demo output, per Requirement 4.3.
- [ ] The three accepted deviations each carry a comment explaining the reasoning.
- [ ] `npm run demo:offline --workspace backend` → exit 0.
- [ ] `npm run demo --workspace backend` (live) → exit 0, or a **clean, honest** failure with a rate-limit reason if the shared quota is exhausted. Paste the output either way — a real recorded result, not a paraphrase.

## Verification
- `npm run typecheck --workspace backend` → clean
- `npm test --workspace backend` → green, with the counts of the new tests
- `npm run demo:offline --workspace backend` → paste the output
- `npm run demo --workspace backend` → paste the output
- Grep `backend/src` for `byte-identical` and paste every hit with its surrounding line — then show the corrected wording for each
- Grep the logs from a fallback rotation for the key and paste the result, showing it is absent
- Confirm `ContainmentVerification` has exactly the two new fields and nothing else changed: paste the type

## Out of scope
- The sealed sandbox, the broker, the egress allowlist — **brief 06**
- `deploy/**` — **brief 06**
- The frontend — FRONTEND is working in parallel
- Changing the report shape, the routes, the error-code map, or the agent loop
- The pitch, the market analysis, the video

## Notes
- You found the contract gap. That is exactly the kind of thing this build needs, and you reported it instead of quietly working around it. Keep doing that.
- The coordinator's standing instruction is **"never settle for less."** So Requirement 1 is not "make the report compile" — it is "a sealed run can reach `contained`, and there is a test that proves it."
- Your mailbox is `AGENTS/message/backend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/backend/<slug>.md` and wait for the decision. Do not proceed without it.
