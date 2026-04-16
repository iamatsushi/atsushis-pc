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
  const CLOCK_INTERVAL_MS = 1000;
  const TITLEBAR_H = 22;    // titlebar height (18) + padding top (2) + padding bottom (2)
  const DBLCLICK_MS = 400;  // manual double-click detection window in ms

  // --- Module state ----------------------------------------------------

  let zCounter = 100;
  let winIdCounter = 0;
  let activeWindowId = null;
  const windows = {};             // id → window state object
  const iconLastClick = {};       // app → timestamp of last click

  // --- Public API ------------------------------------------------------

  function init() {
    startClock();
    bindDesktopIcons();
    bindStartButton();
  }

  // --- Clock -----------------------------------------------------------

  function startClock() {
    renderClock();
    setInterval(renderClock, CLOCK_INTERVAL_MS);
  }

  function renderClock() {
    const el = document.getElementById('taskbar-clock');
    if (!el) { return; }
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) { h = 12; }
    const mm = m < 10 ? '0' + m : '' + m;
    el.textContent = h + ':' + mm + ' ' + ampm;
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
    } else if (app === 'ie') {
      openIE();
    } else if (app === 'resume-exe') {
      openResumeExe();
    } else if (app === 'dialup') {
      openDialupNetworking();
    }
  }

  function openDialupNetworking() {
    // Trigger the dial-up sequence via ie.js. No IE window is opened —
    // connecting is a separate step from browsing, per Win98 behavior.
    if (window.APC.ie && typeof window.APC.ie.connect === 'function') {
      window.APC.ie.connect();
    }
  }

  function openResumeExe() {
    // Open IE (or focus it if already open) and navigate to guestbook?resume=1.
    // ie.js open(targetUrl) handles both cases: new window and already-open window.
    if (window.APC.ie && typeof window.APC.ie.open === 'function') {
      window.APC.ie.open('ahisaka.com/guestbook?resume=1');
    }
  }

  function openMyComputer() {
    const existing = findWindowByApp('my-computer');
    if (existing) {
      if (existing.minimized) { restoreWindow(existing); }
      else { bringToFront(existing.el); }
      return;
    }

    const state = createWindow({
      title: 'My Computer',
      app: 'my-computer',
      width: 400,
      height: 280,
      x: 60,
      y: 50
    });

    const msg = document.createElement('p');
    msg.style.padding = '8px';
    msg.style.fontFamily = '\'MS Sans Serif\', Tahoma, sans-serif';
    msg.style.fontSize = '11px';
    msg.textContent = 'My Computer';
    state.contentEl.appendChild(msg);

    state.show();
  }

  function openIE() {
    // Delegate to ie.js if loaded; otherwise open a stub window
    if (window.APC.ie && typeof window.APC.ie.open === 'function') {
      window.APC.ie.open();
      return;
    }

    const existing = findWindowByApp('ie');
    if (existing) {
      if (existing.minimized) { restoreWindow(existing); }
      else { bringToFront(existing.el); }
      return;
    }

    const state = createWindow({
      title: 'Internet Explorer',
      app: 'ie',
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

  // --- Public exports --------------------------------------------------

  return { init: init, createWindow: createWindow };

}());
