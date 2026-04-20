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

The gate screen is the full cinematic opening sequence. It has three distinct phases before the wormhole begins.

### Phase 1 — Rain
- Rain starts immediately on page load via `_startRain()` — no font gate, no delay.
- Runs for `MATRIX_DURATION_MIN_MS`–`MATRIX_DURATION_MAX_MS` (3–12s) before identity lines appear.
- After rain duration expires, `revealPrompt()` is called — rain keeps running behind everything.

### Phase 2 — Identity Lines
- 8 lines type out character by character at 20–30ms/char (lines 2–8; line 1 appears instantly).
- Rendered on canvas at 20px Courier New with dark backdrop (`rgba(0,0,0,0.7)`) for legibility.
- Color: `#CCFFCC` (near-white green) — visually distinct from the rain.
- Font: explicitly `20px "Courier New", monospace` — do NOT change to MatrixCode.
- Prompt (`C:\> press any key to continue_`) appears at `MATRIX_PROMPT_CANVAS_Y_PCT` (70%) after lines complete.
- Prompt font is 20px set in `css/boot.css` — do NOT revert to 14px.

### Impatience mode
- Clicking or keypressing during typing does NOT skip lines or trigger the wormhole.
- Instead it sets `impatient = true`, reducing `typeNextChar()` delay to 8ms/char.
- Clicking during the post-lines pause skips the 800ms pause and calls `revealPrompt()` immediately.
- Only when `identityPhase === 'done'` (prompt visible) does interaction trigger the wormhole sequence.
- Do NOT allow interaction to bypass identity lines. Do NOT set delay to 0 — 8ms is intentional.

### Phase 3 — Cinematic transition (keypress at prompt)

**State flags involved:**
- `rainAware` — set `true` the moment the user presses a key at the prompt. No visual change. Foundation for dissolution.
- `impatient` — set during typing phase. Reset on `restart()`.
- `dissolveActive` — `true` while lines are unwriting. Read by `drawFrame()` to render dissolution.
- `dissolveStart` — timestamp when dissolution began.
- `dissolveChars` — snapshot of `identityTypedLines` lengths at keypress time. Do NOT use live `identityTypedLines` during dissolution — it gets cleared.

**Dissolution sequence (0–600ms):**
- Lines unwrite right-to-left, bottom line first, 80ms stagger between lines.
- Line 8 (index 7) starts at `dissolveStart + 0ms`. Line 1 (index 0) starts at `dissolveStart + 560ms`.
- Each character position takes ~15ms to unwrite.
- Opacity fades as chars disappear: `globalAlpha = charsVisible / fullLen`.
- `identityPhase = 'dissolving'` during this phase — `drawFrame()` reads this to switch rendering path.

**Wormhole overlap (400ms):**
- `bootScene.init()` fires at 400ms — desk scene begins loading while top lines are still dissolving.
- This creates overlap: dissolution ending and wormhole beginning are not sequential, they overlap.
- Do NOT push `bootScene.init()` past 400ms — the seam between dissolution and wormhole becomes visible.

**Cleanup (400ms setTimeout fires):**
- `dissolveActive = false`, `identityPhase = 'waiting'`, `identityTypedLines = []`.
- Gate z-index drops to 98, opacity stays 1 (rain visible through transparent desk PNG areas).
- `bootScene.init(onComplete)` callback advances to POST screen after CRT sequence.

**Phosphor glow on reveal:**
- In `wormFrame()` Phase 4, a green stroke arc traces the expanding clip circle edge.
- `ctx.strokeStyle = '#00FF41'`, `ctx.shadowColor = '#00FF41'`, `ctx.shadowBlur = 24`.
- Opacity fades as reveal completes: `globalAlpha = 1 - (phaseElapsed / REVEAL_MS)`.
- Reset `ctx.shadowBlur = 0` after stroke to prevent leakage into other canvas ops.
- Do NOT remove this — it's the CRT-phosphor-writing-the-world-into-existence effect.

---

## Matrix Rain (boot.js)

The Matrix rain canvas runs inside `boot.js` under the `window.APC.boot` namespace. There is no separate `matrix.js`.

**No custom font — Courier New only:**
- MatrixCode TTF was trialled and abandoned. It rendered glyphs with a solid background box, incompatible with canvas compositing.
- The rain uses `11px "Courier New", monospace` for all glyph rendering. Do NOT reintroduce MatrixCode or any external font for canvas use.
- The `@font-face` declaration for MatrixCode remains in `css/boot.css` but is not referenced in `boot.js`.

**Character set — full-width katakana + ASCII + symbols:**
- `MATRIX_CHARS` uses full-width katakana (U+30A0–U+30FF range).
- Do NOT use half-width katakana (ｦｧｨｩ... U+FF65–FF9F) — they render at ~7px in Courier New, invisible in a 12px cell.
- ASCII uppercase + digits + symbols (`@#$%*+-=:<>/\|`) are included.
- Emoji handled separately via `MATRIX_EMOJIS` and the `emojiStream` column flag.

**Cell and font size:**
- `FONT_SIZE = 12` — column width and row height in pixels.
- Glyphs render at `11px` — one pixel smaller than cell — so characters breathe without touching neighbors.
- Do NOT change `FONT_SIZE` without also updating the `ctx.font` string in `drawFrame()`.

**Session persistence — localStorage TTL (disabled):**
- `MATRIX_SESSION_TTL_MS` is `0` — every visit gets the full gate → boot experience.
- `boot_complete_ts` is no longer written to localStorage.
- Do NOT restore the `localStorage.setItem('boot_complete_ts', ...)` call.

**Rain startup — direct `_startRain()` call:**
- `init()` calls `_startRain()` directly. There is no font-load gate.
- Do NOT add `document.fonts.load(...)` back.

**Rain duration — randomized at init time:**
- `rainDuration = rand(MATRIX_DURATION_MIN_MS, MATRIX_DURATION_MAX_MS)` (3–12s)
- When `Date.now() - rainStartTime >= rainDuration` and `identityPhase !== 'done'`: call `revealPrompt()` — rain keeps running.

**Column data model:**
- `col.headRow` — current row of the stream head
- `col.trailLen` — random trail length per column (8–20 chars), set at init and on reset
- `col.chars` — fixed character buffer, 120 slots; assigned at init and refreshed on reset. Do NOT pick random chars at draw time — causes shimmer.
- `col.mirrored` — fixed boolean buffer, 120 slots; `true` = draw that row's char horizontally mirrored. Do NOT re-roll at draw time — causes flicker.
- `col.emojis` — fixed emoji buffer, 120 slots; used by `emojiStream` columns. Same rules as `col.chars`.
- `col.emojiStream` — `true` for ~1% of columns (decided by `MATRIX_EMOJI_STREAM_CHANCE`); never re-rolled
- `col.active` — `false` during post-exit pause; `col.pauseUntil` is the resume timestamp
- On resume: `active = true`, `headRow = 0`, `nextCharTime = now`, all three buffers refreshed

**Per-column fixed speed:**
- Base velocity: `MATRIX_STREAM_BASE_DELAY_MS` (160ms) per head advance
- Each column gets a random `speedFactor` in range `MATRIX_COL_SPEED_MIN_PCT` (0.40) to `MATRIX_COL_SPEED_MAX_PCT` (1.30)
- Wide variance makes some columns visibly faster than others
- charDelay is NOT re-rolled when a stream resets

**Render model — explicit trail (current):**
- Each frame: `ctx.fillStyle = '#000'; ctx.fillRect(...)` clears to pure black. No overdraw.
- For each active column, draw `col.trailLen` characters from tail to head (painter's order).
- **Head** (tr === 0): `globalAlpha = 1`, `fillStyle = '#CCFFCC'` (near-white green).
- **Trail** (tr > 0): `fillStyle = MATRIX_COLOR` (`#00FF41`), exponential fade: `Math.pow(1 - (tr / tLen), 2.2)`, minimum 0.03.
- Character at each row: `col.chars[trailRow]` — fixed for stream's lifetime.
- Mirror decision: `col.mirrored[trailRow]` — fixed for stream's lifetime.
- Do NOT use the overdraw model (`rgba(0,0,0,alpha)` fillRect) — creates horizontal banding with Courier New.

**Mirroring — 70/30 split:**
- 70% of character slots mirrored via `ctx.save(); ctx.translate(col.x + FONT_SIZE, ty); ctx.scale(-1, 1); ctx.fillText(ch, 0, 0); ctx.restore()`.
- Decision stored in `col.mirrored[bufIdx]` — fixed at init, not re-rolled.

**Emoji columns:**
- 1% of columns are `emojiStream: true` — every character is an emoji from `MATRIX_EMOJIS`.
- Emoji columns draw a trail using `col.emojis[bufIdx]` — same fixed-buffer rules.
- No mirroring on emoji columns.

**Prompt legibility:**
- `#gate-prompt` has `background: rgba(0,0,0,0.75)` and `padding: 6px 12px` in `css/boot.css`.
- Do not remove these — the rain runs behind the prompt.

**`revealPrompt()`:**
- Sets `identityPhase = 'done'` and adds `gate-prompt--visible` — that is all it does.
- Does NOT cancel rAF. Rain runs continuously.
- rAF cancelled only by `startWormhole()` when user interacts at the prompt.

**Wormhole compatibility (`startWormhole()`):**
- Snapshots `col.headRow` (not `col.currentRow`) when building `wormChars`.
- Clamp: `Math.max(0, col.headRow)`.

---

## Boot Sequence State Machine (boot.js)

boot.js was fully rewritten in PR #97. The old single-screen Win98 progress bar is gone — do not restore it.

**Full sequence:** gate → dissolution (~600ms) → wormhole (~5s, overlapping from 400ms) → desk scene → power button click → CRT (~8s) → zoom+fade (~6s) → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

`advanceBootState(state)` drives all transitions. A `bootGen` generation counter prevents stale
`setTimeout` callbacks from firing after the state has advanced. Always check
`if (gen !== bootGen) { return; }` in every deferred callback.

**Screen 1 — POST** (`#000`, white Courier New)
- IBS BIOS header lines → RAM counter 0K → 131072K → `post-beep.mp3` → "Press DEL" → advance
- RAM counter uses recursive `setTimeout` with variable tick (30–90ms) + mechanical hesitation. DO NOT replace with linear `setInterval`.
- POST safety net: if `hddChatter.paused` is true, starts chatter here. Do not remove this guard.

**Screen 2 — IBS Splash** (`#102046` navy)
- "IBS" logotype + "Captiva 2139-$E7" + "Surepath BIOS v3.26.11" centered
- `floppy-read.mp3` fires at 800–1000ms after screen appears
- Duration: `BOOT_SEQUENCE.IBS_SPLASH_DURATION_MS` (6000ms — do not revert to 3000ms)

**Screen 3 — DOS Log** (`#000`, white Courier New)
- 13 hardcoded bootlog lines, verbatim, in order — do not alter copy
- Line interval: `DOS_LOG_LINE_INTERVAL_MIN/MAX_MS` (160–300ms)
- `hdd-screech.mp3` fires on 60% of boots — never re-rolled

**Screen 4 — WinDoors Logo** (`#000`)
- Four-color CSS flag (red/green/blue/yellow 2×2) — fictional, NOT the Windows logo
- 20-block chunky progress bar, stall rhythm: 3500ms at 60%, 2000ms at 85%
- `hdd-chatter.mp3` volume drops to 0.7 during stalls, restores to 1.0 after

**Screen 5 — Desktop Arrival**
- `hdd-chatter.mp3` continues looping — does NOT stop here
- `startup.mp3` fires at COMPLETE
- After chime ends, `fadeAudioTo(hddChatter, 0.6, 2000ms)`

**Wormhole transition** (gate keypress → desk scene) — fires at 400ms into dissolution
- `window.APC.boot.startWormhole(bitmap, bitmapParams, onComplete)` — public API
- Phase 1 `WORMHOLE_DISTURBANCE_MS` (1500ms): characters drift tangentially (±30px)
- Phase 2 `WORMHOLE_SPIRAL_MS` (2000ms): radius = `initRadius * (1 − easedT)²`; glow 0 → 120px
- Phase 3 `WORMHOLE_COLLAPSE_MS` (500ms): glow pulse — hold 120px → contract to 20px
- Phase 4 `WORMHOLE_REVEAL_MS` (1000ms): desk scene revealed via `ctx.arc` + `clip()` with phosphor glow
- After wormhole: `animFrame = requestAnimationFrame(drawFrame)` must restart rain before `onComplete`

---

## HDD Audio Design (boot.js + boot-scene.js)

Two-file system. Both files preloaded in `preloadBootAudio()` on gate interact.

| File | Duration | Loop | Trigger | Ends |
|---|---|---|---|---|
| `hdd-poweron.mp3` | 10s | No | Power button click (immediate) | Naturally at 10s |
| `hdd-chatter.mp3` | 41s | Yes (`loop=true`) | Power button click (at 9950ms offset) | Never — fades to 0.6 after chime |

**`playHddAudio()` — called by boot-scene.js on power button click:**
```js
bootAudio.hddPoweron.play();
bootAudio.hddChatter.volume = 0;
bootAudio.hddChatter.play();
setTimeout(function () {
  fadeAudioTo(bootAudio.hddChatter, 1.0, 200);
}, HDD_POWERON_DURATION_MS - HDD_CHATTER_CROSSFADE_MS); // 9950ms
```

**Why volume=0 at start:** Autoplay policy blocks `.play()` inside `setTimeout`. Start at 0 immediately, ramp later.

**Critical rules:**
- `hddChatter.loop` must stay `true`
- Never call `fadeAudioOut()` on `hddChatter` — use `fadeAudioTo()` only
- `playHddAudio` must stay on the public API return object
- Do not remove the POST safety net (`if hddChatter.paused`)

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
- **Importing external fonts for canvas rain** — wrong. Courier New only. MatrixCode TTF is present in assets but NOT used in boot.js.
- **Using half-width katakana (ｦｧｨｩ...)** — wrong. Renders at ~7px, invisible in 12px cell. Use full-width only.
- **Picking random chars at draw time** — wrong. Always read from `col.chars[bufIdx]`. Random picks cause shimmer.
- **Re-rolling mirror decision at draw time** — wrong. Always read from `col.mirrored[bufIdx]`.
- **Re-rolling emoji at draw time** — wrong. Always read from `col.emojis[bufIdx]`.
- **Using overdraw model** — wrong. Creates horizontal banding. Use explicit trail: clear to `#000`, draw N chars per column at explicit opacities.
- **Skipping identity lines on keypress** — wrong. Keypress during typing sets `impatient = true` (8ms/char), never skips. Only prompt-visible keypress triggers wormhole.
- **Instant identity line clear on keypress** — wrong. Lines must dissolve via `identityPhase = 'dissolving'` sequence. Do NOT set `identityTypedLines = []` immediately on keypress.
- **Starting bootScene after dissolution completes** — wrong. `bootScene.init()` must fire at 400ms for wormhole overlap.
- **Drawing head in `MATRIX_COLOR`** — wrong. Head draws in `#CCFFCC`. Trail draws in `MATRIX_COLOR`. Do not change.
- **Removing phosphor glow from wormFrame Phase 4** — wrong. It's intentional — the CRT-writing-the-world effect.
- **`hddChatter.loop = false`** — wrong.
- **`fadeAudioOut(hddChatter, ...)`** — wrong. Use `fadeAudioTo()` only.
- **`setTimeout(() => hddChatter.play(), delay)`** — wrong. Start `.play()` within user gesture context.
- **Removing `playHddAudio` from boot.js return object** — wrong. boot-scene.js depends on it.
