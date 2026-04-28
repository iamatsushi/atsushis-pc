# Atsushi's PC
**ahisaka.com**

This is my portfolio site and designed to memorialize a forgotten experience I grew up using at home on a family computer. 
It was slow from limited compute and it would make funny sounds that said, "I'm working hard". 
Dial-up was the entry point for the "world-wide web". 
It is not a WordPress theme, a React app wrapped in a template, or a tasteless AI-generated server waste.
The machine being simulated is specific: an IBM Aptiva SE7. Pentium II with 32MB of RAM sitting in a beige tower.

This experience is intended to be realistic where wvery delay, every freeze, every timeout is deliberate and this frusteration envoke on the user is not a bug.

---

## What's in here

**A boot sequence.** 
"The Matrix" rain in `#00FF41` — full-width katakana, ASCII, and the occasional emoji column to remind users we are not really in 1998. 
After one second, the rain asks one question:

```
> WHO ARE YOU?

  [1] I HAVE 30 SECONDS
  [2] I HAVE TIME
```

pressing `1` skips the ritual entirely — startup.mp3 plays, NetEscape opens full-screen, and the visitor is reading the portfolio content in under five seconds. 
pressing `2` runs the full sequence. on mobile, there's no question — the device already answered it. NetEscape loads directly. the fork isn't a concession to short attention spans. it's the right experience for the right person.
`2` initiates six identity lines over the rain where a terminal prompt blinks. 
Press a key and the lines unwrite themselves bottom-to-top, right-to-left and the text dissolves back into the rain as a wormhole begins pulling the exact characters on screen into a spiral. 
This rain becomes a vortex and ahe desk scene reveals through a green phosphor glow. 
The clicks then Windoors 98 inistiates the power-on process.

**The desktop** 
- A Teal wallpaper
- A taskbar with a working clock, live local weather (Portland,OR if a user opts out of location sahring), and a RAM gauge pulling from the actual Raspberry Pi running the site.
- Desktop icons are draggable using a realistic 75px grid.
- A Start Menu with the full authentic Win98 hierarchy: Programs → Accessories → Entertainment, System Tools, Communications, and more. 40+ nodes of period-accurate friction.
- Modals reject clicks with an error ding and a titlebar flash.
- Windows animate to the taskbar when minimized.
- Connect to the internet and the machine panics — RAM spikes, the hard drive grinds, an Anti-Virus alert fires, windows leave ghost trails when dragged.
- Run Disk Cleanup and it sighs in relief. Right-click the taskbar and the 1998 context menu appears. The machine responds to compute demand.

**NetEscape Navigator** 
The in-app browser where non-ahisaka.com Pages stall mid-load, The title bar flickers (Not Responding). A timeout dialog eventually appears. A felt experience of the Aptiva. The guestbook always works a Protected Path by not punishing someone for a desired action.

**Signal Drift** 
A screensaver, 30 nodes on sine/cosine paths, terminal green, ghost trails and cicks in after 90 seconds. 
The kind of wait you'd actually sit through before a CRT screensaver activated.

**A real guestbook** 
Messages persist. 
Altcha handles bot protection with proof-of-work challenges with no Google involved. 
Moderated in PocketBase every 24 hours.

**A resume you have to earn.** 
`resume_FINAL_v3.exe` throws an Access Denied dialog. 
The guestbook is the unlock. 
This is intentional and do not want to list a resume with my contact infromation and consume spam, get data scraped, etc. 

---

## The behavioral fidelity system

Every delay in the simulation is a named timing token in `js/win98-timing.js` and they are named constants.
Every interactive element is either **Texture Zone** (delays up to 6000ms, failure states enabled) or **Protected Path** (max 1000ms, always succeeds). 
The whole feel of the simulation is a config change in one file.

---

## Stack

No frameworks, build steps, npm. 
Just open `index.html`.
I use opensource.

The whole thing runs on a Raspberry Pi 4 in a closet. 
There is no AWS bill. 
There is no Vercel dashboard. 
If the Pi dies, I flash a new SD card, clone the repo, run `deploy.sh`, and I'm back.

| Service | What it does |
|---|---|
| Caddy | Web server, automatic HTTPS, runs natively on ARM |
| PocketBase | Guestbook backend — single Go binary, SQLite underneath |
| Altcha | Proof-of-work CAPTCHA, no third-party calls |
| Umami | Self-hosted analytics, no cookies |
| OpenWeatherMap | Weather widget via local Python proxy on port 8092 |
| Cloudflare Tunnel | Punches the Pi to the internet, no port forwarding, no static IP |


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
`deploy.sh` restarts Caddy, PocketBase, and the weather server. 
---

## What's open

| # | What | Status |
|---|---|---|
| #1 | `resume_FINAL_v3.exe` — the dial-up lead capture flow | Blocked on #37 |
| #37 | GIF/PNG assets for the resume flow | Blocker |
| #39 | Real content for My Thoughts and About Me | Ready |
| #40 | Accessibility audit — WAVE/axe, zero critical errors | Pre-launch gate |
| #174 | My Computer + Recycle Bin icons render as code point boxes | Under investigation |
| Open | Start Menu — nested folder hover collapses entire menu stack | Active bug |

65+ issues closed. The Start Menu is now registry-driven — a JSON `menuConfig` array feeds a recursive `renderMenuNode()` engine replacing 300+ lines of imperative DOM builders. Full authentic Win98 hierarchy ships: Programs → Accessories → Entertainment/System Tools/Communications, Online Services, StartUp, Favorites, Settings → Active Desktop, Find, Log Off. Taskbar right-click context menus ship. `desktop.js` exports `minimizeAll()`. The screensaver, Recycle Bin, Start Menu cascade, tray balloons, NetEscape, boot sequence, System Properties, Matrix rain overhaul, cinematic gate transition, wormhole match cut, identity line rewrite, a 28-issue bug sprint, and six usability sprint fixes (double-click discoverability, resume/guestbook conversion path, Start Menu Apps shortcut, clock tooltip, first tray balloon timing, dialup icon affordance, window drag cursor) are all shipped.

---

## Why this exists

We live in a scrollable world. WordPress, Shopify, every templated site generator product over optimized and faceless websites that lack personality. 
The interfaces of 1998 were not worse and felt overly custom, and applied cognitive load due to zero shared themes on the web.
The machines of yesterday had a relationship with users by taking its sweet old time, made robot sounds, pushed back and this the waiting was part of the experience. 
This site is a preservation of that feeling, and an argument that UX doesn't have to be frictionless to be good. i have opinions about what computing used to feel like and i built something to prove them.

I am a PM by trade, which means i've spent years writing specs and watching engineers ship them. 
I built this to change this and learn how a server actually works, what a Raspberry Pi does, how to write Python, how to push code from a terminal instead of filing a ticket. 
I also wanted to understand how to use Claude Code for somethig fun. 
---

## For AI agents

Read `CLAUDE.md` before touching anything. It has the full behavioral spec, every resolved design decision with rationale, the timing token architecture, and the reasons certain things that look like bugs are intentional. If you skip it, you will break something on purpose.

---

Built by Atsushi Hisaka. PM by trade. This is what happens when the PM writes the spec and ships it himself.
