# Security policy

## Reporting a vulnerability

Please report security issues privately to the maintainers via GitHub's private vulnerability reporting on this repository. Do not open a public issue for a suspected vulnerability.

## Scope

BRZ is a containment-first control plane. Security-relevant areas:

- Credential handling: `.env` values and API keys are never committed, logged, or returned in a response.
- Sandbox isolation: the sealed tier runs user code under bubblewrap with cgroup v2 limits and no direct network.
- Egress: all outbound traffic from the sandbox goes through the control plane's allowlist proxy and is logged.

## Secrets

- `.env` is gitignored and must never be committed.
- `bash scripts/secret-scan.sh` checks tracked files, staged content, untracked files, and git history. CI runs it on every push and pull request.
- If you believe a secret was committed, treat it as compromised and rotate it immediately.