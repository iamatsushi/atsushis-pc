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

## Gate Screen Experience (boot.js)

The gate screen is the full cinematic opening sequence. Three phases before the wormhole.

### Phase 1 — Rain
- Rain starts immediately on page load via `_startRain()` — no font gate, no delay.
- Runs for `MATRIX_DURATION_MIN_MS`–`MATRIX_DURATION_MAX_MS` (3–12s).
- Identity lines begin after `MATRIX_GATE_START_DELAY_MS` (1000ms) — rain runs for 1s first.
- After rain duration expires, `revealPrompt()` is called — rain keeps running.

### Phase 2 — Identity Lines
- 6 lines type out at 20–30ms/char. Line 1 appears instantly.
- **Verbatim copy — do NOT alter:**
  1. `> it is 1998.`
  2. `> before the cloud. before the stream. before the feed.`
  3. `> dial-up internet had just arrived. nobody knew what it was yet.`
  4. `> explore it on an IBM Aptiva — Pentium II, 128MB RAM. $3,299 in 1998. that's $6,683 today.`
  5. `> dial-up did not respond in milliseconds. it responded in heartbeats.`
  6. `> take your time. sound on.`
- Rendered on canvas at 20px Courier New with dark backdrop (`rgba(0,0,0,0.7)`).
- Color: `#CCFFCC` (near-white green).
- Prompt (`C:\> press any key to continue_`) appears at `MATRIX_PROMPT_CANVAS_Y_PCT` (70%).
- Prompt font: 20px set in `css/boot.css` — do NOT revert to 14px.

### Impatience mode
- Clicking/keypressing during typing sets `impatient = true` — accelerates to 8ms/char.
- Does NOT skip lines. Does NOT trigger wormhole early.
- Only when `identityPhase === 'done'` (prompt visible) does interaction trigger the wormhole.
- Do NOT set delay to 0 — 8ms is intentional.

### Phase 3 — Cinematic transition (keypress at prompt)

**State flags:**
- `rainAware` — set `true` on keypress at prompt. No visual change.
- `dissolveActive` — `true` while lines unwrite. Read by `drawFrame()`.
- `dissolveStart` — timestamp when dissolution began.
- `dissolveChars` — snapshot of line lengths at keypress. Do NOT use live `identityTypedLines`.

**Dissolution (0–600ms):** Lines unwrite right-to-left, bottom-first, 80ms stagger, 15ms/char.

**Wormhole overlap (400ms):** `bootScene.init()` fires at 400ms — do NOT push past 400ms.

**Phosphor glow:** In `wormFrame()` Phase 4, green stroke arc on expanding clip edge. `shadowBlur = 24`. Do NOT remove.

---

## Wormhole Match Cut (startWormhole)

Snapshot captures the ACTUAL visible trail state. Same glyphs, positions, opacity, mirroring as on screen. No random re-population.

- Iterate `col.trailLen` positions. `trailRow = col.headRow - tr`. Skip out-of-bounds.
- Char: `col.chars[bufIdx]` (katakana) or `col.emojis[bufIdx]` (emoji). `bufIdx = Math.min(trailRow, 119)`.
- Opacity: `tr === 0 ? 1.0 : Math.pow(1 - (tr/tLen), 2.2)`.
- Mirror: `col.mirrored[bufIdx]` (katakana); `false` (emoji).
- Fill: `'#CCFFCC'` (head); `MATRIX_COLOR` (trail).
- Do NOT use `Math.random() > 0.6` random skip or `(col.headRow + ri) % gridRows` — old model.

---

## Matrix Rain (boot.js)

**No custom font — Courier New only.** MatrixCode TTF abandoned — solid glyph backgrounds break canvas compositing.

**Character set:** Full-width katakana (U+30A0–U+30FF). Do NOT use half-width (ｦｧ... renders at ~7px, invisible in 12px cell).

**Cell/font size:** `FONT_SIZE = 12`. Glyphs at `11px`. Do NOT change without updating `ctx.font`.

**Session TTL:** `MATRIX_SESSION_TTL_MS = 0`. Every visit gets full experience. Do NOT restore `localStorage.setItem`.

**Startup:** `init()` calls `_startRain()` directly. No `document.fonts.load()` gate.

**Column model:**
- `col.headRow` — stream head position
- `col.trailLen` — random 8–20, set at init and reset
- `col.chars` — 120-slot fixed buffer. Do NOT pick random at draw time.
- `col.mirrored` — 120-slot fixed buffer. Do NOT re-roll at draw time.
- `col.emojis` — 120-slot fixed buffer. Do NOT re-roll at draw time.
- `col.emojiStream` — 1% of columns, never re-rolled
- On resume: all three buffers refreshed

**Speed:** Base `MATRIX_STREAM_BASE_DELAY_MS` (160ms). Factor range 0.40–1.30. Not re-rolled on reset.

**Render — explicit trail:**
- Clear to `#000` each frame.
- Draw `col.trailLen` chars tail-to-head.
- Head (tr=0): `globalAlpha=1`, `fillStyle='#CCFFCC'`.
- Trail: `fillStyle=MATRIX_COLOR`, `opacity=Math.pow(1-(tr/tLen),2.2)`, min 0.03.
- Do NOT use overdraw model (`rgba(0,0,0,alpha)`) — creates banding.

**Mirroring:** 70% mirrored via `ctx.translate(col.x+FONT_SIZE,ty); ctx.scale(-1,1)`. Fixed in `col.mirrored[bufIdx]`.

**Emoji:** 1% columns `emojiStream:true`. Trail uses `col.emojis[bufIdx]`. No mirroring.

---

## Boot Sequence State Machine (boot.js)

**Full sequence:** gate → dissolution (~600ms) → wormhole match cut (~5s, overlapping from 400ms) → desk scene → power button → CRT (~4s) → zoom+fade (~1.5s) → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

**CRT timings (50% faster than original):**
- `CRT_DIM_MS`: 1060ms
- `CRT_SCANLINE_MS`: 1100ms
- `CRT_GLOW_MS`: 1150ms
- `CRT_CONTENT_FADE_MS`: 700ms
- `DESK_ZOOM_MS`: 1500ms

Do NOT revert these to original values (2120/2200/2300/1400/3000).

`advanceBootState(state)` drives transitions. Always check `if (gen !== bootGen) { return; }`.

**Screen 1 — POST:** IBS BIOS header → RAM counter (recursive setTimeout, not setInterval) → post-beep → advance.
**Screen 2 — IBS Splash** (`#102046`): IBS logotype, floppy-seek 800–1000ms, 6000ms duration.
**Screen 3 — DOS Log:** 13 bootlog lines verbatim, 160–300ms intervals, screech 60% of boots.
**Screen 4 — WinDoors Logo:** 20-block bar, stalls 3500ms at 60%, 2000ms at 85%.
**Screen 5 — Desktop Arrival:** chatter continues, startup chime at COMPLETE, then staged fade (see HDD Audio).

**Wormhole:** Phase 1 drift (1500ms) → Phase 2 spiral+glow (2000ms) → Phase 3 collapse (500ms) → Phase 4 reveal+phosphor (1000ms). Restart rain before `onComplete`.

---

## HDD Audio Design (boot.js + boot-scene.js)

Two-file system. Both files preloaded in `preloadBootAudio()` on gate interact.

| File | Duration | Loop | Trigger | Ends |
|---|---|---|---|---|
| `hdd-poweron.mp3` | 10s | No | Power button (immediate) | Naturally |
| `hdd-chatter.mp3` | 41s | Yes | Power button (at 9950ms) | Never — staged fade after chime |

Start chatter at `volume=0` immediately (autoplay policy). Ramp to 1.0 at 9950ms.

**Chatter lifecycle:**
1. Power button click → starts at `volume = 0`
2. At 9950ms → `fadeAudioTo(hddChatter, 1.0, 200ms)` — ramps up
3. Runs through all boot screens at 1.0 (with 0.7 dips during WinDoors stalls)
4. Desktop Arrival — chatter continues, does NOT stop
5. COMPLETE — `startup.mp3` chime fires
6. Chime `ended` → wait 2s → `fadeAudioTo(hddChatter, 0.5, 3000ms)` — stage 1: fade to 50%
7. After stage 1 completes (3s) → `fadeAudioTo(hddChatter, 0.2, 5000ms)` — stage 2: fade to 20%
8. Loops at 0.2 indefinitely as ambient background

**Do NOT:**
- Call `fadeAudioOut()` on `hddChatter` — it should never stop
- Collapse stages 1 and 2 into a single fade — the two-stage drop is intentional
- Remove the 2s delay before stage 1 — it lets the desktop moment breathe
- Set `hddChatter.loop = false`

**Timing tokens (flat on `window.APC.timing`):**
- `HDD_POWERON_DURATION_MS`: 10000
- `HDD_CHATTER_CROSSFADE_MS`: 50
- `HDD_CHATTER_SETTLE_MS`: 3000 — stage 1 fade duration
- `HDD_CHATTER_SETTLE_VOL`: 0.5 — stage 1 target (50%)
- Stage 2 values are hardcoded in boot.js: `fadeAudioTo(hddChatter, 0.2, 5000)`

**`fadeAudioTo(audio, targetVol, durationMs)`** — fades to any target, does NOT pause. Distinct from `fadeAudioOut()` which fades to 0 and pauses.

**Critical rules:**
- `hddChatter.loop` must stay `true`
- Never `fadeAudioOut(hddChatter)` — use `fadeAudioTo()` only
- `playHddAudio` must stay on public API return object
- Do not remove POST safety net (`if hddChatter.paused`)

---

## NetEscape (netescape.js)

`netescape-` prefix only — never `ie-`. Protected Path: max 1000ms, no failures. Unknown URLs: freeze → dialog → homepage.

---

## RAM Endpoint

`/ram` → `127.0.0.1:8091`. Returns `{total, available, used}` kB. Degrade to `'--'` on failure.

---

## Common Pitfalls

- **`setInterval` for RAM counter** — wrong. Recursive `setTimeout`.
- **`sessionStorage.clear()` on restart** — wrong. Targeted `removeItem()`.
- **Audio before user gesture** — wrong. Preload inside `onGateInteract()`.
- **Hardcoded ms values** — wrong. Always `window.APC.timing.*`.
- **`ie-` prefixed classes** — wrong. Use `netescape-`.
- **Proxy APIs called directly** — wrong. All through Caddy.
- **External fonts for canvas** — wrong. Courier New only.
- **Half-width katakana** — wrong. Full-width only.
- **Random chars at draw time** — wrong. Use `col.chars[bufIdx]`.
- **Re-rolling mirror at draw time** — wrong. Use `col.mirrored[bufIdx]`.
- **Re-rolling emoji at draw time** — wrong. Use `col.emojis[bufIdx]`.
- **Overdraw model** — wrong. Explicit trail, clear to `#000`.
- **Skipping identity lines on keypress** — wrong. `impatient=true` (8ms/char), never skip.
- **Instant identity line clear on keypress** — wrong. Must dissolve via `identityPhase='dissolving'`.
- **bootScene.init() after dissolution** — wrong. Must fire at 400ms.
- **Head in `MATRIX_COLOR`** — wrong. Head is `#CCFFCC`.
- **Removing phosphor glow from wormFrame Phase 4** — wrong. Intentional.
- **Random wormhole snapshot** — wrong. Use actual trail positions/chars/opacity/mirroring.
- **`(col.headRow+ri)%gridRows` in snapshot** — wrong. Use `col.headRow-tr`.
- **Altering identity line copy** — wrong. Verbatim only. Copy written by Don Draper and the Wachowskis.
- **Reverting CRT/zoom timings to original** — wrong. Current values are 50% faster by design.
- **`fadeAudioOut(hddChatter)`** — wrong. `fadeAudioTo()` only.
- **`hddChatter.loop=false`** — wrong.
- **Collapsing staged chatter fade into one step** — wrong. Two-stage drop (1.0→0.5→0.2) is intentional.
- **Removing 2s delay before chatter fade** — wrong. Intentional breathing room after chime.
- **`setTimeout(()=>hddChatter.play(),delay)`** — wrong. Start within user gesture.
- **Removing `playHddAudio` from return object** — wrong.

## Desktop Icon Dragging (shipped)

- **File:** `js/desktop.js` (appended IIFE: `initIconDrag`)
- **CSS:** `css/win98.css` — `.desktop-icon--dragging`, `.desktop-icon--drag-placeholder`
- **Timing token:** `ICON_DRAG_THRESHOLD_PX = 5` in `window.APC.timing`
- **localStorage key:** `desktop_icon_positions` — JSON map of icon ID → `{gridX, gridY}`
- **Behavior:** mousedown/mousemove/mouseup drag (no HTML5 drag API). 5px threshold before drag starts. Snaps to 80×80 grid on drop. Collision detection scans right then down. Ghost placeholder shown at origin during drag. Positions persist across sessions.
- **Pitfalls:** Do NOT use `export const` in win98-timing.js — it is not a module. All tokens go inside `window.APC.timing = { ... }`. The drag IIFE calls `hideIconHint()` if it exists — safe no-op if not present.
- **Analytics:** Umami event `desktop_icon_drag` fires on every completed drag.
