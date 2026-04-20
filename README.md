# Atsushi's PC
**ahisaka.com**

This is my portfolio site. It's designed to memorialize a forgotten computer experience — limited compute, dialing up for internet, 32MB of RAM doing its best. It is not a WordPress theme, a React app wrapped in a template, or a tasteless AI-generated server waste.

The machine being simulated is specific: an IBM Aptiva SE7. Pentium II. The beige tower your neighbor had in 1998. That specificity is the point. Every delay, every freeze, every timeout is that machine's reality rendered faithfully in a browser. The waiting is not a bug. The waiting is the feature.

---

## What's in here

**A boot sequence.** Matrix rain in `#00FF41` — full-width katakana, ASCII, and the occasional emoji column, because the internet absorbed everything eventually. Characters fall in fixed streams with variable-length trails: near-white head fading through green to black. 70% of glyphs are horizontally mirrored per the Rezmason reference. A terminal prompt blinks. You click. Windows 98 loads.

**A desktop.** Teal wallpaper. Beveled chrome. A taskbar with a working clock, live Portland weather, and a RAM gauge pulling from the actual Raspberry Pi running the site. Draggable windows. A Start Menu with a cascade bug that took longer to fix than anything else in this project.

**NetEscape Navigator.** The in-app browser. Pages stall mid-load. The title bar flickers (Not Responding). A timeout dialog eventually appears. This is the Texture Zone — the felt experience of the Aptiva. The guestbook always works. That's the Protected Path. You don't punish someone for committing to an action.

**Signal Drift.** The screensaver. 30 nodes on sine/cosine paths, terminal green, ghost trails. Kicks in after 90 seconds. The kind of wait you'd actually sit through before a CRT screensaver activated.

**A real guestbook.** Messages persist. Altcha handles bot protection with proof-of-work challenges — no Google involved. Moderated in PocketBase every 24 hours.

**A resume you have to earn.** `resume_FINAL_v3.exe` throws an Access Denied dialog. The guestbook is the unlock. This is intentional.

---

## The behavioral fidelity system

Every delay in the simulation is a named timing token in `js/win98-timing.js`. Not magic numbers. Named constants.

Every interactive element is either **Texture Zone** (delays up to 6000ms, failure states enabled) or **Protected Path** (max 1000ms, always succeeds). The whole feel of the simulation is a config change in one file.

---

## Stack

No frameworks. No build step. No npm. Open `index.html` and it works.

| Service | What it does |
|---|---|
| Caddy | Web server, automatic HTTPS, runs natively on ARM |
| PocketBase | Guestbook backend — single Go binary, SQLite underneath |
| Altcha | Proof-of-work CAPTCHA, no third-party calls |
| Umami | Self-hosted analytics, no cookies |
| OpenWeatherMap | Weather widget via local Python proxy on port 8092 |
| Cloudflare Tunnel | Punches the Pi to the internet, no port forwarding, no static IP |

The whole thing runs on a Raspberry Pi 4 in a closet. There is no AWS bill. There is no Vercel dashboard. If the Pi dies, I flash a new SD card, clone the repo, run `deploy.sh`, and I'm back.

---

## Running locally

```bash
git clone https://github.com/iamatsushi/atsushis-pc.git
cd atsushis-pc
open index.html
```

The boot sequence, desktop, Start Menu, screensaver, NetEscape, and all timing behavior run entirely client-side. The guestbook, weather widget, and analytics require their respective backend services.

---

## Deploying

```bash
ssh atsushi@atsushispc
cd ~/site
git pull origin main
./deploy.sh
```

`deploy.sh` restarts Caddy, PocketBase, and the weather server. That's the deploy.

---

## What's open

| # | What | Status |
|---|---|---|
| #1 | `resume_FINAL_v3.exe` — the dial-up lead capture flow | Blocked on #37 |
| #37 | GIF/PNG assets for the resume flow | Blocker |
| #39 | Real content for My Thoughts and About Me | Ready |
| #40 | Accessibility audit — WAVE/axe, zero critical errors | Pre-launch gate |

46 issues closed. The screensaver, Recycle Bin, Start Menu cascade, tray balloons, NetEscape, boot sequence, System Properties, Matrix rain overhaul, and a 28-issue bug sprint are all shipped.

---

## For AI agents

Read `CLAUDE.md` before touching anything. It has the full behavioral spec, every resolved design decision with rationale, the timing token architecture, and the reasons certain things that look like bugs are intentional. If you skip it, you will break something on purpose.

---

Built by Atsushi Hisaka. PM by trade. This is what happens when the PM writes the spec and ships it himself.
