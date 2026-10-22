# BRZ

> **Status:** harness ready, product not yet defined.
> The coordinator (the user) owns product scope. The main agent owns the plan, the briefs, and the integration.

## What this repo is right now

A **multi-agent working harness** around an empty product:

```
AGENT.md          ← the harness: rules for the main agent (this session)
HACKATHON.md      ← the product brief: Vultr Agent Rush Hackathon requirements
AGENTS/           ← protocols, roles, briefs, completions, mailbox, permissions, reports
skills/           ← 17 reusable skills (finance, fundraising, legal, infra)
docs/             ← architecture, design, and user documentation
```

## How work flows

```
You (coordinator)  →  main agent (plans, writes briefs, locks scopes)
                       ↓  gives you one line per agent
                 You open that agent, paste the line
                       ↓
                 Agent works in its locked write scope
                       ↓  writes a summary to AGENTS/completion/
                 Main agent reviews, integrates, commits
```

The only thing you have to do per agent:

```
INVOKE: FRONTEND
Read AGENTS/briefs/03-auth-endpoint.md and start working
```

## Non-overlap guarantee

Every brief declares an **exclusive write scope**. The ledger at `AGENTS/scope_ledger.md` records who owns which paths in which wave. Two briefs in the same wave may not overlap — the main agent checks this before dispatching. Shared files (lockfiles, root config, migrations) are serialized: one owner per wave.

## Start here

1. Read `AGENT.md` (the main agent's rules).
2. Read `AGENTS/README.md` (harness index).
3. Tell the main agent what BRZ is. The first wave is then planned and dispatched.
