# css/ — CSS Rules

## Win98 Chrome Fidelity

These rules are absolute. Breaking them breaks the simulation.

- **No `border-radius`** on Win98 chrome. Sharp corners everywhere.
  Exception: `.tray-balloon` uses `border-radius: 6px` — XP chrome, intentional.
- **No `box-shadow`** except Win98 3D inset/raised borders.
- **No CSS frameworks.** No Tailwind, Bootstrap, or resets that affect Win98 chrome.
- **No CSS variables** for Win98 chrome colors. Hard-code them.
  CSS custom properties (e.g. `--page-bg`) are only for NetEscape page content theming.
- **No modern layout** (flexbox/grid) for Win98 chrome. Use tables, `position: absolute`, floats.
  Exception: NetEscape page content may use modern CSS inside the browser content area.
- **Tight spacing.** 2–4px gaps. No modern whitespace.
- **No hardcoded z-indexes in JS.** Layering is owned by CSS. New z-index values belong in `win98.css` as named classes, not inline `style.zIndex = 9999` in scripts.
  The established hierarchy (do not insert between layers without explicit review):

  | Layer | Value | Owner |
  |---|---|---|
  | Desktop icons | 1 | CSS default |
  | Windows (dynamic) | 100–∞ | `desktop.js` `zCounter` |
  | Disk Cleanup window | 3000 | `diskcleanup.js` (exception: self-managed) |
  | Tray balloon (behind glitch) | 998 | `widgets.js` |
  | Taskbar | 1000 | CSS |
  | Start menu | 2000 | CSS |
  | Wireframe drag animation | 99999 | `desktop.js` (transient) |
  | Modal overlays | 10000 | CSS `.win98-msgbox-overlay` |

---

## Color Palette

**Win98 Chrome:**

| Color | Value | Use |
|---|---|---|
| Desktop teal | `#008080` | Desktop background |
| Chrome/buttons | `#C0C0C0` | Window backgrounds, buttons |
| Active titlebar (start) | `#000080` | Left edge of gradient |
| Active titlebar (end) | `#1084D0` | Right edge of gradient |
| Inactive titlebar | `#808080` | Unfocused windows |
| Titlebar text | `#FFFFFF` | Window titles |
| Shadow | `#808080` | 3D border dark edge |
| Highlight | `#FFFFFF` | 3D border light edge |
| SYSDM.CPL titlebar (start) | `#7A5ACD` | System Properties only |
| SYSDM.CPL titlebar (end) | `#4B2E83` | System Properties only |
| IBS Splash background | `#102046` | Boot Screen 2 only |

**NetEscape Page Content:**

| Color | Value | Use |
|---|---|---|
| Page body | `#0A0A2E` | All pages default |
| Sidebar | `#111133` | Nav/sidebar areas |
| Body text | `#E8E4D0` | Main content text |
| Borders | `#2A2A6A` | Dividers, card borders |
| Amber accent | `#FFB347` | Links, nav, highlights |
| Terminal green | `#00FF41` | My Thoughts page, Matrix rain, Signal Drift ONLY |
| Neon pink | `#FF69B4` | About Me headers only |

**The `#00FF41` rule:** Terminal green is used for Matrix rain, Signal Drift screensaver,
and My Thoughts page only. Do not use it anywhere else.

---

## Typography

No web fonts. No CDN imports. System fonts only.

| Context | Font | Size |
|---|---|---|
| Win98 chrome | `MS Sans Serif`, Tahoma fallback | 11px |
| NetEscape homepage, About, Guestbook | Verdana | 11–12px |
| Work/Projects, Resume | Tahoma | 12px |
| My Thoughts | `Courier New` | 12px |
| Winamp UI | Black bg, track `#FFB347`, analyzer `#00FF41`, EQ `#008080` | — |

---

## CSS Emoji Green Filter

To render emojis in `#00FF41` on canvas, use this exact filter string:

```css
filter: brightness(0) saturate(100%) invert(57%) sepia(99%) saturate(400%) hue-rotate(85deg) brightness(110%);
```

Do not approximate or simplify it.

---

## CSS Class Naming

BEM-style kebab-case: `.netescape-window__toolbar`, `.win98-button--active`

Use `netescape-` prefix for all NetEscape browser components.
Never use `ie-` — that prefix is retired (PR #25).

---

## GIF Limits

Max 2 GIFs per page. Max 4 on About Me. All GIFs self-hosted in `assets/gifs/`.
Every asset must be registered in `assets/CREDITS.md` before use.
