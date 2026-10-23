<DONE>

# 10 — CI, PR hygiene, and repo polish

Agent name: GITMASTER. You are GITMASTER. If no name was given to you, STOP and ask.

**Wave:** 4
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** briefs 04, 05, 06, and 08 all `RELEASED` — the product code exists and is tested

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/GITMASTER.md`, then this brief. You are the **first launch** of this agent, so read the standing card once and then rely on your session.

## Goal
Make `main` a branch a judge can land on at 03:00 and understand in five minutes. CI green on every push and PR. Every change arrives via a PR with a description, a checklist, and a link to its brief. The repo reads like a submission, not a work-in-progress.

## Why / context
BRZ is a public repository (github.com/ASAYMAN69/blast-radius-zero, MIT, `main`) and the rubric scores *Application of Technology* on a ladder that a **partial or missing repo caps at 3/5** and a "well thought of" repo earns 4. The repo is currently a bootstrap with a good README but no CI, no PR template, and no branch hygiene. That is the gap this brief closes.

Read `AGENTS/CONTEXT.md`, `HACKATHON.md` §7.3 (what to submit), and `JUDGING-CRITERIA.md` §3.

## Write scope (EXCLUSIVE — do not touch anything else)
- `.github/**`
- `scripts/ci/**`
- `docs/dev/**` (contributor and runbook docs)

## Read scope
- everything — you may read any file to write a good CI pipeline and PR template

## Shared / serialized files
- **You are serialized.** Never run at the same time as another agent that holds an open write scope, and never run two GITMASTER tasks concurrently. In wave 4, DESIGNER writes only to `docs/design/**`, so the two are safe to run in parallel.
- The root `package.json` is **HEAD's**. You may add scripts to it only via a permission request — do not edit it.

## Requirements

1. **GitHub Actions CI** at `.github/workflows/ci.yml`, triggered on push and PR to `main`:
   - `npm ci` at the root (one install, the monorepo way).
   - `npm run typecheck` (fans out to both workspaces).
   - `npm test --workspace backend`.
   - `npm run build --workspace frontend`.
   - `bash scripts/secret-scan.sh` — the scan this repo already ships.
   - **Fail closed.** A red check blocks merge. No `continue-on-error`, no `|| true`.
   - Cache `node_modules` / the npm cache keyed on the lockfile.
2. **A second workflow** `.github/workflows/demo.yml` that runs the offline demo (`npm run demo:offline --workspace backend`) on PRs that touch `backend/**` or `deploy/**`, and uploads the blast-radius report as an artifact. This is the containment beat, automated and re-runnable.
3. **Branch strategy.** Document it in `docs/dev/branch-strategy.md`: `main` is always green and deployable; one branch per brief, named `agent/<role>/<brief-slug>`; never commit to `main` directly; squash-merge with a Conventional Commits subject. Include a worked example using brief 04.
4. **PR template** at `.github/pull_request_template.md` with: what changed, why, the brief it implements, a checklist (tests green, typecheck clean, no secrets, no out-of-scope files, report readable), and the verification commands pasted.
5. **Commit message format** documented in `docs/dev/commit-convention.md`: Conventional Commits, imperative subject under 72 chars, body explains *why*, footer references the brief number. No "wip", no "fix", no "asdf".
6. **Repo hygiene.** Update `README.md` (the repo-level one) so a judge landing on it in five minutes sees: what BRZ is, the one-command local run, the typecheck/test/build commands, the demo command, the deploy path, and the license. Add a `SECURITY.md` stating the disclosure process and the fact that `.env` values and credentials are never committed. Set topics if not already set (they are).
7. **A `CONTRIBUTING.md`** at the root (short) covering: clone, install, run, test, the branch/PR conventions, and the rule that no agent commits without a HEAD brief.
8. **Verify the CI would pass.** Run the exact commands the workflow runs, locally, and paste the results. If a command fails, do not "fix" the product — report the failure and the owner.

## Constraints
- **Do not edit product source** (`backend/**`, `frontend/**`, `deploy/**` except `deploy/README.md`). Your scope is the CI, the docs, and the repo metadata.
- **Do not commit or push.** Leave the working tree for the HEAD.
- **Do not use the `subagent` tool.**
- Never commit a secret, a token, or `.env`.
- If a CI command fails because of the product, report it in the summary with the owner — do not patch the product to make CI green.

## Acceptance criteria
- [ ] Both workflow files are valid YAML (`actionlint` or a `yamllint` run, or a dry-run with `act` if available).
- [ ] The commands in the workflow run locally and pass: `npm ci`, `npm run typecheck`, `npm test --workspace backend`, `npm run build --workspace frontend`, `bash scripts/secret-scan.sh`, `npm run demo:offline --workspace backend`.
- [ ] `README.md` is rewritten for a judge landing in five minutes.
- [ ] `SECURITY.md`, `CONTRIBUTING.md`, `docs/dev/branch-strategy.md`, `docs/dev/commit-convention.md`, and `.github/pull_request_template.md` exist and are useful.
- [ ] No file outside `.github/**`, `scripts/ci/**`, `docs/dev/**`, `README.md`, `SECURITY.md` and `CONTRIBUTING.md` was modified.
- [ ] Secret scan clean.

## Verification
- Run every command the CI workflow runs, locally, and paste the results
- `bash scripts/secret-scan.sh` → PASS
- `git status --short` → only files in your write scope are modified

## Out of scope
- The product code, the sandbox, the report, the deploy scripts' implementation
- The pitch, the deck, the video
- Any change to `AGENT.md`, `STATE.md`, `HACKATHON.md`, or the harness files

## Notes
- The repo is a monorepo with a single root `package.json` and `npm workspaces`. CI installs once at the root. See `docs/MONOREPO.md`.
- The backend has **no emit build** — `npm run build --workspace backend` is `tsc --noEmit`. The frontend produces the only artifact (`frontend/dist/`).
- The secret scanner is the gate that catches the kind of mistake the HEAD almost made with the ad-hoc grep. It is the single most important CI check.
- Your mailbox is `AGENTS/message/gitmaster/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/gitmaster/<slug>.md` and wait for the decision. Do not proceed without it.
