# AGENTS/ — the BRZ harness index

Everything the coordinator and the workers need, in one place.

| File | What it is |
|---|---|
| `delegation_protocol.md` | **Core.** How a request becomes a brief, how the coordinator is told what to invoke, how the HEAD integrates. |
| `sub_agent_protocol.md` | Worker-side rules: exclusive write scope, mailbox etiquette, completion marker, summary format. |
| `agent_roles.md` | Role cards, home scopes, identity lines, per-role specifics. |
| `roles/<AGENT>.md` | The standing instruction card a worker reads once per session. |
| `brief_template.md` | The exact skeleton every brief follows. |
| `scope_ledger.md` | Who owns which paths right now. The non-overlap enforcement table. |
| `permissions/PROTOCOL.md` | **Out-of-scope access is granted, never assumed.** The request → review → grant → act procedure, and the never-grantable list. |
| `permissions/README.md` | Permission request template + index of decisions. |
| `briefs/` | Briefs written by the HEAD. **This is what a worker reads.** |
| `completion/` | Summaries written by workers after finishing a brief. |
| `message/` | Cross-worker mailboxes: `message/<agent>/<from>.md`. |
| `reports/` | TESTER reports and DBMASTER reviews. |
| `features/` | Per-feature documentation (one file per shipped feature). |

## The 30-second version

**Coordinator:** the HEAD writes a brief, then hands you a one-line prompt per agent. You open that agent's session, paste the line, and come back when it finishes.

**Worker:** you are named in the brief. You read `AGENT.md` and the brief, you work only inside the write scope, you write your summary to `AGENTS/completion/`, you mark the brief `<DONE>`. Nothing else.

**HEAD:** you plan, you lock scopes, you dispatch, you review, you integrate, you commit.

## Directory contract

```
brz/
├── AGENT.md                  # main harness — the rules
├── AGENTS/
│   ├── delegation_protocol.md
│   ├── sub_agent_protocol.md
│   ├── agent_roles.md
│   ├── roles/              # <AGENT>.md standing cards
│   ├── brief_template.md
│   ├── scope_ledger.md
│   ├── permissions/         # PROTOCOL.md + request files with HEAD decisions
│   ├── briefs/               # NN-slug.md
│   ├── completion/           # NN-slug.md-summary.md
│   ├── message/<agent>/      # <from>.md
│   ├── reports/              # test-*.md, db-*.md
│   └── features/             # <feature>.md
├── skills/                   # skill library (17 skills)
├── docs/                     # architecture, design, user docs
└── TODO.md                   # only while a plan is in flight
```

## Status markers

| Marker | Where | Meaning |
|---|---|---|
| `<WORK IN PROGRESS>` | top of a brief | agent is working on it |
| `<DONE>` | top of a brief | finished and verified |
| `<BLOCKED>` / `<PARTIAL>` | top of a brief | not finished; see the summary |
| `PENDING` / `ACTIVE` / `RELEASED` | scope ledger | dispatch state |
