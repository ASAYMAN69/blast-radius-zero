# Branch strategy

BRZ keeps `main` always green and deployable. No one commits to `main` directly.

## Rules

- `main` is always green and deployable. Every commit on `main` passed CI.
- One branch per brief, named `agent/<role>/<brief-slug>`. Examples:
  - `agent/backend/04-backend-core`
  - `agent/gitmaster/10-gitmaster-ci`
- Never commit to `main` directly. All changes arrive via a pull request.
- Squash-merge into `main` with a Conventional Commits subject. One commit per brief on `main`.
- Delete the branch after merge.

## Worked example (brief 04)

1. Branch off `main`: `git checkout -b agent/backend/04-backend-core`.
2. Implement only within the brief's write scope (`backend/**`).
3. Open a PR titled `feat(backend): control plane, agent loop, store, report, HTTP surface (brief 04)`.
4. CI must be green. GITMASTER reviews the diff for scope creep and secrets.
5. Squash-merge into `main`. Delete `agent/backend/04-backend-core`.

## Who may merge

Only GITMASTER merges, and only when CI is green and the PR checklist is complete.