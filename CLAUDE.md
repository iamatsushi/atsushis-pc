# Atsushi's PC — CLAUDE.md

Browser-based Win98 desktop simulation and personal PM portfolio hosted on Raspberry Pi (via Cloudflare Tunnel) at ahisaka.com. No frameworks. No npm. No build step. Vanilla HTML/CSS/JS only.

---

## Before Every Task

1. Read this file in full before starting work.
2. State your plan in plain English before making any change larger than ~10 lines.
3. Never install packages, dependencies, or build tooling. Zero exceptions.
4. Never deviate from any rule without explicitly asking first.
5. After every task, summarize changes and flag anything needing manual QA.

---

## Hard Rules

- **No frameworks.** No React, Vue, Svelte, Alpine, jQuery, or bundlers. Ever.
- **No TypeScript.** `.js` only.
- **No npm.** No `package.json`, no `node_modules`, no build steps.
- **No hardcoded delays.** Every ms value references `window.APC.timing.*` from `js/win98-timing.js`.
- **No external CDN calls** in production. Umami and the Altcha widget are the only exceptions.
- **Never commit `.env`.** Only `.env.example` is versioned.
- **Never modify** `assets/CREDITS.md`, `.env.example`, or `config/Caddyfile` without being explicitly asked.

---

## Behavioral Zones

Every interactive element belongs to one of two zones. Getting this wrong breaks the simulation.

**Protected Path** — recruiter-critical flows (NetEscape pages, Guestbook, resume flow)
- Max delay: 1000ms total. No failures. No error states. Always show progress feedback.

**Texture Zone** — ambient system UI (desktop apps, Start Menu, tray, screensaver)
- Delays up to 6000ms. Minor recoverable failures permitted. Never block a Protected Path.

Always determine zone before adding or modifying any feature or flow. Zone discipline is non-negotiable.

---

## Namespace Contract

All globals live under `window.APC`. Never pollute the global scope outside it.

```js
window.APC = window.APC || {};
window.APC.boot    = ...  // boot state machine
window.APC.desktop = ...  // desktop shell API
window.APC.timing  = ...  // win98-timing.js — loaded first, always
```

---

## Script Load Order

`win98-timing.js` must load before every other script. No exceptions.

After that: `boot.js` → `desktop.js` → `taskbar.js` → `netescape.js` → `widgets.js` → `apps/*`

Do not change this order without explicit instruction.

---

## PR Workflow

Never commit directly to main.

```bash
git checkout -b your-branch
# commits
gh pr create
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

## After Every PR — CLAUDE.md Maintenance

When a PR changes any spec, timing value, or infrastructure detail, update the relevant CLAUDE.md file in the same commit. The PR description already has everything needed — this is a one-paragraph update, not a rewrite.

| Change type | Update target |
|---|---|
| New timing token or changed token value | `js/CLAUDE.md` — timing section |
| New mini-app or changed app behavior/spec | `js/apps/CLAUDE.md` |
| New resolved spec decision | `js/apps/CLAUDE.md` (component-specific) |
| New CSS rule, color, or font change | `css/CLAUDE.md` |
| New service, port, or infra change | `config/CLAUDE.md` |
| New script load order or namespace change | `js/CLAUDE.md` |
| New analytics event | `js/CLAUDE.md` — analytics table |

**A PR that changes behavior without updating the relevant CLAUDE.md is incomplete.**

---

## Subdirectory CLAUDE.md Files

Claude Code automatically loads these when working in the relevant directory. Do not duplicate rules across files — keep each focused on its context.

- **`js/CLAUDE.md`** — JS conventions, timing system, boot sequence state machine, analytics events, module patterns, common pitfalls
- **`js/apps/CLAUDE.md`** — mini-app specs: screensaver, recycle bin, system properties, start menu, tray balloons, app launch delays
- **`css/CLAUDE.md`** — Win98 visual fidelity rules, full color palette, typography
- **`config/CLAUDE.md`** — server infrastructure, services and ports, deploy workflow, Pi filesystem map
