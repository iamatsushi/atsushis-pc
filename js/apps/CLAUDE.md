# js/apps/ — Mini-App Rules

## App Launch Delays (Texture Zone)

All mini-apps launch via `desktop.launchApp()`. Delay + optional failure is built in.
`resume_FINAL_v3.exe` is Protected Path: always 0ms, no failure, ever.

| App | Min | Max | Failure chance | Failure behavior |
|---|---|---|---|---|
| Winamp | 2000ms | 4000ms | 1-in-10 | "Not Responding" title for 1200ms, then normal |
| Calculator | 800ms | 1500ms | 1-in-15 | 80ms white flash flicker |
| Notepad | 600ms | 1200ms | 1-in-15 | 80ms white flash flicker |
| Minesweeper | 1500ms | 3000ms | 1-in-15 | 80ms white flash flicker |
| My Computer | 1000ms | 2200ms | none | — |
| Recycle Bin | 400ms | 800ms | none | — |
| resume_FINAL_v3.exe | 0ms | 0ms | none | Protected Path — instant always |

All values from `window.APC.timing.*`. Never hardcode.
During delay: `cursor: wait` on desktop. Taskbar button appears immediately.
On complete: `cursor: default` restored, window mounts, brought to front.

---

## Screensaver — Signal Drift (screensaver.js)

**Interface:** `window.APC.apps.screensaver = { start(onExit), stop() }`

Activates after `SCREENSAVER_IDLE_MS` (90s) of no input. Idle timer lives in `desktop.js`.
Boot guard: checks for `desktop--hidden` class before launching — suppresses during boot.

**Visual:**
- 30 nodes on `#000` canvas, radius 2px filled circles
- Color: `#00FF41` (terminal green — same as Matrix rain, intentional)
- Lines between nodes within 120px proximity; opacity proportional to inverse distance
- Trail: `rgba(0,0,0,0.15)` overdraw per frame — no hard `clearRect`

**Motion:**
```js
node.x = node.x0 + node.ampX * Math.sin(t * node.speedX + node.phaseX);
node.y = node.y0 + node.ampY * Math.cos(t * node.speedY + node.phaseY);
```
- Amplitude: 60–120px | Speed: 0.3–0.8 rad/s | Phase: random 0–2π
- Re-seeds `x0/y0` every 25–35s. Speed, phase, amplitude held constant across reseed.

**Exit:** First `keydown` or `mousedown`. Use `{ once: true }` + explicit `removeEventListener` in `stop()`.
`onExit` callback fires after teardown — `desktop.js` uses it to restart the idle timer.

---

## Recycle Bin (desktop.js)

Window: 380×260px, `background: #C0C0C0`, centered "Recycle Bin is empty."
Singleton: double-clicking when open focuses existing window, never opens a second.

Right-click context menu: Open | (separator) | Empty Recycle Bin

**Empty Recycle Bin easter egg:**
- Progress fills 0→100% over `RECYCLEBIN_EMPTY_MIN/MAX_MS` (2000–3000ms)
- Tick: `RECYCLEBIN_PROGRESS_STEP_MS` (50ms)
- Completion: "You have successfully deleted nothing. Have a great day."
- OK and Escape both dismiss. No failure state.

---

## System Properties (js/apps/system-properties.js)

**These decisions are final. Do not override without explicit written update to this file.**

**General tab hardware — IBM Aptiva SE7 only:**
- Manufacturer: `IBM`
- Processor: `Intel Pentium II Processor Intel MMX(TM) Technology`
- Speed/RAM: `450MHz, 128.0MB RAM`
- DO NOT show real Pi hardware (ARMv7, Samsung microSD, WiFi wlan0) on General tab.
- Performance tab may reference real Pi data as a technical easter egg.

**Tab count:** Exactly 4 — General | Device Manager | Hardware Profiles | Performance.
Do not add File System or Virtual Memory tabs until there is a specific feature or easter egg for them.
Retain "File System..." and "Virtual Memory..." as non-functional stubs on the Performance tab.

**Dialog width:** ~480px. The old ~400px figure is wrong and superseded.

**Titlebar:** Purple gradient (`#7A5ACD` → `#4B2E83`). Not the standard navy Win98 gradient.

**Device Manager PM easter egg:** Contains a `Product Management` node with 6 devices:
Backlog Manager Pro, Confidence.dll, Imposter Syndrome Controller, Sprint Velocity Controller,
Stakeholder Alignment Service, Story Point Estimator. Do not remove or rename these.

Fire `easteregg_trigger { easter_egg: 'system_properties_pm' }` on OK/Cancel after any PM device interaction.

---

## Start Menu (taskbar.js)

**Programs structure:** Programs ▶ → Accessories ▶ → Winamp, Calculator, Minesweeper, Notepad.
Do not place apps directly under Programs. That flat structure is deprecated.

**Accessories cascade hover discipline:**
Uses local `accOpenTimer`/`accCloseTimer`, NOT the global `openSubmenuEl` tracker.
Reason: the global `openSubmenu()` would close Programs when Accessories opens.
A `MutationObserver` on the Programs submenu detects loss of `--open` class and calls `closeAcc()`.
Do not refactor this to use the global tracker — the isolation is load-bearing.

**Shut Down modal — exactly three radio options:**
1. Shut down (default)
2. Restart
3. Log Off

Do not use "Restart in MS-DOS mode" — permanently discarded.

Log Off behavior: fire `{source: 'start_menu', option: 'log_off'}`, call `desktop.closeAll()`,
show "Thanks for visiting. Close the tab…" with OK. No session wipe, no reload.
taskbar.js already implements this correctly. Do not change it.

---

## Tray Balloons (widgets.js)

XP-style balloon tips — intentional anachronism. `border-radius: 6px` on `.tray-balloon`
is correct and intentional (XP chrome, not Win98 chrome).

Two types, alternating in strict sequence (never random):
- Low Disk Space ⚠️
- Security Risk 🛡️

**Timing tokens (all in win98-timing.js):**
- `TRAY_POPUP_MIN_MS`: 90000 — min interval between balloons
- `TRAY_POPUP_MAX_MS`: 300000 — max interval
- `TRAY_POPUP_DISPLAY_MS`: 10000 — display duration (single token, not a min/max pair)
- `TRAY_CLICK_MIN/MAX_MS`: 100–200 — click response delay

Note: `TRAY_POPUP_DISPLAY_MS` is a single token. The old two-token form
(`TRAY_POPUP_DISPLAY_MIN_MS` / `TRAY_POPUP_DISPLAY_MAX_MS`) is retired.

**Suppression:** `isBalloonVisible` flag prevents stacking. `protectedPathActive` flag
suppresses during Protected Path interactions (NetEscape loads, Guestbook, resume flow).

**Behind-taskbar glitch:** 1-in-20 renders. Z-index set below taskbar (998), self-corrects
after 400–600ms. Entry/exit animations still play — balloon may animate invisibly then pop up.

**Disk Cleanup branch (Low Disk Space body click):** Currently stubbed. Do not implement
until Disk Cleanup Feature Spec (document 24c49bfe) is provided to the session.
The stub comment in widgets.js must remain exactly as written — do not replace with a placeholder modal.

```js
// TODO: Disk Cleanup click path
// Spec: Disk Cleanup Feature Spec (document 24c49bfe)
// On body click: apply TRAY_CLICK_MIN/MAX_MS delay → isBalloonVisible = false → open Disk Cleanup modal
// Do not implement until spec is provided. Do not stub with a placeholder modal.
```
