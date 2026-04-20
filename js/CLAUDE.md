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
- `rainAware` — set `true` the moment the user presses a key at the prompt. No visual change.
- `impatient` — set during typing phase. Reset on `restart()`.
- `dissolveActive` — `true` while lines are unwriting. Read by `drawFrame()` to render dissolution.
- `dissolveStart` — timestamp when dissolution began.
- `dissolveChars` — snapshot of `identityTypedLines` lengths at keypress time. Do NOT use live `identityTypedLines` during dissolution — it gets cleared.

**Dissolution sequence (0–600ms):**
- Lines unwrite right-to-left, bottom line first, 80ms stagger between lines.
- Line 8 (index 7) starts at `dissolveStart + 0ms`. Line 1 (index 0) starts at `dissolveStart + 560ms`.
- Each character position takes ~15ms to unwrite.
- Opacity fades as chars disappear: `globalAlpha = charsVisible / fullLen`.
- `identityPhase = 'dissolving'` during this phase.

**Wormhole overlap (400ms):**
- `bootScene.init()` fires at 400ms — desk scene begins loading while top lines are still dissolving.
- Do NOT push `bootScene.init()` past 400ms — the seam between dissolution and wormhole becomes visible.

**Cleanup (400ms setTimeout fires):**
- `dissolveActive = false`, `identityPhase = 'waiting'`, `identityTypedLines = []`.
- Gate z-index drops to 98, opacity stays 1.
- `bootScene.init(onComplete)` callback advances to POST screen after CRT sequence.

**Phosphor glow on reveal:**
- In `wormFrame()` Phase 4, a green stroke arc traces the expanding clip circle edge.
- `ctx.strokeStyle = '#00FF41'`, `ctx.shadowColor = '#00FF41'`, `ctx.shadowBlur = 24`.
- Opacity fades as reveal completes: `globalAlpha = 1 - (phaseElapsed / REVEAL_MS)`.
- Reset `ctx.shadowBlur = 0` after stroke to prevent leakage.
- Do NOT remove — it's the CRT-phosphor-writing-the-world-into-existence effect.

---

## Wormhole Match Cut (startWormhole)

The wormhole snapshot is a **match cut** — it captures the exact visual state of the rain at the moment of keypress and spirals those characters inward. The viewer never sees a cut. The same characters they were watching become the vortex.

**Snapshot rules — do NOT change these without understanding the match cut principle:**

- Iterate `col.trailLen` positions per column (not `gridRows` randomly sampled).
- For each `tr = 0 to col.trailLen`, compute `trailRow = col.headRow - tr`.
- Skip positions where `trailRow < 0` or `trailRow >= gridRows`.
- Character: `col.chars[bufIdx]` for katakana/ASCII columns; `col.emojis[bufIdx]` for emoji columns. `bufIdx = Math.min(trailRow, 119)`.
- Opacity: `tr === 0 ? 1.0 : Math.pow(1 - (tr / tLen), 2.2)` — matches the rain trail model exactly.
- Mirror: `col.mirrored[bufIdx]` for katakana/ASCII; `false` for emoji columns.
- Fill color: `'#CCFFCC'` for head (tr === 0); `MATRIX_COLOR` for trail.
- Emoji columns render in natural OS color — do NOT apply green fill to emoji.

**Do NOT:**
- Use `Math.random() > 0.6` to randomly skip rows — this was the old model, it created a mismatched cloud.
- Use `(col.headRow + ri) % gridRows` — this wraps around and generates positions not on screen.
- Pick random chars for `wormChars` — use the actual buffer values.
- Re-roll mirror decisions — use `col.mirrored[bufIdx]`.

**Wormhole draw loop — Phase 1 and Phase 2:**
- Use `c.opacity` (preserved from snapshot) combined with spiral fade for Phase 2: `Math.max(0, opacity * c.opacity)`.
- Use `c.fillColor` for `fillStyle` — head chars stay near-white, trail chars stay green through the spiral.
- Apply `c.mirrored` transform: `ctx.translate(x + FONT_SIZE, y); ctx.scale(-1, 1)` — same as rain draw.
- Emoji chars (`c.isEmoji`) render without fill color override — natural OS color preserved.

---

## Matrix Rain (boot.js)

The Matrix rain canvas runs inside `boot.js` under the `window.APC.boot` namespace. There is no separate `matrix.js`.

**No custom font — Courier New only:**
- MatrixCode TTF was trialled and abandoned. It rendered glyphs with a solid background box, incompatible with canvas compositing.
- The rain uses `11px "Courier New", monospace` for all glyph rendering.
- Do NOT reintroduce MatrixCode or any external font for canvas use.

**Character set — full-width katakana + ASCII + symbols:**
- `MATRIX_CHARS` uses full-width katakana (U+30A0–U+30FF range).
- Do NOT use half-width katakana (ｦｧｨｩ... U+FF65–FF9F) — renders at ~7px, invisible in 12px cell.
- ASCII uppercase + digits + symbols (`@#$%*+-=:<>/\|`) included.

**Cell and font size:**
- `FONT_SIZE = 12` — column width and row height in pixels.
- Glyphs render at `11px` — one pixel smaller than cell.
- Do NOT change `FONT_SIZE` without updating `ctx.font` string in `drawFrame()`.

**Session persistence — localStorage TTL (disabled):**
- `MATRIX_SESSION_TTL_MS` is `0` — every visit gets the full gate → boot experience.
- `boot_complete_ts` is no longer written to localStorage.
- Do NOT restore the `localStorage.setItem('boot_complete_ts', ...)` call.

**Rain startup — direct `_startRain()` call:**
- `init()` calls `_startRain()` directly. There is no font-load gate.
- Do NOT add `document.fonts.load(...)` back.

**Rain duration:**
- `rainDuration = rand(MATRIX_DURATION_MIN_MS, MATRIX_DURATION_MAX_MS)` (3–12s)
- When expired and `identityPhase !== 'done'`: call `revealPrompt()` — rain keeps running.

**Column data model:**
- `col.headRow` — current row of the stream head
- `col.trailLen` — random trail length per column (8–20 chars), set at init and on reset
- `col.chars` — fixed character buffer, 120 slots. Do NOT pick random chars at draw time.
- `col.mirrored` — fixed boolean buffer, 120 slots. Do NOT re-roll at draw time.
- `col.emojis` — fixed emoji buffer, 120 slots. Do NOT re-roll at draw time.
- `col.emojiStream` — `true` for ~1% of columns; never re-rolled
- `col.active` — `false` during post-exit pause
- On resume: `active = true`, `headRow = 0`, `nextCharTime = now`, all three buffers refreshed

**Per-column fixed speed:**
- Base: `MATRIX_STREAM_BASE_DELAY_MS` (160ms). Speed factor range: 0.40–1.30.
- charDelay is NOT re-rolled when a stream resets.

**Render model — explicit trail:**
- Each frame: clear to `#000`. Draw `col.trailLen` chars from tail to head.
- Head (tr === 0): `globalAlpha = 1`, `fillStyle = '#CCFFCC'`.
- Trail (tr > 0): `fillStyle = MATRIX_COLOR`, `opacity = Math.pow(1 - (tr / tLen), 2.2)`, min 0.03.
- Char: `col.chars[trailRow]`. Mirror: `col.mirrored[trailRow]`. Both fixed.
- Do NOT use overdraw model (`rgba(0,0,0,alpha)` fillRect) — creates banding.

**Mirroring — 70/30 split:**
- `ctx.save(); ctx.translate(col.x + FONT_SIZE, ty); ctx.scale(-1, 1); ctx.fillText(ch, 0, 0); ctx.restore()`
- Decision stored in `col.mirrored[bufIdx]` — fixed at init.

**Emoji columns:**
- 1% `emojiStream: true`. Trail uses `col.emojis[bufIdx]`. No mirroring.

**`revealPrompt()`:**
- Sets `identityPhase = 'done'`, adds `gate-prompt--visible`. Does NOT cancel rAF.

---

## Boot Sequence State Machine (boot.js)

**Full sequence:** gate → dissolution (~600ms) → wormhole match cut (~5s, overlapping from 400ms) → desk scene → power button click → CRT (~8s) → zoom+fade (~6s) → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE

`advanceBootState(state)` drives all transitions. Always check `if (gen !== bootGen) { return; }`.

**Screen 1 — POST** (`#000`, white Courier New): IBS BIOS header → RAM counter → post-beep → advance.
**Screen 2 — IBS Splash** (`#102046`): IBS logotype, floppy-seek at 800–1000ms, 6000ms duration.
**Screen 3 — DOS Log** (`#000`): 13 bootlog lines verbatim, 160–300ms intervals, screech on 60% of boots.
**Screen 4 — WinDoors Logo** (`#000`): 20-block progress bar, stalls at 60% (3500ms) and 85% (2000ms).
**Screen 5 — Desktop Arrival**: chatter continues, boot-sequence fades, startup chime fires at COMPLETE.

**Wormhole** fires at 400ms into dissolution. `startWormhole(bitmap, bitmapParams, onComplete)` — public API.
- Phase 1 (1500ms): drift. Phase 2 (2000ms): spiral with glow. Phase 3 (500ms): collapse pulse. Phase 4 (1000ms): radial reveal with phosphor glow.
- After wormhole: `animFrame = requestAnimationFrame(drawFrame)` must restart rain before `onComplete`.

---

## HDD Audio Design

| File | Duration | Loop | Trigger | Ends |
|---|---|---|---|---|
| `hdd-poweron.mp3` | 10s | No | Power button click | Naturally |
| `hdd-chatter.mp3` | 41s | Yes | Power button click (at 9950ms) | Never — fades to 0.6 |

**Critical rules:** `hddChatter.loop = true`. Never `fadeAudioOut(hddChatter)`. `playHddAudio` stays on public API. Keep POST safety net.

---

## NetEscape (netescape.js)

All CSS classes use `netescape-` prefix — never `ie-`. Protected Path: max 1000ms, no failures. Unknown URLs: freeze → dialog → homepage.

---

## RAM Endpoint

`/ram` → `127.0.0.1:8091`. Returns `{total, available, used}` in kB. Degrade to `'--'` on failure.

---

## Common Pitfalls

- **`setInterval` for RAM counter** — wrong. Recursive `setTimeout` with hesitation.
- **`sessionStorage.clear()` on restart** — wrong. Targeted `removeItem()` only.
- **Audio before user gesture** — wrong. Preload inside `onGateInteract()` only.
- **Hardcoded ms values** — wrong. Always `window.APC.timing.*`.
- **`ie-` prefixed files or classes** — wrong. Use `netescape-`.
- **Calling proxy APIs directly** — wrong. All calls go through Caddy routes.
- **External fonts for canvas rain** — wrong. Courier New only.
- **Half-width katakana** — wrong. Full-width only.
- **Random chars at draw time** — wrong. Use `col.chars[bufIdx]`.
- **Re-rolling mirror at draw time** — wrong. Use `col.mirrored[bufIdx]`.
- **Re-rolling emoji at draw time** — wrong. Use `col.emojis[bufIdx]`.
- **Overdraw model** — wrong. Explicit trail: clear `#000`, draw N chars at explicit opacities.
- **Skipping identity lines on keypress** — wrong. `impatient = true` (8ms/char), never skip.
- **Instant identity line clear on keypress** — wrong. Must dissolve via `identityPhase = 'dissolving'`.
- **Starting bootScene after dissolution** — wrong. Must fire at 400ms for overlap.
- **Drawing head in `MATRIX_COLOR`** — wrong. Head is `#CCFFCC`, trail is `MATRIX_COLOR`.
- **Removing phosphor glow from wormFrame Phase 4** — wrong. Intentional CRT effect.
- **Random wormhole snapshot** — wrong. Snapshot must use actual trail positions, chars, opacity, and mirroring. See Wormhole Match Cut section.
- **`(col.headRow + ri) % gridRows` in snapshot** — wrong. Use `col.headRow - tr` for each trail position.
- **`hddChatter.loop = false`** — wrong.
- **`fadeAudioOut(hddChatter)`** — wrong. Use `fadeAudioTo()` only.
- **`setTimeout(() => hddChatter.play(), delay)`** — wrong. Start within user gesture context.
- **Removing `playHddAudio` from return object** — wrong. boot-scene.js depends on it.
