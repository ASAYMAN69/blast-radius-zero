# BRZ — Blast Radius Zero

Containment-first control plane for AI agents. The user gives a task; BRZ plans the work, dispatches the real execution into an isolated, ephemeral sandbox, verifies the result, and returns evidence plus a blast-radius report showing that the execution could not reach anything it should not.

**Not a chat wrapper. A runtime that makes agent execution safe enough to approve.**

Challenge 01 — *Blast Radius Zero* — of the Vultr Agent Rush Hackathon (lablab.ai × Vultr). MIT licensed.

## What you get

- A control plane (`backend/`) that runs an agent loop against an OpenAI-compatible provider.
- A sealed sandbox tier (bubblewrap + cgroup v2 + rlimits): no direct network, real resource caps, ephemeral per task.
- A blast-radius report: files changed, tests, commands, network attempts, lifecycle, containment verdict.
- An operator console (`frontend/`) to submit a task and read the report.
- A one-command offline demo that proves the containment story without any API key.

## Quick start (local)

```bash
cp .env.example .env   # fill in OPENAI_API_KEY / OPENAI_ENDPOINT / OPENAI_MODEL
npm ci
npm run dev --workspace backend   # http://127.0.0.1:8787
npm run dev --workspace frontend  # http://127.0.0.1:5173
```

## Verify

```bash
npm run typecheck
npm test --workspace backend
npm run build --workspace frontend
bash scripts/secret-scan.sh
```

## Demo (offline, no API key)

```bash
npm run demo:offline --workspace backend
```

Runs the full containment scenario and prints the blast-radius report. Exits 0 on success.

## Deploy

```bash
sudo bash deploy/bootstrap.sh
```

See `deploy/README.md` for the URL and credentials.

## Repository layout

```
backend/     control plane (TypeScript, Node 24)
frontend/    React + Vite operator console
deploy/      bootstrap, systemd unit, Caddy config
docs/        architecture, business, design, dev
scripts/     envcheck, secret-scan
```

## License

MIT — see `LICENSE`.