# Contributing

## Clone and install

```bash
git clone https://github.com/ASAYMAN69/blast-radius-zero.git
cd blast-radius-zero
cp .env.example .env   # fill in OPENAI_API_KEY, OPENAI_ENDPOINT, OPENAI_MODEL
npm ci
```

## Run

```bash
npm run dev --workspace backend   # control plane on :8787
npm run dev --workspace frontend  # console on :5173
```

## Test, typecheck, build

```bash
npm run typecheck
npm test --workspace backend
npm run build --workspace frontend
bash scripts/secret-scan.sh
```

## Demo

```bash
npm run demo:offline --workspace backend
```

## Branches and PRs

- One branch per brief: `agent/<role>/<brief-slug>`.
- Never commit to `main` directly. Open a PR.
- Squash-merge with a Conventional Commits subject (see `docs/dev/commit-convention.md`).
- No agent commits without a HEAD brief.

## Deploy

```bash
sudo bash deploy/bootstrap.sh
```

See `deploy/README.md`.