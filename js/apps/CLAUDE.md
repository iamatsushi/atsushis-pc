# js/apps/ — Mini-App Rules

## App Launch Delays (Texture Zone)

All mini-apps launch via `desktop.launchApp()`. Delay + optional failure is built in.
`resume_FINAL_v3.exe` and `diskcleanup` are Protected Path: always 0ms, no failure, ever.

| App | Min | Max | Failure chance | Failure behavior |
|---|---|---|---|---|
| Winamp | 2000ms | 4000ms | 1-in-10 | "Not Responding" title for 1200ms, then normal |
| Calculator | 800ms | 1500ms | 1-in-15 | 80ms white flash flicker |
| Notepad | 600ms | 1200ms | 1-in-15 | 80ms white flash flicker |
| Minesweeper | 1500ms | 3000ms | 1-in-15 | 80ms white flash flicker |
| My Computer | 1000ms | 2200ms | none | — |
| Recycle Bin | 400ms | 800ms | none | — |
| Disk Cleanup | 0ms | 0ms | none | Protected Path — instant always |
| resume_FINAL_v3.exe | 0ms | 0ms | none | Protected Path — instant always |

All values from `window.APC.timing.*`. Never hardcode.
During delay: `cursor: wait` on desktop. Taskbar button appears immediately.
On complete: `cursor: default` restored, window mounts, brought to front.

---

## Disk Cleanup (js/apps/diskcleanup.js)

**Interface:** `window.APC.apps.diskcleanup = { open() }`

**Protected Path — launch is instant, no delay, no failure.**
Simulated latency is internal to the app only (scan phase + cleanup phase).

**Two-phase UI:**

Phase 1 — Scan (`DISK_CLEANUP_SCAN_MS`: 3000ms):
- Progress bar fills 0→60%
- Status label cycles: "Checking Temporary Internet Files…", "Analyzing Recycle Bin…", "Checking Temporary Files…", "Scanning Downloaded Program Files…", "Analyzing Old Windows Files…"
- Sparse file ticker fires every `DISK_CLEANUP_TICKER_INTERVAL_MS` (400ms) — aesthetic only, not continuous

Phase 2 — Cleanup (`DISK_CLEANUP_CLEAN_MS`: 2500ms):
- Progress bar fills 60→100% via setInterval at 50ms steps
- Status label: "Cleaning up files…"
- File ticker clears

**Completion state:**
- Freed space: randomized float, range 8.0–24.0 MB, one decimal precision
- Distribution: 65% in 10.0–16.0 MB, 20% in 8.0–10.0 MB, 15% in 16.0–24.0 MB
- Format: "12.4 MB of disk space freed."
- OK button appears and receives focus

**On OK:** fires `window.dispatchEvent(new CustomEvent('diskcleanup:complete'))`
Consumed by `widgets.js` — sets `diskCleanupDone = true`, suppresses Low Disk Space balloon for session.

**Singleton:** second `open()` call focuses existing window, never opens a second.

**Timing tokens (win98-timing.js):**
- `DISK_CLEANUP_SCAN_MS`: 3000
- `DISK_CLEANUP_CLEAN_MS`: 2500
- `DISK_CLEANUP_TICKER_INTERVAL_MS`: 400

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
- node.x = node.x0 + node.ampX * Math.sin(t * node.speedX + node.phaseX)
- node.y = node.y0 + node.ampY * Math.cos(t * node.speedY + node.phaseY)
- Amplitude: 60–120px | Speed: 0.3–0.8 rad/s | Phase: random 0–2pi
- Re-seeds x0/y0 every 25–35s. Speed, phase, amplitude held constant across reseed.

**Exit:** First `keydown` or `mousedown`. Use `{ once: true }` + explicit `removeEventListener` in `stop()`.
`onExit` callback fires after teardown — `desktop.js` uses it to restart the idle timer.

---

## Recycle Bin (desktop.js)

Window: 380x260px, `background: #C0C0C0`, centered "Recycle Bin is empty."
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

**Programs structure:** Programs ▶ → Accessories ▶ → Winamp, Calculator, Minesweeper, Notepad, Disk Cleanup.
Do not place apps directly under Programs. That flat structure is deprecated.

**FUNDAMENTAL UI REQUIREMENT — Cascade submenu top-edge alignment:**
All cascade submenus must have their top edge flush with the triggering item top edge.
Each nesting level accumulates ~4px of vertical drift from parent border + padding.
This is corrected in win98.css with negative top offsets:
- `.start-menu__submenu`: `top: -4px` (top-level submenu, compensates for menu container offset)
- `.start-menu__submenu-item--has-submenu > .start-menu__submenu`: `top: -4px` (cascade level)
Without these offsets, users cannot navigate horizontally between cascade levels —
the mouse falls into the gap between menus and triggers premature close.
DO NOT remove or "fix" these negative offsets. They are load-bearing.

**Accessories cascade hover discipline:**
Uses local `accOpenTimer`/`accCloseTimer`, NOT the global `openSubmenuEl` tracker.
Reason: the global `openSubmenu()` would close Programs when Accessories opens.
A `MutationObserver` on the Programs submenu detects loss of `--open` class and calls `closeAcc()`.
On `accSub.mouseenter`, BOTH `accCloseTimer` AND `cancelSubmenuClose('programs')` must be called —
without cancelling the Programs-level close timer, mousing into accSub closes the whole stack.
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
- Low Disk Space
- Security Risk

**Timing tokens (all in win98-timing.js):**
- `TRAY_POPUP_MIN_MS`: 90000 — min interval between balloons
- `TRAY_POPUP_MAX_MS`: 300000 — max interval
- `TRAY_POPUP_DISPLAY_MS`: 10000 — display duration (single token, not a min/max pair)
- `TRAY_CLICK_MIN/MAX_MS`: 100–200 — click response delay
- `TRAY_DISK_REAPPEAR_MS`: 120000 — ms before Low Disk Space re-shows after dismiss

Note: `TRAY_POPUP_DISPLAY_MS` is a single token. The old two-token form
(`TRAY_POPUP_DISPLAY_MIN_MS` / `TRAY_POPUP_DISPLAY_MAX_MS`) is retired.

**Suppression:** `isBalloonVisible` flag prevents stacking. `protectedPathActive` flag
suppresses during Protected Path interactions (NetEscape loads, Guestbook, resume flow).

**Behind-taskbar glitch:** 1-in-20 renders. Z-index set below taskbar (998), self-corrects
after 400–600ms. Entry/exit animations still play — balloon may animate invisibly then pop up.

**Low Disk Space balloon behavior (IMPLEMENTED):**
- Does NOT auto-dismiss like other balloons — persists until resolved
- X dismiss: schedules reappearance after `TRAY_DISK_REAPPEAR_MS` (2 min) via `scheduleLowDiskReappear()`
- Body click: `TRAY_CLICK_MIN/MAX_MS` delay → `isBalloonVisible = false` → opens `window.APC.apps.diskcleanup.open()`
- `diskcleanup:complete` event: sets `diskCleanupDone = true` — suppresses Low Disk Space permanently for session
- `diskCleanupDone` resets to `false` on `reset()` (new session)
