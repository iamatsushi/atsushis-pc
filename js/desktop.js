if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before desktop.js');
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
  const iconHintTimers = {};      // app → { show: timerId, hide: timerId } for double-click hint

  // Clock easter egg state
  let clockClickCount = 0;
  let clockFirstClickTime = 0;

  // Screensaver idle timer state
  let idleTimer = null;
  let idleResetBound = false;

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
    startIdleTimer();
    // Bind input reset listeners once for the lifetime of the page.
    // idleResetBound guards against double-binding on restart (init fires again).
    if (!idleResetBound) {
      idleResetBound = true;
      ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(function (evt) {
        document.addEventListener(evt, startIdleTimer, { passive: true });
      });
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
    el.title = 'System clock';
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

      // My Computer: right-click shows icon context menu with Properties
      // Intercepted at the icon level so it doesn't bubble to the desktop context menu handler
      if (icon.dataset.app === 'my-computer') {
        icon.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          showIconContextMenu(e.clientX, e.clientY, icon);
        });
      }

      // Dial-Up Networking: tooltip explains the icon's function (P1-2)
      if (icon.dataset.app === 'dialup') {
        icon.title = 'Connect to the internet via Dial-Up Networking';
      }

      // Recycle Bin: right-click shows "Empty Recycle Bin" easter egg option
      if (icon.dataset.app === 'recycle-bin') {
        icon.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          showRecycleBinContextMenu(e.clientX, e.clientY);
        });
      }
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
    var app = icon.dataset.app;
    var now = Date.now();

    clearIconSelection();
    icon.classList.add('desktop-icon--selected');

    // Manual double-click: two clicks within DBLCLICK_MS on the same icon
    if (iconLastClick[app] && (now - iconLastClick[app]) < DBLCLICK_MS) {
      // Confirmed double-click — cancel any pending hint, open the app
      iconLastClick[app] = 0;
      hideIconHint(icon);
      openIconApp(app);
    } else {
      // First click — record timestamp and schedule the hint
      iconLastClick[app] = now;
      // Cancel any previous hint timer for this icon before scheduling a new one
      hideIconHint(icon);
      var t = window.APC.timing;
      iconHintTimers[app] = iconHintTimers[app] || {};
      iconHintTimers[app].show = setTimeout(function () {
        showIconHint(icon);
      }, t.ICON_HINT_DELAY_MS);
    }
  }

  // showIconHint — appends a small tooltip below the icon label.
  // Auto-dismisses after ICON_HINT_DISPLAY_MS. Only one hint per icon at a time.
  function showIconHint(icon) {
    var app = icon.dataset.app;
    var t = window.APC.timing;

    // Remove any existing hint on this icon first
    hideIconHint(icon);

    var hint = document.createElement('span');
    hint.className = 'desktop-icon__hint';
    hint.textContent = 'double-click to open';
    icon.appendChild(hint);

    // Trigger CSS opacity transition on next frame
    requestAnimationFrame(function () {
      hint.classList.add('desktop-icon__hint--visible');
    });

    // Auto-dismiss after display duration
    iconHintTimers[app] = iconHintTimers[app] || {};
    iconHintTimers[app].hide = setTimeout(function () {
      hideIconHint(icon);
    }, t.ICON_HINT_DISPLAY_MS);
  }

  // hideIconHint — cancels all pending hint timers for this icon and removes
  // any visible hint element from the DOM.
  function hideIconHint(icon) {
    var app = icon.dataset.app;

    // Cancel in-flight show and hide timers
    if (iconHintTimers[app]) {
      clearTimeout(iconHintTimers[app].show);
      clearTimeout(iconHintTimers[app].hide);
      delete iconHintTimers[app];
    }

    // Remove hint element from DOM entirely (not just hidden)
    var existing = icon.querySelector('.desktop-icon__hint');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
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
    } else if (app === 'recycle-bin') {
      openRecycleBin();
    }
  }

  function openRecycleBin() {
    const existing = findWindowByApp('recycle-bin');
    if (existing) {
      if (existing.minimized) { restoreWindow(existing); }
      else { bringToFront(existing.el); }
      return;
    }

    if (appLaunching['recycle-bin']) { return; }
    document.body.style.cursor = 'wait';

    var t = window.APC.timing;
    appLaunching['recycle-bin'] = setTimeout(function () {
      delete appLaunching['recycle-bin'];
      document.body.style.cursor = '';
      buildRecycleBinWindow();
    }, t.rand(t.APP_RECYCLEBIN_MIN_MS, t.APP_RECYCLEBIN_MAX_MS));
  }

  function buildRecycleBinWindow() {
    const state = createWindow({
      title: 'Recycle Bin',
      app: 'recycle-bin',
      width: 380,
      height: 260,
      x: 80,
      y: 60
    });

    // Empty state — centred message over grey content area
    state.contentEl.style.background = '#C0C0C0';
    state.contentEl.style.display = 'table';
    state.contentEl.style.width = '100%';

    const cell = document.createElement('div');
    cell.style.cssText = 'display:table-cell;vertical-align:middle;text-align:center;';

    const msg = document.createElement('p');
    msg.style.cssText =
      'font-family:\'MS Sans Serif\',Tahoma,sans-serif;font-size:11px;color:#000000;';
    msg.textContent = 'Recycle Bin is empty.';
    cell.appendChild(msg);
    state.contentEl.appendChild(cell);

    state.show();
  }

  // Right-click context menu on the Recycle Bin icon.
  function showRecycleBinContextMenu(x, y) {
    hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';

    const items = [
      { label: 'Open',              action: function () { openRecycleBin(); } },
      { sep: true },
      { label: 'Empty Recycle Bin', action: showEmptyRecycleBinFlow }
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
        btn.addEventListener('click', function () { hideContextMenu(); action(); });
      }(item.action));
      menu.appendChild(btn);
    });

    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    document.body.appendChild(menu);
    contextMenuEl = menu;

    const rect = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (x + rect.width  > vw) { x = vw - rect.width  - 4; }
    if (y + rect.height > vh) { y = vh - rect.height - 4; }
    if (x < 0) { x = 0; }
    if (y < 0) { y = 0; }
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    const onDocClick = function (e) {
      if (contextMenuEl && !contextMenuEl.contains(e.target)) { hideContextMenu(); }
    };
    const onDocKey = function (e) { if (e.key === 'Escape') { hideContextMenu(); } };
    setTimeout(function () {
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onDocKey);
    }, 0);
    menu._dismissClick = onDocClick;
    menu._dismissKey   = onDocKey;

    const first = menu.querySelector('.desktop-context-menu__item');
    if (first) { first.focus(); }
  }

  // Easter egg: "Empty Recycle Bin" progress dialog → completion message.
  function showEmptyRecycleBinFlow() {
    // Phase 1: progress dialog
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Emptying Recycle Bin');

    const box = document.createElement('div');
    box.className = 'win98-msgbox';

    const tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = 'Emptying Recycle Bin';
    tb.appendChild(titleSpan);
    box.appendChild(tb);

    const body = document.createElement('div');
    body.className = 'win98-msgbox__body';

    const statusMsg = document.createElement('p');
    statusMsg.className = 'win98-msgbox__msg';
    statusMsg.textContent = 'Deleting items...';
    body.appendChild(statusMsg);

    // Progress bar — Win98-style (outer track + inner fill)
    const track = document.createElement('div');
    track.style.cssText =
      'border:2px inset #808080;background:#FFFFFF;height:18px;' +
      'margin-top:8px;position:relative;';
    const fill = document.createElement('div');
    fill.style.cssText =
      'position:absolute;top:0;left:0;height:100%;width:0%;' +
      'background:#000080;transition:none;';
    track.appendChild(fill);
    body.appendChild(track);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animate fill from 0 → 100% over 2000–3000ms using small increments
    var t = window.APC.timing;
    var totalMs   = t.rand(t.RECYCLEBIN_EMPTY_MIN_MS, t.RECYCLEBIN_EMPTY_MAX_MS);
    var stepMs    = t.RECYCLEBIN_PROGRESS_STEP_MS;
    var steps     = Math.floor(totalMs / stepMs);
    var stepCount = 0;

    var progressTimer = setInterval(function () {
      stepCount++;
      var pct = Math.min(100, Math.round((stepCount / steps) * 100));
      fill.style.width = pct + '%';
      statusMsg.textContent = 'Deleting items... ' + pct + '%';

      if (pct >= 100) {
        clearInterval(progressTimer);
        // Phase 2: completion dialog after a brief pause
        setTimeout(function () {
          if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
          showRecycleBinComplete();
        }, 400);
      }
    }, stepMs);
  }

  function showRecycleBinComplete() {
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'rb-complete-title');

    const box = document.createElement('div');
    box.className = 'win98-msgbox';

    const tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.id = 'rb-complete-title';
    titleSpan.textContent = 'Recycle Bin';
    const ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    const xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    ctrls.appendChild(xBtn);
    tb.appendChild(titleSpan);
    tb.appendChild(ctrls);
    box.appendChild(tb);

    const body = document.createElement('div');
    body.className = 'win98-msgbox__body';
    const msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    msg.textContent = 'You have successfully deleted nothing. Have a great day.';
    const okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(msg);
    body.appendChild(okBtn);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function dismiss() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    }
    const onKey = function (e) { if (e.key === 'Escape') { dismiss(); } };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', dismiss);
    okBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { dismiss(); } });
    okBtn.focus();
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
    document.body.style.cursor = 'wait';

    var t = window.APC.timing;
    appLaunching['my-computer'] = setTimeout(function () {
      delete appLaunching['my-computer'];
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

    document.body.style.cursor = 'wait';

    // Store timer ID so reset() can cancel in-flight launches.
    appLaunching[app] = setTimeout(function () {
      delete appLaunching[app];
      document.body.style.cursor = '';
      window.APC.apps[app].open();
      if (willFail) {
        // Defer by one tick so open()'s DOM work completes before
        // findWindowByApp() runs inside applyNotResponding/applyFlicker.
        setTimeout(function () {
          if (cfg.failType === 'not-responding') { applyNotResponding(app); }
          else if (cfg.failType === 'flicker')   { applyFlicker(app); }
        }, 0);
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
    contentEl.style.height = (totalH - TITLEBAR_H - 4) + 'px';
  }

  // --- Dragging --------------------------------------------------------

  function makeDraggable(winEl, barEl) {
    if (!barEl) { return; }

    barEl.addEventListener('mousedown', function (e) {
      if (e.button !== 0) { return; }
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
        const newLeft = Math.max(-(winEl.offsetWidth - 40), Math.min(window.innerWidth - 40, startLeft + dx));
        const newTop  = Math.max(0, Math.min(window.innerHeight - TASKBAR_HEIGHT - 18, startTop + dy));
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
      let newW = startW, newH = startH, newLeft = startLeft, newTop = startTop;
      if (dir === 'e' || dir === 'ne' || dir === 'se') { newW = Math.max(WIN_MIN_WIDTH, startW + dx); }
      if (dir === 'w' || dir === 'nw' || dir === 'sw') { const d = Math.min(dx, startW - WIN_MIN_WIDTH); newW = startW - d; newLeft = startLeft + d; }
      if (dir === 's' || dir === 'se' || dir === 'sw') { newH = Math.max(WIN_MIN_HEIGHT, startH + dy); }
      if (dir === 'n' || dir === 'ne' || dir === 'nw') { const d = Math.min(dy, startH - WIN_MIN_HEIGHT); newH = startH - d; newTop = startTop + d; }
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
    Object.keys(windows).forEach(function (id) { windows[id].el.classList.add('win98-window--inactive'); });
    winEl.classList.remove('win98-window--inactive');
    if (windows[winEl.id]) { activeWindowId = winEl.id; }
  }

  // --- Titlebar keyboard movement (WCAG 2.1 AA) ------------------------

  function onTitlebarKeyDown(e, winEl) {
    const STEP = 8;
    const moves = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
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
      if (state.minimized) { restoreWindow(state); }
      else if (state.id === activeWindowId) { minimizeWindow(state); }
      else { bringToFront(state.el); state.el.style.display = ''; state.minimized = false; }
    });
    container.appendChild(btn);
    state.taskbarBtn = btn;
  }

  function removeTaskbarButton(state) {
    if (state.taskbarBtn && state.taskbarBtn.parentNode) { state.taskbarBtn.parentNode.removeChild(state.taskbarBtn); }
    state.taskbarBtn = null;
  }

  // --- Window actions --------------------------------------------------

  function minimizeWindow(state) {
    state.el.style.display = 'none';
    state.minimized = true;
    if (state.taskbarBtn) { state.taskbarBtn.classList.remove('taskbar-btn--active'); state.taskbarBtn.classList.add('taskbar-btn--minimized'); }
    if (activeWindowId === state.id) { activeWindowId = null; }
    focusTopWindow();
  }

  function restoreWindow(state) {
    state.el.style.display = '';
    state.minimized = false;
    if (state.taskbarBtn) { state.taskbarBtn.classList.remove('taskbar-btn--minimized'); state.taskbarBtn.classList.add('taskbar-btn--active'); }
    bringToFront(state.el);
  }

  function maximizeWindow(state) {
    if (state.maximized) {
      if (state.savedGeom) {
        state.el.style.left   = state.savedGeom.left;
        state.el.style.top    = state.savedGeom.top;
        state.el.style.width  = state.savedGeom.width;
        state.el.style.height = state.savedGeom.height;
        updateContentHeight(state.el, parseInt(state.savedGeom.height, 10));
      }
      state.maximized = false; state.savedGeom = null;
    } else {
      state.savedGeom = { left: state.el.style.left, top: state.el.style.top, width: state.el.style.width, height: state.el.style.height };
      const maxH = window.innerHeight - TASKBAR_HEIGHT;
      state.el.style.left = '0px'; state.el.style.top = '0px';
      state.el.style.width = window.innerWidth + 'px'; state.el.style.height = maxH + 'px';
      updateContentHeight(state.el, maxH);
      state.maximized = true;
    }
    bringToFront(state.el);
  }

  function closeWindow(state) {
    if (state.el.parentNode) { state.el.parentNode.removeChild(state.el); }
    removeTaskbarButton(state);
    if (activeWindowId === state.id) { activeWindowId = null; }
    delete windows[state.id];
    focusTopWindow();
  }

  function focusTopWindow() {
    let topZ = -1, topState = null;
    Object.keys(windows).forEach(function (id) {
      const s = windows[id];
      if (!s.minimized) { const z = parseInt(s.el.style.zIndex, 10) || 0; if (z > topZ) { topZ = z; topState = s; } }
    });
    if (topState) { bringToFront(topState.el); }
  }

  // --- Context menu -------------------------------------------------------

  function bindContextMenu() {
    const desktopEl = document.getElementById('desktop');
    if (!desktopEl) { return; }
    desktopEl.addEventListener('contextmenu', function (e) {
      let t = e.target;
      while (t && t !== desktopEl) {
        if (t.classList && (t.classList.contains('win98-window') || t.classList.contains('desktop-icon') || t.id === 'taskbar' || t.id === 'start-menu')) { return; }
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
      if (item.sep) { const sep = document.createElement('div'); sep.className = 'desktop-context-menu__sep'; menu.appendChild(sep); return; }
      const btn = document.createElement('button');
      btn.className = 'desktop-context-menu__item';
      btn.textContent = item.label;
      (function (action) { btn.addEventListener('click', function () { hideContextMenu(); action(); }); }(item.action));
      menu.appendChild(btn);
    });
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    document.body.appendChild(menu);
    contextMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (x + rect.width > vw) { x = vw - rect.width - 4; }
    if (y + rect.height > vh) { y = vh - rect.height - 4; }
    if (x < 0) { x = 0; } if (y < 0) { y = 0; }
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const onDocClick = function (e) { if (contextMenuEl && !contextMenuEl.contains(e.target)) { hideContextMenu(); } };
    const onDocKey = function (e) { if (e.key === 'Escape') { hideContextMenu(); } };
    setTimeout(function () { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onDocKey); }, 0);
    menu._dismissClick = onDocClick; menu._dismissKey = onDocKey;
    const first = menu.querySelector('.desktop-context-menu__item');
    if (first) { first.focus(); }
  }

  function showIconContextMenu(x, y, icon) {
    hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'desktop-context-menu';
    const items = [
      { label: 'Open',       action: function () { openIconApp(icon.dataset.app); } },
      { sep: true },
      { label: 'Properties', action: openSystemProperties }
    ];
    items.forEach(function (item) {
      if (item.sep) { const sep = document.createElement('div'); sep.className = 'desktop-context-menu__sep'; menu.appendChild(sep); return; }
      const btn = document.createElement('button');
      btn.className = 'desktop-context-menu__item';
      btn.textContent = item.label;
      (function (action) { btn.addEventListener('click', function () { hideContextMenu(); action(); }); }(item.action));
      menu.appendChild(btn);
    });
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    document.body.appendChild(menu);
    contextMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (x + rect.width > vw) { x = vw - rect.width - 4; }
    if (y + rect.height > vh) { y = vh - rect.height - 4; }
    if (x < 0) { x = 0; } if (y < 0) { y = 0; }
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const onDocClick = function (e) { if (contextMenuEl && !contextMenuEl.contains(e.target)) { hideContextMenu(); } };
    const onDocKey = function (e) { if (e.key === 'Escape') { hideContextMenu(); } };
    setTimeout(function () { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onDocKey); }, 0);
    menu._dismissClick = onDocClick; menu._dismissKey = onDocKey;
    const first = menu.querySelector('.desktop-context-menu__item');
    if (first) { first.focus(); }
  }

  function hideContextMenu() {
    if (!contextMenuEl) { return; }
    if (contextMenuEl._dismissClick) { document.removeEventListener('click', contextMenuEl._dismissClick); }
    if (contextMenuEl._dismissKey)   { document.removeEventListener('keydown', contextMenuEl._dismissKey); }
    if (contextMenuEl.parentNode) { contextMenuEl.parentNode.removeChild(contextMenuEl); }
    contextMenuEl = null;
  }

  // --- Arrange Icons dialog -----------------------------------------------

  function showArrangeIconsDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    const box = document.createElement('div');
    box.className = 'win98-msgbox';
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
    ctrls.appendChild(xBtn); tb.appendChild(titleSpan); tb.appendChild(ctrls);
    const body = document.createElement('div');
    body.className = 'win98-msgbox__body';
    const msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    msg.textContent = 'Icons arranged successfully.';
    const okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(msg); body.appendChild(okBtn);
    box.appendChild(tb); box.appendChild(body);
    overlay.appendChild(box); document.body.appendChild(overlay);
    const closeOverlay = function () { if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); } document.removeEventListener('keydown', onKey); };
    const onKey = function (e) { if (e.key === 'Escape') { closeOverlay(); } };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', closeOverlay);
    okBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) { closeOverlay(); } });
    okBtn.focus();
  }

  // --- Wallpaper cycling --------------------------------------------------

  function cycleWallpaper() {
    const desktopEl = document.getElementById('desktop');
    if (!desktopEl) { return; }
    if (WALLPAPER_CLASSES[wallpaperIndex]) { desktopEl.classList.remove(WALLPAPER_CLASSES[wallpaperIndex]); }
    wallpaperIndex = (wallpaperIndex + 1) % WALLPAPER_CLASSES.length;
    if (WALLPAPER_CLASSES[wallpaperIndex]) { desktopEl.classList.add(WALLPAPER_CLASSES[wallpaperIndex]); }
  }

  // --- System Properties window -------------------------------------------

  function openSystemProperties() {
    if (syspropsState) {
      if (syspropsState.minimized) { restoreWindow(syspropsState); }
      else { bringToFront(syspropsState.el); }
      return;
    }
    const state = createWindow({ title: 'System Properties', width: 480, height: 420 });
    state.el.classList.add('win98-window--sysprops');
    syspropsState = state;
    const closeBtn = state.el.querySelector('[data-action="close"]');
    if (closeBtn) { closeBtn.addEventListener('click', function () { syspropsState = null; }); }
    if (window.APC.systemProperties && window.APC.systemProperties.buildContent) {
      state.contentEl.classList.add('sysprops-content-area');
      window.APC.systemProperties.buildContent(state.contentEl, function () { closeWindow(state); syspropsState = null; });
    }
    state.show();
  }

  // --- Close all windows -----------------------------------------------

  function closeAll() {
    var ids = Object.keys(windows);
    ids.forEach(function (id) { if (windows[id]) { closeWindow(windows[id]); } });
    syspropsState = null;
  }

  // --- Screensaver idle timer -------------------------------------------

  function startIdleTimer() {
    var t = window.APC.timing;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      idleTimer = null;
      var desktopEl = document.getElementById('desktop');
      if (desktopEl && desktopEl.classList.contains('desktop--hidden')) { return; }
      if (window.APC.apps && window.APC.apps.screensaver) { window.APC.apps.screensaver.start(startIdleTimer); }
    }, t.SCREENSAVER_IDLE_MS);
  }

  // --- Module reset (called by boot.restart()) -------------------------

  function reset() {
    Object.keys(windows).forEach(function (id) { delete windows[id]; });
    Object.keys(iconLastClick).forEach(function (k) { delete iconLastClick[k]; });
    Object.keys(appLaunching).forEach(function (k) { clearTimeout(appLaunching[k]); delete appLaunching[k]; });
    // Cancel all pending icon hint timers before clearing state.
    Object.keys(iconHintTimers).forEach(function (k) {
      if (iconHintTimers[k]) { clearTimeout(iconHintTimers[k].show); clearTimeout(iconHintTimers[k].hide); }
      delete iconHintTimers[k];
    });
    clearTimeout(idleTimer);
    idleTimer = null;
    if (window.APC.apps && window.APC.apps.screensaver) { window.APC.apps.screensaver.stop(); }
    zCounter = 100; winIdCounter = 0; activeWindowId = null; syspropsState = null;
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


// =============================================
// Desktop Icon Dragging
// Feature spec: Feature 1 — Desktop Icon Dragging
// =============================================

(function initIconDrag() {
  const GRID_W = 80;
  const GRID_H = 80;
  const STORAGE_KEY = 'desktop_icon_positions';

  function getThreshold() {
    return (window.APC && window.APC.timing && typeof window.APC.timing.ICON_DRAG_THRESHOLD_PX === 'number')
      ? window.APC.timing.ICON_DRAG_THRESHOLD_PX
      : 5;
  }

  function getDesktopEl() {
    return document.getElementById('desktop') || document.querySelector('.desktop');
  }

  function getTaskbarHeight() {
    const tb = document.getElementById('taskbar') || document.querySelector('.taskbar');
    return tb ? tb.offsetHeight : 40;
  }

  function getGridDimensions() {
    const d = getDesktopEl();
    if (!d) return { cols: 10, rows: 10 };
    const tbh = getTaskbarHeight();
    return {
      cols: Math.floor(d.offsetWidth / GRID_W),
      rows: Math.floor((d.offsetHeight - tbh) / GRID_H)
    };
  }

  function getAllIcons() {
    const d = getDesktopEl();
    if (!d) return [];
    return Array.from(d.querySelectorAll('.desktop-icon'));
  }

  function loadPositions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function savePositions(positions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (e) {}
  }

  function applyGridPosition(icon, gridX, gridY) {
    const tbh = getTaskbarHeight();
    icon.style.position = 'absolute';
    icon.style.left = (gridX * GRID_W) + 'px';
    icon.style.top = (gridY * GRID_H + tbh) + 'px';
    icon.dataset.gridX = gridX;
    icon.dataset.gridY = gridY;
  }

  function getOccupied(excludeIcon) {
    const occupied = new Set();
    getAllIcons().forEach(ic => {
      if (ic === excludeIcon) return;
      const x = parseInt(ic.dataset.gridX, 10);
      const y = parseInt(ic.dataset.gridY, 10);
      if (!isNaN(x) && !isNaN(y)) occupied.add(x + ',' + y);
    });
    return occupied;
  }

  function nearestFreeCell(preferX, preferY, excludeIcon) {
    const occupied = getOccupied(excludeIcon);
    const { cols, rows } = getGridDimensions();

    // Clamp preferred position to grid bounds
    preferX = Math.max(0, Math.min(cols - 1, preferX));
    preferY = Math.max(0, Math.min(rows - 1, preferY));

    if (!occupied.has(preferX + ',' + preferY)) {
      return { gridX: preferX, gridY: preferY };
    }

    // Scan right then down from preferred position
    for (let y = preferY; y < rows; y++) {
      const startX = (y === preferY) ? preferX : 0;
      for (let x = startX; x < cols; x++) {
        if (!occupied.has(x + ',' + y)) {
          return { gridX: x, gridY: y };
        }
      }
    }

    // Fallback — scan from origin
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!occupied.has(x + ',' + y)) {
          return { gridX: x, gridY: y };
        }
      }
    }

    return { gridX: preferX, gridY: preferY };
  }

  function setDefaultLayout() {
    const icons = getAllIcons();
    const occupied = new Set();
    const { rows } = getGridDimensions();
    let col = 0, row = 0;

    icons.forEach(icon => {
      while (occupied.has(col + ',' + row)) {
        row++;
        if (row >= rows) { row = 0; col++; }
      }
      applyGridPosition(icon, col, row);
      occupied.add(col + ',' + row);
      row++;
      if (row >= rows) { row = 0; col++; }
    });
  }

  function restoreLayout() {
    const positions = loadPositions();
    const icons = getAllIcons();
    let anyRestored = false;

    icons.forEach(icon => {
      const id = icon.dataset.app || icon.id;
      if (id && positions[id]) {
        applyGridPosition(icon, positions[id].gridX, positions[id].gridY);
        anyRestored = true;
      }
    });

    if (!anyRestored) setDefaultLayout();
  }

  function attachDrag(icon) {
    let startMouseX = 0, startMouseY = 0;
    let startLeft = 0, startTop = 0;
    let dragging = false;
    let dragStarted = false;
    let placeholder = null;

    function onMouseDown(e) {
      if (e.button !== 0) return;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      const rect = icon.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      dragging = true;
      dragStarted = false;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;

      if (!dragStarted) {
        if (Math.abs(dx) < getThreshold() && Math.abs(dy) < getThreshold()) return;
        dragStarted = true;

        // Cancel any hint timer — drag suppresses hint
        if (typeof hideIconHint === 'function') hideIconHint();

        // Show ghost placeholder at original position
        placeholder = document.createElement('div');
        placeholder.className = 'desktop-icon--drag-placeholder';
        placeholder.style.left = (parseInt(icon.dataset.gridX, 10) * GRID_W) + 'px';
        placeholder.style.top = (parseInt(icon.dataset.gridY, 10) * GRID_H + getTaskbarHeight()) + 'px';
        getDesktopEl().appendChild(placeholder);

        icon.classList.add('desktop-icon--dragging');
        document.body.style.cursor = 'move';
      }

      icon.style.left = (startLeft + dx) + 'px';
      icon.style.top = (startTop + dy) + 'px';
    }

    function onMouseUp(e) {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (!dragStarted) {
        dragging = false;
        return;
      }

      dragging = false;
      dragStarted = false;

      // Remove placeholder and dragging class
      if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
      icon.classList.remove('desktop-icon--dragging');
      document.body.style.cursor = '';

      // Calculate grid cell from drop position
      const tbh = getTaskbarHeight();
      const dropX = parseInt(icon.style.left, 10);
      const dropY = parseInt(icon.style.top, 10) - tbh;
      const preferX = Math.round(dropX / GRID_W);
      const preferY = Math.round(dropY / GRID_H);

      const { gridX, gridY } = nearestFreeCell(preferX, preferY, icon);
      applyGridPosition(icon, gridX, gridY);

      // Persist
      const positions = loadPositions();
      const id = icon.dataset.app || icon.id;
      if (id) positions[id] = { gridX, gridY };
      savePositions(positions);

      // Umami analytics
      if (window.umami) {
        window.umami.track('desktop_icon_drag', { icon: id, gridX, gridY });
      }
    }

    icon.addEventListener('mousedown', onMouseDown);
  }

  // Init on DOMContentLoaded or immediately if already loaded
  function init() {
    restoreLayout();
    getAllIcons().forEach(attachDrag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Desktop may render icons after boot — wait for desktop:ready or fallback to timeout
    if (typeof window.APC !== 'undefined' && window.APC.desktop) {
      init();
    } else {
      document.addEventListener('desktop:ready', init);
      setTimeout(init, 3000); // safety net
    }
  }
})();
