# 03 — Phase 1 system design and frozen contracts — COMPLETION SUMMARY

> **Agent:** ARCHITECT · **Brief:** `AGENTS/briefs/03-phase1-design.md` · **Date:** 2026-10-23
> **Artifact:** `docs/architecture/02-phase1-design.md` (2 849 lines, 13 required sections + a frozen-decisions list + two appendices)

---

## Status

**DONE.** The design document is written, every TypeScript type in it compiles under `strict` + `noUncheckedIndexedAccess` + `erasableSyntaxOnly`, the example blast-radius report is valid JSON **and** structurally conforms to the `BlastRadiusReport` type, and every `bwrap` flag, cgroup path and Vultr endpoint in it was verified on the build machine or against the cited public docs.

---

## What changed

| File | Why |
|---|---|
| `docs/architecture/02-phase1-design.md` | **Created.** The whole deliverable. |
| `AGENTS/message/architect/monorepo-update-READ.md` | Renamed from `monorepo-update.md` after reading (protocol §2 mailbox etiquette). |

**Nothing else was touched.** No product code, no manifest, no lockfile, no brief, no ledger, no role card.

---

## The decisions, in one screen

**§2 — the workload.** **`self-healing-runner`**, specialised to a single-file Python bug fix with a stdlib `unittest` suite (named direction #5 in `HACKATHON.md` §3.3). The deciding argument: *the answer must be in the error message*. A seeded exclusive-range bug produces `AssertionError: 10 != 15`; a thin agent's job is one comparison and one edit. The error-feedback retry is **native to the workload** rather than bolted on. Seven other named directions were considered and rejected in writing, with the reason for each.

**§4 — the seam.** A complete, copy-pasteable `SandboxProvider` declaration with doc comments on every member. The no-network guarantee is **type-level** (`readonly direct: 'blocked'` — a provider cannot widen it without editing the file) and **measured** (`verify()` returns observations, never claims). `BwrapProvider` and `VultrVMProvider` are specified side by side.

**§6 — the report.** The full type plus a filled-in example. The load-bearing construct is `Measured<T>`, which makes "not measured" **impossible to write as `0`** at the type level. The verdict rule is deterministic and given as a function.

**§8 — the API.** Ten routes with full request/response types, a frozen error-code → status table, frozen per-status generic messages, and the exact mapping from HTTP outcome to the five UI states.

**§9 — the schema.** The complete `node:sqlite` migration, every column, type, constraint and index, the migration mechanism, and the exact query for each store function.

---

## Contracts the downstream briefs depend on — tell the workers these

1. **The frozen types live in `backend/src/contracts/`, not `backend/src/sandbox/`.**
   `contracts/sandbox.ts` holds the `SandboxProvider` interface. `sandbox/` holds only *implementations*. This resolves the brief-04/brief-06 write-scope collision: **brief 04 owns `contracts/`**; **brief 06 owns `sandbox/` + `broker/` + `deploy/`**; neither re-declares the interface.
   *Implementation:* `backend/src/contracts/{api,events,report,sandbox,broker,workload}.ts`.

2. **Brief 04 implements a stand-in provider at `backend/src/runs/standinProvider.ts`** (inside its own scope) and it **must** produce `verdict: 'incomplete'` with `not-measured` containment facts. A stand-in that claims containment is a false claim. Brief 06 replaces it with `BwrapProvider`.

3. **The `SandboxProvider` interface is frozen.** If it looks wrong, implement the closest reasonable reading, mark it in a comment, and say so loudly in the summary. Do not silently deviate.

4. **The exact `bwrap` argv, the cgroup discovery algorithm, and the cgroup file values are in §4.3 and §4.4.** They are measured, not guessed. The single most important implementation detail: **the sandbox must be started through `/bin/sh -c 'echo $$ > <cgroup>/cgroup.procs && exec bwrap …'`** — `bwrap` forks before it execs, so moving its PID afterwards does not move the child and **the caps silently do not apply** (measured: `memory.peak` stayed at 256 KB while 400 MB was allocated).

5. **The backend has no emit build.** Its `build` script is `tsc --noEmit`. This is forced: `.ts` import specifiers require `allowImportingTsExtensions`, and TypeScript then refuses to emit (`TS5096`, measured). No `dist/` for the backend.

6. **The demo is `npm run demo --workspace backend`**, with `npm run demo:offline --workspace backend` as the byte-deterministic variant. The demo asserts 13 containment invariants (D1–D13) and exits non-zero if any fails.

7. **The dependency list in §10.3 is the input the HEAD needs** to write the two workspace manifests. The backend has **zero runtime dependencies**; the frontend has React, React DOM, Vite and the React plugin. Nothing else.

8. **The environment contract is §10.8** — every variable, its default, and the four fail-closed rules. No worker should invent a variable, and no worker should add a default that the table does not have.

---

## Two things the HEAD must act on

> **These brief statements are now outdated. I cannot edit the briefs — they are yours.**

1. **Briefs 04 and 05 say "root `package.json` → do not create" and "backend/package.json → owner: you, this wave".** The monorepo decision (`docs/MONOREPO.md`, added mid-flight) supersedes both: the root manifest, the base tsconfig, **both workspace manifests** and the root lockfile are **HEAD's**, written between wave 1 and wave 2, with one root install. **Briefs 04 and 05 need their "Shared / serialized files" sections updated before dispatch.** The design doc already assumes the new arrangement throughout.

   > **Update — the HEAD has already applied this.** I re-read briefs 04 and 05 after writing this summary: their "Shared / serialized files" sections now correctly say the manifests and the lockfile are HEAD's, and `AGENTS/scope_ledger.md` records "none — all manifests are HEAD's" for both. **No action needed on the briefs; point 1 is closed.**
   >
   > **What remains for the HEAD, between wave 1 and wave 2:** write `backend/package.json` and `frontend/package.json` from **§10.3** and run one root `npm install`. Two details in that manifest are easy to get wrong and are specified in **§10.4**:
   > - the backend's **`build` script is `tsc --noEmit`** — there is no emit step, because `.ts` import specifiers require `allowImportingTsExtensions`, and TypeScript then refuses to emit (`TS5096`, measured). The root fan-out needs the script to exist or it silently skips the backend.
   > - **every workspace must define `dev`, `build`, `typecheck`, `test` and `lint`**, or `npm run <script> --workspaces --if-present` silently skips that workspace.

2. **Brief 04 §Requirements says "No dependencies beyond what the design doc lists"** — §10.3 now lists them exactly, so BACKEND needs no permission request for `typescript` and `@types/node`, and FRONTEND needs none for React, React DOM, Vite or the React plugin. Anything else still needs a grant.

**Also worth a decision:** the demo's *determinism* is defined precisely in §12.5 — the containment facts, denial, caps, teardown and verdict are byte-stable; the agent's prose and the durations are not. The demo therefore **retries the whole run up to twice** if the suite comes back red and reports which attempt succeeded. If you would rather the video never show a failed attempt, `demo:offline` is the byte-deterministic fallback — but then the shipped demo is a mock, which `AGENTS/CONTEXT.md` treats as a scoring risk. I recommend keeping the live demo plus the retry.

---

## Verification

| Check | Command | Result |
|---|---|---|
| Every TypeScript block compiles | `tsc --noEmit` (5.9.3, `strict` + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax`) over the 12 extracted blocks | **0 errors** |
| The example report conforms to the type | the JSON block assigned to `BlastRadiusReport` and typechecked | **0 errors** |
| The example report is valid JSON | `JSON.parse` | **valid** |
| `bwrap` flags are real | `bwrap --help` on this machine, bubblewrap **0.13.0** | **all 21 flags present** |
| The cgroup path is real and writable | walk from `/proc/self/cgroup`; `mkdir`, write `memory.max`/`memory.swap.max`/`cpu.max`/`pids.max`, read back | **verified** |
| The memory cap actually bites | 96 MiB cap, sandbox allocated 400 MB | **OOM-killed at exactly the cap**; `oom_kill 1`, `memory.peak == 100663296`, exit **137** |
| The "move after spawn" race is real | moved `bwrap`'s PID into the cgroup after spawn | **cap did not apply** (`memory.peak` 256 KB) — hence the `sh -c` wrapper |
| The root bind is minimal and safe | `os.listdir('/')` inside the sandbox | exactly `{bin,dev,etc,lib,lib64,proc,sbin,tmp,usr,work}`; **no** `/home`, `/root`, `/mnt`, `/sys`, `/var` |
| The env is scrubbed | `os.environ` inside the sandbox | exactly `{HOME, LANG, PATH, PWD}` |
| Direct egress is dead | `socket.create_connection(('1.1.1.1',443))` inside the sandbox | `OSError` / `ENETUNREACH` |
| The broker channel works with no network | a `AF_UNIX` round trip from inside the netns-unshared sandbox | **reached the broker** |
| The repo's `.env` would have leaked under `--ro-bind / /` | `ls -l .env` | mode **0777** — the minimal bind set is load-bearing, not cosmetic |
| `node:sqlite` | `new DatabaseSync(':memory:')` | works; SQLite **3.53.3** on Node **24.19** |
| Node 24 type stripping | `process.features.typescript` | `"strip"`; `.ts` specifiers required; `enum` rejected; `node --test` runs `*.test.ts` |
| A backend `tsc` emit build is impossible | `allowImportingTsExtensions` + emit | **`TS5096`** |
| `--env-file-if-exists` | `node --env-file-if-exists=./missing.env` | supported, exits 0 |
| The Vultr API surface | the official API page (JS-rendered, `403` to plain fetch) **and** the public OpenAPI 3.0 mirror | `POST /instances` → 202 with `region`, `plan`, `os_id`, `label`, `hostname`, `sshkey_id`, `user_data` (**base64**); `GET /instances/{id}` → 200 with `status`/`power_status`/`server_status`; `DELETE /instances/{id}` → 204; `POST /instances/{id}/start` → 204. `os_id 2284` = Ubuntu 24.04 LTS x64. |

**Cited, with access dates, in Appendix B.** The official Vultr API page returns `403` to a plain fetch, so the field-level detail was read from a public OpenAPI 3.0 mirror of that spec — the document says so explicitly rather than implying a direct read.

---

## Risks and open items for the coordinator

1. **The Vultr tier is untested.** The cold-start assumption (**p90 = 120 s**, timeout 300 s) and the destroy path are **assumptions**, labelled as such in §4.6 with a plan to measure at kickoff. The mock covers nine cases including destroy failure and a leaked instance.
2. **The stand-in provider exists for exactly one brief.** It is the only place in the design where containment is *not* real, and the design forces it to say so. If brief 06 slips, the shipped reports are `incomplete`, not `contained` — correctly.
3. **The demo's live model may fail to fix the bug.** Mitigated by the fixture design (the answer is in the error message) and the two-run retry. It is not eliminated.
4. **Auth is explicitly out of Phase 1**, and the control plane binds `0.0.0.0`. The judge-facing deployment must therefore sit behind an access control. §8.4 says this plainly rather than implying the app is access-controlled.
5. **VISION §4 lists nine rules, not ten.** The brief said ten. Rule 6 carries two independently testable obligations, so §11 states ten criteria. The count difference is recorded in §11 rather than papered over.
6. **`docs/MONOREPO.md` arrived mid-flight.** §10, §1.4, §8.1, §11, §12, §13 and §14 were re-checked against it. Everything else was unaffected — §9's schema is unchanged, and §4, §6, §7 and §12 (the highest-value sections) needed no edits.

---

## Index entry for `AGENT.md` `<featureInfo>`

> **[Phase 1 Design](docs/architecture/02-phase1-design.md)**: the frozen contract for brief 03 — the `SandboxProvider` seam and both tiers, the blast-radius report shape, the API contract, the `node:sqlite` schema, the file layout, the portability criteria, and the demo scenario.

*(The HEAD owns the `<featureInfo>` index; this is the title and one-liner to paste.)*

---

## Recommended next step

Briefs 04 and 05 can be dispatched **in parallel** — the contracts they implement against are frozen and complete, and their shared-file sections are already correct for the monorepo. The only thing to do first is write the two workspace manifests from §10.3 and run one root `npm install` (point 1 above), because BACKEND and FRONTEND are both told not to touch a manifest.

`AGENTS/scope_ledger.md` still shows brief 03 as **READY**; the HEAD should mark it **RELEASED** when it dispatches wave 2.
