if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before taskbar.js');
// taskbar.js - WinDoors 98 Start Menu
// Registry-driven menu system (Phases 1-3).

window.APC = window.APC || {};

window.APC.taskbar = (function () {
  'use strict';

  var startBtn = null;
  var menuEl   = null;
  var submenuOpenTimers  = {};
  var submenuCloseTimers = {};
  var openSubmenuEl  = null;
  var openSubmenuKey = null;

  var menuConfig = [
    { id: 'windows-update', label: 'Windows Update', icon: '\uD83C\uDF10', type: 'action', action: 'stub' },
    { type: 'separator' },
    { id: 'programs', label: 'Programs', icon: '\uD83D\uDCC1', type: 'folder', children: [
        { id: 'accessories', label: 'Accessories', icon: '\uD83D\uDCC1', type: 'folder', children: [
            { id: 'communications', label: 'Communications', icon: '\uD83D\uDCC1', type: 'folder', children: [
                { id: 'dialup',        label: 'Dial-Up Networking', icon: '\uD83D\uDCDE', type: 'action', action: 'dialup' },
                { id: 'hyperterminal', label: 'HyperTerminal',      icon: '\uD83D\uDCE0', type: 'action', action: 'stub' },
                { id: 'phonedialer',   label: 'Phone Dialer',       icon: '\u260E',        type: 'action', action: 'launch', app: 'phonedialer' }
            ]},
            { id: 'entertainment', label: 'Entertainment', icon: '\uD83D\uDCC1', type: 'folder', children: [
                { id: 'cdplayer',   label: 'CD Player',          icon: '\uD83D\uDCBF', type: 'action', action: 'stub' },
                { id: 'soundrec',   label: 'Sound Recorder',     icon: '\uD83C\uDF99', type: 'action', action: 'stub' },
                { id: 'volcontrol', label: 'Volume Control',     icon: '\uD83D\uDD0A', type: 'action', action: 'stub' },
                { id: 'webtv',      label: 'Web TV for Windows', icon: '\uD83D\uDCFA', type: 'action', action: 'stub' },
                { id: 'winamp',     label: 'Winamp',             icon: '\uD83C\uDFB5', type: 'action', action: 'launch', app: 'winamp' }
            ]},
            { id: 'system-tools', label: 'System Tools', icon: '\uD83D\uDCC1', type: 'folder', children: [
                { id: 'charmap',     label: 'Character Map',      icon: '\uD83D\uDD23', type: 'action', action: 'stub' },
                { id: 'clipbrd',     label: 'Clipboard Viewer',   icon: '\uD83D\uDCCB', type: 'action', action: 'stub' },
                { id: 'defrag',      label: 'Disk Defragmenter',  icon: '\uD83D\uDCBD', type: 'action', action: 'stub' },
                { id: 'diskcleanup', label: 'Disk Cleanup',       icon: '\uD83D\uDDA5', type: 'action', action: 'launch', app: 'diskcleanup' },
                { id: 'sysinfo',     label: 'System Information', icon: '\u2139',        type: 'action', action: 'stub' }
            ]},
            { id: 'addressbook', label: 'Address Book', icon: '\uD83D\uDCC7', type: 'action', action: 'stub' },
            { id: 'calculator',  label: 'Calculator',   icon: '\uD83E\uDDF2', type: 'action', action: 'launch', app: 'calculator' },
            { id: 'imaging',     label: 'Imaging',      icon: '\uD83D\uDDBC', type: 'action', action: 'stub' },
            { id: 'minesweeper', label: 'Minesweeper',  icon: '\uD83D\uDCA3', type: 'action', action: 'launch', app: 'minesweeper' },
            { id: 'notepad',     label: 'Notepad',      icon: '\uD83D\uDCDD', type: 'action', action: 'launch', app: 'notepad' },
            { id: 'paint',       label: 'Paint',        icon: '\uD83C\uDFA8', type: 'action', action: 'stub' },
            { id: 'wordpad',     label: 'WordPad',      icon: '\uD83D\uDCD3', type: 'action', action: 'stub' }
        ]},
        { id: 'onlineservices', label: 'Online Services', icon: '\uD83D\uDCC1', type: 'folder', children: [
            { id: 'aol', label: 'AOL Internet Dialer',   icon: '\uD83D\uDD3A', type: 'action', action: 'stub' },
            { id: 'att', label: 'AT&T WorldNet Service', icon: '\uD83C\uDF10', type: 'action', action: 'stub' }
        ]},
        { id: 'startup', label: 'StartUp', icon: '\uD83D\uDCC1', type: 'folder', children: [
            { id: 'startup-empty', label: '(Empty)', type: 'action', disabled: true }
        ]},
        { id: 'ie',               label: 'Internet Explorer', icon: '\uD83C\uDF0E', type: 'action', action: 'stub' },
        { id: 'ms-dos',           label: 'MS-DOS Prompt',     icon: '\uD83D\uDCDF', type: 'action', action: 'stub' },
        { id: 'outlook',          label: 'Outlook Express',   icon: '\u2709',        type: 'action', action: 'stub' },
        { id: 'windows-explorer', label: 'Windows Explorer',  icon: '\uD83D\uDDC2', type: 'action', action: 'stub' }
    ]},
    { id: 'favorites', label: 'Favorites', icon: '\u2B50', type: 'folder', children: [
        { id: 'fav-empty', label: '(Empty)', type: 'action', disabled: true }
    ]},
    { id: 'documents', label: 'Documents', icon: '\uD83D\uDCC4', type: 'dynamic', source: 'documents' },
    { id: 'settings', label: 'Settings', icon: '\u2699', type: 'folder', children: [
        { id: 'control-panel',    label: 'Control Panel',          icon: '\uD83C\uDF9B', type: 'action', action: 'stub' },
        { id: 'printers',         label: 'Printers',               icon: '\uD83D\uDDA8', type: 'action', action: 'stub' },
        { id: 'taskbar-settings', label: 'Taskbar & Start Menu...', icon: '\uD83D\uDDD4', type: 'action', action: 'stub' },
        { id: 'folder-opts',      label: 'Folder Options...',       icon: '\uD83D\uDCC1', type: 'action', action: 'stub' },
        { id: 'active-desk', label: 'Active Desktop', icon: '\uD83D\uDDA5', type: 'folder', children: [
            { id: 'ad-view', label: 'View as Web Page',         icon: '\u2713',        type: 'action', action: 'stub' },
            { id: 'ad-cust', label: 'Customize my Desktop...', icon: '\uD83C\uDFA8', type: 'action', action: 'stub' }
        ]}
    ]},
    { id: 'find', label: 'Find', icon: '\uD83D\uDD0D', type: 'folder', children: [
        { id: 'find-files', label: 'Files or Folders...', icon: '\uD83D\uDCC4', type: 'action', action: 'stub' },
        { id: 'find-comp',  label: 'Computer...',         icon: '\uD83D\uDCBB', type: 'action', action: 'stub' },
        { id: 'find-net',   label: 'On the Internet...',  icon: '\uD83C\uDF10', type: 'action', action: 'stub' }
    ]},
    { id: 'help',     label: 'Help',      icon: '\u2753', type: 'action', action: 'help'     },
    { id: 'run',      label: 'Run...',    icon: '\u25BA', type: 'action', action: 'run'      },
    { type: 'separator' },
    { id: 'apps', label: 'Apps', icon: '\uD83D\uDCC2', type: 'folder', children: [
        { id: 'app-winamp', label: 'Winamp',       icon: '\uD83C\uDFB5', type: 'action', action: 'launch', app: 'winamp'      },
        { id: 'app-calc',   label: 'Calculator',   icon: '\uD83E\uDDF2', type: 'action', action: 'launch', app: 'calculator'  },
        { id: 'app-notes',  label: 'Notepad',      icon: '\uD83D\uDCDD', type: 'action', action: 'launch', app: 'notepad'     },
        { id: 'app-mine',   label: 'Minesweeper',  icon: '\uD83D\uDCA3', type: 'action', action: 'launch', app: 'minesweeper' },
        { id: 'app-disk',   label: 'Disk Cleanup', icon: '\uD83D\uDDA5', type: 'action', action: 'launch', app: 'diskcleanup' }
    ]},
    { type: 'separator' },
    { id: 'logoff',   label: 'Log Off Guest...', icon: '\uD83D\uDD11', type: 'action', action: 'logoff'   },
    { id: 'shutdown', label: 'Shut Down...',      icon: '\uD83D\uDD0C', type: 'action', action: 'shutdown' }
  ];

  var startButtonContextMenu = [
    { label: 'Open',    action: 'stub' },
    { label: 'Explore', action: 'stub' },
    { label: 'Find...', action: 'stub' }
  ];

  var taskbarContextMenu = [
    { label: 'Toolbars', action: 'stub', hasArrow: true },
    { sep: true },
    { label: 'Cascade Windows',           action: 'stub' },
    { label: 'Tile Windows Horizontally', action: 'stub' },
    { label: 'Tile Windows Vertically',   action: 'stub' },
    { sep: true },
    { label: 'Minimize All Windows', action: 'desktop_minimize' },
    { sep: true },
    { label: 'Properties', action: 'stub' }
  ];

  function init() {
    startBtn = document.getElementById('start-button');
    menuEl   = document.getElementById('start-menu');
    if (!startBtn || !menuEl) { return; }
    buildMenu();
    bindStartButton();
    bindOutsideClick();
    bindContextMenus();
    bindBeforeUnload();
  }

  function buildMenu() {
    menuEl.innerHTML = '';
    var banner = document.createElement('div');
    banner.className = 'start-menu__banner';
    banner.setAttribute('aria-hidden', 'true');
    var bannerText = document.createElement('span');
    bannerText.className = 'start-menu__banner-text';
    bannerText.textContent = 'WinDoors 98';
    banner.appendChild(bannerText);
    menuEl.appendChild(banner);
    var itemsEl = document.createElement('div');
    itemsEl.className = 'start-menu__items';
    menuConfig.forEach(function (node) {
      itemsEl.appendChild(renderMenuNode(node, true));
    });
    menuEl.appendChild(itemsEl);
    setupMenuKeyboard(itemsEl);
  }

  function renderMenuNode(node, isTopLevel) {
    if (node.type === 'separator') {
      var sep = document.createElement('div');
      sep.className = 'start-menu__separator';
      sep.setAttribute('role', 'separator');
      return sep;
    }

    var baseClass = isTopLevel ? 'start-menu__item' : 'start-menu__submenu-item';
    var el = document.createElement('div');
    el.className = baseClass + (node.disabled ? ' ' + baseClass + '--disabled' : '');
    if (node.type === 'folder' && !isTopLevel) {
      el.className += ' start-menu__submenu-item--has-submenu';
    }
    el.setAttribute('role', 'menuitem');
    el.setAttribute('tabindex', node.disabled ? '-1' : '0');
    el.dataset.key = node.id;
    if (node.disabled) { el.setAttribute('aria-disabled', 'true'); }

    var iconSpan = document.createElement('span');
    iconSpan.className = 'start-menu__item-icon';
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = node.icon || '';
    el.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'start-menu__item-label';
    labelSpan.textContent = node.label;
    el.appendChild(labelSpan);

    if (node.type === 'folder' || node.type === 'dynamic') {
      var arrowSpan = document.createElement('span');
      arrowSpan.className = 'start-menu__item-arrow';
      arrowSpan.setAttribute('aria-hidden', 'true');
      arrowSpan.textContent = '\u25BA';
      el.appendChild(arrowSpan);
      el.setAttribute('aria-haspopup', 'menu');
      el.setAttribute('aria-expanded', 'false');

      var submenuEl = document.createElement('div');
      submenuEl.className = 'start-menu__submenu';
      submenuEl.setAttribute('role', 'menu');
      submenuEl.setAttribute('aria-label', node.label);
      submenuEl.dataset.parentKey = node.id;

      if (node.type === 'dynamic') {
        submenuEl.dataset.dynamic = node.source;
      } else if (node.children) {
        node.children.forEach(function (child) {
          submenuEl.appendChild(renderMenuNode(child, false));
        });
      }

      el.appendChild(submenuEl);
      el.addEventListener('click', function (e) { e.stopPropagation(); });

      if (isTopLevel) {
        attachSubmenuHover(node.id, el, submenuEl);
      } else {
        attachNestedSubmenuHover(node.id, el, submenuEl);
      }

    } else if (!node.disabled) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var t = window.APC.timing;
        setTimeout(function () {
          closeMenu();
          if (node.action === 'launch') {
            if (window.APC.desktop && typeof window.APC.desktop.launchApp === 'function') {
              window.APC.desktop.launchApp(node.app);
            } else if (window.APC.apps && window.APC.apps[node.app] &&
                       typeof window.APC.apps[node.app].open === 'function') {
              window.APC.apps[node.app].open();
            }
          } else if (node.action === 'stub')     { showSimpleDialog(node.label, 'This feature is not available.'); }
          else if (node.action === 'shutdown')   { showShutdownModal(); }
          else if (node.action === 'help')       { showHelpStub(); }
          else if (node.action === 'run')        { showRunStub(); }
          else if (node.action === 'logoff')     { doLogOff(); }
          else if (node.action === 'dialup')     { if (window.APC.netescape && typeof window.APC.netescape.connect === 'function') { window.APC.netescape.connect(); } }
        }, t.rand(t.MENU_ACTION_MIN_MS, t.MENU_ACTION_MAX_MS));
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
      if (isTopLevel) { el.addEventListener('mouseenter', closeAllSubmenus); }
    } else {
      if (isTopLevel) { el.addEventListener('mouseenter', closeAllSubmenus); }
    }

    return el;
  }

  function attachSubmenuHover(key, itemEl, submenuEl) {
    itemEl.addEventListener('mouseenter', function () {
      cancelSubmenuClose(key);
      scheduleSubmenuOpen(key, itemEl, submenuEl);
    });
    itemEl.addEventListener('mouseleave', function () {
      cancelSubmenuOpen(key);
      scheduleSubmenuClose(key, itemEl, submenuEl);
    });
    submenuEl.addEventListener('mouseenter', function () { cancelSubmenuClose(key); });
    submenuEl.addEventListener('mouseleave', function () { scheduleSubmenuClose(key, itemEl, submenuEl); });
  }

  function scheduleSubmenuOpen(key, itemEl, submenuEl) {
    var t = window.APC.timing;
    submenuOpenTimers[key] = setTimeout(function () {
      delete submenuOpenTimers[key];
      openSubmenu(key, itemEl, submenuEl);
    }, t.rand(t.MENU_SUBMENU_MIN_MS, t.MENU_SUBMENU_MAX_MS));
  }

  function cancelSubmenuOpen(key) {
    if (submenuOpenTimers[key]) { clearTimeout(submenuOpenTimers[key]); delete submenuOpenTimers[key]; }
  }

  function scheduleSubmenuClose(key, itemEl, submenuEl) {
    var t = window.APC.timing;
    submenuCloseTimers[key] = setTimeout(function () {
      delete submenuCloseTimers[key];
      closeSubmenu(key, itemEl, submenuEl);
    }, t.SUBMENU_CLOSE_DELAY_MS);
  }

  function cancelSubmenuClose(key) {
    if (submenuCloseTimers[key]) { clearTimeout(submenuCloseTimers[key]); delete submenuCloseTimers[key]; }
  }

  function openSubmenu(key, itemEl, submenuEl) {
    if (submenuEl.dataset.dynamic === 'documents') { populateDocumentsSubmenu(submenuEl); }
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
    if (openSubmenuEl === submenuEl) { openSubmenuEl = null; openSubmenuKey = null; }
  }

  function closeAllSubmenus() {
    Object.keys(submenuOpenTimers).forEach(function (k) {
      clearTimeout(submenuOpenTimers[k]); delete submenuOpenTimers[k];
    });
    if (openSubmenuEl && openSubmenuKey) {
      var itemEl = menuEl.querySelector('[data-key="' + openSubmenuKey + '"]');
      closeSubmenu(openSubmenuKey, itemEl, openSubmenuEl);
    }
  }

  function attachNestedSubmenuHover(key, itemEl, submenuEl) {
    var openTimer  = null;
    var closeTimer = null;

    function openNested() {
      clearTimeout(closeTimer); closeTimer = null;
      submenuEl.classList.add('start-menu__submenu--open');
      itemEl.setAttribute('aria-expanded', 'true');
      itemEl.classList.add('start-menu__submenu-item--open');
    }

    function closeNested() {
      clearTimeout(openTimer);  openTimer  = null;
      clearTimeout(closeTimer); closeTimer = null;
      submenuEl.classList.remove('start-menu__submenu--open');
      itemEl.setAttribute('aria-expanded', 'false');
      itemEl.classList.remove('start-menu__submenu-item--open');
    }

    itemEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer); closeTimer = null;
      var t = window.APC.timing;
      openTimer = setTimeout(function () { openTimer = null; openNested(); },
        t.rand(t.MENU_SUBMENU_MIN_MS, t.MENU_SUBMENU_MAX_MS));
    });
    itemEl.addEventListener('mouseleave', function () {
      clearTimeout(openTimer); openTimer = null;
      var t = window.APC.timing;
      closeTimer = setTimeout(function () { closeTimer = null; closeNested(); }, t.SUBMENU_CLOSE_DELAY_MS);
    });
    submenuEl.addEventListener('mouseenter', function () {
      clearTimeout(closeTimer); closeTimer = null;
    });
    submenuEl.addEventListener('mouseleave', function () {
      var t = window.APC.timing;
      closeTimer = setTimeout(function () { closeTimer = null; closeNested(); }, t.SUBMENU_CLOSE_DELAY_MS);
    });

    itemEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') {
        e.preventDefault(); openNested();
        var first = submenuEl.querySelector('.start-menu__submenu-item:not(.start-menu__submenu-item--disabled)');
        if (first) { first.focus(); }
      } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault(); closeNested(); itemEl.focus();
      }
    });
  }

  function populateDocumentsSubmenu(sub) {
    sub.innerHTML = '';
    var hist = [];
    try { hist = JSON.parse(sessionStorage.getItem('ne_history') || '[]'); } catch (e) {}
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
        if (window.APC.netescape && typeof window.APC.netescape.open === 'function') {
          window.APC.netescape.open(url);
        }
      }));
    });
  }

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
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var t = window.APC.timing;
      setTimeout(function () { closeMenu(); action(); }, t.rand(t.MENU_ACTION_MIN_MS, t.MENU_ACTION_MAX_MS));
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      if (e.key === 'ArrowLeft' || e.key === 'Escape') {
        e.preventDefault();
        if (onBack) { onBack(); }
        else if (openSubmenuKey) {
          var parentEl = menuEl.querySelector('[data-key="' + openSubmenuKey + '"]');
          closeAllSubmenus();
          if (parentEl) { parentEl.focus(); }
        }
      }
    });
    return el;
  }

  function bindContextMenus() {
    var taskbarEl = document.getElementById('taskbar');
    if (!taskbarEl) { return; }
    taskbarEl.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      closeMenu();
      if (e.target.id === 'start-button' || e.target.closest('#start-button')) {
        renderContextMenu(startButtonContextMenu, e.clientX, e.clientY);
      } else if (e.target === taskbarEl || e.target.closest('#taskbar-windows') || e.target.closest('#system-tray')) {
        if (e.target.closest('.taskbar-btn')) { return; }
        renderContextMenu(taskbarContextMenu, e.clientX, e.clientY);
      }
    });
  }

  function renderContextMenu(items, x, y) {
    var existing = document.getElementById('active-taskbar-context');
    if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); }
    var menu = document.createElement('div');
    menu.id = 'active-taskbar-context';
    menu.className = 'desktop-context-menu';
    items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement('div');
        sep.className = 'desktop-context-menu__sep';
        menu.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'desktop-context-menu__item';
      btn.textContent = item.label;
      if (item.hasArrow) {
        var arrowSpan = document.createElement('span');
        arrowSpan.className = 'start-menu__item-arrow';
        arrowSpan.setAttribute('aria-hidden', 'true');
        arrowSpan.textContent = '\u25BA';
        btn.style.position = 'relative';
        btn.appendChild(arrowSpan);
      }
      btn.addEventListener('click', function () {
        if (item.action === 'stub') {
          showSimpleDialog(item.label, 'This feature is not available.');
        } else if (item.action === 'desktop_minimize') {
          if (window.APC.desktop && typeof window.APC.desktop.minimizeAll === 'function') {
            window.APC.desktop.minimizeAll();
          } else {
            showSimpleDialog('Minimize All Windows', 'This feature is not available.');
          }
        }
      });
      menu.appendChild(btn);
    });
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    var rect = menu.getBoundingClientRect();
    var ax = (x + rect.width  > window.innerWidth)  ? (window.innerWidth  - rect.width  - 2) : x;
    var ay = (y + rect.height > window.innerHeight)  ? (window.innerHeight - rect.height - 2) : y;
    if (y > window.innerHeight - 35) { ay = window.innerHeight - 28 - rect.height; }
    menu.style.left = ax + 'px';
    menu.style.top  = ay + 'px';
    menu.style.visibility = 'visible';
    var onDocClick = function (e) {
      if (menu && !menu.contains(e.target)) {
        if (menu.parentNode) { menu.parentNode.removeChild(menu); }
        document.removeEventListener('click',       onDocClick);
        document.removeEventListener('contextmenu', onDocClick);
      }
    };
    setTimeout(function () {
      document.addEventListener('click',       onDocClick);
      document.addEventListener('contextmenu', onDocClick);
    }, 0);
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
      // Remove only the keys this restart flow owns. boot.restart() also
      // removes these explicitly — belt-and-suspenders for safety.
      localStorage.removeItem('boot_complete_ts');
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
