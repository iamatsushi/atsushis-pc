// desktop.js — Windows 98 desktop environment
// Handles: clock, desktop icons (double-click), start menu stub,
//          Win98 window shell (drag/resize/minimize/maximize/close/taskbar)
// Namespaced under window.APC per project conventions.

window.APC = window.APC || {};

window.APC.desktop = (function () {
  'use strict';

  // --- Constants -------------------------------------------------------

  const TASKBAR_HEIGHT = 28;
  const WIN_MIN_WIDTH = 200;
  const WIN_MIN_HEIGHT = 80;
  const TITLEBAR_H = 22;    // titlebar height (18) + padding top (2) + padding bottom (2)
  const DBLCLICK_MS = 400;  // manual double-click detection window in ms

  // --- Module state ----------------------------------------------------

  let zCounter = 100;
  let winIdCounter = 0;
  let activeWindowId = null;
  const windows = {};             // id → window state object
  const iconLastClick = {};       // app → timestamp of last click
  const appLaunching = {};        // app → true while launch delay is in-progress (prevents double-launch)

  // Clock easter egg state
  let clockClickCount = 0;
  let clockFirstClickTime = 0;

  // Context menu / wallpaper / system properties state
  let contextMenuEl = null;       // active context menu DOM node (or null)
  let wallpaperIndex = 0;         // current wallpaper variant index (0 = default teal)
  let syspropsState = null;       // System Properties window state (singleton)
  const WALLPAPER_CLASSES = [     // wallpaper variant CSS classes; index 0 = no class (default teal)
    '',
    'desktop--wallpaper-stars',
    'desktop--wallpaper-ascii'
  ];

  // --- Public API ------------------------------------------------------

  function init() {
    startClock();
    bindDesktopIcons();
    bindContextMenu();
    // Start menu is owned by taskbar.js which is loaded before desktop.js fires.
    if (window.APC.taskbar && typeof window.APC.taskbar.init === 'function') {
      window.APC.taskbar.init();
    }
    // Widgets fire their first fetch immediately; subsequent fetches self-schedule via setTimeout.
    if (window.APC.widgets && typeof window.APC.widgets.init === 'function') {
      window.APC.widgets.init();
    }
  }

  // --- Clock -----------------------------------------------------------

  function startClock() {
    renderClock();
    scheduleClock();
    bindClockEasterEgg();
  }

  // Self-rescheduling clock tick — fires every CLOCK_INTERVAL_MS (60s) plus a random
  // 0–CLOCK_OFFSET_MAX_MS (0–2s) drift per tick, matching the Texture Zone clock spec.
  function scheduleClock() {
    var t = window.APC.timing;
    setTimeout(function () {
      renderClock();
      scheduleClock();
    }, t.CLOCK_INTERVAL_MS + t.rand(0, t.CLOCK_OFFSET_MAX_MS));
  }

  function renderClock() {
    const el = document.getElementById('taskbar-clock');
    if (!el) { return; }
    const now = new Date();
    const month = now.getMonth() + 1;
    const day   = now.getDate();
    const year  = now.getFullYear();
    let h = now.getHours();
    const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) { h = 12; }
    const mm = m < 10 ? '0' + m : '' + m;
    el.textContent = month + '/' + day + '/' + year + ' ' + h + ':' + mm + ' ' + ampm;
  }

  // --- Clock easter egg ------------------------------------------------
  // 10 clicks within 5 seconds → Y2K Warning dialog

  function bindClockEasterEgg() {
    const el = document.getElementById('taskbar-clock');
    if (!el) { return; }
    el.addEventListener('click', function () {
      const now = Date.now();
      // Reset window if more than 5 seconds have elapsed since first click
      if (clockClickCount > 0 && now - clockFirstClickTime > 5000) {
        clockClickCount = 0;
      }
      if (clockClickCount === 0) { clockFirstClickTime = now; }
      clockClickCount++;
      if (clockClickCount >= 10) {
        clockClickCount = 0;
        clockFirstClickTime = 0;
        showY2KDialog();
      }
    });
  }

  function showY2KDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';

    const box = document.createElement('div');
    box.className = 'win98-msgbox';

    const tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = 'Y2K WARNING';
    const ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    const xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    ctrls.appendChild(xBtn);
    tb.appendChild(titleSpan);
    tb.appendChild(ctrls);

    const body = document.createElement('div');
    body.className = 'win98-msgbox__body';
    const msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    msg.textContent =
      'It is the year 2000. All systems are failing. ' +
      'Please contact your IT department immediately.';
    const okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(msg);
    body.appendChild(okBtn);

    box.appendChild(tb);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const closeOverlay = function () {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    };
    const onKey = function (e) { if (e.key === 'Escape') { closeOverlay(); } };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', closeOverlay);
    okBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closeOverlay(); }
    });

    if (window.umami) { window.umami.track('easteregg_trigger', { easter_egg: 'y2k' }); }
    okBtn.focus();
  }

  // --- Desktop icons ---------------------------------------------------

  function bindDesktopIcons() {
    const icons = document.querySelectorAll('.desktop-icon');
    icons.forEach(function (icon) {
      // click fires on Enter key too (role="button" on the element)
      icon.addEventListener('click', function (e) {
        e.stopPropagation();
        onIconClick(icon);
      });
    });

    // Click on desktop (outside icons) clears selection
    const desktop = document.getElementById('desktop');
    if (desktop) {
      desktop.addEventListener('click', function () {
        clearIconSelection();
      });
    }
  }

  function onIconClick(icon) {
    const app = icon.dataset.app;
    const now = Date.now();

    clearIconSelection();
    icon.classList.add('desktop-icon--selected');

    // Manual double-click: two clicks within DBLCLICK_MS on the same icon
    if (iconLastClick[app] && (now - iconLastClick[app]) < DBLCLICK_MS) {
      iconLastClick[app] = 0;
      openIconApp(app);
    } else {
      iconLastClick[app] = now;
    }
  }

  function clearIconSelection() {
    const selected = document.querySelectorAll('.desktop-icon--selected');
    selected.forEach(function (el) {
      el.classList.remove('desktop-icon--selected');
    });
  }

  function openIconApp(app) {
    if (app === 'my-computer') {
      openMyComputer();
    } else if (app === 'netescape') {
      openNetEscape();
    } else if (app === 'resume-exe') {
      openResumeExe();
    } else if (app === 'dialup') {
      openDialupNetworking();
    }
  }

  function openDialupNetworking() {
    // Trigger the dial-up sequence via netescape.js. No IE window is opened —
    // connecting is a separate step from browsing, per Win98 behavior.
    if (window.APC.netescape && typeof window.APC.netescape.connect === 'function') {
      window.APC.netescape.connect();
    }
  }

  function openResumeExe() {
    // Open IE (or focus it if already open) and navigate to guestbook?resume=1.
    // netescape.js open(targetUrl) handles both cases: new window and already-open window.
    if (window.APC.netescape && typeof window.APC.netescape.open === 'function') {
      window.APC.netescape.open('ahisaka.com/guestbook?resume=1');
    }
  }

  function openMyComputer() {
    const existing = findWindowByApp('my-computer');
    if (existing) {
      if (existing.minimized) { restoreWindow(existing); }
      else { bringToFront(existing.el); }
      return;
    }

    // Texture Zone launch delay: 1000–2200ms, hourglass cursor, no failure state.
    // Guard reuses appLaunching to prevent double-open during delay.
    if (appLaunching['my-computer']) { return; }
    appLaunching['my-computer'] = true;
    document.body.style.cursor = 'wait';

    var t = window.APC.timing;
    setTimeout(function () {
      appLaunching['my-computer'] = false;
      document.body.style.cursor = '';
      buildMyComputerWindow();
    }, t.rand(t.APP_MYCOMPUTER_MIN_MS, t.APP_MYCOMPUTER_MAX_MS));
  }

  function buildMyComputerWindow() {
    const state = createWindow({
      title: 'My Computer',
      app: 'my-computer',
      width: 400,
      height: 280,
      x: 60,
      y: 50
    });

    // Path / address bar
    const pathBar = document.createElement('div');
    pathBar.className = 'explorer-path';
    pathBar.setAttribute('aria-label', 'Current folder');
    pathBar.textContent = 'C:\\My Computer';
    state.contentEl.appendChild(pathBar);

    // Icon area
    const iconArea = document.createElement('div');
    iconArea.className = 'explorer-icons';
    iconArea.setAttribute('role', 'listbox');
    iconArea.setAttribute('aria-label', 'Programs');

    const explorerLastClick = {};

    const appDefs = [
      { app: 'winamp',      icon: '\uD83C\uDFB5', label: 'Winamp'      },
      { app: 'calculator',  icon: '\uD83E\uDDF2', label: 'Calculator'  },
      { app: 'notepad',     icon: '\uD83D\uDCDD', label: 'README.txt'  },
      { app: 'minesweeper', icon: '\uD83D\uDCA3', label: 'Minesweeper' }
    ];

    appDefs.forEach(function (def) {
      const iconEl = document.createElement('div');
      iconEl.className = 'explorer-icon';
      iconEl.setAttribute('role', 'option');
      iconEl.setAttribute('aria-label', def.label);
      iconEl.setAttribute('tabindex', '0');

      const imgSpan = document.createElement('span');
      imgSpan.className = 'explorer-icon__img';
      imgSpan.setAttribute('aria-hidden', 'true');
      imgSpan.textContent = def.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'explorer-icon__label';
      labelSpan.textContent = def.label;

      iconEl.appendChild(imgSpan);
      iconEl.appendChild(labelSpan);

      iconEl.addEventListener('click', function (e) {
        e.stopPropagation();
        const now = Date.now();
        // Clear all icon selections in this explorer
        iconArea.querySelectorAll('.explorer-icon--selected').forEach(function (el) {
          el.classList.remove('explorer-icon--selected');
        });
        iconEl.classList.add('explorer-icon--selected');

        if (explorerLastClick[def.app] && (now - explorerLastClick[def.app]) < DBLCLICK_MS) {
          explorerLastClick[def.app] = 0;
          launchApp(def.app);
        } else {
          explorerLastClick[def.app] = now;
        }
      });

      iconArea.appendChild(iconEl);
    });

    const clearDiv = document.createElement('div');
    clearDiv.className = 'explorer-clear';
    iconArea.appendChild(clearDiv);

    state.contentEl.appendChild(iconArea);
    state.show();
  }

  // Dispatch to mini-app open() via window.APC.apps namespace.
  // Applies Texture Zone launch delay + failure behavior from win98-timing.js tokens.
  function launchApp(app) {
    if (!window.APC.apps || !window.APC.apps[app] ||
        typeof window.APC.apps[app].open !== 'function') { return; }

    // Prevent double-launch: if a delay timer is already running for this app, ignore.
    if (appLaunching[app]) { return; }

    var t = window.APC.timing;

    // Per-app delay range and failure config keyed by app name.
    var cfg = {
      winamp:      { min: t.APP_WINAMP_MIN_MS,     max: t.APP_WINAMP_MAX_MS,
                     failChance: t.APP_WINAMP_FAIL_CHANCE,     failType: 'not-responding' },
      calculator:  { min: t.APP_CALC_MIN_MS,        max: t.APP_CALC_MAX_MS,
                     failChance: t.APP_CALC_FAIL_CHANCE,        failType: 'flicker' },
      notepad:     { min: t.APP_NOTEPAD_MIN_MS,     max: t.APP_NOTEPAD_MAX_MS,
                     failChance: t.APP_NOTEPAD_FAIL_CHANCE,     failType: 'flicker' },
      minesweeper: { min: t.APP_MINESWEEPER_MIN_MS, max: t.APP_MINESWEEPER_MAX_MS,
                     failChance: t.APP_MINESWEEPER_FAIL_CHANCE, failType: 'flicker' }
    }[app];

    if (!cfg) {
      // Unknown app — open immediately with no delay.
      window.APC.apps[app].open();
      return;
    }

    var delay    = t.rand(cfg.min, cfg.max);
    var willFail = Math.random() < cfg.failChance;

    appLaunching[app] = true;
    document.body.style.cursor = 'wait';

    setTimeout(function () {
      appLaunching[app] = false;
      document.body.style.cursor = '';
      window.APC.apps[app].open();
      if (willFail) {
        if (cfg.failType === 'not-responding') { applyNotResponding(app); }
        else if (cfg.failType === 'flicker')   { applyFlicker(app); }
      }
    }, delay);
  }

  // applyNotResponding — temporarily marks the window titlebar + taskbar button as
  // "(Not Responding)" for APP_NOT_RESPONDING_MS, then reverts.
  function applyNotResponding(app) {
    var state = findWindowByApp(app);
    if (!state) { return; }
    var t = window.APC.timing;
    var titleEl = state.el.querySelector('.win98-window__title');
    var originalTitle = titleEl ? titleEl.textContent : state.title;

    if (titleEl) { titleEl.textContent = originalTitle + ' (Not Responding)'; }
    if (state.taskbarBtn) { state.taskbarBtn.textContent = originalTitle + ' (Not Responding)'; }

    setTimeout(function () {
      if (titleEl) { titleEl.textContent = originalTitle; }
      if (state.taskbarBtn) { state.taskbarBtn.textContent = originalTitle; }
    }, t.APP_NOT_RESPONDING_MS);
  }

  // applyFlicker — two-phase rendering glitch on the window content area:
  //   Phase 1 (APP_FLICKER_MS):     white flash — content hidden, background #FFF
  //   Phase 2 (APP_FLICKER_GAP_MS): blank gap   — content invisible before remount
  function applyFlicker(app) {
    var state = findWindowByApp(app);
    if (!state) { return; }
    var t = window.APC.timing;

    state.el.classList.add('win98-window--flicker-flash');

    setTimeout(function () {
      state.el.classList.remove('win98-window--flicker-flash');
      state.el.classList.add('win98-window--flicker-gap');

      setTimeout(function () {
        state.el.classList.remove('win98-window--flicker-gap');
      }, t.APP_FLICKER_GAP_MS);
    }, t.APP_FLICKER_MS);
  }

  function openNetEscape() {
    // Delegate to netescape.js if loaded; otherwise open a stub window
    if (window.APC.netescape && typeof window.APC.netescape.open === 'function') {
      window.APC.netescape.open();
      return;
    }

    const existing = findWindowByApp('netescape');
    if (existing) {
      if (existing.minimized) { restoreWindow(existing); }
      else { bringToFront(existing.el); }
      return;
    }

    const state = createWindow({
      title: 'NetEscape',
      app: 'netescape',
      width: 640,
      height: 480,
      x: 80,
      y: 60
    });

    state.show();
  }

  function findWindowByApp(app) {
    const ids = Object.keys(windows);
    for (let i = 0; i < ids.length; i++) {
      if (windows[ids[i]].app === app) { return windows[ids[i]]; }
    }
    return null;
  }

  // --- Start button / menu stub ----------------------------------------

  function bindStartButton() {
    const btn = document.getElementById('start-button');
    const menu = document.getElementById('start-menu');
    if (!btn || !menu) { return; }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = menu.classList.contains('start-menu--open');
      if (isOpen) {
        menu.classList.remove('start-menu--open');
      } else {
        menu.classList.add('start-menu--open');
      }
    });

    // Click anywhere outside start menu closes it
    document.addEventListener('click', function () {
      menu.classList.remove('start-menu--open');
    });
  }

  // --- Window factory (public) -----------------------------------------

  function createWindow(config) {
    const id = 'win-' + (++winIdCounter);
    const title = config.title || 'Window';
    const app = config.app || '';
    const w = config.width || 400;
    const h = config.height || 300;

    // Default position: stagger by number of windows created
    const stagger = ((winIdCounter - 1) % 8) * 24;
    const x = (config.x !== undefined) ? config.x : (40 + stagger);
    const y = (config.y !== undefined) ? config.y : (40 + stagger);

    const el = buildWindowDOM(id, title);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = ++zCounter;

    const titleEl = el.querySelector('.win98-window__title');
    if (titleEl) { titleEl.id = id + '-title'; }
    el.setAttribute('aria-labelledby', id + '-title');

    const contentEl = el.querySelector('.win98-window__content');
    updateContentHeight(el, h);

    const layer = document.getElementById('window-layer');
    layer.appendChild(el);

    // State object returned to callers
    const state = {
      id: id,
      app: app,
      title: title,
      el: el,
      contentEl: contentEl,
      minimized: false,
      maximized: false,
      savedGeom: null,
      taskbarBtn: null,
      show: show
    };

    windows[id] = state;

    // Wire titlebar control buttons
    const closeBtn = el.querySelector('[data-action="close"]');
    const minBtn   = el.querySelector('[data-action="minimize"]');
    const maxBtn   = el.querySelector('[data-action="maximize"]');

    if (closeBtn) { closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeWindow(state); }); }
    if (minBtn)   { minBtn.addEventListener('click', function (e) { e.stopPropagation(); minimizeWindow(state); }); }
    if (maxBtn)   { maxBtn.addEventListener('click', function (e) { e.stopPropagation(); maximizeWindow(state); }); }

    // Bring to front on any mousedown inside the window
    el.addEventListener('mousedown', function () { bringToFront(el); });

    // Keyboard: arrow keys move window when titlebar is focused (WCAG)
    const titlebar = el.querySelector('.win98-window__titlebar');
    if (titlebar) {
      titlebar.addEventListener('keydown', function (e) {
        onTitlebarKeyDown(e, el);
      });
    }

    makeDraggable(el, titlebar);
    makeResizable(el);
    addTaskbarButton(state);

    // show() is the public method to make the window visible
    function show() {
      el.style.display = '';
      bringToFront(el);
    }

    return state;
  }

  // --- DOM builder -----------------------------------------------------

  function buildWindowDOM(id, title) {
    const win = document.createElement('div');
    win.className = 'win98-window';
    win.id = id;
    win.setAttribute('role', 'dialog');

    // 8 resize handles (z-index 5 in CSS, below titlebar z-index 10)
    const dirs = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    dirs.forEach(function (dir) {
      const handle = document.createElement('div');
      handle.className = 'win98-window__resize win98-window__resize--' + dir;
      handle.dataset.dir = dir;
      win.appendChild(handle);
    });

    // Titlebar
    const bar = document.createElement('div');
    bar.className = 'win98-window__titlebar';
    bar.setAttribute('tabindex', '0');
    bar.setAttribute('aria-label', title + ' — drag to move');

    // Title text first in DOM (accessibility reading order);
    // controls are positioned absolute top-right via CSS.
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = title;   // textContent prevents XSS
    bar.appendChild(titleSpan);

    // Control buttons
    const controls = document.createElement('div');
    controls.className = 'win98-window__controls';

    const minBtn = document.createElement('button');
    minBtn.className = 'win98-window__btn';
    minBtn.dataset.action = 'minimize';
    minBtn.setAttribute('aria-label', 'Minimize');
    minBtn.textContent = '_';

    const maxBtn = document.createElement('button');
    maxBtn.className = 'win98-window__btn';
    maxBtn.dataset.action = 'maximize';
    maxBtn.setAttribute('aria-label', 'Maximize');
    maxBtn.textContent = '\u25A1';   // □

    const closeBtn = document.createElement('button');
    closeBtn.className = 'win98-window__btn';
    closeBtn.dataset.action = 'close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7'; // ×

    controls.appendChild(minBtn);
    controls.appendChild(maxBtn);
    controls.appendChild(closeBtn);
    bar.appendChild(controls);

    win.appendChild(bar);

    // Content area — height set by JS via updateContentHeight()
    const content = document.createElement('div');
    content.className = 'win98-window__content';
    win.appendChild(content);

    return win;
  }

  // --- Content height --------------------------------------------------

  function updateContentHeight(winEl, totalH) {
    const contentEl = winEl.querySelector('.win98-window__content');
    if (!contentEl) { return; }
    // totalH (border-box) = 2px top border + inner + 2px bottom border
    // inner = totalH - 4; titlebar occupies TITLEBAR_H (22px) of inner
    // content height = inner - TITLEBAR_H = totalH - 4 - 22 = totalH - 26
    contentEl.style.height = (totalH - TITLEBAR_H - 4) + 'px';
  }

  // --- Dragging --------------------------------------------------------

  function makeDraggable(winEl, barEl) {
    if (!barEl) { return; }

    barEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) { return; }
      // Clicks on titlebar buttons should not trigger drag
      if (e.target.closest && e.target.closest('.win98-window__btn')) { return; }

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseInt(winEl.style.left, 10) || 0;
      const startTop  = parseInt(winEl.style.top, 10)  || 0;

      bringToFront(winEl);
      e.preventDefault();

      function onMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Keep at least 40px of the window visible on each side
        const newLeft = Math.max(
          -(winEl.offsetWidth - 40),
          Math.min(window.innerWidth - 40, startLeft + dx)
        );
        // Titlebar must stay on screen (not go above top or below taskbar)
        const newTop = Math.max(
          0,
          Math.min(window.innerHeight - TASKBAR_HEIGHT - 18, startTop + dy)
        );

        winEl.style.left = newLeft + 'px';
        winEl.style.top  = newTop  + 'px';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // --- Resizing --------------------------------------------------------

  function makeResizable(winEl) {
    const handles = winEl.querySelectorAll('.win98-window__resize');
    handles.forEach(function (handle) {
      handle.addEventListener('mousedown', function (e) {
        if (e.button !== 0) { return; }
        e.preventDefault();
        e.stopPropagation();
        startResize(e, handle.dataset.dir, winEl);
      });
    });
  }

  function startResize(e, dir, winEl) {
    const startX    = e.clientX;
    const startY    = e.clientY;
    const startW    = winEl.offsetWidth;
    const startH    = winEl.offsetHeight;
    const startLeft = parseInt(winEl.style.left, 10) || 0;
    const startTop  = parseInt(winEl.style.top,  10) || 0;

    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newW    = startW;
      let newH    = startH;
      let newLeft = startLeft;
      let newTop  = startTop;

      // East edges
      if (dir === 'e' || dir === 'ne' || dir === 'se') {
        newW = Math.max(WIN_MIN_WIDTH, startW + dx);
      }
      // West edges — move left edge, clamp so width doesn't go below min
      if (dir === 'w' || dir === 'nw' || dir === 'sw') {
        const delta = Math.min(dx, startW - WIN_MIN_WIDTH);
        newW    = startW - delta;
        newLeft = startLeft + delta;
      }
      // South edges
      if (dir === 's' || dir === 'se' || dir === 'sw') {
        newH = Math.max(WIN_MIN_HEIGHT, startH + dy);
      }
      // North edges — move top edge, clamp so height doesn't go below min
      if (dir === 'n' || dir === 'ne' || dir === 'nw') {
        const delta = Math.min(dy, startH - WIN_MIN_HEIGHT);
        newH   = startH - delta;
        newTop = startTop + delta;
      }

      winEl.style.width  = newW    + 'px';
      winEl.style.height = newH    + 'px';
      winEl.style.left   = newLeft + 'px';
      winEl.style.top    = newTop  + 'px';
      updateContentHeight(winEl, newH);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // --- Z-index / focus -------------------------------------------------

  function bringToFront(winEl) {
    winEl.style.zIndex = ++zCounter;

    // Inactive state on all windows, remove from newly focused one
    Object.keys(windows).forEach(function (id) {
      windows[id].el.classList.add('win98-window--inactive');
    });
    winEl.classList.remove('win98-window--inactive');

    // Track which window id is currently active for taskbar toggle logic
    if (windows[winEl.id]) { activeWindowId = winEl.id; }
  }

  // --- Titlebar keyboard movement (WCAG 2.1 AA) ------------------------

  function onTitlebarKeyDown(e, winEl) {
    const STEP = 8;
    const moves = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0],
                    ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    if (!moves[e.key]) { return; }
    e.preventDefault();
    winEl.style.left = ((parseInt(winEl.style.left, 10) || 0) + moves[e.key][0]) + 'px';
    winEl.style.top  = ((parseInt(winEl.style.top,  10) || 0) + moves[e.key][1]) + 'px';
  }

  // --- Taskbar buttons -------------------------------------------------

  function addTaskbarButton(state) {
    const container = document.getElementById('taskbar-windows');
    if (!container) { return; }

    const btn = document.createElement('button');
    btn.className = 'taskbar-btn taskbar-btn--active';
    btn.textContent = state.title;
    btn.dataset.winId = state.id;

    btn.addEventListener('click', function () {
      if (state.minimized) {
        restoreWindow(state);
      } else if (state.id === activeWindowId) {
        // Clicking focused window's taskbar button minimizes it
        minimizeWindow(state);
      } else {
        bringToFront(state.el);
        state.el.style.display = '';
        state.minimized = false;
      }
    });

    container.appendChild(btn);
    state.taskbarBtn = btn;
  }

  function removeTaskbarButton(state) {
    if (state.taskbarBtn && state.taskbarBtn.parentNode) {
      state.taskbarBtn.parentNode.removeChild(state.taskbarBtn);
    }
    state.taskbarBtn = null;
  }

  // --- Window actions --------------------------------------------------

  function minimizeWindow(state) {
    state.el.style.display = 'none';
    state.minimized = true;
    if (state.taskbarBtn) {
      state.taskbarBtn.classList.remove('taskbar-btn--active');
      state.taskbarBtn.classList.add('taskbar-btn--minimized');
    }
    if (activeWindowId === state.id) { activeWindowId = null; }
    focusTopWindow();
  }

  function restoreWindow(state) {
    state.el.style.display = '';
    state.minimized = false;
    if (state.taskbarBtn) {
      state.taskbarBtn.classList.remove('taskbar-btn--minimized');
      state.taskbarBtn.classList.add('taskbar-btn--active');
    }
    bringToFront(state.el);
  }

  function maximizeWindow(state) {
    if (state.maximized) {
      // Restore from saved geometry
      if (state.savedGeom) {
        state.el.style.left   = state.savedGeom.left;
        state.el.style.top    = state.savedGeom.top;
        state.el.style.width  = state.savedGeom.width;
        state.el.style.height = state.savedGeom.height;
        updateContentHeight(state.el, parseInt(state.savedGeom.height, 10));
      }
      state.maximized = false;
      state.savedGeom = null;
    } else {
      // Save current geometry before maximizing
      state.savedGeom = {
        left:   state.el.style.left,
        top:    state.el.style.top,
        width:  state.el.style.width,
        height: state.el.style.height
      };
      const maxH = window.innerHeight - TASKBAR_HEIGHT;
      state.el.style.left   = '0px';
      state.el.style.top    = '0px';
      state.el.style.width  = window.innerWidth  + 'px';
      state.el.style.height = maxH + 'px';
      updateContentHeight(state.el, maxH);
      state.maximized = true;
    }
    bringToFront(state.el);
  }

  function closeWindow(state) {
    if (state.el.parentNode) {
      state.el.parentNode.removeChild(state.el);
    }
    removeTaskbarButton(state);
    if (activeWindowId === state.id) { activeWindowId = null; }
    delete windows[state.id];
    focusTopWindow();
  }

  // After minimize or close, move focus to the topmost remaining window
  function focusTopWindow() {
    let topZ = -1;
    let topState = null;
    Object.keys(windows).forEach(function (id) {
      const s = windows[id];
      if (!s.minimized) {
        const z = parseInt(s.el.style.zIndex, 10) || 0;
        if (z > topZ) { topZ = z; topState = s; }
      }
    });
    if (topState) { bringToFront(topState.el); }
  }

  // --- Context menu -------------------------------------------------------

  function bindContextMenu() {
    const desktopEl = document.getElementById('desktop');
    if (!desktopEl) { return; }
    desktopEl.addEventListener('contextmenu', function (e) {
      // Suppress menu when right-clicking inside a window, icon, taskbar, or start menu
      let t = e.target;
      while (t && t !== desktopEl) {
        if (t.classList && (
          t.classList.contains('win98-window') ||
          t.classList.contains('desktop-icon') ||
          t.id === 'taskbar' ||
          t.id === 'start-menu'
        )) { return; }
        t = t.parentNode;
      }
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    });
  }

  function showContextMenu(x, y) {
    hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';

    const items = [
      { label: 'Arrange Icons',    action: showArrangeIconsDialog },
      { label: 'Refresh',          action: function () { location.reload(); } },
      { label: 'Change Wallpaper', action: cycleWallpaper },
      { sep: true },
      { label: 'Properties',       action: openSystemProperties }
    ];

    items.forEach(function (item) {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'desktop-context-menu__sep';
        menu.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'desktop-context-menu__item';
      btn.textContent = item.label;
      (function (action) {
        btn.addEventListener('click', function () {
          hideContextMenu();
          action();
        });
      }(item.action));
      menu.appendChild(btn);
    });

    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    document.body.appendChild(menu);
    contextMenuEl = menu;

    // Edge detection: reposition if menu clips outside viewport
    const rect = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (x + rect.width  > vw) { x = vw - rect.width  - 4; }
    if (y + rect.height > vh) { y = vh - rect.height - 4; }
    if (x < 0) { x = 0; }
    if (y < 0) { y = 0; }
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    // Dismiss on outside click or Escape — setTimeout avoids same-event immediate dismiss
    const onDocClick = function (e) {
      if (contextMenuEl && !contextMenuEl.contains(e.target)) { hideContextMenu(); }
    };
    const onDocKey = function (e) {
      if (e.key === 'Escape') { hideContextMenu(); }
    };
    setTimeout(function () {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onDocKey);
    }, 0);
    menu._dismissClick = onDocClick;
    menu._dismissKey   = onDocKey;

    const first = menu.querySelector('.desktop-context-menu__item');
    if (first) { first.focus(); }
  }

  function hideContextMenu() {
    if (!contextMenuEl) { return; }
    if (contextMenuEl._dismissClick) {
      document.removeEventListener('click', contextMenuEl._dismissClick);
    }
    if (contextMenuEl._dismissKey) {
      document.removeEventListener('keydown', contextMenuEl._dismissKey);
    }
    if (contextMenuEl.parentNode) {
      contextMenuEl.parentNode.removeChild(contextMenuEl);
    }
    contextMenuEl = null;
  }

  // --- Arrange Icons dialog -----------------------------------------------

  function showArrangeIconsDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';

    const box = document.createElement('div');
    box.className = 'win98-msgbox';

    // Titlebar (reuse win98-window titlebar classes for authentic look)
    const tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = 'Desktop';
    const ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    const xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    ctrls.appendChild(xBtn);
    tb.appendChild(titleSpan);
    tb.appendChild(ctrls);

    // Body
    const body = document.createElement('div');
    body.className = 'win98-msgbox__body';
    const msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    msg.textContent = 'Icons arranged successfully.';
    const okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(msg);
    body.appendChild(okBtn);

    box.appendChild(tb);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Unified close handler — cleans up key listener on every exit path
    const closeOverlay = function () {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    };
    const onKey = function (e) {
      if (e.key === 'Escape') { closeOverlay(); }
    };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', closeOverlay);
    okBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { closeOverlay(); }
    });

    okBtn.focus();
  }

  // --- Wallpaper cycling --------------------------------------------------

  function cycleWallpaper() {
    const desktopEl = document.getElementById('desktop');
    if (!desktopEl) { return; }
    // Remove current wallpaper class (index 0 has no class — skip)
    if (WALLPAPER_CLASSES[wallpaperIndex]) {
      desktopEl.classList.remove(WALLPAPER_CLASSES[wallpaperIndex]);
    }
    wallpaperIndex = (wallpaperIndex + 1) % WALLPAPER_CLASSES.length;
    if (WALLPAPER_CLASSES[wallpaperIndex]) {
      desktopEl.classList.add(WALLPAPER_CLASSES[wallpaperIndex]);
    }
  }

  // --- System Properties window -------------------------------------------

  function openSystemProperties() {
    if (syspropsState) {
      // Already open — restore or focus
      if (syspropsState.minimized) { restoreWindow(syspropsState); }
      else { bringToFront(syspropsState.el); }
      return;
    }
    const state = createWindow({
      title: 'System Properties',
      width: 340,
      height: 370
    });
    syspropsState = state;
    // Clear singleton reference when window is closed
    const closeBtn = state.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { syspropsState = null; });
    }
    buildSyspropsContent(state.contentEl);
    state.show();
  }

  function buildSyspropsContent(contentEl) {
    contentEl.className += ' sysprops-content-area';

    const wrap = document.createElement('div');
    wrap.className = 'sysprops-wrap';

    // Tab bar — General is active; others disabled
    const tabBar = document.createElement('div');
    tabBar.className = 'sysprops-tab-bar';
    ['General', 'Device Manager', 'Hardware Profiles', 'Performance'].forEach(function (name, i) {
      const tab = document.createElement('button');
      tab.className = 'sysprops-tab' + (i === 0 ? ' sysprops-tab--active' : ' sysprops-tab--inactive');
      tab.textContent = name;
      if (i !== 0) { tab.setAttribute('disabled', 'disabled'); }
      tabBar.appendChild(tab);
    });
    // Clearfix for floated tabs
    const tabClear = document.createElement('div');
    tabClear.style.clear = 'both';
    tabBar.appendChild(tabClear);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'sysprops-panel';

    // General tab: computer icon on left, OS info on right
    const tbl = document.createElement('table');
    tbl.className = 'sysprops-general';
    tbl.setAttribute('cellpadding', '0');
    tbl.setAttribute('cellspacing', '0');
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const tdL = document.createElement('td');
    tdL.className = 'sysprops-general__icon';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = '\uD83D\uDCBB';  // 💻
    iconSpan.setAttribute('aria-hidden', 'true');
    tdL.appendChild(iconSpan);

    const tdR = document.createElement('td');
    tdR.className = 'sysprops-general__info';
    [
      { bold: true,  text: 'Microsoft Windows 98' },
      { bold: false, text: '4.10.1998' },
      { bold: false, text: '\u00A0' },
      { bold: false, text: 'This product is licensed to:' },
      { bold: true,  text: 'Atsushi Hisaka' },
      { bold: false, text: 'Product ID: 24796-OEM-0014736-66386' },
      { bold: false, text: '\u00A0' },
      { bold: false, text: 'AMD Athlon 300MHz' },
      { bold: false, text: '64.0MB RAM' }
    ].forEach(function (line) {
      const p = document.createElement('p');
      p.className = 'sysprops-general__line' + (line.bold ? ' sysprops-general__line--bold' : '');
      p.textContent = line.text;
      tdR.appendChild(p);
    });

    tr.appendChild(tdL);
    tr.appendChild(tdR);
    tbody.appendChild(tr);
    tbl.appendChild(tbody);
    panel.appendChild(tbl);

    // OK / Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';
    ['OK', 'Cancel'].forEach(function (label) {
      const btn = document.createElement('button');
      btn.className = 'sysprops-btn';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        if (syspropsState) {
          const cb = syspropsState.el.querySelector('[data-action="close"]');
          if (cb) { cb.click(); }
        }
      });
      btnRow.appendChild(btn);
    });

    wrap.appendChild(tabBar);
    wrap.appendChild(panel);
    wrap.appendChild(btnRow);
    contentEl.appendChild(wrap);
  }

  // --- Close all windows -----------------------------------------------
  // Called by Start Menu Log Off action and by boot.restart().

  function closeAll() {
    var ids = Object.keys(windows);
    ids.forEach(function (id) {
      if (windows[id]) { closeWindow(windows[id]); }
    });
    syspropsState = null;
  }

  // --- Module reset (called by boot.restart()) -------------------------
  // Discards all window references so state is clean when desktop.init()
  // fires again after the gate/boot sequence replays. DOM cleanup (removing
  // window-layer and taskbar-windows children) is done by boot.restart().

  function reset() {
    Object.keys(windows).forEach(function (id) { delete windows[id]; });
    Object.keys(iconLastClick).forEach(function (k) { delete iconLastClick[k]; });
    Object.keys(appLaunching).forEach(function (k) { delete appLaunching[k]; });
    zCounter = 100;
    winIdCounter = 0;
    activeWindowId = null;
    syspropsState = null;
  }

  // --- Public exports --------------------------------------------------

  return {
    init:         init,
    createWindow: createWindow,
    launchApp:    launchApp,
    closeAll:     closeAll,
    reset:        reset
  };

}());
