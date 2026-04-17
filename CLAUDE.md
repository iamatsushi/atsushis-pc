# Atsushi's PC – AI Coding Rules & Standards ([CLAUDE.md](http://CLAUDE.md))

## Instructions for Claude Code

This file is your primary behavioral contract for the Atsushi's PC repository. Read it in full before starting any task.

**Rules:**

* Read this entire file before writing or editing any code.
* Never deviate from the rules in this document without explicitly asking first.
* Before starting any non-trivial task (more than \~10 lines of code changed), state your plan in plain English and wait for confirmation before proceeding.
* Never install a package, add a dependency, or introduce a build step. If you think one is needed, stop and ask.
* If a task requires changing an architectural pattern (file structure, namespace convention, routing logic), flag it and ask before making the change.
* When in doubt about visual fidelity (colors, fonts, spacing, layout), refer to the Design Language section of the PRD and ask rather than guess.
* Never modify assets/CREDITS.md, .env.example, or Caddyfile without being explicitly asked to.
* After completing a task, summarize what you changed and flag anything that may need manual QA (e.g., audio behavior, dial-up trigger logic, sessionStorage gates).

---

## Project Overview

Atsushi's PC is a browser-based Windows 98 desktop simulation, serving as a personal portfolio for a product management job search. The site is hosted on Raspberry Pi OS Lite, using Caddy as the server and cloudflare tunnel for secure remote routing. The project is an MVP/prototype-level solo build, targeting a 4-week completion. Its structure is strictly modular and assets-contained, prioritizing period-authentic visual and interaction fidelity. **No frameworks or package dependencies** are present.

### Repository Structure

Atsushis-pc uses a flat structure. All frontend files live at the repo root. The `config/` folder is strictly for server-side ops files — nothing frontend belongs there.

```
atsushis-pc/
├── CLAUDE.md
├── .gitignore
├── .env.example
├── index.html                  ← NetEscape Homepage
├── about.html                  ← NetEscape About Me
├── thoughts.html               ← NetEscape My Thoughts
├── projects.html               ← NetEscape Work/Projects
├── guestbook.html              ← NetEscape Guestbook
├── js/
│   ├── win98-timing.js             ← All timing tokens live here; never hardcode delays elsewhere
│   ├── boot.js
│   ├── desktop.js
│   ├── taskbar.js                  ← Start Menu (Programs, Documents, Shut Down modal)
│   ├── netescape.js                ← NetEscape browser window (renamed from ie.js)
│   ├── widgets.js
│   └── apps/
│       ├── winamp.js
│       ├── calculator.js
│       ├── screensaver.js          ← Signal Drift (pending — issue #2)
│       ├── notepad.js
│       └── minesweeper.js
├── pb_hooks/                   ← Pocketbase JS hooks (server-side, deployed to Pi)
├── css/
│   ├── win98.css
│   ├── ie-base.css
│   └── \[per-page stylesheets\]
├── assets/
│   ├── audio/
│   │   ├── dialup.mp3
│   │   └── startup.mp3
│   ├── gifs/
│   ├── fonts/
│   └── CREDITS.md
├── static-export/              ← Netlify/Vercel fallback
└── config/                     ← Server-side ops ONLY
    ├── Caddyfile
    ├── deploy.sh
    ├── backup-pocketbase.sh
    ├── check-caddy.sh
    ├── ram-server.py
    ├── pocketbase.service
    └── ram-server.service

```

**config/ rules:** This folder contains reference/documentation copies of server infrastructure files only. These are NOT the live running files. Live scripts run from `~/` (home directory). Cron jobs point to `~/backup-pocketbase.sh` and `~/check-caddy.sh`. Never treat `config/` files as the source of truth for server behavior — they are committed for documentation purposes only. Claude Code should never modify `config/` files unless explicitly asked.

---

## Tech Stack & Conventions

* **Framework**: None. Absolutely no usage of React, Vue, Svelte, or bundlers.
* **Language**: HTML5 + CSS3 + Vanilla JavaScript (ES6+); strictly no TypeScript.
* **Package Manager**: None in production. No `npm`, no `package.json`, no runtime package dependencies.
* **Database**: Pocketbase (SQLite, REST API, locally hosted on Pi)
* **Server**: Caddy (for HTTPS, TLS, static serving), Raspberry Pi OS Lite
* **Analytics**: Umami Cloud (event-based analytics; no Google Analytics)
* **CAPTCHA**: Altcha (proof-of-work, self-hosted on Pi)
* **Weather API**: OpenWeatherMap (fetches Portland, OR, degrees F); API key managed via Pi env
* **DNS/CDN/Tunnel**: Cloudflare Tunnel (WAF, geo-blocking at edge)
* **Version Control/Backup**: GitHub (private repo), daily cron backup of Pocketbase SQLite
* **Hosting**: Raspberry Pi + Cloudflare Tunnel as primary; Netlify/Vercel static export failover
* **Secrets Management**:
  * All keys set as env vars on Raspberry Pi
  * `.env` is never committed (always gitignored)
  * `.env.example` lists var names only
* **Assets**: All audio, GIFs, fonts, icons self-hosted. No external CDN calls in production.
  * Every asset must be registered in `assets/CREDITS.md`
* **Audio**: Audio files are always loaded from `assets/audio/`. No streaming or external fetches.

**Do not introduce**: npm dependencies, package managers, or production build steps, under any circumstances.

---

## Code Style Rules

### Naming Conventions

* **HTML Files**: kebab-case (eg. `about-me.html`)
* **JS Files**: kebab-case (eg. `boot-sequence.js`, `dial-up.js`)
* **CSS Files**: kebab-case (eg. `win98-chrome.css`, `ie-base.css`)
* **Directories**: kebab-case (eg. `apps/`, `audio/`, `gifs/`)
* **Functions/Variables**: camelCase (eg. `triggerDialUp()`, `initDesktop()`)
* **Constants**: SCREAMING_SNAKE_CASE (eg. `DIALUP_DURATION_MS`, `MATRIX_EMOJI_FREQUENCY`)
* **CSS Classes**: BEM-style kebab-case (eg. `.ie-window__toolbar`, `.win98-button--active`)

### Imports & Exports

* No ES module imports/exports in production.
* Use `<script>` tags, manually ordered for dependency safety.
* Shared globals must be namespaced: 

  ```js
  window.APC = window.APC || {};
  window.APC.dialUp = { trigger, dismiss };
  
```
* Never pollute the global scope outside `window.APC`.

### TypeScript

* Not used.
* All JavaScript must be explicit, readable, and safe.

### Formatting

* Indentation: 2 spaces, always.
* JS strings: single quotes preferred.
* Semicolons: Always used; enforce consistency.
* Max line length: 100 characters.
* Comments: Any non-obvious flows, especially:
  * Audio unlock (autoplay policy avoidance)
  * CSS emoji color filter hacks
  * Boot sequence steps/timings
* CSS:
  * Never use CSS variables for Win98 chrome/base colors.
  * Only use CSS custom properties (e.g., `--page-bg`) to theme *NetEscape page content* when per-page style is required.
  * Never introduce CSS resets or normalization that would break pixel-authentic Win98 style.

---

## Component & Architecture Patterns

### Component Structure

* No frameworks/components in the React/Vue sense.
* Each building block is a self-contained JS module:
  * Owns its root DOM, listeners, teardown logic.
  * Follows pattern: 

    ```js
    function createDialUpModal() {
      // setup...
      return { show, hide, destroy }
    }
    
```
* Apps live in `js/apps/`. Each classic app has its own JS module (`winamp.js`, `calculator.js`, etc.).
* Core shells:
  * `js/desktop.js`: Desktop/window management
  * `js/boot.js`: Handles Matrix → terminal prompt → loading bar → desktop fade-in
  * `js/netescape.js`: NetEscape browser window (routing, dial-up logic, navigation)
  * `js/widgets.js`: Taskbar widgets (weather, RAM, clock)
  * `js/win98-timing.js`: Centralised timing token file — all delay values live here, never hardcoded elsewhere

### Matrix Rain Spec

The Click to Start gate screen uses a canvas-based Matrix rain effect. All values below are exact — do not approximate or substitute.

**Character set (drawn in #00FF41, no filter):**

* Half-width katakana: ｦ ｧ ｨ ｩ ｪ ｫ ｬ ｭ ｮ ｯ ｰ ｱ ｲ ｳ ｴ ｵ ｶ ｷ ｸ ｹ ｺ ｻ ｼ ｽ ｾ ｿ ﾀ ﾁ ﾂ ﾃ ﾄ ﾅ ﾆ ﾇ ﾈ ﾉ ﾊ ﾋ ﾌ ﾍ ﾎ ﾏ ﾐ ﾑ ﾒ ﾓ ﾔ ﾕ ﾖ ﾗ ﾘ ﾙ ﾚ ﾛ ﾜ ﾝ
* ASCII uppercase: A–Z
* Digits: 0–9
* Symbols: @ # $ % \* + - = : < > / \\ |

**Emoji list (drawn with CSS filter applied, 1–5% frequency):**

🎾 ⛳ 🎣 🍜 🍕 🎮 ✈️ 🌍 🌱 💾 🖥️ 🔌 🛠️ 🎭 🧩 🧠 ⚙️ 🔍 ♟️ 🌉 📦 🧨 📊 🧭

**Emoji frequency:** Re-rolled per character draw call — random between 1% and 5%. Do not use a single fixed constant.

```js
const MATRIX_EMOJI_FREQUENCY_MIN = 0.01;
const MATRIX_EMOJI_FREQUENCY_MAX = 0.05;
// Per draw call:
const emojiThreshold = MATRIX_EMOJI_FREQUENCY_MIN +
  Math.random() * (MATRIX_EMOJI_FREQUENCY_MAX - MATRIX_EMOJI_FREQUENCY_MIN);
const isEmoji = Math.random() < emojiThreshold;
```

**Emoji CSS filter (apply to ctx.filter before drawing each emoji, reset to 'none' immediately after):**

```
ctx.filter = 'brightness(0) saturate(100%) invert(57%) sepia(99%) saturate(400%) hue-rotate(85deg) brightness(110%)';
// draw emoji
ctx.filter = 'none';
```

**Animation model — per-column typing reveal (not falling streams):**

Each column reveals characters one at a time, top to bottom, at a randomised typing pace. No smooth y-position drop. No 20fps throttle — use native `requestAnimationFrame`.

```js
// Column object shape:
{ x, currentRow, nextCharTime, charDelay }

// Character delay per column (randomised on init and reset):
// 40–180ms — programmer typing speed range
function randomCharDelay() { return 40 + Math.random() * 140; }

// After column fills to bottom: pause 800–2500ms before reset
```

Fade-to-black trail: draw `rgba(0,0,0,0.15)` overlay each frame (unchanged — naturally dims older characters).

**Rain color:** `#00FF41` — used exclusively for Matrix rain and the My Thoughts page. Never bleed into Win98 chrome.

**IBM Aptiva identity lines — appear during Matrix rain:**

At the 2-second mark of the rain (after it has established itself), two lines type in character by character at **40–60ms per character**, in `#00FF41`, same Courier New font, same size as rain. No highlight, no special treatment — must feel typed by the rain itself, not injected as a separate UI element.

```
> initializing experience on IBM Aptiva SE7
```
600ms pause, then:
```
> $3,299 in 1998. the fastest consumer PC money could buy.
```

Do not alter punctuation or capitalisation. Line 1 completes by the 3.5-second mark. After both lines render, a **1000ms pause**, then the standard prompt appears below:

**Terminal prompt text (exact):** `C:\> press any key to continue_` — blinking block cursor at end (\~530ms blink interval). This is the exact string. Do not paraphrase or substitute.

On any keypress or click: cut to black, begin boot sequence. The identity lines do not persist past this screen.

### Data Fetching

* All fetch calls must use vanilla `fetch()`.
  * No axios, no helpers, no polyfills.
* Weather:
  * Fetch from OpenWeatherMap every 10 mins via Caddy proxy (`/weather`)
  * Cache value in module memory; use `'--'` on failure.
* RAM:
  * Fetch every 30s from Pi local endpoint; same cache/fallback.
* Pocketbase Guestbook:
  * POST new entries to `/api/collections/guestbook/records`
  * GET all approved entries on page load; cache for 24h.
  * Errors always degrade to a fallback UI message; never leave the UI broken.
* NetEscape navigation is client-side routed via a URL-to-page-object map.
  * Known internal routes (`ahisaka.com/*`) navigate normally.
  * Unknown or external URLs trigger the **partial-load freeze flow**: status bar shows "Connecting…" → stub page renders (grey bar + broken image boxes) → freezes at ~2.5s → WinDoors 98 dialog: "Dial-up is too busy. Go to ahisaka.com?" → OK redirects to homepage.
  * Never navigate to a real external URL. Never show a real 404.
  * A future favourites allowlist will let specific classic sites bypass the freeze flow and load as museum pages.

### State Management

* No global or 3rd-party state libraries.
* State is module-local wherever possible.
* Boot state (booted/not): Store in `sessionStorage` as a flag.
* Audio state (unlocked): Boolean in `boot.js`.
* Z-index: Simple incrementing counter in `desktop.js`.
* Screensaver idle timer: Single timer in `desktop.js`, reset on user input.

---

## Win98 Behavioral Fidelity

### Machine Identity — IBM Aptiva SE7

This simulation is grounded in a real, specific machine. All timing, latency, and failure behavior derives from it. When validating a delay, ask: *"Would this be noticeable on an IBM Aptiva SE7 running WinDoors 98 on a 30 kbps connection?"*

| Property | Value |
| --- | --- |
| Model | IBM Aptiva SE7 (S Series) |
| CPU | Intel Pentium II, 450 MHz, 512 KB L2 cache |
| RAM | 128 MB SDRAM |
| Storage | 16.8 GB IBM Deskstar HDD, 5400 RPM |
| Modem | 56K V.90 — advertised 56 kbps, actual throughput ~30 kbps |
| Graphics | 4 MB SyncGraphics AGP |
| OS | WinDoors 98 (pre-installed) |
| Retail price | $3,299 (1998) ≈ $6,200 (2024) |

Modem reality: V.90 was limited by telephone infrastructure optimised for voice. Real throughput was 28–30 kbps (source: Wired, 1999). This is the speed used to calibrate all dial-up simulation timing.

### Branding

| Real name | Simulation name |
| --- | --- |
| Windows 98 | WinDoors 98 |
| Microsoft | Microblob |
| Internet Explorer | NetEscape |

`js/netescape.js` and `css/netescape-*.css` are the canonical names. Do not create new files using the `ie-` prefix. Existing `ie-*.css` files are pending rename to `netescape-*.css` (tracked separately — do not rename as part of unrelated PRs).

### Matrix Gate Screen — Load Immediately

The Matrix rain gate screen is exempt from all behavioral fidelity timing rules. It must render as fast as the browser allows — no artificial delay, no loading state, no spinner before the canvas starts. It is the first thing the visitor sees and must be instant.

The timing values within the Matrix sequence (2s mark for identity lines, 40–60ms character cadence, 1000ms pause before prompt) are part of the animation choreography, not latency simulation. They are fixed creative timing, not IBMAptiva dial-up modeling.

The behavioral fidelity timing rules below apply only after the visitor clicks through the gate and the boot sequence begins.

### Protected Path vs Texture Zone

Every feature must be classified as Protected or Texture before timing or failures are assigned.

**Protected Path** — recruiter-facing workflows:
* Max delay: 1 second
* No failures, no error states
* Always show visible progress feedback (status bar, progress indicator)
* Surfaces: all NetEscape page loads, Guestbook submission, `resume_FINAL_v3.exe` flow

**Texture Zone** — ambient/system UI:
* Max delay: 6 seconds
* Minor, recoverable failures permitted — never block or degrade Protected Path
* Always show UI feedback during delays > 300ms (hourglass cursor, status bar)
* Surfaces: desktop app launches, Start Menu, File Explorer / My Computer, System Tray

### Timing System

All timing values live in `js/win98-timing.js`. **Never hardcode delay values anywhere else.**

* All delays are variable — use randomised ranges, never fixed values
* Compound actions (e.g. dial-up + page load) sum their delays with distinct feedback at each stage
* Hourglass cursor (`cursor: wait`) appears within 50ms of any delay > 300ms; reverts on completion

### Component Timing Reference

#### NetEscape Browser (Protected Path)

| Action | Delay |
| --- | --- |
| Initial page load after dial-up | 300–900ms; progressive status bar fill |
| In-session link navigation | 150–500ms |
| Manual URL entry | Dial-up simulation 1000–4000ms + initial load delay |
| Back / Forward | 100–400ms |

Status bar sequence: `""` → `"Opening page [url]..."` → `"Transferring data from [url]..."` → `"Done"`

#### Start Menu (Texture Zone)

| Action | Delay |
| --- | --- |
| Open | 80–180ms |
| Submenu expand (mouse hover) | 200–400ms |
| Submenu expand (keyboard Right) | Immediate — no delay |
| Submenu close (after mouse leaves) | 300ms — cancelled on mouse re-entry |
| Item → action | 100–250ms |

Failure: 1-in-12 chance menu flickers closed on open (requires second click).

**Menu items:** Programs ► | Documents ► | Settings (disabled) | Find (disabled) | Help | Run… | — | Shut Down…

**Programs submenu:** Winamp, Minesweeper, Calculator, Notepad — dispatches to `desktop.launchApp()`.

**Documents submenu:** Populated just-in-time from `sessionStorage['ne_history']` (up to 10 recent NetEscape URLs). `netescape.js` writes to this key at the end of `renderPage()`.

**Shut Down modal — three radio options:**
1. **Shut Down** — shows a non-dismissable black "It is now safe to turn off your computer." overlay.
2. **Restart the computer** — fires Umami `shutdown_trigger`, 100ms tick, then `sessionStorage.clear()` + `boot.restart()` (soft restart, no page reload).
3. **Close all programs and log off as Atsushi** — closes all open windows via `desktop.closeAll()`, then shows: `"Thanks for visiting. Close the tab whenever you're ready."` ← **intentional deviation from the original "Restart in MS-DOS mode" spec slot.** Log Off was chosen because it provides a genuine recruiter-facing goodbye moment. Do not revert to MS-DOS mode.

**`beforeunload` Umami event:** Registered as best-effort via `navigator.sendBeacon()`. Umami CDN does not expose a sendBeacon API, so this is currently a documented no-op. **QA note: mark as "expected to be unreliable / not tracked" — do not treat missing beforeunload events as a bug.**

#### Desktop App Launches (Texture Zone)

| App | Launch delay | Failure |
| --- | --- | --- |
| Winamp | 2000–4000ms | 1-in-10: "Not Responding" (1200ms) |
| Calculator | 800–1500ms | 1-in-15: window flicker (80ms white flash) |
| Notepad | 600–1200ms | 1-in-15: window flicker |
| Minesweeper | 1500–3000ms | 1-in-15: window flicker |
| My Computer | 1000–2200ms | None |
| Recycle Bin | 400–800ms | None |
| resume_FINAL_v3.exe | 0ms (instant) | None — Protected Path; Access Denied dialog always fires immediately |

#### File Explorer / My Computer (Texture Zone)

| Action | Delay |
| --- | --- |
| Open folder | 800–1800ms |
| Expand subfolder | 400–900ms |
| Icon render | 50–150ms per icon, sequential |
| Access drive root | 1200–2500ms |

Failure: 1-in-8 chance of extra 2000–3000ms delay before folder shows. Never delays `resume_FINAL_v3.exe` access.

#### System Tray & Taskbar (Texture Zone)

| Element | Behavior |
| --- | --- |
| Clock | Updates every 60s + random 0–2000ms offset |
| Weather widget | 1500–3000ms to load; shows `'--°F'` while loading |
| RAM widget | Updates every 30s; 200–400ms render delay |
| Tray pop-ups | Appear every 90–300s (random); display for 4–6s. Copy: "Your computer may be at risk", "Low disk space on C:" |
| Tray icon click | 100–200ms |

### System Properties Dialog

Access: Right-click My Computer → Properties. Also Start Menu → Settings → Control Panel → System.

**General tab — exact field values:**

* OS name: `Microblob WinDoors 98`
* Version: `4.10.1998`
* Copyright: `© Copyright Microblob Corp 1981-1998.`
* Registered to: `Atsushi Hisaka` / org blank / Product ID: `24796-OEM-0014736-00000`
* Computer line 1: `IBM`
* Computer line 2: `Intel Pentium II Processor Intel MMX(TM) Technology`
* Computer line 3: `450MHz, 128.0MB RAM`

**About This Machine** (recessed sunken inset box at bottom of General tab, `#808080` border, bold header):

```
IBM Aptiva SE7 — Retail price: $3,299 (1998)
Equivalent to approximately $6,200 in 2024.
This was the fastest consumer PC money could buy.
56K modem advertised at 56 kbps. Actual speed: ~30 kbps.
You are browsing the internet exactly as fast as the best hardware of 1998 allowed.
```

**Chrome:** Purple gradient titlebar (`#7A5ACD` to `#4B2E83`). Title: `System Properties`. Not resizable. Width ~400px. Tabs: General | Device Manager | Hardware Profiles | Performance. Default: General.

**Other tabs:** Visual stubs. Device Manager shows standard hardware tree with IBM Aptiva SE7-accurate entries. Performance tab: "Your system is configured for optimal performance."

**Close:** OK/Cancel at bottom. OK closes with 200–400ms delay (Texture Zone).

---

## Do's and Don'ts

### Do

* DO namespace all JS globals under `window.APC` to prevent collisions.
* DO unlock audio *only* after explicit user gesture on "Click to Start."
* DO play `dialup.mp3` using a single preloaded `Audio` object.
* DO use terminal green `#00FF41` for Matrix rain and My Thoughts page only.
* DO apply the exact required CSS emoji green filter:  

  `filter: brightness(0) saturate(100%) invert(57%) sepia(99%) saturate(400%) hue-rotate(85deg) brightness(110%);`
* DO use `MS Sans Serif` (with `Tahoma` fallback) for Win98 UI chrome.
* DO use `Verdana` for NetEscape Homepage, About, and Guestbook; `Courier New` for My Thoughts; `Tahoma` for Work/Projects and Resume.
* DO treat `resume_FINAL_v3.exe` as a lead capture flow — not a file download. Double-clicking shows a WinDoors 98 desktop dialog → triggers dial-up if not connected → opens NetEscape → spinning logo pause → guestbook page loads with "I'd like a copy of your resume" pre-checked. No `resume.html` page exists; the guestbook IS the resume request mechanism.
* DO always sanitize and escape user-submitted guestbook content before rendering.
* DO keep all secrets in Pi environment variables.
* DO document every asset in `assets/CREDITS.md` before use.
* DO fire all specified Umami Cloud events, with correct parameters.
* DO gracefully degrade all widgets to `'--'` or last value on API failure.
* DO uphold WCAG 2.1 AA accessibility:
  * Alt text on every image/GIF
  * ARIA labeling of interactive elements
  * Focus trap for modals
  * Keyboard navigation for draggable windows

### Don't

* DON'T introduce any npm packages, production build steps, or dependency management.
* DON'T use border-radius for Win98 chrome (sharp edges only).
* DON'T use web fonts; never import from a CDN (Google Fonts, etc.).
* DON'T use inline styles for color/layout—keep *all* styles in CSS files.
* DON'T perform any external CDN calls in production at runtime.
* DON'T expose any Pocketbase admin URLs, `/api/admins`, or `/_/` paths—block in Caddy.
* DON'T hardcode API keys, credentials, or access tokens in any file.
* DON'T use `useEffect` (not applicable) or `setInterval` for fetches—manual cache+fetch only.
* DON'T render raw, unsanitized guestbook data in the DOM.
* DON'T trigger dial-up on every NetEscape navigation event—run *only* on first NetEscape launch, manual URL entry, or `resume_FINAL_v3.exe` flow (when not already connected).
* DON'T allow the NetEscape address bar to navigate to external URLs — all non-allowlisted input triggers the partial-load freeze flow.
* DON'T serve Rick Astley’s song/video from the Pi—link to official YouTube only.
* DON'T add more than 2 GIFs per page (max 4 on About Me).
* DON'T use modern CSS (gap, grid, animations) for Win98 chrome—use tables/absolutes.
* DON'T ever commit `.env`—only `.env.example` is versioned.

---

## Testing & Quality

### Testing Framework

* No automated/unit test framework (e.g., no Vitest, Jest, or Playwright).
* **Manual + accessibility tooling only**.

### What to Test Manually

Before each milestone:

* Boot sequence full playthrough; **no console errors** on Chrome/Firefox desktop.
* Matrix rain emoji appear in `#00FF41` green with correct filter.
* Dial-up audio triggers *only* on first NetEscape launch/manual URL; never repeats in-session.
* `resume_FINAL_v3.exe` double-click flow works end-to-end: dialog → dial-up (if not connected) → NetEscape opens → spinning logo → guestbook loads with resume checkbox pre-checked.
* Guestbook POST works, Altcha resolves, and "success" message is shown.
* Guestbook entries render safely (no XSS/HTML inject).
* All 5 mini-apps open and close without errors.
* Screensaver triggers on idle; exits on any input.
* Shutdown animation appears as user leaves site.
* Weather widget and RAM widget degrade gracefully—never crash on API failure.
* Cloudflare WAF geo-block: VPN test from a blocked country returns proper 403.
* **Quality gates** before launch:
  * Accessibility: WAVE and axe run, **zero critical errors required**
  * No console errors in browser devtools (Chrome, Firefox)
  * Desktop browsers: Chrome, Firefox, Safari covered
  * Mobile/tablet (width < 1024px or touch device) shows "WinDoors 98" interstitial — hard gate, no dismiss path, boot sequence never initialises
  * Lighthouse initial load <2s
  * All Umami Cloud events fire and log as expected

---

## Common Pitfalls

* **Pitfall**: Adding `border-radius` to Win98 chrome  

  **Correct**: All chrome corners are sharp. Set `border-radius: 0` if needed.
* **Pitfall**: Dial-up runs on every NetEscape navigation
  **Correct**: Dial-up *only* on (1) first NetEscape session and (2) manual URL entry. Track `hasDialedUp` boolean in `netescape.js`.
* **Pitfall**: Rendering guestbook entries with unsanitized HTML  

  **Correct**: Always set text with `textContent`; validate URLs before rendering `<a>`.
* **Pitfall**: Storing OpenWeatherMap API keys in client JS  

  **Correct**: API key *must* only live in Pi env. All fetches proxied or secured.
* **Pitfall**: Building a resume page or gating resume.html behind a sessionStorage flag
  **Correct**: There is no resume.html. The `resume_FINAL_v3.exe` icon triggers a dial-up lead capture flow that lands on the guestbook. Atsushi follows up personally via email.
* **Pitfall**: Audio played before user gesture (blocked as "autoplay" in browsers)  

  **Correct**: Create Audio on init, but call `.play()` ONLY after the gate UX interaction.
* **Pitfall**: Using Flexbox, Grid, or modern CSS in legacy UI chrome  

  **Correct**: Stick to tables, absolutes, floats for WinDoors 98 shell. Modern CSS allowed only in NetEscape page content layouts.
* **Pitfall**: Fetching Pocketbase guestbook entries every time the guestbook page loads  

  **Correct**: Fetch and cache results once, refetch *only* after 24h (track timestamp in `sessionStorage`).
* **Pitfall**: Using external font/icon libraries  

  **Correct**: Only use system fonts (as described above) and self-hosted icons/Unicode.
* **Pitfall**: Boot sequence repeats on refresh/new tab
  **Correct**: On load, check `sessionStorage` for `boot_complete`, skip boot sequence if true.
* **Pitfall**: Hardcoding a delay value (e.g. `setTimeout(fn, 800)`) anywhere in the codebase
  **Correct**: All delay values live in `js/win98-timing.js`. Import the token. Never hardcode.
* **Pitfall**: Creating a new file with the `ie-` prefix (e.g. `ie-newfeature.css`)
  **Correct**: The `ie-` prefix is deprecated. Use `netescape-` for new NetEscape browser files. Existing `ie-*.css` files are pending rename.
* **Pitfall**: Classifying a new feature as Texture Zone when it touches a recruiter workflow
  **Correct**: Any path that leads to the Guestbook, resume flow, or NetEscape page loads is Protected Path — max 1 second delay, no failures.

---

## Infrastructure Reference

This section documents the live server environment. Use it when writing code that touches file paths, API endpoints, ports, service names, environment variables, or deployment scripts. Do not guess paths or ports—use what is defined here.

### Hardware

* **Device**: Raspberry Pi 3B+
* **CPU**: 4 cores @ 1.4GHz (armv7l, 32-bit ARM)
* **RAM**: 1 GB
* **Networking**: WiFi (wlan0)
* **Local IP**: 192.168.68.54 (statically assigned)
* **MAC (wlan0)**: b8:27:eb:81:45:59

### SSH Access

* **Host alias**: `ssh atsushispc` (configured in `~/.ssh/config` on Mac)
* **Manual**: `ssh atsushi@192.168.68.54 -p 2222`
* **Username**: atsushi
* **Port**: 2222
* **Auth**: SSH key only (password auth disabled)
* **Pocketbase admin tunnel**: `ssh -L 8090:127.0.0.1:8090 atsushispc` → `http://localhost:8090/_/`

### Domain & DNS

* **Domain**: ahisaka.com
* **DNS**: Managed by Cloudflare (nameservers already set—do not modify)
* [**www.ahisaka.com**](http://www.ahisaka.com): Routes via Cloudflare Tunnel to Pi
* **Do not delete**: MX records (5 × eforward registrar-servers) and SPF TXT record

### Cloudflare

* **Account**: [atsushih@gmail.com](mailto:atsushih@gmail.com)
* **Tunnel name**: atsushispc
* **Tunnel ID**: 56401fb3-690d-427b-8a50-8382f69fe283
* **Tunnel config on Pi**: `/etc/cloudflared/config.yml`
* **Tunnel credentials on Pi**: `/etc/cloudflared/56401fb3-690d-427b-8a50-8382f69fe283.json`
* **Systemd service**: `cloudflared` (enabled, autostarts)
* **SSL/TLS mode**: Full
* **URL Normalization**: DISABLED
* **Always Use HTTPS**: OFF
* **WAF rule**: Block `(ip.geoip.country in {'RU' 'IR' 'NG' 'KP' 'BY' 'CN'})` → Action: Block
* **Bot protection**: AI Labyrinth enabled
* **Redirect rules**: None active (www redirect was deleted—caused redirect loops; do not recreate)

### Web Server – Caddy

* **Version**: 2.6.2
* **Config file**: `/etc/caddy/Caddyfile` (live file on Pi — reference copy committed to repo at `config/Caddyfile`; if you edit `config/Caddyfile` in the repo, remind the user to manually copy it to `/etc/caddy/Caddyfile` on the Pi and reload Caddy)
* **Site root**: `/home/atsushi/site` (repo root maps directly—HTML files served from root, no subdirectory)
* **Systemd service**: `caddy` (enabled, autostarts)
* **Listening port**: `:80` (Cloudflare terminates HTTPS at edge—do not configure TLS in Caddy)
* **Proxy routes**:  

  `/api/*` → 127.0.0.1:8090 (Pocketbase)  

  `/altcha/*` → 127.0.0.1:8093 (Altcha challenge server)

  `/ram` → 127.0.0.1:8091 (RAM server)  

  `/weather` → 127.0.0.1:8092 (OpenWeatherMap proxy)
* **Blocked routes**: `/_/*` and `/api/admins/*` → 403 Forbidden
* **Weather proxy**: A lightweight server-side script on the Pi listens on port 8092, reads `OPENWEATHERMAP_API_KEY` from the environment, and forwards requests to OpenWeatherMap. Client-side JS calls `/weather`—never the OpenWeatherMap API directly.
* **HSTS**: Do not set in Caddy—Cloudflare handles it at the edge
* **Auto-restart**: `~/check-caddy.sh` runs every 5 min via cron
* **Health log**: `/var/log/caddy-health.log`
* **Sudo rules**: `/etc/sudoers.d/caddy-reload`, `/etc/sudoers.d/caddy-restart`

### Guestbook Backend – Pocketbase

* **Version**: 0.28.2 (linux_armv7)
* **Binary**: `/home/atsushi/pocketbase/pocketbase`
* **Data directory**: `/home/atsushi/pocketbase/pb_data/` (gitignored, backed up daily)
* **Systemd service**: `pocketbase` (enabled, autostarts)
* **Port**: `127.0.0.1:8090` (localhost only—never exposed to public internet)
* **Admin UI**: SSH tunnel only → `http://localhost:8090/_/`
* **Admin email**: [atsushih@gmail.com](mailto:atsushih@gmail.com)
* **Guestbook collection name**: `guestbook`
* **Collection fields**: `name` (required), `email` (required), `website` (optional), `message` (required), `approved` (bool, default: false)
* **API rules**: Create = open (empty rule); all other operations locked
* **Health check**: `curl http://127.0.0.1:8090/api/health`
* **POST endpoint**: `/api/collections/guestbook/records`
* **GET approved entries**: `GET /api/collections/guestbook/records?filter=(approved=true)`

### CAPTCHA – Altcha

* **Implementation**: Browser-side proof-of-work widget + self-hosted challenge server on Pi
* **Challenge server**: `~/altcha-server.py` — listens on `127.0.0.1:8093`, generates HMAC-signed challenges using `ALTCHA_HMAC_SECRET`. Live and enabled via systemd (`altcha-server` service).
* **Caddy route**: `/altcha/*` → `127.0.0.1:8093`
* **Server-side verification**: Pocketbase `pb_hooks/guestbook_verify.pb.js` — pending (issue #8). Until deployed, the client solves proof-of-work but Pocketbase does not verify the submitted payload.
* **HMAC secret env var**: `ALTCHA_HMAC_SECRET`
* **Note**: The `~/altcha` directory on the Pi is unused and can be ignored — the live server is `~/altcha-server.py`

### Analytics – Umami Cloud

* **Service**: Umami Cloud
* **Website**: ahisaka.com
* **Website ID**: `d26f2f30-ead0-4092-b7c5-99afac8eda72`
* **Tracking script** (place in `<head>` of every HTML page): 

  ```html
  <script defer src="https://cloud.umami.is/script.js" data-website-id="d26f2f30-ead0-4092-b7c5-99afac8eda72"></script>
  
```
* **Required custom events**: `click_to_start`, `boot_complete`, `netescape_homepage_load`, `app_open` (with `app_name` param), `guestbook_submit` (with `success`/`failure` param), `resume_click`, `easteregg_trigger`, `dialup_trigger`, `dialup_url_entry`
* **Dashboard**: app.umami.is

### Weather API – OpenWeatherMap

* **Account**: [atsushih@gmail.com](mailto:atsushih@gmail.com)
* **API key env var**: `OPENWEATHERMAP_API_KEY`
* **Portland coordinates**: lat=45.5051, lon=-122.6750
* **API endpoint**: `https://api.openweathermap.org/data/2.5/weather?lat=45.5051&lon=-122.6750&units=imperial&appid=[KEY]`
* **Activation delay**: New API keys take up to 2 hours to activate
* **Key rotation**: Every 90 days
* **Important**: The API key must be proxied through a Caddy endpoint or server-side script — never exposed in client-side JS

### RAM Endpoint

* **Script**: `~/ram-server.py` (Python 3 HTTP server)
* **Port**: `127.0.0.1:8091`
* **Systemd service**: `ram-server` (enabled, autostarts)
* **Caddy route**: `/ram` reverse proxies to `127.0.0.1:8091`
* **Response format**: JSON with `total`, `available`, `used` memory values in kB
* **Test**: `curl http://127.0.0.1:8091/ram`
* **Usage**: Supplies RAM data to the Win98 taskbar widget in `js/widgets.js`

### GitHub

* **Account**: github.com/iamatsushi
* **Main repo**: `iamatsushi/atsushis-pc`
* **Backup repo**: `iamatsushi/atsushis-pc-backup` (private)
* **Pi SSH keys**:
  * `~/.ssh/id_ed25519` — read-only deploy key for main repo (Host alias: `github-site`)
  * `~/.ssh/id_ed25519_backup` — write access key for backup repo (Host alias: `github-backup`)
* **Git remote URLs**:
  * Site: `git@github-site:iamatsushi/atsushis-pc.git`
  * Backup: `git@github-backup:iamatsushi/atsushis-pc-backup.git`
* **GitHub PAT env var**: `GITHUB_PAT` (write-only scope to backup repo)
* **PAT rotation**: Every 90 days

### Automated Scripts & Cron

**Important**: Live scripts run from `~/` (Pi home directory), not from the repo. Files in `config/` are reference copies for documentation only. Cron jobs point to `~/backup-pocketbase.sh` and `~/check-caddy.sh`. If you update a script in `config/`, remind the user to manually sync the change to `~/`.

* **Deploy script**: `~/deploy.sh` (live) — reference copy at `config/deploy.sh` — pulls latest code, reloads Caddy, logs to `/var/log/deploy.log`
* **Backup script**: `~/backup-pocketbase.sh` (live) — reference copy at `config/backup-pocketbase.sh` — copies Pocketbase SQLite to `~/backups/`, commits and pushes to backup repo, prunes local backups older than 30 days, logs to `/var/log/pb-backup.log`
* **Health script**: `~/check-caddy.sh` (live) — reference copy at `config/check-caddy.sh` — checks if Caddy is running, restarts if down, logs to `/var/log/caddy-health.log`
* **Cron schedule**:  

  `0 2 * * * ~/backup-pocketbase.sh`  

  `*/5 * * * * ~/check-caddy.sh`
* **RAM server**: `~/ram-server.py` (live) — reference copy at `config/ram-server.py` — managed by systemd only (not cron)

### Environment Variables

* **Secrets file on Pi**: `/home/atsushi/.env` (chmod 600 — owner read/write only, never committed)
* **Template in repo**: `/home/atsushi/site/.env.example` (variable names only, safe to commit)
* **Variables**:
  * `ALTCHA_HMAC_SECRET`
  * `OPENWEATHERMAP_API_KEY`
  * `CF_TUNNEL_TOKEN`
  * `GITHUB_PAT`
* **.gitignore** includes: `.env`, `pb_data/`, `*.db`
* **Rule**: Never hardcode any of these values in JS, HTML, or any committed file

### Filesystem Map

| Path | Purpose |
| --- | --- |
| /home/atsushi/site/ | Main site repo (served by Caddy) |
| /home/atsushi/site/.env.example | Env var template (safe to commit) |
| /home/atsushi/pocketbase/pocketbase | Pocketbase binary |
| /home/atsushi/pocketbase/pb_data/ | Pocketbase data (gitignored, backed up daily) |
| /home/atsushi/pocketbase/pb_hooks/ | Pocketbase JS hooks — deploy from repo `pb_hooks/` |
| /home/atsushi/backups/ | Pocketbase DB staging (30-day retention) |
| /home/atsushi/backup-repo/ | Clone of backup GitHub repo |
| \~/deploy.sh | Live deploy script (reference copy: config/deploy.sh) |
| \~/backup-pocketbase.sh | Live backup script (reference copy: config/backup-pocketbase.sh) |
| \~/check-caddy.sh | Live Caddy health script (reference copy: config/check-caddy.sh) |
| \~/ram-server.py | Live RAM endpoint server (reference copy: config/ram-server.py) |
| /home/atsushi/.env | Secrets file (chmod 600, gitignored) |
| /home/atsushi/.ssh/ | SSH keys and config |
| /etc/caddy/Caddyfile | Live Caddy config (reference in repo: config/Caddyfile) |
| /etc/cloudflared/config.yml | Cloudflare Tunnel config |
| /etc/cloudflared/56401fb3-...json | Cloudflare Tunnel credentials |
| /etc/systemd/system/pocketbase.service | Pocketbase systemd unit (reference: config/pocketbase.service) |
| /etc/systemd/system/ram-server.service | RAM server systemd unit (reference: config/ram-server.service) |
| /var/log/deploy.log | Deploy script log |
| /var/log/pb-backup.log | Pocketbase backup log |
| /var/log/caddy-health.log | Caddy health check log |

### Systemd Services

| Service | Binary/Script | Port | Status |
| --- | --- | --- | --- |
| caddy | /usr/bin/caddy | 80 | enabled |
| pocketbase | /home/atsushi/pocketbase/pocketbase | 8090 (localhost) | enabled |
| ram-server | \~/ram-server.py | 8091 (localhost) | enabled |
| altcha-server | ~/altcha-server.py | 8093 (localhost) | enabled |
| cloudflared | /usr/bin/cloudflared | outbound tunnel | enabled |

Status check: `sudo systemctl status caddy pocketbase ram-server cloudflared`

---

*End of AI Coding Rules & Standards.*
