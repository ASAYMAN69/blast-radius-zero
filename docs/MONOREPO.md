# Monorepo note (from HEAD) — the workspace root is decided

> Added mid-flight by the HEAD. If your brief says "no root `package.json`", **ignore that line** — the monorepo root now exists and is fixed.

## What is decided

BRZ is a **monorepo**: one git repository, one npm workspace root.

```
brz/                     ← this repo, one root package.json, one lockfile, one node_modules
├── package.json         ← root workspace manifest — HEAD's file, already written
├── tsconfig.base.json   ← shared strictness — HEAD's file, already written
├── backend/             ← workspace package "backend"
├── frontend/            ← workspace package "frontend"
├── deploy/              ← not an npm package; shell + systemd + templates
├── docs/                ← architecture, business, design
└── AGENTS/              ← the harness
```

## Rules

1. **One root `package.json`, one root lockfile, one `node_modules`.** `npm install` at the root installs everything. Never create a second lockfile and never run `npm install` inside a workspace package.
2. **The root `package.json`, `tsconfig.base.json`, both workspace `package.json` files, and the root lockfile belong to the HEAD.** The HEAD writes the two workspace manifests between wave 1 and wave 2, using the dependency list from the design document, then runs one `npm install` at the root. Workers write **source only** and never touch a manifest or a lockfile. If you need a dependency that is not listed, request permission with the reason and the HEAD adds it.
3. **Each workspace owns its own `package.json`.** `backend/package.json` is BACKEND's, `frontend/package.json` is FRONTEND's. They are listed in the root `workspaces` array already.
4. **Each workspace's `tsconfig.json` extends the root base.** The base supplies the strictness knobs — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `verbatimModuleSyntax`, `isolatedModules`. The workspace file supplies only what differs: `module`, `moduleResolution`, `lib`, `types`, `outDir`, `include`. **Do not re-declare the strictness flags** — one place, so the two packages cannot drift.
5. **Root scripts fan out.** `npm run typecheck` at the root runs every workspace's `typecheck`. So a workspace must define a `typecheck` script, or the root fan-out silently skips it. The same applies to `build`, `test`, `lint`, `dev`.
6. **Node 24 only.** `node:sqlite` and `node:test` are built in — the backend needs no test-runner dependency and no database driver.
7. **ESM throughout.** `"type": "module"` at the root. The backend uses `module: NodeNext`; the frontend uses `module: ESNext` with `moduleResolution: bundler`.
8. **One dependency install, one CI install.** CI runs `npm ci` at the root, once.

## What this means for the design document

§10 (file layout) must specify the files **inside** `backend/` and `frontend/`. The top-level layout above is **fixed** — describe it, do not redesign it. The workspace package names are `backend` and `frontend`.
