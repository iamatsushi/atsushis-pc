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

**Full sequence:** gate → wormhole (~5s) → desk scene → power button click → CRT (~8s) → zoom+fade (~6s) → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

`advanceBootState(state)` drives all transitions. A `bootGen` generation counter prevents stale
`setTimeout` callbacks from firing after the state has advanced. Always check
`if (gen !== bootGen) { return; }` in every deferred callback.

**Screen 1 — POST** (`#000`, white Courier New)
- IBS BIOS header lines → RAM counter 0K → 131072K → `post-beep.mp3` → "Press DEL" → advance
- RAM counter uses recursive `setTimeout` with variable tick (30–90ms) + mechanical hesitation
  (~1-in-12 steps pause 200–600ms). DO NOT replace with linear `setInterval`.
- POST safety net: if `hddChatter.paused` is true (asset load failure path, power button never
  clicked), starts chatter here. If chatter is already playing from power button click, this is
  a no-op. Do not remove this guard.

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
- `hdd-chatter.mp3` does NOT stop or fade here — it continues looping through the desktop
- `#boot-sequence` fades to opacity 0 over `DESKTOP_FADE_MS` (1200ms) via double-rAF
- `desktop.init()` called during the fade — desktop is visible behind it
- `startup.mp3` fires at COMPLETE. `sessionStorage.boot_complete = '1'` set at COMPLETE.
- After `startup.mp3` ends (~5s), `fadeAudioTo(hddChatter, 0.6, 2000ms)` — chatter settles
  to background volume and loops indefinitely until the tab is closed.

**Wormhole transition** (gate keypress → desk scene, #109) — fires before POST, ~5s total
- `window.APC.boot.startWormhole(bitmap, bitmapParams, onComplete)` — public API on boot.js
- Cancels matrix rain rAF, takes over `#matrix-canvas` for all four phases
- Phase 1 `WORMHOLE_DISTURBANCE_MS` (1500ms): characters drift tangentially (±30px)
- Phase 2 `WORMHOLE_SPIRAL_MS` (2000ms): radius = `initRadius * (1 − easedT)²`; glow 0 → 120px
- Phase 3 `WORMHOLE_COLLAPSE_MS` (500ms): glow pulse — hold 120px (40%) → contract to 20px (60%)
- Phase 4 `WORMHOLE_REVEAL_MS` (1000ms): desk scene revealed via `ctx.arc` + `clip()` from pinhole
- After wormhole: `animFrame = requestAnimationFrame(drawFrame)` must restart rain before `onComplete`
  fires — otherwise CRT `rain_on` state shows black (fixed in PR #123)

---

## HDD Audio Design (boot.js + boot-scene.js)

Two-file system. Both files preloaded in `preloadBootAudio()` on gate interact.

**Files:**

| File | Duration | Loop | Trigger | Ends |
|---|---|---|---|---|
| `hdd-poweron.mp3` | 10s | No | Power button click (immediate) | Naturally at 10s |
| `hdd-chatter.mp3` | 41s | Yes (`loop=true`) | Power button click (at 9950ms offset) | Never — fades to 0.6 after chime |

**`playHddAudio()` — called by boot-scene.js on power button click:**
```js
// poweron plays immediately
bootAudio.hddPoweron.play();

// chatter must start within the user gesture context — browser autoplay policy
// blocks .play() calls inside setTimeout. Start at volume 0 immediately,
// then ramp to 1.0 at the crossfade point.
bootAudio.hddChatter.volume = 0;
bootAudio.hddChatter.play();

setTimeout(function () {
  fadeAudioTo(bootAudio.hddChatter, 1.0, 200); // ramp up at crossfade point
}, HDD_POWERON_DURATION_MS - HDD_CHATTER_CROSSFADE_MS); // 9950ms
```

**Why volume=0 at start:** Browser autoplay policy blocks `.play()` calls inside `setTimeout`
when they're too far from the original user gesture. Starting at volume 0 immediately satisfies
the gesture requirement; the `setTimeout` only adjusts volume (always allowed), not playback.
Do not change this to a setTimeout-based `.play()` call — it will be silently blocked.

**Chatter lifecycle:**
1. Power button click → starts at `volume = 0`
2. At 9950ms → `fadeAudioTo(hddChatter, 1.0, 200ms)` — ramps up, crossfade masks poweron seam
3. Runs through all boot screens at volume 1.0 (with 0.7 dips during WinDoors stalls)
4. Desktop Arrival — chatter continues, does NOT stop
5. COMPLETE — `startup.mp3` chime fires
6. Chime `ended` event → `fadeAudioTo(hddChatter, 0.6, 2000ms)` — settles to background
7. Loops at 0.6 indefinitely

**Timing tokens (flat on `window.APC.timing`):**
- `HDD_POWERON_DURATION_MS`: 10000 — poweron file length
- `HDD_CHATTER_CROSSFADE_MS`: 50 — overlap between files
- `HDD_CHATTER_SETTLE_MS`: 2000 — fade duration after chime ends
- `HDD_CHATTER_SETTLE_VOL`: 0.6 — settled background volume

**`fadeAudioTo(audio, targetVol, durationMs)`** — fades to any target volume, does NOT pause.
Distinct from `fadeAudioOut()` which fades to 0 and pauses.

**Critical rules:**
- `hddChatter.loop` must stay `true` — do not set to `false`
- Never call `fadeAudioOut()` on `hddChatter` — it should never stop
- `playHddAudio` must stay on the `boot.js` public API return object — `boot-scene.js` calls it
- Do not remove the POST safety net (`if hddChatter.paused`) — it covers the asset failure path

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
- **`hddChatter.loop = false`** — wrong. Chatter must loop indefinitely.
- **`fadeAudioOut(hddChatter, ...)`** — wrong. Chatter never stops; use `fadeAudioTo()` only.
- **`setTimeout(() => hddChatter.play(), delay)`** — wrong. Blocked by browser autoplay policy.
  Always start `.play()` within the user gesture context (volume=0 trick).
- **Removing `playHddAudio` from boot.js return object** — wrong. boot-scene.js depends on it.
