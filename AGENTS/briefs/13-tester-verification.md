<WORK IN PROGRESS>

# 13 — Phase 1 independent verification

Agent name: TESTER. You are TESTER. If no name was given to you, STOP and ask.

**Wave:** 6
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** briefs 04, 05, 06, 08, 10, 12 all `<DONE>`

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/TESTER.md`, then this brief. You are the **first launch** of this agent, so read the standing card once and then rely on your session.

## Goal
Independently verify that Phase 1 is what it claims to be. You are not the author; you do not fix anything; you report. A verdict of **PASS**, **PASS WITH RISKS**, or **FAIL**, with evidence for every claim.

## Why / context
BRZ is a containment-first control plane for AI agents: submit a task, the control plane dispatches real execution into an isolated sandbox, and you get the result **plus** a blast-radius report proving the blast radius was zero. Phase 1 is the sealed local tier plus the operator console. It has been built in six briefs across BACKEND, FRONTEND, ARCHITECT and BUSINESS. It has **never been independently verified**.

Read `AGENTS/CONTEXT.md`, `HACKATHON.md` §3 and §9, `docs/VISION.md` §3 and §4, and `JUDGING-CRITERIA.md` (the rubric you are scoring against).

## Write scope (EXCLUSIVE — do not touch anything else)
- `AGENTS/reports/test-2026-10-23-phase1.md` (new) — your report

You may **read** everything. You may **run** anything. You may **not** edit product code, migrations, `.env`, the harness files, or anything else.

## Read scope
- everything, including both repos' code and the design doc

## Shared / serialized files
- none. You are read-only on product code and write only to `AGENTS/reports/**`.

## What to verify

### A. The contract (design doc vs code)
1. Every TypeScript type in `backend/src/contracts/` matches the design doc §4, §6, §8. Diff them. List mismatches.
2. Every route in `backend/src/routes/` matches §8 (method, path, payload, status codes, error codes). List mismatches.
3. The SQLite schema matches §9. List mismatches.
4. The blast-radius report example in the design doc conforms to `BlastRadiusReport`. List mismatches.

### B. The containment claims (the product's central claim)
5. **Secret hygiene.** Run the sealed sandbox; verify `OPENAI_API_KEY` is absent from its environment. Show the mechanism (the scrubbed env) and the measurement (the report's `environmentKeys`).
6. **No direct egress.** From inside the sandbox, attempt a TCP connection. Show the errno and the report's `network.directAccess`.
7. **Resource caps bite.** Run a sandbox that tries to allocate past the cap. Show it was killed, the exit code, and the report's `memoryPeakBytes` / `cpuSeconds` / `capFired`.
8. **Lifecycle.** After a run, verify the sandbox is destroyed (no process, no directory). Test the timeout case and the client-disconnect case.
9. **The broker.** Verify an egress attempt through the allowlist is logged with its verdict, and a denied attempt appears in the report's `network.attempts`.
10. **The report is assembled from persisted records.** Verify that every field traces to a row (runs, events, toolCalls, sandbox lifecycle, egress attempts, artifacts). Pick one field and trace it end to end.
11. **`Measured<T>` is used literally.** Verify that "not measured" never appears as `0` or `false`, and that every `not-measured` carries a reason.

### C. The agent loop
12. The agent writes real code, runs it in the sandbox, and reports a real result. Show one full run end to end, with the event stream.
13. The error-feedback retry works: a run with a failing test feeds the failure back and retries. Show the two attempts.
14. The run fails honestly: a run that cannot be fixed ends `failed` with `errorCode: "repair_budget_exhausted"` or `"tests_not_green"`, and the report is honest about it.
15. The sandbox decides success, not the model. A model that says "done" without a green verification run ends `failed`.

### D. The HTTP surface
16. Every route returns the correct status code and the frozen error envelope. Test 400, 404, 409, 415, 429, 502.
17. `GET /healthz` → 200 with the inference mode and database state.
18. The `X-Request-Id` header is present on every response.
19. Config fails closed: a missing required variable prevents startup; a non-HTTPS endpoint in production prevents startup; `BRZ_ALLOW_UNAUTHENTICATED=true` is required to bind `0.0.0.0` in production.

### E. The access-control gate
20. The control plane binds `127.0.0.1` by default in production.
21. The service refuses to start in production bound to `0.0.0.0` without `BRZ_ALLOW_UNAUTHENTICATED=true`.
22. `deploy/bootstrap.sh` exists, is idempotent, and generates credentials without printing them. (You may not run it on a clean VM — say so and state what you could not verify.)
23. The reverse proxy config provides TLS + HTTP basic auth.

### F. The frontend
24. The console runs in fixture mode with no backend and shows all four (five?) fixtures.
25. The report panel renders the `incomplete` / `not-measured` case as honesty, not failure.
26. No absolute backend URL, no `VITE_` secret, no dangerous DOM API, no console errors.
27. No horizontal overflow at 390px; full keyboard traversal; reduced motion respected.

### G. The deployment artifacts
28. `README.md` is readable by a judge in five minutes.
29. `SECURITY.md`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`, `.github/workflows/demo.yml` exist and are coherent.
30. The offline demo runs as one command and is deterministic (containment facts byte-identical across runs).

### H. The rubric
31. For each of the four criteria (Presentation, Business Value, Application of Technology, Originality), state what the console currently does that helps and what hurts, and give a score you would defend in a room of judges.

## Constraints
- **Read-only on product code.** You may not edit anything. If you find a bug, report it; do not fix it.
- **No destructive SQL, no schema changes, no migrations.**
- **No `git commit` or `git push`.** No `subagent` tool.
- **No secrets in your report.** Paths and line numbers only.
- If you cannot verify something, say why. Never mark it PASS by assumption.

## Acceptance criteria
- [ ] Every item in §A–§H is addressed, with evidence (command + output) for each.
- [ ] A verdict: **PASS**, **PASS WITH RISKS**, or **FAIL**.
- [ ] P0/P1/P2/P3 findings with repro, expected, actual, suspected area, suggested owner.
- [ ] A "Not tested / limitations" section.
- [ ] A recommendation: ship / fix first / re-test after.
- [ ] Written to `AGENTS/reports/test-2026-10-23-phase1.md` only.

## Verification
- All commands you ran, with their output, pasted into the report.
- `git status --short` → only `AGENTS/reports/test-2026-10-23-phase1.md` should be new/modified by you.

## Out of scope
- Any change to product code, migrations, or `.env`.
- Any change to the harness, the design doc, or the briefs.
- The pitch, the deck, the video.

## Notes
- The design doc is at `docs/architecture/02-phase1-design.md` (2,900 lines). Read §4, §6, §8, §9, §11, §12, §13, §14 — not all of it.
- Your mailbox is `AGENTS/message/tester/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/tester/<slug>.md` and wait for the decision. Do not proceed without it.
- The coordinator's standing instruction is **"never settle for less."** A verdict of PASS means you would defend it in a room of judges. If you cannot, it is PASS WITH RISKS or FAIL.
