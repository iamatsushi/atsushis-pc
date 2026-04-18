// taskbar.js — WinDoors 98 Start Menu
// DOM built ONCE in init(), toggled on Start button click.
// All delay values from window.APC.timing (win98-timing.js).
// Submenus: Programs (app launcher), Documents (recent NetEscape history).
// Keyboard: ArrowUp/Down moves items, Right opens submenu immediately,
//           Left / Escape closes submenu / menu, Enter / Space activates item.
// Namespaced under window.APC per project conventions.

window.APC = window.APC || {};

window.APC.taskbar = (function () {
  'use strict';

  // --- Module state ----------------------------------------------------

  var startBtn = null;
  var menuEl = null;

  // Per-key open and close timer IDs for submenu hover behaviour.
  var submenuOpenTimers  = {};
  var submenuCloseTimers = {};

  // Currently visible submenu element (null if none open).
  var openSubmenuEl  = null;
  var openSubmenuKey = null;

  // --- Public API ------------------------------------------------------

  function init() {
    startBtn = document.getElementById('start-button');
    menuEl   = document.getElementById('start-menu');
    if (!startBtn || !menuEl) { return; }

    buildMenu();
    bindStartButton();
    bindOutsideClick();
    bindBeforeUnload();
  }

  // --- Build menu DOM (runs exactly once on init) ----------------------

  function buildMenu() {
    menuEl.innerHTML = '';

    // Left gradient banner — "WinDoors 98" vertical text.
    var banner = document.createElement('div');
    banner.className = 'start-menu__banner';
    banner.setAttribute('aria-hidden', 'true');
    var bannerText = document.createElement('span');
    bannerText.className = 'start-menu__banner-text';
    bannerText.textContent = 'WinDoors 98';
    banner.appendChild(bannerText);
    menuEl.appendChild(banner);

    // Items container — sits to the right of the banner.
    var itemsEl = document.createElement('div');
    itemsEl.className = 'start-menu__items';

    var itemDefs = [
      { key: 'programs',  label: 'Programs',  icon: '\uD83D\uDCC1', submenu: buildProgramsSubmenu  },
      { key: 'documents', label: 'Documents', icon: '\uD83D\uDCC4', submenu: buildDocumentsSubmenu },
      { key: 'settings',  label: 'Settings',  icon: '\u2699\uFE0F', disabled: true },
      { key: 'find',      label: 'Find',       icon: '\uD83D\uDD0D', disabled: true },
      { key: 'help',      label: 'Help',       icon: '\u2753',        action: showHelpStub },
      { key: 'run',       label: 'Run\u2026',  icon: '\u25BA',        action: showRunStub },
      { sep: true },
      { key: 'shutdown',  label: 'Shut Down\u2026', icon: '\uD83D\uDD0C', action: showShutdownModal }
    ];

    itemDefs.forEach(function (def) {
      if (def.sep) {
        var sep = document.createElement('div');
        sep.className = 'start-menu__separator';
        sep.setAttribute('role', 'separator');
        itemsEl.appendChild(sep);
        return;
      }
      itemsEl.appendChild(buildMenuItem(def));
    });

    menuEl.appendChild(itemsEl);
    setupMenuKeyboard(itemsEl);
  }

  // Builds a single top-level menu item element.
  function buildMenuItem(def) {
    var el = document.createElement('div');
    el.className = 'start-menu__item' +
      (def.disabled ? ' start-menu__item--disabled' : '');
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', def.disabled ? '-1' : '0');
    el.dataset.key = def.key;
    if (def.disabled) { el.setAttribute('aria-disabled', 'true'); }

    var iconSpan = document.createElement('span');
    iconSpan.className = 'start-menu__item-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = def.icon || '';
    el.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'start-menu__item-label';
    labelSpan.textContent = def.label;
    el.appendChild(labelSpan);

    if (def.submenu) {
      // ► arrow indicator
      var arrowSpan = document.createElement('span');
      arrowSpan.className = 'start-menu__item-arrow';
      arrowSpan.setAttribute('aria-hidden', 'true');
      arrowSpan.textContent = '\u25BA';
      el.appendChild(arrowSpan);

      el.setAttribute('aria-haspopup', 'menu');
      el.setAttribute('aria-expanded', 'false');

      var submenuEl = def.submenu();
      submenuEl.dataset.parentKey = def.key;
      el.appendChild(submenuEl);

      attachSubmenuHover(def.key, el, submenuEl);

    } else if (!def.disabled && def.action) {
      el.addEventListener('click', function () {
        var t = window.APC.timing;
        setTimeout(function () {
          closeMenu();
          def.action();
        }, t.rand(t.MENU_ACTION_MIN_MS, t.MENU_ACTION_MAX_MS));
      });

      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    } else if (def.disabled) {
      // Hovering over disabled item closes any open submenu
      el.addEventListener('mouseenter', closeAllSubmenus);
    }

    // All non-submenu items close open submenus on hover
    if (!def.submenu) {
      el.addEventListener('mouseenter', closeAllSubmenus);
    }

    return el;
  }

  // --- Submenu hover timing --------------------------------------------
  // Mouse hover uses MENU_SUBMENU_MIN/MAX_MS delay to open,
  // SUBMENU_CLOSE_DELAY_MS delay to close (cancelled on mouse re-entry).
  // Keyboard Right arrow opens immediately (no delay) — see setupMenuKeyboard.

  function attachSubmenuHover(key, itemEl, submenuEl) {
    itemEl.addEventListener('mouseenter', function () {
      cancelSubmenuClose(key);
      scheduleSubmenuOpen(key, itemEl, submenuEl);
    });
    itemEl.addEventListener('mouseleave', function () {
      cancelSubmenuOpen(key);
      scheduleSubmenuClose(key, itemEl, submenuEl);
    });
    // Keep submenu open while mouse is over it — cancel the close timer.
    submenuEl.addEventListener('mouseenter', function () {
      cancelSubmenuClose(key);
    });
    submenuEl.addEventListener('mouseleave', function () {
      scheduleSubmenuClose(key, itemEl, submenuEl);
    });
  }

  function scheduleSubmenuOpen(key, itemEl, submenuEl) {
    var t = window.APC.timing;
    submenuOpenTimers[key] = setTimeout(function () {
      delete submenuOpenTimers[key];
      openSubmenu(key, itemEl, submenuEl);
    }, t.rand(t.MENU_SUBMENU_MIN_MS, t.MENU_SUBMENU_MAX_MS));
  }

  function cancelSubmenuOpen(key) {
    if (submenuOpenTimers[key]) {
      clearTimeout(submenuOpenTimers[key]);
      delete submenuOpenTimers[key];
    }
  }

  function scheduleSubmenuClose(key, itemEl, submenuEl) {
    var t = window.APC.timing;
    submenuCloseTimers[key] = setTimeout(function () {
      delete submenuCloseTimers[key];
      closeSubmenu(key, itemEl, submenuEl);
    }, t.SUBMENU_CLOSE_DELAY_MS);
  }

  function cancelSubmenuClose(key) {
    if (submenuCloseTimers[key]) {
      clearTimeout(submenuCloseTimers[key]);
      delete submenuCloseTimers[key];
    }
  }

  function openSubmenu(key, itemEl, submenuEl) {
    // Documents submenu is populated just-in-time from sessionStorage.
    if (submenuEl.dataset.dynamic === 'documents') {
      populateDocumentsSubmenu(submenuEl);
    }

    // Close any other open submenu first.
    if (openSubmenuEl && openSubmenuEl !== submenuEl) {
      var prevKey = openSubmenuKey;
      var prevItem = menuEl.querySelector('[data-key="' + prevKey + '"]');
      if (prevItem) { closeSubmenu(prevKey, prevItem, openSubmenuEl); }
    }

    submenuEl.classList.add('start-menu__submenu--open');
    itemEl.setAttribute('aria-expanded', 'true');
    itemEl.classList.add('start-menu__item--open');
    openSubmenuEl  = submenuEl;
    openSubmenuKey = key;
  }

  function closeSubmenu(key, itemEl, submenuEl) {
    submenuEl.classList.remove('start-menu__submenu--open');
    if (itemEl) {
      itemEl.setAttribute('aria-expanded', 'false');
      itemEl.classList.remove('start-menu__item--open');
    }
    if (openSubmenuEl === submenuEl) {
      openSubmenuEl  = null;
      openSubmenuKey = null;
    }
  }

  function closeAllSubmenus() {
    // Cancel all pending open timers.
    Object.keys(submenuOpenTimers).forEach(function (k) {
      clearTimeout(submenuOpenTimers[k]);
      delete submenuOpenTimers[k];
    });
    // Close the currently visible submenu immediately.
    if (openSubmenuEl && openSubmenuKey) {
      var itemEl = menuEl.querySelector('[data-key="' + openSubmenuKey + '"]');
      closeSubmenu(openSubmenuKey, itemEl, openSubmenuEl);
    }
  }

  // --- Programs submenu -----------------------------------------------
  // Programs only contains a single cascade item: Accessories ►
  // All apps live one level deeper: Programs ► → Accessories ► → apps.

  function buildProgramsSubmenu() {
    var sub = document.createElement('div');
    sub.className = 'start-menu__submenu';
    sub.setAttribute('role', 'menu');
    sub.setAttribute('aria-label', 'Programs');
    sub.appendChild(buildAccessoriesCascadeItem(sub));
    return sub;
  }

  // Builds the Accessories cascade item, including its own hover timers.
  // Hover discipline mirrors the top-level submenu pattern exactly:
  //   MENU_SUBMENU_MIN/MAX_MS delay on enter, SUBMENU_CLOSE_DELAY_MS on leave,
  //   clearTimeout on re-entry. Managed locally to avoid conflating with the
  //   global openSubmenuEl tracker (which is single-level).
  function buildAccessoriesCascadeItem(programsSub) {
    var accOpenTimer  = null;
    var accCloseTimer = null;

    var el = document.createElement('div');
    el.className = 'start-menu__submenu-item start-menu__submenu-item--has-submenu';
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-haspopup', 'menu');
    el.setAttribute('aria-expanded', 'false');
    el.dataset.key = 'accessories';

    var iconSpan = document.createElement('span');
    iconSpan.className = 'start-menu__item-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '\uD83D\uDCC1';
    el.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'start-menu__item-label';
    labelSpan.textContent = 'Accessories';
    el.appendChild(labelSpan);

    var arrowSpan = document.createElement('span');
    arrowSpan.className = 'start-menu__item-arrow';
    arrowSpan.setAttribute('aria-hidden', 'true');
    arrowSpan.textContent = '\u25BA';
    el.appendChild(arrowSpan);

    // openAcc/closeAcc are function declarations so they are hoisted and
    // available when passed to buildAccessoriesSubmenu below.
    function openAcc() {
      clearTimeout(accCloseTimer);
      accCloseTimer = null;
      accSub.classList.add('start-menu__submenu--open');
      el.setAttribute('aria-expanded', 'true');
      el.classList.add('start-menu__submenu-item--open');
    }

    function closeAcc() {
      clearTimeout(accOpenTimer);
      accOpenTimer  = null;
      clearTimeout(accCloseTimer);
      accCloseTimer = null;
      accSub.classList.remove('start-menu__submenu--open');
      el.setAttribute('aria-expanded', 'false');
      el.classList.remove('start-menu__submenu-item--open');
    }

    var accSub = buildAccessoriesSubmenu(closeAcc, el);
    el.appendChild(accSub);

    // Hover: same OPEN delay as top-level submenus.
    el.addEventListener('mouseenter', function () {
      clearTimeout(accCloseTimer);
      accCloseTimer = null;
      var t = window.APC.timing;
      accOpenTimer = setTimeout(function () {
        accOpenTimer = null;
        openAcc();
      }, t.rand(t.MENU_SUBMENU_MIN_MS, t.MENU_SUBMENU_MAX_MS));
    });

    el.addEventListener('mouseleave', function () {
      clearTimeout(accOpenTimer);
      accOpenTimer = null;
      var t = window.APC.timing;
      accCloseTimer = setTimeout(function () {
        accCloseTimer = null;
        closeAcc();
      }, t.SUBMENU_CLOSE_DELAY_MS);
    });

    // Keep Accessories open while mouse is over the sub-submenu.
    accSub.addEventListener('mouseenter', function () {
      clearTimeout(accCloseTimer);
      accCloseTimer = null;
    });

    accSub.addEventListener('mouseleave', function () {
      var t = window.APC.timing;
      accCloseTimer = setTimeout(function () {
        accCloseTimer = null;
        closeAcc();
      }, t.SUBMENU_CLOSE_DELAY_MS);
    });

    // Keyboard: ArrowRight opens immediately (no delay), ArrowLeft/Escape closes
    // and returns focus to the Programs top-level item.
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        openAcc();
        var first = accSub.querySelector(
          '.start-menu__submenu-item:not(.start-menu__submenu-item--has-submenu)' +
          ':not(.start-menu__submenu-item--empty)'
        );
        if (first) { first.focus(); }
      } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault();
        closeAcc();
        var programsEl = menuEl.querySelector('[data-key="programs"]');
        if (programsEl) { programsEl.focus(); }
      }
    });

    // Reset Accessories state when Programs submenu closes, so it does not
    // re-appear as stale-open on the next Programs hover.
    var mo = new MutationObserver(function () {
      if (!programsSub.classList.contains('start-menu__submenu--open')) {
        closeAcc();
      }
    });
    mo.observe(programsSub, { attributes: true, attributeFilter: ['class'] });

    return el;
  }

  // Builds the Accessories sub-submenu containing the four app items.
  // closeAcc / accEl are passed in so ArrowLeft on an app item can close
  // Accessories and return focus to the Accessories cascade item.
  function buildAccessoriesSubmenu(closeAcc, accEl) {
    var sub = document.createElement('div');
    sub.className = 'start-menu__submenu';
    sub.setAttribute('role', 'menu');
    sub.setAttribute('aria-label', 'Accessories');

    [
      { app: 'winamp',      icon: '\uD83C\uDFB5', label: 'Winamp'      },
      { app: 'calculator',  icon: '\uD83E\uDDF2', label: 'Calculator'  },
      { app: 'minesweeper', icon: '\uD83D\uDCA3', label: 'Minesweeper' },
      { app: 'notepad',     icon: '\uD83D\uDCDD', label: 'Notepad'     }
    ].forEach(function (def) {
      sub.appendChild(buildSubmenuItem(def.icon, def.label, function () {
        if (window.APC.desktop && typeof window.APC.desktop.launchApp === 'function') {
          window.APC.desktop.launchApp(def.app);
        }
      }, function () {
        // ArrowLeft/Escape from an Accessories app item: close Accessories
        // and return focus to the Accessories cascade item (not Programs).
        closeAcc();
        accEl.focus();
      }));
    });

    return sub;
  }

  // --- Documents submenu (populated just-in-time) ---------------------

  function buildDocumentsSubmenu() {
    var sub = document.createElement('div');
    sub.className = 'start-menu__submenu';
    sub.setAttribute('role', 'menu');
    sub.setAttribute('aria-label', 'Documents');
    sub.dataset.dynamic = 'documents'; // signals openSubmenu() to repopulate
    return sub;
  }

  function populateDocumentsSubmenu(sub) {
    sub.innerHTML = '';

    var hist = [];
    try {
      hist = JSON.parse(sessionStorage.getItem('ne_history') || '[]');
    } catch (e) {}

    if (!hist.length) {
      var empty = document.createElement('div');
      empty.className = 'start-menu__submenu-item start-menu__submenu-item--empty';
      empty.setAttribute('role', 'menuitem');
      empty.setAttribute('aria-disabled', 'true');
      empty.textContent = '(No recent documents)';
      sub.appendChild(empty);
      return;
    }

    hist.slice(0, 10).forEach(function (url) {
      sub.appendChild(buildSubmenuItem('\uD83C\uDF10', url, function () {
        // Null-check: netescape.open() handles creating the window if not open.
        if (window.APC.netescape && typeof window.APC.netescape.open === 'function') {
          window.APC.netescape.open(url);
        }
      }));
    });
  }

  // --- Submenu item helper --------------------------------------------

  // onBack (optional): called on ArrowLeft/Escape instead of the default
  // closeAllSubmenus() behaviour. Used by Accessories items to go back one
  // level instead of collapsing the entire menu stack.
  function buildSubmenuItem(icon, label, action, onBack) {
    var el = document.createElement('div');
    el.className = 'start-menu__submenu-item';
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', '0');

    var iconSpan = document.createElement('span');
    iconSpan.className = 'start-menu__item-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = icon;
    el.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'start-menu__item-label';
    labelSpan.textContent = label;
    el.appendChild(labelSpan);

    el.addEventListener('click', function () {
      var t = window.APC.timing;
      setTimeout(function () {
        closeMenu();
        action();
      }, t.rand(t.MENU_ACTION_MIN_MS, t.MENU_ACTION_MAX_MS));
    });

    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
      // Left arrow / Escape: go up one level. onBack overrides the default
      // so Accessories items return to the Accessories item, not Programs.
      if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault();
        if (onBack) {
          onBack();
        } else if (openSubmenuKey) {
          var parentEl = menuEl.querySelector('[data-key="' + openSubmenuKey + '"]');
          closeAllSubmenus();
          if (parentEl) { parentEl.focus(); }
        }
      }
    });

    return el;
  }

  // --- Start button binding -------------------------------------------

  function bindStartButton() {
    startBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menuEl.classList.contains('start-menu--open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    startBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!menuEl.classList.contains('start-menu--open')) {
          openMenu();
        }
        // Delay to let the open animation play, then focus first item.
        setTimeout(function () {
          var first = menuEl.querySelector(
            '.start-menu__item:not(.start-menu__item--disabled)'
          );
          if (first) { first.focus(); }
        }, window.APC.timing.MENU_OPEN_MAX_MS + 20);
      }
    });
  }

  function openMenu() {
    var t = window.APC.timing;
    var delay    = t.rand(t.MENU_OPEN_MIN_MS, t.MENU_OPEN_MAX_MS);
    var willFlicker = Math.random() < t.MENU_FLICKER_CHANCE;

    if (willFlicker) {
      // Menu flickers open then immediately closes — user must click again.
      menuEl.classList.add('start-menu--open');
      startBtn.setAttribute('aria-expanded', 'true');
      setTimeout(function () {
        menuEl.classList.remove('start-menu--open');
        startBtn.setAttribute('aria-expanded', 'false');
      }, delay);
      return;
    }

    setTimeout(function () {
      menuEl.classList.add('start-menu--open');
      startBtn.setAttribute('aria-expanded', 'true');
    }, delay);
  }

  function closeMenu() {
    menuEl.classList.remove('start-menu--open');
    startBtn.setAttribute('aria-expanded', 'false');
    closeAllSubmenus();
    // Cancel any lingering close timers too.
    Object.keys(submenuCloseTimers).forEach(function (k) {
      clearTimeout(submenuCloseTimers[k]);
      delete submenuCloseTimers[k];
    });
  }

  // --- Outside-click and keyboard dismiss -----------------------------

  function bindOutsideClick() {
    document.addEventListener('click', function (e) {
      if (menuEl.classList.contains('start-menu--open') &&
          !menuEl.contains(e.target) && e.target !== startBtn) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuEl.classList.contains('start-menu--open')) {
        closeMenu();
        startBtn.focus();
      }
    });
  }

  // --- Keyboard navigation within the menu ---------------------------

  function setupMenuKeyboard(itemsEl) {
    itemsEl.addEventListener('keydown', function (e) {
      var focusable = Array.prototype.slice.call(
        itemsEl.querySelectorAll(
          '.start-menu__item:not(.start-menu__item--disabled)'
        )
      );
      var focused = document.activeElement;
      var idx = focusable.indexOf(focused);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var next = focusable[(idx + 1) % focusable.length];
        if (next) { next.focus(); }

      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = focusable[(idx - 1 + focusable.length) % focusable.length];
        if (prev) { prev.focus(); }

      } else if (e.key === 'ArrowRight') {
        // Open submenu immediately — no delay for keyboard (mouse uses timer).
        if (focused && focused.dataset.key) {
          var subEl = focused.querySelector('.start-menu__submenu');
          if (subEl) {
            e.preventDefault();
            openSubmenu(focused.dataset.key, focused, subEl);
            var firstSubItem = subEl.querySelector('.start-menu__submenu-item:not(.start-menu__submenu-item--empty)');
            if (firstSubItem) { firstSubItem.focus(); }
          }
        }

      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        closeAllSubmenus();

      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focused) {
          e.preventDefault();
          focused.click();
        }
      }
    });
  }

  // --- Stub dialogs ---------------------------------------------------

  function showHelpStub() {
    showSimpleDialog('Windows Help',
      'Windows Help is not available on this computer.');
  }

  function showRunStub() {
    showSimpleDialog('Run',
      'Type the name of a program, folder, or document,\n' +
      'and Windows will open it for you.\n\n' +
      '(This feature is not available.)');
  }

  // Reusable Win98-style message box: title + message + OK.
  function showSimpleDialog(title, message) {
    var overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'simple-dialog-title');

    var box = document.createElement('div');
    box.className = 'win98-msgbox';

    var tb = buildTitlebar(title, 'simple-dialog-title', function () { dismiss(); });
    box.appendChild(tb);

    var body = document.createElement('div');
    body.className = 'win98-msgbox__body';

    var msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    // Preserve newlines as <br> — safe because textContent is used per segment.
    message.split('\n').forEach(function (line, i) {
      if (i > 0) { msg.appendChild(document.createElement('br')); }
      msg.appendChild(document.createTextNode(line));
    });
    body.appendChild(msg);

    var okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(okBtn);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function dismiss() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    }

    var onKey = function (e) { if (e.key === 'Escape') { dismiss(); } };
    document.addEventListener('keydown', onKey);
    okBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { dismiss(); }
    });

    // Focus trap: only OK button + title close button to cycle.
    trapFocusWithin(overlay);
    okBtn.focus();
  }

  // --- Shutdown modal -------------------------------------------------

  function showShutdownModal() {
    var overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shutdown-dialog-title');

    var box = document.createElement('div');
    box.className = 'win98-msgbox win98-msgbox--shutdown';

    var tb = buildTitlebar(
      'Shut Down WinDoors 98',
      'shutdown-dialog-title',
      function () { dismiss(); }
    );
    box.appendChild(tb);

    var body = document.createElement('div');
    body.className = 'win98-msgbox__body';

    // Computer icon + prompt
    var prompt = document.createElement('table');
    prompt.className = 'shutdown-prompt';
    prompt.setAttribute('cellpadding', '0');
    prompt.setAttribute('cellspacing', '0');
    var ptbody = document.createElement('tbody');
    var ptr = document.createElement('tr');
    var iconTd = document.createElement('td');
    iconTd.className = 'shutdown-prompt__icon';
    var iconEl = document.createElement('span');
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = '\uD83D\uDCBB';  // 💻
    iconTd.appendChild(iconEl);
    var textTd = document.createElement('td');
    textTd.className = 'shutdown-prompt__text';
    textTd.textContent = 'What do you want the computer to do?';
    ptr.appendChild(iconTd);
    ptr.appendChild(textTd);
    ptbody.appendChild(ptr);
    prompt.appendChild(ptbody);
    body.appendChild(prompt);

    // Radio options
    var options = [
      { value: 'shutdown', label: 'Shut down'  },
      { value: 'restart',  label: 'Restart'    },
      { value: 'logoff',   label: 'Log Off'    }
    ];

    var radiosEl = document.createElement('div');
    radiosEl.className = 'shutdown-radios';
    var selectedValue = 'shutdown';

    options.forEach(function (opt, i) {
      var row = document.createElement('div');
      row.className = 'shutdown-radio-row';

      var radio = document.createElement('input');
      radio.type  = 'radio';
      radio.name  = 'shutdown-option';
      radio.id    = 'shutdown-opt-' + opt.value;
      radio.value = opt.value;
      radio.className = 'shutdown-radio';
      if (i === 0) { radio.checked = true; }

      radio.addEventListener('change', function () {
        if (radio.checked) { selectedValue = opt.value; }
      });

      var label = document.createElement('label');
      label.setAttribute('for', 'shutdown-opt-' + opt.value);
      label.className = 'shutdown-radio-label';
      label.textContent = opt.label;

      row.appendChild(radio);
      row.appendChild(label);
      radiosEl.appendChild(row);
    });

    body.appendChild(radiosEl);

    // Buttons
    var btnRow = document.createElement('div');
    btnRow.className = 'win98-msgbox__btnrow';

    var okBtn     = buildDialogBtn('OK');
    var cancelBtn = buildDialogBtn('Cancel');
    var helpBtn   = buildDialogBtn('Help');

    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(helpBtn);
    body.appendChild(btnRow);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function dismiss() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    }

    var onKey = function (e) { if (e.key === 'Escape') { dismiss(); } };
    document.addEventListener('keydown', onKey);

    okBtn.addEventListener('click', function () {
      dismiss();
      if (selectedValue === 'shutdown') {
        if (window.umami) {
          window.umami.track('shutdown_trigger', { source: 'start_menu', option: 'shut_down' });
        }
        window.APC.boot.shutdown();
      } else if (selectedValue === 'restart') {
        doRestart();
      } else if (selectedValue === 'logoff') {
        doLogOff();
      }
    });

    cancelBtn.addEventListener('click', dismiss);

    helpBtn.addEventListener('click', function () {
      dismiss();
      showHelpStub();
    });

    trapFocusWithin(overlay);
    okBtn.focus();
  }

  function doRestart() {
    if (window.umami) {
      window.umami.track('shutdown_trigger', { source: 'start_menu', option: 'restart' });
    }
    // ~100ms tick lets the Umami call dispatch before state is cleared.
    setTimeout(function () {
      // Remove only the keys this restart flow owns. sessionStorage.clear()
      // would wipe unrelated state (audio unlock, resume gate) and conflicts
      // with boot.restart() which also removes these keys explicitly.
      sessionStorage.removeItem('boot_complete');
      sessionStorage.removeItem('ne_history');
      if (window.APC.boot && typeof window.APC.boot.restart === 'function') {
        window.APC.boot.restart();
      }
    }, 100);
  }

  function doLogOff() {
    if (window.umami) {
      window.umami.track('shutdown_trigger', { source: 'start_menu', option: 'log_off' });
    }
    if (window.APC.desktop && typeof window.APC.desktop.closeAll === 'function') {
      window.APC.desktop.closeAll();
    }
    // Show sign-off dialog.
    showSimpleDialog(
      'Log Off WinDoors 98',
      'Thanks for visiting. Close the tab whenever you\'re ready.'
    );
  }

  // --- Dialog helpers -------------------------------------------------

  // Builds a Win98-style titlebar with close button.
  function buildTitlebar(title, titleId, onClose) {
    var tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = title;
    if (titleId) { titleSpan.id = titleId; }
    tb.appendChild(titleSpan);

    var ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    var xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    xBtn.addEventListener('click', onClose);
    ctrls.appendChild(xBtn);
    tb.appendChild(ctrls);

    return tb;
  }

  // Builds a standard Win98 OK/Cancel/Help dialog button.
  function buildDialogBtn(label) {
    var btn = document.createElement('button');
    btn.className = 'win98-msgbox__ok';
    btn.textContent = label;
    return btn;
  }

  // --- Focus trap (OS fidelity + WCAG 2.1 AA) ------------------------
  // Confines Tab navigation to focusable elements inside `el`.

  function trapFocusWithin(el) {
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') { return; }
      var focusable = Array.prototype.slice.call(
        el.querySelectorAll('button, input, [tabindex="0"]')
      ).filter(function (node) {
        return !node.disabled && node.offsetParent !== null;
      });
      if (!focusable.length) { e.preventDefault(); return; }

      var first = focusable[0];
      var last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // --- beforeunload ---------------------------------------------------
  // Best-effort: navigator.sendBeacon() outlives the page unload where
  // fetch()-based calls (umami.track) would be abandoned. Umami doesn't
  // expose a sendBeacon API directly, so this is a documented no-op for now.
  // The handler is here as the canonical place for future implementation.

  function bindBeforeUnload() {
    window.addEventListener('beforeunload', function () {
      // navigator.sendBeacon(url, data) — best-effort, not guaranteed.
      // Umami CDN script does not expose sendBeacon; upgrade if Umami adds it.
    });
  }

  // --- Public export --------------------------------------------------

  return { init: init };

}());
