# Atsushi's PC — CLAUDE.md

Browser-based Win98 desktop simulation and personal PM portfolio hosted on Raspberry Pi (via Cloudflare Tunnel) at ahisaka.com. No frameworks. No npm. No build step. Vanilla HTML/CSS/JS only.

---

## Before Every Task

1. Read this file in full before starting work.
2. State your plan in plain English before making any change larger than ~10 lines.
3. Never install packages, dependencies, or build tooling. Zero exceptions.
4. Never deviate from any rule without explicitly asking first.
5. After every task, summarize changes and flag anything needing manual QA.
6. **Pre-Flight Architecture Check** — Before writing any code that introduces new state, timers, loops, or DOM elements, explicitly answer:
   - How will this feature be destroyed? (Detail the exact cleanup path.)
   - What happens if the user restarts mid-execution?
   - Does this introduce a new z-index, and if so, where does it sit in the global hierarchy?

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

## Memory & Lifecycle Integrity

These rules are as non-negotiable as the no-framework rule. Violations cause memory leaks and silent timer ghosts that survive across soft restarts.

**No orphaned timers.** Every `setInterval` and `setTimeout` return value MUST be assigned to a named variable. Inline-fire-and-forget timers are forbidden.

**Mandatory teardown.** Every module, mini-app, or window MUST expose a `close()`, `stop()`, or `reset()` method. That method MUST explicitly `clearInterval` / `clearTimeout` / `cancelAnimationFrame` every timer or loop the module owns. No exceptions, even for "simple" apps.

**DOM presence guard on recursive loops.** Any `requestAnimationFrame` or chained `setTimeout` loop MUST check that its target element is still in the document before executing the next tick:
```js
// WRONG
function tick() { el.textContent = '...'; requestAnimationFrame(tick); }

// RIGHT
function tick() { if (!el.parentNode) { return; } el.textContent = '...'; requestAnimationFrame(tick); }
```

**Singleton state must be nulled on close.** If a module tracks a singleton (e.g. `winState`, `isOpen`), `close()` MUST reset that flag. Otherwise a restart leaves the module believing the window is still open.

**`desktop.reset()` is the canonical teardown caller.** It calls `closeAll()` then iterates `window.APC.apps` and calls `.close()` on any app that exposes it. Any new app that owns timers MUST expose `close()` so `reset()` can reach it.

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

---

## Start Menu Registry System (Phases 1-3, Apr 2026)

`taskbar.js` is now registry-driven. The old imperative DOM builders (`buildProgramsSubmenu`, `buildAccessoriesCascadeItem`, `buildAccessoriesSubmenu`, `buildAppsSubmenu`) are deleted. Everything flows from `menuConfig`.

**menuConfig** — single source of truth for all Start Menu items. A flat JSON array of node objects with `type`, `id`, `label`, `icon`, `action`, `app`, and `children` fields.

**renderMenuNode(node, isTopLevel)** — recursive renderer. Produces `.start-menu__item` at top level, `.start-menu__submenu-item` at all nested levels. Handles `separator`, `folder`, `dynamic`, and `action` node types.

**Two hover timer systems:**
- `attachSubmenuHover(key, itemEl, submenuEl)` — top-level folders only. Uses global `openSubmenuEl`/`openSubmenuKey` tracker. Closes sibling submenus on open.
- `attachNestedSubmenuHover(key, itemEl, submenuEl)` — all nested folders. Isolated `openTimer`/`closeTimer` per node. MutationObserver on parent submenu triggers `closeNested()` when parent closes.

**`closeAllSubmenus()`** — only bound to `mouseenter` on top-level action and disabled items. Never bound to nested items — doing so collapses the entire stack.

**`type: 'dynamic'`** — sets `submenuEl.dataset.dynamic = node.source`. Must equal `'documents'` to trigger `openSubmenu()` JIT population via `populateDocumentsSubmenu()`.

**`action: 'stub'`** — routes to `showSimpleDialog(node.label, 'This feature is not available.')`.

**Protected Path** — `Apps` folder is a top-level `menuConfig` node. Single-level, no Accessories cascade, no Texture Zone friction. This is intentional and permanent.

**Known open bug** — nested folder hover still collapses menu stack in some paths. Tracked as open issue. Root cause: event propagation or MutationObserver firing on intermediate parent. `attachNestedSubmenuHover` isolation is the fix vector.

**`desktop.js` export added** — `minimizeAll()` iterates `windows`, calls `minimizeWindow(state)` on all non-minimized visible windows. Exported as `window.APC.desktop.minimizeAll`. Consumed by taskbar right-click context menu.

---

## Icon Hint System (P0-1, commit 3c4483d)

Desktop icons show a "double-click to open" tooltip after a single click with no follow-up.
Timing controlled by two tokens in `win98-timing.js`:
- `ICON_HINT_DELAY_MS` (1200ms) — wait after single click before hint appears
- `ICON_HINT_DISPLAY_MS` (2500ms) — how long hint stays visible

State lives in `iconHintTimers` in `desktop.js`. Hint is removed from DOM on dismiss (not just hidden).
Hint never appears if the user double-clicks successfully. `reset()` cancels all in-flight hint timers.
Zone: Texture Zone.

---

## Subdirectory CLAUDE.md Files

Claude Code automatically loads these when working in the relevant directory. Do not duplicate rules across files — keep each focused on its context.

- **`js/CLAUDE.md`** — JS conventions, timing system, boot sequence state machine, analytics events, module patterns, common pitfalls
- **`js/apps/CLAUDE.md`** — mini-app specs: screensaver, recycle bin, system properties, start menu, tray balloons, app launch delays
- **`css/CLAUDE.md`** — Win98 visual fidelity rules, full color palette, typography
- **`config/CLAUDE.md`** — server infrastructure, services and ports, deploy workflow, Pi filesystem map
