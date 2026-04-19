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

**Sequence:** gate → wormhole → desk scene → power button → CRT → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

`advanceBootState(state)` drives all transitions. A `bootGen` generation counter prevents stale
`setTimeout` callbacks from firing after the state has advanced. Always check
`if (gen !== bootGen) { return; }` in every deferred callback.

**Screen 1 — POST** (`#000`, white Courier New)
- IBS BIOS header lines → RAM counter 0K → 131072K → `post-beep.mp3` → "Press DEL" → advance
- RAM counter uses recursive `setTimeout` with variable tick and mechanical hesitation pauses.
  Tokens: `RAM_TICK_MIN_MS: 30`, `RAM_TICK_MAX_MS: 90`, `RAM_HESITATION_CHANCE: 0.08`,
  `RAM_HESITATION_MIN_MS: 200`, `RAM_HESITATION_MAX_MS: 600`, `RAM_STEP_K: 2048` (64 steps total).
  DO NOT replace with linear `setInterval` — the hesitation rhythm is intentional.
  Obsolete tokens `POST_DURATION_MS` and `RAM_INCREMENT_INTERVAL_MS` are removed.
- `hdd-chatter.mp3` starts on screen entry. Plays once (no loop), 59s long.
- Guard: `if (!bootAudio) { preloadBootAudio(); }` before `advanceBootState(POST)` in case
  a soft-restart race leaves `bootAudio` null.

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

**Boot audio files** (all preloaded on gate interact, never before):
- `hdd-chatter.mp3` — Screen 1 entry, fades on Screen 5
- `post-beep.mp3` — RAM counter completion
- `floppy-read.mp3` — Screen 2 at 800–1000ms
- `hdd-screech.mp3` — 60% of boots, Screen 3 or 4
- `startup.mp3` — COMPLETE (desktop chime)

---

## Wormhole Transition (boot.js — `startWormhole`)

Added in PR #109. Replaces the 600ms CSS fade-in with a 5-second four-phase animation.
Triggered from `boot-scene.js` after the desk scene asset loads.

**Interface:** `window.APC.boot.startWormhole(bitmap, bitmapParams, onComplete)`

Cancels the matrix rain rAF at entry, takes full control of `#matrix-canvas`.
`boot-scene.js` defers its own rAF loop, listeners, and opacity snap until the wormhole
`onComplete` callback fires — no races, no premature interaction.

**Four phases:**

| Phase | Duration | Effect |
|---|---|---|
| 1 — Disturbance | `WORMHOLE_DISTURBANCE_MS` (1500ms) | Characters drift ±30px tangentially |
| 2 — Spiral | `WORMHOLE_SPIRAL_MS` (2000ms) | `radius = initRadius × (1−easedT)²`, rotation grows, center glow 0→120px |
| 3 — Collapse | `WORMHOLE_COLLAPSE_MS` (500ms) | Glow pulse: hold 120px (40%) → contract to 20px (60%) |
| 4 — Reveal | `WORMHOLE_REVEAL_MS` (1000ms) | `ctx.arc` + `clip()` radial reveal from pinhole, cubic ease, glow fades |

**Critical:** After the wormhole completes, `animFrame` (the rain loop) must be restarted
before `onComplete` fires. Fixed in PR #123:
```js
animFrame = requestAnimationFrame(drawFrame);
```
Without this, the rain stops behind the desk scene and the CRT `rain_on` state shows black.

---

## Desk Scene Module (boot-scene.js)

Added in PR #104. Sits between the gate keypress and the POST boot screen.
**Interface:** `window.APC.bootScene = { init(onComplete), destroy() }`

**Full flow:**
gate keypress → gate fades (600ms) → `bootScene.init(onComplete)` →
wormhole transition (~5s) → desk scene fades in → user clicks power button →
CRT sequence (~8s) → desk scene zoom (3s) + fade out (3s) → `destroy()` + `onComplete()` → POST

**Asset:** `assets/images/desk-scene_edited.png` — 1024×1172px source image.
Do not rename or move this file.

**Chroma key colors (exact — no tolerance):**
- `#FF00FF` → fully transparent (CRT screen region — live content shows through)
- `#00FFFF` → `#C8B89A` beige (power button — matches tower body color)

**Asset coordinates (raw px in source image):**
```
Asset:   1024 × 1172
Screen:  X1=201, Y1=205, X2=654, Y2=600
Power:   X1=882, Y1=723, X2=927, Y2=738
Indicator: AX=873, AY=680, size=4px
```

**Scale formula — CRITICAL:**
```js
scale = Math.min(window.innerWidth / ASSET_W, window.innerHeight / ASSET_H);
```
Must be `Math.min`, never `Math.max`. `Math.max` picks `widthScale` (~1.875 at 1920×1080),
scaling the 1172px-tall asset to 2197px — 559px of overflow clips the screen region
off-canvas and puts CRT states in the wrong position. `Math.min` letterboxes correctly.
Fixed in PR #117. Do not change this.

**CRT state machine:**
`idle` → `btn_flash` → `flash` → `dim` → `scanlines` → `glow` → `rain_on` → `done`

The rAF loop reads `crtState` each frame to decide what to draw in the screen region.

**CRT state render:**
- `idle`: black fill — CRT is off
- `btn_flash`: black fill — button visual, CRT stays dark
- `flash`: `#FFFFFF` white fill
- `dim`: `#1A1A1A` near-black
- `scanlines`: alternating `#000` / `#1A1A1A` horizontal bands (1 scaled-px per band)
- `glow`: `rgba(0,255,65,0.15)` phosphor green
- `rain_on`: black + `#matrix-canvas` sampled at 0.6 opacity — rain must be live (see PR #123)
- `done`: nothing — scene is fading out

**CRT timing tokens (flat on `window.APC.timing`):**
```
POWER_BTN_FLASH_MS     — button visual flash before CRT steps begin
CRT_FLASH_MS           — step 1: white flash
CRT_DIM_MS             — step 2: dim (2120ms after PR #126)
CRT_SCANLINE_MS        — step 3: scanlines (2200ms after PR #126)
CRT_GLOW_MS            — step 4: glow (2300ms after PR #126)
CRT_CONTENT_FADE_MS    — step 5: rain_on (1400ms after PR #126)
BOOT_SCENE_FADE_OUT_MS — desk scene CSS opacity fade (3000ms after PR #126)
BOOT_SCENE_FADE_IN_MS  — initial fade in
DESK_ZOOM_MS           — zoom-into-monitor phase 1 (3000ms)
DESK_ZOOM_SCALE        — CSS transform scale target (8)
CRT_IDLE_FLICKER_INTERVAL_MIN/MAX_MS — idle flicker scheduling
CRT_IDLE_FLICKER_DURATION_MS         — idle flicker hold duration
```
Total CRT sequence: ~8.1s. Exit: 3s zoom + 3s fade = ~6s before POST appears.

**`addTimeout` vs `setTimeout` discipline — CRITICAL:**
- Pre-click timeouts (idle flicker scheduling): use `addTimeout()` — tracked in `pendingTimeouts`,
  cancellable by `clearAllTimeouts()` / `destroy()`.
- Post-click CRT timeouts (`startCRTSequence`): use plain `setTimeout()` — NOT `addTimeout()`.
  Once the power button is clicked, the CRT sequence must run to completion regardless of any
  teardown path. `clearAllTimeouts()` must not be able to cancel it. Fixed in PR #119.
- `fadeOutAndComplete` timeout: also plain `setTimeout()` for the same reason. Fixed in PR #121.

**`onComplete` capture pattern — CRITICAL:**
`destroy()` nulls the module-level `onComplete` variable. Always capture it into a local
variable before calling `destroy()`, then call the local. Fixed in PR #128/#129:
```js
// WRONG — onComplete is null by the time this runs
destroy();
if (onComplete) { onComplete(); }

// RIGHT — capture first
var cb = onComplete;
destroy();
if (cb) { cb(); }
```
Applied in both `fadeOutAndComplete` and the `img.onerror` fallback path.

**Exit sequence (zoom + fade):**
Two phases, both use plain `setTimeout`:
1. `DESK_ZOOM_MS` (3000ms, ease-in): `transform: scale(8)` anchored to `screenRegion` center
2. `BOOT_SCENE_FADE_OUT_MS` (3000ms): opacity 1→0, then canvas clear + gate hide +
   `destroy()` + `onComplete()`

Before applying the fade transition, clear any lingering `transition` from the fade-in:
```js
sceneCanvas.style.transition = 'none';
void sceneCanvas.offsetHeight; // force reflow
// then set the zoom transition
```
Without the reflow flush, the old transition races and suppresses the zoom. Fixed in PR #125.

**Gate screen z-index during desk scene:**
`gate-screen` is lowered to `z-index: 98` on `bootScene.init()` so it sits just below the
desk scene canvas (`z-index: 100`). This keeps Matrix rain visible through the transparent
CRT screen region of the PNG. Restored opacity to 1 instantly (no transition) at the same time.

**Canvas clear on handoff:**
After `cancelAnimationFrame(animFrame)`, stale rain pixels remain on `#matrix-canvas`.
Call `clearRect` on it inside the `fadeOutAndComplete` callback before `destroy()`,
or rain pixels bleed into the POST screen. Fixed in PR #121.

**Common pitfalls:**
- `Math.max` in `computeRegions` — clips screen region off-canvas. Use `Math.min`.
- `addTimeout` for post-click CRT steps — cancellable by destroy(). Use plain `setTimeout`.
- Calling `onComplete` after `destroy()` nulls it — capture to local var first.
- Not restarting `animFrame` after wormhole — CRT `rain_on` shows black.
- Lingering fade-in `transition` on `sceneCanvas` — clear with `style.transition = 'none'`
  + reflow before applying zoom transition.
- Rain pixels on `#matrix-canvas` after `cancelAnimationFrame` — call `clearRect` on handoff.

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
- **`Math.max` in `computeRegions`** — wrong. Always `Math.min` for letterbox scaling.
- **`addTimeout` for post-click CRT steps** — wrong. Use plain `setTimeout`.
- **Calling `onComplete` after `destroy()`** — wrong. Capture to local var before calling `destroy()`.
