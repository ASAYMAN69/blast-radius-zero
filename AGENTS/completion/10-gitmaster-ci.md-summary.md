# 10 — CI, PR hygiene, and repo polish — summary

**Status:** DONE

## What changed

- `.github/workflows/ci.yml` — CI on push/PR to main: npm ci, typecheck, backend tests, frontend build, secret scan. Cached npm via setup-node. Fail closed.
- `.github/workflows/demo.yml` — offline demo on PRs touching backend/** or deploy/**, uploads blast-radius report artifact.
- `.github/pull_request_template.md` — PR template with checklist and verification commands.
- `docs/dev/branch-strategy.md` — branch naming, squash-merge, worked example (brief 04).
- `docs/dev/commit-convention.md` — Conventional Commits format and forbidden subjects.
- `README.md` — rewritten for a judge landing in five minutes.
- `SECURITY.md` — disclosure process, secret handling.
- `CONTRIBUTING.md` — clone, install, run, test, branch/PR conventions.
- `AGENTS/briefs/10-gitmaster-ci.md` — marked `<DONE>`.

## Verification

- `npm ci` → added 73 packages in 7s (exit 0)
- `npm run typecheck` → backend + frontend clean (exit 0)
- `npm test --workspace backend` → 91 tests, 0 failures (exit 0)
- `npm run build --workspace frontend` → built in 3.36s (exit 0)
- `bash scripts/secret-scan.sh` → PASS
- `npm run demo:offline --workspace backend` → succeeded, verdict contained, all assertions passed
- YAML validation (PyYAML) → both workflow files valid
- `git status --short` → only files in write scope modified (plus pre-existing STATE.md and other agents' files)

## Notes

- No product source edited.
- No commit or push performed; working tree left for HEAD.