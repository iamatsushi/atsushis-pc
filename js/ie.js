// ie.js — Internet Explorer 4 window with dial-up simulation
// Handles: IE chrome, address bar navigation, client-side routing,
//          dial-up modal (first launch + manual URL entry)
// Namespaced under window.APC per project conventions.

window.APC = window.APC || {};

window.APC.ie = (function () {
  'use strict';

  // --- Constants -------------------------------------------------------

  const DEFAULT_URL = 'ahisaka.com';
  const DIALUP_PHONE = '867-9305';

  // Fallback duration if audio 'ended' event never fires (e.g. load error).
  // Matches dialup.mp3 length of 10.5 seconds.
  const DIALUP_FALLBACK_MS = 10500;

  // Offsets at which each step message appears during the audio.
  // Cosmetic only — completion is driven by audio 'ended', not these timers.
  const DIALUP_STEP_OFFSETS_MS = [0, 2500, 5500, 8500];

  // Step messages displayed sequentially during the dial-up audio.
  const DIALUP_STEPS = [
    { msg: 'Dialing ' + DIALUP_PHONE + '...'    },
    { msg: 'Verifying username and password...' },
    { msg: 'Logging on to network...'           },
    { msg: 'Connected at 28,800 bps'            }
  ];

  // Client-side routing map: normalized URL → page key.
  // Unknown URLs fall back to 'home' (no 404s per spec).
  const PAGE_ROUTES = {
    'ahisaka.com':           'home',
    'ahisaka.com/':          'home',
    'ahisaka.com/about':     'about',
    'ahisaka.com/thoughts':  'thoughts',
    'ahisaka.com/projects':  'projects',
    'ahisaka.com/guestbook': 'guestbook',
    'ahisaka.com/resume':    'resume'
  };

  // --- Module state ----------------------------------------------------

  // hasDialedUp: true once dial-up has run this session.
  // Manual URL entry always re-triggers regardless of this flag.
  let hasDialedUp = false;
  let ieWindowState = null;   // win98 window state object from desktop.js
  let currentUrl = DEFAULT_URL;

  // Preload dial-up audio at module init time — same pattern as startup.mp3 in boot.js.
  // Created here (not in open()) so the browser has time to buffer the file and the
  // Audio object exists well before any .play() call, satisfying autoplay policy.
  // .play() is only called inside showDialup(), after a user gesture has occurred.
  const dialupAudio = new Audio('assets/audio/dialup.mp3');
  dialupAudio.preload = 'auto';
  dialupAudio.addEventListener('error', function () {});
  let pageEl = null;          // .ie-chrome__page element (scroll container)
  let addressInput = null;    // address bar <input>
  let statusEl = null;        // .ie-chrome__status-text span

  // Navigation history stack
  let navHistory = [];        // array of normalized URL strings in visit order
  let navIndex = -1;          // pointer into navHistory; -1 = nothing visited yet
  let backBtn = null;         // reference to Back <button> for aria-disabled updates
  let fwdBtn = null;          // reference to Forward <button>

  // --- Public API ------------------------------------------------------

  function open() {
    // If IE window already exists, restore or focus it — don't open a second.
    if (ieWindowState) {
      if (ieWindowState.minimized) {
        ieWindowState.el.style.display = '';
        ieWindowState.minimized = false;
        if (ieWindowState.taskbarBtn) {
          ieWindowState.taskbarBtn.classList.remove('taskbar-btn--minimized');
          ieWindowState.taskbarBtn.classList.add('taskbar-btn--active');
        }
      }
      // Trigger mousedown to bring window to front via desktop.js bringToFront.
      ieWindowState.el.dispatchEvent(new MouseEvent('mousedown'));
      return;
    }

    // Create the Win98 window shell via desktop.js.
    ieWindowState = window.APC.desktop.createWindow({
      title: 'Internet Explorer',
      app: 'ie',
      width: 680,
      height: 520,
      x: 80,
      y: 40
    });

    // When the window is closed, reset all module-level DOM refs and nav state.
    // desktop.js already removes the element and taskbar button.
    const closeBtn = ieWindowState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        ieWindowState = null;
        pageEl = null;
        addressInput = null;
        statusEl = null;
        backBtn = null;
        fwdBtn = null;
        navHistory = [];
        navIndex = -1;
      });
    }

    buildIEChrome(ieWindowState.contentEl);
    ieWindowState.show();

    if (window.umami) {
      window.umami.track('app_open', { app_name: 'ie' });
    }

    // Navigate to homepage — will trigger dial-up on first launch.
    navigate(DEFAULT_URL, false);
  }

  // --- IE Chrome builder -----------------------------------------------

  function buildIEChrome(contentEl) {
    const chrome = document.createElement('div');
    chrome.className = 'ie-chrome';

    chrome.appendChild(buildMenubar());
    chrome.appendChild(buildToolbar());

    // Page viewport — scrollable, fills space between toolbar and statusbar.
    const page = document.createElement('div');
    page.className = 'ie-chrome__page';
    page.setAttribute('role', 'main');
    page.setAttribute('aria-label', 'Page content');
    pageEl = page;
    chrome.appendChild(page);

    // Status bar
    const statusbar = document.createElement('div');
    statusbar.className = 'ie-chrome__statusbar';
    const statusSpan = document.createElement('span');
    statusSpan.className = 'ie-chrome__status-text';
    statusSpan.textContent = 'Done';
    statusbar.appendChild(statusSpan);
    statusEl = statusSpan;
    chrome.appendChild(statusbar);

    contentEl.appendChild(chrome);
  }

  function buildMenubar() {
    const menubar = document.createElement('div');
    menubar.className = 'ie-chrome__menubar';
    menubar.setAttribute('role', 'menubar');
    menubar.setAttribute('aria-label', 'Menu bar');

    // Stub menu items — no dropdowns in MVP.
    ['File', 'Edit', 'View', 'Go', 'Favorites', 'Help'].forEach(function (label) {
      const btn = document.createElement('button');
      btn.className = 'ie-chrome__menu-item';
      btn.textContent = label;
      btn.setAttribute('role', 'menuitem');
      menubar.appendChild(btn);
    });

    return menubar;
  }

  function buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'ie-chrome__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Navigation toolbar');

    // Table-based chrome layout — float/absolute/tables only per CLAUDE.md.
    const table = document.createElement('table');
    table.className = 'ie-chrome__toolbar-table';
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '0');
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    // Back — starts disabled (no history yet); stores ref for updateNavButtons().
    const backTd = makeNavBtnCell('◄', 'Back', goBack, true);
    backBtn = backTd.querySelector('button');
    tr.appendChild(backTd);

    // Forward — starts disabled; stores ref for updateNavButtons().
    const fwdTd = makeNavBtnCell('►', 'Forward', goForward, true);
    fwdBtn = fwdTd.querySelector('button');
    tr.appendChild(fwdTd);

    // Refresh — re-navigates to currentUrl without dial-up; always enabled.
    tr.appendChild(makeNavBtnCell('↻', 'Refresh', function () {
      navigate(currentUrl, false);
    }, false));

    // Vertical separator
    const tdSep = document.createElement('td');
    tdSep.className = 'ie-chrome__toolbar-cell ie-chrome__toolbar-sep';
    tr.appendChild(tdSep);

    // "Address" label
    const tdLabel = document.createElement('td');
    tdLabel.className = 'ie-chrome__toolbar-cell ie-chrome__toolbar-cell--addr-label';
    const addrLabel = document.createElement('label');
    addrLabel.className = 'ie-chrome__addr-label';
    addrLabel.setAttribute('for', 'ie-address-bar');
    addrLabel.textContent = 'Address';
    tdLabel.appendChild(addrLabel);
    tr.appendChild(tdLabel);

    // Address bar input — expands to fill remaining table width.
    const tdAddr = document.createElement('td');
    tdAddr.className = 'ie-chrome__toolbar-cell ie-chrome__toolbar-cell--addr';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'ie-address-bar';
    input.className = 'ie-chrome__address-input';
    input.value = DEFAULT_URL;
    input.setAttribute('aria-label', 'Address bar');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const url = input.value.trim();
        if (url) { navigate(url, true); }
      }
    });
    addressInput = input;
    tdAddr.appendChild(input);
    tr.appendChild(tdAddr);

    // Go button — manual URL entry triggers dial-up (same as pressing Enter).
    const tdGo = document.createElement('td');
    tdGo.className = 'ie-chrome__toolbar-cell ie-chrome__toolbar-cell--btn';
    const goBtn = document.createElement('button');
    goBtn.className = 'ie-chrome__go-btn';
    goBtn.setAttribute('aria-label', 'Go to address');
    goBtn.textContent = 'Go';
    goBtn.addEventListener('click', function () {
      const url = input.value.trim();
      if (url) { navigate(url, true); }
    });
    tdGo.appendChild(goBtn);
    tr.appendChild(tdGo);

    tbody.appendChild(tr);
    table.appendChild(tbody);
    toolbar.appendChild(table);
    return toolbar;
  }

  // isDisabled: true = start with --disabled class and aria-disabled="true"
  function makeNavBtnCell(symbol, label, onClick, isDisabled) {
    const td = document.createElement('td');
    td.className = 'ie-chrome__toolbar-cell ie-chrome__toolbar-cell--btn';
    const btn = document.createElement('button');
    btn.className = 'ie-chrome__nav-btn';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.textContent = symbol;
    btn.addEventListener('click', onClick);
    if (isDisabled) {
      btn.classList.add('ie-chrome__nav-btn--disabled');
      btn.setAttribute('aria-disabled', 'true');
    }
    td.appendChild(btn);
    return td;
  }

  // --- Navigation history ----------------------------------------------

  function goBack() {
    if (navIndex <= 0) { return; }
    navIndex--;
    const url = navHistory[navIndex];
    currentUrl = url;
    if (addressInput) { addressInput.value = url; }
    renderPage(PAGE_ROUTES[url] || 'home');
    updateNavButtons();
  }

  function goForward() {
    if (navIndex >= navHistory.length - 1) { return; }
    navIndex++;
    const url = navHistory[navIndex];
    currentUrl = url;
    if (addressInput) { addressInput.value = url; }
    renderPage(PAGE_ROUTES[url] || 'home');
    updateNavButtons();
  }

  function updateNavButtons() {
    const canBack = navIndex > 0;
    const canFwd  = navIndex < navHistory.length - 1;

    if (backBtn) {
      backBtn.setAttribute('aria-disabled', canBack ? 'false' : 'true');
      if (canBack) {
        backBtn.classList.remove('ie-chrome__nav-btn--disabled');
      } else {
        backBtn.classList.add('ie-chrome__nav-btn--disabled');
      }
    }

    if (fwdBtn) {
      fwdBtn.setAttribute('aria-disabled', canFwd ? 'false' : 'true');
      if (canFwd) {
        fwdBtn.classList.remove('ie-chrome__nav-btn--disabled');
      } else {
        fwdBtn.classList.add('ie-chrome__nav-btn--disabled');
      }
    }
  }

  // --- Navigation ------------------------------------------------------

  function navigate(url, fromUserInput) {
    // Normalize: strip protocol, strip www., collapse trailing slash on paths.
    let normalized = url
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '');
    // Preserve 'ahisaka.com/' but strip trailing slash from any longer path.
    if (normalized.length > 'ahisaka.com/'.length && normalized.slice(-1) === '/') {
      normalized = normalized.slice(0, -1);
    }

    currentUrl = normalized;
    if (addressInput) { addressInput.value = normalized; }

    // Push to history, truncating any forward entries first.
    navHistory = navHistory.slice(0, navIndex + 1);
    navHistory.push(normalized);
    navIndex = navHistory.length - 1;
    updateNavButtons();

    // Resolve to page key; unknown URLs fall back silently to homepage.
    const pageKey = PAGE_ROUTES[normalized] || 'home';

    // Dial-up trigger rules:
    // - First IE launch (hasDialedUp === false): always dial. Event: 'dialup_trigger'.
    // - Manual URL entry (fromUserInput): always dial. Event: 'dialup_url_entry'.
    // - In-session link navigation after first dial: skip dial, render directly.
    if (!hasDialedUp || fromUserInput) {
      const eventName = fromUserInput ? 'dialup_url_entry' : 'dialup_trigger';
      if (window.umami) { window.umami.track(eventName); }
      if (statusEl) { statusEl.textContent = 'Connecting to ' + normalized + '...'; }
      showDialup(function () {
        hasDialedUp = true;
        renderPage(pageKey);
      });
    } else {
      renderPage(pageKey);
    }
  }

  // --- Page renderer ---------------------------------------------------

  function renderPage(pageKey) {
    if (!pageEl) { return; }
    pageEl.innerHTML = '';
    if (statusEl) { statusEl.textContent = 'Done'; }

    if (pageKey === 'home') {
      renderHome();
    } else {
      renderStub(pageKey);
    }
  }

  function renderHome() {
    if (window.umami) { window.umami.track('ie_homepage_load'); }

    const page = document.createElement('div');
    page.className = 'ie-home';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'ie-home__header';

    const siteTitle = document.createElement('h1');
    siteTitle.className = 'ie-home__title';
    siteTitle.textContent = 'ATSUSHI HISAKA';

    const tagline = document.createElement('p');
    tagline.className = 'ie-home__tagline';
    tagline.textContent = 'Product Manager · Portland, OR';

    const divider = document.createElement('hr');
    divider.className = 'ie-home__divider';
    divider.setAttribute('aria-hidden', 'true');

    header.appendChild(siteTitle);
    header.appendChild(tagline);
    header.appendChild(divider);
    page.appendChild(header);

    // --- Two-column layout ---
    const cols = document.createElement('div');
    cols.className = 'ie-home__cols';

    // Left column: navigation links
    const leftCol = document.createElement('div');
    leftCol.className = 'ie-home__col ie-home__col--left';

    const navTitle = document.createElement('p');
    navTitle.className = 'ie-home__section-title';
    navTitle.textContent = '[ NAVIGATE ]';
    leftCol.appendChild(navTitle);

    const nav = document.createElement('nav');
    nav.className = 'ie-home__nav';
    nav.setAttribute('aria-label', 'Site navigation');

    const navLinks = [
      { label: '» About Me',    url: 'ahisaka.com/about'     },
      { label: '» My Thoughts', url: 'ahisaka.com/thoughts'  },
      { label: '» Work',        url: 'ahisaka.com/projects'  },
      { label: '» Guestbook',   url: 'ahisaka.com/guestbook' },
      { label: '» Resume',      url: 'ahisaka.com/resume'    }
    ];

    navLinks.forEach(function (link) {
      const a = document.createElement('a');
      a.className = 'ie-home__nav-link';
      a.href = '#';
      a.textContent = link.label;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(link.url, false);
      });
      nav.appendChild(a);
      nav.appendChild(document.createElement('br'));
    });

    leftCol.appendChild(nav);
    cols.appendChild(leftCol);

    // Right column: intro blurb
    const rightCol = document.createElement('div');
    rightCol.className = 'ie-home__col ie-home__col--right';

    const welcomeTitle = document.createElement('p');
    welcomeTitle.className = 'ie-home__section-title';
    welcomeTitle.textContent = '[ WELCOME ]';
    rightCol.appendChild(welcomeTitle);

    const intro1 = document.createElement('p');
    intro1.className = 'ie-home__intro';
    intro1.textContent =
      'Welcome to my little corner of the internet. ' +
      "I'm a product manager based in Portland, OR. " +
      'This site is my portfolio — built from scratch, no frameworks, ' +
      'running on a Raspberry Pi in my apartment.';
    rightCol.appendChild(intro1);

    const intro2 = document.createElement('p');
    intro2.className = 'ie-home__intro';
    intro2.textContent =
      'Sign the guestbook to unlock my resume. ' +
      'Click around — there are a few surprises.';
    rightCol.appendChild(intro2);

    cols.appendChild(rightCol);

    // Clearfix div ends the float context
    const clear = document.createElement('div');
    clear.className = 'ie-home__clear';
    cols.appendChild(clear);

    page.appendChild(cols);

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'ie-home__footer';
    footer.setAttribute('aria-label', 'Page footer');

    const counter = document.createElement('p');
    counter.className = 'ie-home__counter';
    counter.textContent = 'Visitors: 1,337';

    const updated = document.createElement('p');
    updated.className = 'ie-home__updated';
    updated.textContent = 'Last updated: April 2026';

    footer.appendChild(counter);
    footer.appendChild(updated);
    page.appendChild(footer);

    pageEl.appendChild(page);
  }

  function renderStub(pageKey) {
    const labels = {
      about:     'About Me',
      thoughts:  'My Thoughts',
      projects:  'Work / Projects',
      guestbook: 'Guestbook',
      resume:    'Resume'
    };
    const page = document.createElement('div');
    page.className = 'ie-home';
    const stub = document.createElement('p');
    stub.className = 'ie-stub';
    stub.textContent = (labels[pageKey] || pageKey) + ' — coming soon.';
    page.appendChild(stub);
    pageEl.appendChild(page);
  }

  // --- Dial-up modal ---------------------------------------------------

  function showDialup(onComplete) {
    const overlay = document.createElement('div');
    overlay.className = 'dialup-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Connecting to Internet');

    const win = document.createElement('div');
    win.className = 'dialup-modal__win';

    // Titlebar (Win98 chrome: navy gradient, white title text)
    const titlebar = document.createElement('div');
    titlebar.className = 'dialup-modal__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'dialup-modal__title';
    titleSpan.textContent = 'Connecting to ahisaka.com...';
    titlebar.appendChild(titleSpan);
    win.appendChild(titlebar);

    // Body
    const body = document.createElement('div');
    body.className = 'dialup-modal__body';

    const icon = document.createElement('div');
    icon.className = 'dialup-modal__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📞';

    const phoneNum = document.createElement('p');
    phoneNum.className = 'dialup-modal__phone';
    phoneNum.textContent = 'Phone: ' + DIALUP_PHONE;

    const statusText = document.createElement('p');
    statusText.className = 'dialup-modal__status';
    statusText.setAttribute('aria-live', 'polite');
    statusText.textContent = DIALUP_STEPS[0].msg;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialup-modal__cancel';
    cancelBtn.textContent = 'Cancel';

    body.appendChild(icon);
    body.appendChild(phoneNum);
    body.appendChild(statusText);
    body.appendChild(cancelBtn);
    win.appendChild(body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    // Focus cancel button for keyboard accessibility (focus trap: only one control).
    cancelBtn.focus();

    // completed guard: prevents double-fire if audio 'ended' and fallback both race.
    let completed = false;
    let fallbackTimer = null;
    const stepTimers = [];

    function cleanup() {
      clearTimeout(fallbackTimer);
      stepTimers.forEach(clearTimeout);
      if (dialupAudio) {
        dialupAudio.removeEventListener('ended', onAudioEnded);
        dialupAudio.pause();
        dialupAudio.currentTime = 0;
      }
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    function complete() {
      if (completed) { return; }
      completed = true;
      cleanup();
      onComplete();
    }

    // Primary completion trigger: audio 'ended' event fires when dialup.mp3 finishes.
    // Named function so it can be removed in cleanup without lingering on the element.
    function onAudioEnded() {
      complete();
    }

    if (dialupAudio) {
      dialupAudio.addEventListener('ended', onAudioEnded);
      try {
        dialupAudio.currentTime = 0;
        dialupAudio.play().catch(function () {});
      } catch (e) {
        // Silent fallback — audio failure must never block the connection sequence.
      }
    }

    // Fallback timer: if audio never fires 'ended' (load error, 404, etc.),
    // dismiss the modal after DIALUP_FALLBACK_MS (10500ms = dialup.mp3 length).
    fallbackTimer = setTimeout(complete, DIALUP_FALLBACK_MS);

    // Cosmetic step text updates — purely visual, decoupled from completion.
    // Step 0 is already set above; schedule steps 1–3 at their offsets.
    DIALUP_STEP_OFFSETS_MS.forEach(function (offsetMs, idx) {
      if (idx === 0) { return; } // already displayed at modal open
      const t = setTimeout(function () {
        if (!completed && DIALUP_STEPS[idx]) {
          statusText.textContent = DIALUP_STEPS[idx].msg;
        }
      }, offsetMs);
      stepTimers.push(t);
    });

    // Cancel: suppress onComplete, clean up everything.
    cancelBtn.addEventListener('click', function () {
      completed = true;   // prevent complete() from calling onComplete
      cleanup();
      // Page stays blank — user cancelled the connection.
    });
  }

  // --- Public exports --------------------------------------------------

  return { open: open };

}());
