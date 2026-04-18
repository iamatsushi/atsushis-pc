# js/ — JavaScript Rules

## Timing System (win98-timing.js)

**Never hardcode a delay anywhere in this codebase.**
Every ms value is a named constant in `window.APC.timing`. Reference it by name.

```js
// WRONG
setTimeout(fn, 800);

// RIGHT
setTimeout(fn, window.APC.timing.APP_CALC_MIN_MS);
```

Boot sequence tokens live in `window.APC.timing.BOOT_SEQUENCE.*` (a nested object).
All other tokens are flat on `window.APC.timing.*`.

Use `window.APC.timing.rand(min, max)` for randomised delays — never `Math.random()` inline.

---

## Module Pattern

Each JS file is an IIFE that exposes its public API on `window.APC`:

```js
window.APC.myModule = (function () {
  'use strict';
  // private state...
  return { init, reset };
}());
```

No ES module imports/exports. No `class`. Load order in `index.html` is the dependency system.

---

## Naming

- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case`
- CSS classes: BEM `kebab-case` — see `css/CLAUDE.md`

---

## Analytics (Umami)

Fire events via `window.umami.track('event_name', { property: value })`.
Always guard: `if (window.umami) { window.umami.track(...) }`.

Required events:

| Event | Trigger | Params |
|---|---|---|
| `click_to_start` | Gate screen interact | — |
| `boot_complete` | Boot sequence finishes | — |
| `netescape_homepage_load` | NetEscape homepage first renders | — |
| `app_open` | Any mini-app opens | `app_name` |
| `guestbook_submit` | Form submit attempt | `status: 'success'/'failure'` |
| `resume_click` | resume_FINAL_v3.exe double-clicked | — |
| `easteregg_trigger` | Any easter egg fires | `type` |
| `dialup_trigger` | Dial-up sequence starts | — |
| `dialup_url_entry` | Manual URL entry in NetEscape | `domain`, `type` |

Dashboard: app.umami.is

---

## Audio Rules

- All audio loads from `assets/audio/`. No streaming, no external URLs.
- Never play audio before a user gesture. All boot audio preloads inside `onGateInteract()`.
- Use `try { audio.play().catch(fn) } catch(e) {}` — never let audio errors crash boot.
- Dial-up: use a single preloaded `Audio` object, never create a new one per navigation.

---

## sessionStorage Keys

| Key | Set by | Cleared by |
|---|---|---|
| `boot_complete` | `boot.js` at COMPLETE | `boot.restart()` |
| `ne_history` | `netescape.js` | `boot.restart()` |

Never call `sessionStorage.clear()`. Use targeted `removeItem()` only.

---

## Boot Sequence State Machine (boot.js)

boot.js was fully rewritten in PR #97. The old single-screen Win98 progress bar is gone — do not restore it.

**Sequence:** gate → keypress → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

`advanceBootState(state)` drives all transitions. A `bootGen` generation counter prevents stale
`setTimeout` callbacks from firing after the state has advanced. Always check
`if (gen !== bootGen) { return; }` in every deferred callback.

**Screen 1 — POST** (`#000`, white Courier New)
- IBS BIOS header lines → RAM counter 0K → 131072K → `post-beep.mp3` → "Press DEL" → advance
- RAM counter uses recursive `setTimeout` with variable tick (30–90ms) + mechanical hesitation
  (~1-in-12 steps pause 200–600ms). DO NOT replace with linear `setInterval`.
- `hdd-chatter.mp3` starts on screen entry. Plays once (no loop), 59s long.

**Screen 2 — IBS Splash** (`#102046` navy)
- "IBS" logotype + "Captiva 2139-$E7" + "Surepath BIOS v3.26.11" centered
- `floppy-read.mp3` fires at 800–1000ms after screen appears
- Duration: `BOOT_SEQUENCE.IBS_SPLASH_DURATION_MS` (6000ms — do not revert to 3000ms)

**Screen 3 — DOS Log** (`#000`, white Courier New)
- 13 hardcoded bootlog lines, verbatim, in order — do not alter copy
- Line interval: `DOS_LOG_LINE_INTERVAL_MIN/MAX_MS` (160–300ms — do not revert to 80–150ms)
- `hdd-screech.mp3` fires on 60% of boots; assigned to Screen 3 or 4 at boot start — never re-rolled

**Screen 4 — WinDoors Logo** (`#000`)
- Four-color CSS flag (red/green/blue/yellow 2×2) — fictional, NOT the Windows logo
- 20-block chunky progress bar (`#102046` blocks on `#C0C0C0` trough)
- Stall rhythm: 3500ms at block 11 (60%), 2000ms at block 16 (85%), fast finish
- `hdd-chatter.mp3` volume drops to 0.7 during stalls, restores to 1.0 after
- Block speed: 0–5 → 600ms, 6–11 → 800ms, 12–16 → 500ms, 17–19 → 300ms

**Screen 5 — Desktop Arrival**
- `hdd-chatter.mp3` fades out over `HDD_CHATTER_FADE_MS` (300ms)
- `#boot-sequence` fades to opacity 0 over `DESKTOP_FADE_MS` (1200ms) via double-rAF
- `desktop.init()` called during the fade — desktop is visible behind it
- `startup.mp3` fires at COMPLETE. `sessionStorage.boot_complete = '1'` set at COMPLETE.

**Wormhole transition** (gate keypress → desk scene, #106) — fires before POST, ~5s total
- `window.APC.boot.startWormhole(bitmap, bitmapParams, onComplete)` — public API on boot.js
- Cancels matrix rain rAF, takes over `#matrix-canvas` for all four phases
- Phase 1 `WORMHOLE_DISTURBANCE_MS` (1500ms): characters drift tangentially (±30px), angle updated each frame for smooth Phase 2 handoff
- Phase 2 `WORMHOLE_SPIRAL_MS` (2000ms): radius = `initRadius * (1 − easedT)²` — deterministic, characters arrive at center exactly at phase end; rotation speed increases with `easedT`; glow 0 → 120px
- Phase 3 `WORMHOLE_COLLAPSE_MS` (500ms): glow pulse — hold 120px (first 40%), contract to 20px (last 60%)
- Phase 4 `WORMHOLE_REVEAL_MS` (1000ms): desk scene bitmap revealed via `ctx.arc` + `clip()` from pinhole outward; cubic ease; glow fades
- On complete: `boot-scene.js` snaps sceneCanvas to `opacity:1` (no transition) and starts its rAF loop

**Boot audio files** (all preloaded on gate interact, never before):
- `hdd-chatter.mp3` — Screen 1 entry, fades on Screen 5
- `post-beep.mp3` — RAM counter completion
- `floppy-read.mp3` — Screen 2 at 800–1000ms
- `hdd-screech.mp3` — 60% of boots, Screen 3 or 4
- `startup.mp3` — COMPLETE (desktop chime)

---

## NetEscape (netescape.js)

Renamed from `ie.js` in PR #25. All CSS classes use `netescape-` prefix — never `ie-`.

Protected Path rules:
- All internal `ahisaka.com/*` routes: max 1000ms, no failures, always show status bar sequence
- Status sequence: `""` → `"Opening page [url]..."` → `"Transferring data from [url]..."` → `"Done"`
- Unknown URLs: partial-load freeze → timeout dialog → homepage. Never show real external content.

---

## RAM Endpoint

`/ram` proxies to `127.0.0.1:8091` (ram-server.py on Pi).
Returns `{total, available, used}` in kB. Fetch every 30s in `widgets.js`.
Degrade to `'--'` on failure — never crash.

---

## Common Pitfalls

- **`setInterval` for RAM counter** — wrong. Use recursive `setTimeout` with hesitation rhythm.
- **`sessionStorage.clear()` on restart** — wrong. Use targeted `removeItem()`.
- **Audio before user gesture** — wrong. Preload inside `onGateInteract()` only.
- **Hardcoded ms values** — wrong. Always `window.APC.timing.*`.
- **New `ie-` prefixed files or classes** — wrong. Use `netescape-` prefix.
- **Calling proxy APIs directly from client** — wrong. All API calls go through Caddy routes.
- **Importing external fonts or icon libraries** — wrong. System fonts only, assets self-hosted.
