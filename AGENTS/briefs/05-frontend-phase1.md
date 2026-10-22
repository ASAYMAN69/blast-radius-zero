<WORK IN PROGRESS>

# 05 — Phase 1 operator console (React + Vite)

Agent name: FRONTEND. You are FRONTEND. If no name was given to you, STOP and ask.

**Wave:** 2
**Assigned by:** HEAD
**Date:** 2026-10-23
**Depends on:** brief 03 (ARCHITECT) must be `RELEASED` — its design doc is your contract

> **Before starting:** read `AGENTS/CONTEXT.md`, then `AGENT.md`, then `AGENTS/roles/FRONTEND.md`, then this brief. **Your contract is `docs/architecture/02-phase1-design.md`** — read it in full before writing code. If it conflicts with this brief, **the design doc wins**, and say so in your summary.

## Goal
Build the Phase 1 operator console: a clean, credible web app where someone submits a task, watches the run happen, and reads the result together with the **blast-radius report** — the artifact that is supposed to make a judge trust the system. When this brief is done, the console is usable, good-looking, and correct against the API contract, even before the sealed sandbox lands.

## Why / context
BRZ is a containment-first control plane for AI agents: submit a task → the control plane dispatches real execution into an isolated sandbox → you get the result **and** a report proving the blast radius was zero.

Read `AGENTS/CONTEXT.md` (stack, non-negotiables), then the design doc §8 (API contract), §6 (blast-radius report shape), and §2 (the Phase 1 workload).

**BACKEND is building the API at the same time as you.** You will not have a running server for most of your task. Therefore:

- Build against the **types in the design doc**, not against a live server.
- Build a **fixture mode**: a small set of realistic fake runs (a successful run, a failed run, a run that hit a resource cap, a run that was denied an egress attempt) served from local fixtures when the API is unreachable or when a fixture flag is set. This is a development affordance, and it also lets you demo the UI without the backend.
- The console must never look broken when the API is down — it shows a clear, honest error state with a retry.

**"Web design comfort" is in scope; a design system is not.** The coordinator's instruction: *"just some web design comfort… so that it works, just works."* So: a considered, coherent visual result — real spacing rhythm, a type scale, a small token set, consistent states — without building a component library, a theme engine, or a marketing site. It should look like a serious internal tool that a security team would use, not a hackathon landing page.

## Write scope (EXCLUSIVE — do not touch anything else)
- `frontend/**`

## Read scope
- `AGENTS/CONTEXT.md`, `AGENT.md`
- `docs/architecture/02-phase1-design.md` — **your contract** (§2 workload, §6 report, §8 API, §10 layout, §12 demo scenario)
- `HACKATHON.md`, `docs/VISION.md` (context only)
- `AGENTS/permissions/PROTOCOL.md`

## Shared / serialized files
- `frontend/package.json` → owner: **you, this wave** (the only writer in this wave)
- `frontend/package-lock.json` → owner: **you**
- root `package.json` → **do not create**. Single npm workspace per the design doc.

## Requirements

Implement, in the file layout the design doc specifies:

1. **Vite + React + TypeScript app**, strict mode, with the dev server on `5173` and a **same-origin** `/api` → `http://127.0.0.1:8787` proxy in `vite.config.ts` reading the backend target from a **server-side** env var. The browser bundle must contain **no absolute backend URL, no port literal, and no `VITE_` secret**. The proxy target is read from a non-`VITE_` variable, same as the design doc says.
2. **The submit screen** for the Phase 1 workload. Every field the workload needs, with client-side validation that mirrors the server's rules, `maxlength` where relevant, and a disabled submit while in flight. An in-flight button shows an action-specific label, not a generic spinner.
3. **The run view** — the heart of the console. It must show, live:
   - the run's status and phase,
   - the **event stream** (planning → tool call → execution → output → explanation), polled from the API,
   - the agent's produced output rendered properly — **never as raw HTML**. If the output is markdown or a table, render it as text or a real table. No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`.
   - the **blast-radius report** rendered as a **panel a human can scan in five seconds**: what ran, what was denied, resource usage against the caps, network attempts, and the teardown. This panel is the product's differentiator — it must look deliberate, not like a JSON dump.
4. **All five states everywhere**: loading, empty, error, success, unauthorized. Every one of them designed, not accidental.
5. **Error hygiene in the UI.** The server returns a machine code and a generic message. Show the generic message. The code is shown small and monospaced so it is reportable. **Never render a server stack, provider text, or raw response body.**
6. **A run list** (recent runs) so the console has a home screen, not just a form.
7. **Fixture mode** with at least four realistic fixtures: success, model failure, resource-cap hit, and an egress attempt that was denied. The egress-denied fixture is the one the containment moment will use, so it must be visually striking.
8. **Accessibility and responsiveness.** Keyboard reachable, visible focus, 44px minimum targets, no horizontal overflow at 390px, `prefers-reduced-motion` respected, and the console readable on a projector (a judge will watch it).

## Constraints
- **The browser talks only to its own origin.** Every API call is a relative `/api/v1/...` path. No absolute backend URL anywhere in the source or the bundle. No host sniffing. No `VITE_*` secret.
- **Server config is server-side.** The proxy target comes from a non-`VITE_` env var, read in `vite.config.ts`.
- **Strict TypeScript**, types copied exactly from the design doc's API contract. Do not invent a parallel type system.
- **No dependencies beyond what the design doc lists.** If you need one that is not listed, request permission with the reason; do not add it.
- **Do not touch** `backend/**`, `deploy/**`, `docs/**`, or any harness file.
- Do not commit or push. Do not use the `subagent` tool.
- Never render a secret, a token, or an env value.

## Acceptance criteria
- [ ] `cd frontend && npm run typecheck` passes with zero errors in strict mode.
- [ ] `npm run build` succeeds.
- [ ] A grep of `frontend/src` and `frontend/vite.config.ts` for `localhost`, `127.0.0.1`, `:8783`, `VITE_` combined with a key, and `https://` returns clean (a relative `/api` path is expected and fine).
- [ ] The console runs in **fixture mode** with no backend at all and shows all four fixtures correctly, including the egress-denied one.
- [ ] Every screen has all five states, and they are visually distinct.
- [ ] The blast-radius report panel is readable in five seconds and clearly deliberate.
- [ ] No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write` anywhere in `frontend/src`.
- [ ] No horizontal overflow at 390px; keyboard traversal reaches every control; focus is always visible.
- [ ] `prefers-reduced-motion` is respected for every animation.
- [ ] **Paste actual screenshots** at 1440px and 390px into `AGENTS/completion/05-frontend-phase1.md-summary.md` — one desktop, one mobile, and one of the report panel.

## Verification
- `cd frontend && npm run typecheck` → clean
- `cd frontend && npm run build` → clean
- `cd frontend && npm run dev` → open the console, walk every state, screenshot each
- Run the grep from the Constraints section and paste the (clean) result
- Confirm with the browser console open that there are **zero** uncaught errors and **zero** React warnings
- Check 390px for overflow, and tab through the whole flow

## Out of scope
- The backend, the sandbox, the broker — briefs 04 and 06
- `deploy/**`
- A component library, a theme engine, a marketing landing page, dark mode, i18n, routing beyond what the design doc specifies
- The pitch, the deck, the video

## Notes
- The design doc's §12 describes the demo scenario. **The console must be able to show that scenario end to end** — the operator submits, the run appears live, the report lands. That is what the demo video will capture.
- A DESIGNER review brief (08) will follow and may ask for polish. So build with a clear visual language — spacing scale, type scale, a small token set — even though you are not building a design system. That makes the polish pass cheap.
- Your mailbox is `AGENTS/message/frontend/`. Check it before you finish.
- If you need access to something outside your scope, write a permission request to `AGENTS/permissions/frontend/<slug>.md` and wait for the decision. Do not proceed without it.
