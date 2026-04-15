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

  // Guestbook Pocketbase endpoint and client-side cache TTL.
  const GUESTBOOK_API_URL = '/api/collections/guestbook/records';
  const GUESTBOOK_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Client-side routing map: normalized URL → page key.
  // Unknown URLs fall back to 'home' (no 404s per spec).
  const PAGE_ROUTES = {
    'ahisaka.com':           'home',
    'ahisaka.com/':          'home',
    'ahisaka.com/about':     'about',
    'ahisaka.com/thoughts':  'thoughts',
    'ahisaka.com/projects':  'projects',
    'ahisaka.com/guestbook': 'guestbook'
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
  let currentParams = {};     // parsed query params for the current page

  // --- Public API ------------------------------------------------------

  function open(targetUrl) {
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
      // If a target URL was requested (e.g. from resume.exe icon), navigate to it.
      if (targetUrl) { navigate(targetUrl, false); }
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

    // When the window is closed, reset DOM refs and nav stack.
    // hasDialedUp is intentionally NOT reset here — dial-up fires once per
    // browser session regardless of how many times the window is opened/closed.
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

    // Navigate to target URL (or homepage) — will trigger dial-up on first launch.
    navigate(targetUrl || DEFAULT_URL, false);
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

    // Extract and parse query params; route matching uses the base URL only.
    const qIdx = normalized.indexOf('?');
    currentParams = {};
    if (qIdx !== -1) {
      normalized.slice(qIdx + 1).split('&').forEach(function (pair) {
        const parts = pair.split('=');
        if (parts[0]) {
          currentParams[decodeURIComponent(parts[0])] = parts[1] ? decodeURIComponent(parts[1]) : '';
        }
      });
      normalized = normalized.slice(0, qIdx);
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

    // Track manual URL bar entries as an analytics event — no dial-up re-trigger.
    if (fromUserInput && window.umami) {
      window.umami.track('dialup_url_entry');
    }

    // Dial-up fires once per browser session — first IE launch only.
    // All subsequent navigations (links, address bar, back/forward) go direct.
    if (!hasDialedUp) {
      if (window.umami) { window.umami.track('dialup_trigger'); }
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

    const renderers = {
      home:      renderHome,
      about:     renderAbout,
      thoughts:  renderThoughts,
      projects:  renderProjects,
      guestbook: renderGuestbook
    };
    (renderers[pageKey] || renderHome)();
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
      { label: '» Guestbook',   url: 'ahisaka.com/guestbook' }
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
      'Sign the guestbook and say hello. ' +
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

  // --- About Me --------------------------------------------------------

  function renderAbout() {
    const page = document.createElement('div');
    page.className = 'ie-about';

    // Top header
    const topHeader = document.createElement('div');
    topHeader.className = 'ie-about__top-header';

    const h1 = document.createElement('h1');
    h1.className = 'ie-about__top-title';
    h1.textContent = '~*~ ATSUSHI\'S PAGE ~*~';

    const underConst = document.createElement('p');
    underConst.className = 'ie-about__under-construction';
    underConst.textContent = '🚧 UNDER CONSTRUCTION 🚧';

    topHeader.appendChild(h1);
    topHeader.appendChild(underConst);
    page.appendChild(topHeader);

    // Left sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'ie-about__sidebar';

    const sideTitle = document.createElement('p');
    sideTitle.className = 'ie-about__section-title';
    sideTitle.textContent = '[ ABOUT ME ]';
    sidebar.appendChild(sideTitle);

    const bio = document.createElement('p');
    bio.className = 'ie-about__bio';
    bio.textContent = 'Hi!! I\'m Atsushi, a PM based in Portland, OR. ' +
      'I like building products, playing video games, and making things ' +
      'with my hands. Placeholder — real bio in Phase 9.';
    sidebar.appendChild(bio);

    // GIF placeholders in sidebar (2 of 4 max per page) — replaced in Phase 9
    ['Animated banner placeholder', 'Animated badge placeholder'].forEach(function (alt) {
      const box = document.createElement('div');
      box.className = 'ie-about__gif-placeholder';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', alt);
      box.textContent = '[ GIF ]';
      sidebar.appendChild(box);
    });

    const counter = document.createElement('p');
    counter.className = 'ie-about__counter';
    counter.textContent = 'You are visitor #001,337';
    sidebar.appendChild(counter);

    page.appendChild(sidebar);

    // Right main content (overflow: hidden BFC fills remaining width)
    const main = document.createElement('div');
    main.className = 'ie-about__main';

    const mainTitle = document.createElement('p');
    mainTitle.className = 'ie-about__section-title';
    mainTitle.textContent = '[ WELCOME TO MY PAGE!! ]';
    main.appendChild(mainTitle);

    const welcome = document.createElement('p');
    welcome.className = 'ie-about__welcome';
    welcome.textContent = 'Welcome!! This page is my little corner of the internet. ' +
      'Feel free to look around and sign my guestbook. ' +
      'Placeholder — real content in Phase 9.';
    main.appendChild(welcome);

    // GIF placeholders in main (2 of 4 max) — replaced in Phase 9
    ['Decorative GIF placeholder 3', 'Decorative GIF placeholder 4'].forEach(function (alt) {
      const box = document.createElement('div');
      box.className = 'ie-about__gif-placeholder';
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', alt);
      box.textContent = '[ GIF ]';
      main.appendChild(box);
    });

    const hr = document.createElement('hr');
    hr.className = 'ie-about__divider';
    hr.setAttribute('aria-hidden', 'true');
    main.appendChild(hr);

    const interestsTitle = document.createElement('p');
    interestsTitle.className = 'ie-about__section-title';
    interestsTitle.textContent = '[ INTERESTS ]';
    main.appendChild(interestsTitle);

    const interests = document.createElement('p');
    interests.className = 'ie-about__interests';
    interests.textContent =
      'Product Management ★ Video Games ★ Cooking ★ Cycling ★ Raspberry Pi';
    main.appendChild(interests);

    page.appendChild(main);

    const clear = document.createElement('div');
    clear.className = 'ie-about__clear';
    page.appendChild(clear);

    pageEl.appendChild(page);
  }

  // --- My Thoughts -----------------------------------------------------

  function renderThoughts() {
    const page = document.createElement('div');
    page.className = 'ie-thoughts';

    const header = document.createElement('div');
    header.className = 'ie-thoughts__header';

    const h1 = document.createElement('h1');
    h1.className = 'ie-thoughts__title';
    h1.textContent = 'MY THOUGHTS';

    const sub = document.createElement('p');
    sub.className = 'ie-thoughts__subtitle';
    sub.textContent = '// a log of things on my mind';

    const divider = document.createElement('hr');
    divider.className = 'ie-thoughts__divider';
    divider.setAttribute('aria-hidden', 'true');

    header.appendChild(h1);
    header.appendChild(sub);
    header.appendChild(divider);
    page.appendChild(header);

    // Reverse-chronological posts — placeholder content, replaced in Phase 9
    const posts = [
      {
        date: '2026-04-14',
        title: 'Why I built this on a Raspberry Pi',
        body: 'Placeholder — real post coming in Phase 9. ' +
          'Something about the joy of over-engineering a personal site ' +
          'and running it on $35 of hardware on my desk.'
      },
      {
        date: '2026-03-28',
        title: 'On product thinking in small teams',
        body: 'Placeholder — real post coming in Phase 9. ' +
          'Notes on how PM work changes when there is no design team, ' +
          'no data team, and no one to hand things off to.'
      },
      {
        date: '2026-03-10',
        title: 'Notes from a weekend of tinkering',
        body: 'Placeholder — real post coming in Phase 9. ' +
          'Weekend project log. Set up Caddy, got Cloudflare Tunnel ' +
          'working, broke everything twice, fixed it once.'
      }
    ];

    posts.forEach(function (post) {
      const article = document.createElement('article');
      article.className = 'ie-thoughts__post';

      const meta = document.createElement('p');
      meta.className = 'ie-thoughts__meta';
      meta.textContent = '> ' + post.date;

      const title = document.createElement('h2');
      title.className = 'ie-thoughts__post-title';
      title.textContent = post.title;

      const body = document.createElement('p');
      body.className = 'ie-thoughts__body';
      body.textContent = post.body;

      const hr = document.createElement('hr');
      hr.className = 'ie-thoughts__divider';
      hr.setAttribute('aria-hidden', 'true');

      article.appendChild(meta);
      article.appendChild(title);
      article.appendChild(body);
      article.appendChild(hr);
      page.appendChild(article);
    });

    pageEl.appendChild(page);
  }

  // --- Work / Projects -------------------------------------------------

  function renderProjects() {
    const page = document.createElement('div');
    page.className = 'ie-projects';

    const header = document.createElement('div');
    header.className = 'ie-projects__header';

    const h1 = document.createElement('h1');
    h1.className = 'ie-projects__title';
    h1.textContent = 'Work & Projects';

    const sub = document.createElement('p');
    sub.className = 'ie-projects__subtitle';
    sub.textContent = 'A selection of things I\'ve built and shipped.';

    const divider = document.createElement('hr');
    divider.className = 'ie-projects__divider';
    divider.setAttribute('aria-hidden', 'true');

    header.appendChild(h1);
    header.appendChild(sub);
    header.appendChild(divider);
    page.appendChild(header);

    // Project cards — placeholder content, replaced in Phase 9
    const projects = [
      {
        title:   'Project Alpha',
        role:    'Product Manager',
        company: 'Company Name',
        years:   '2024–2025',
        impact:  'Shipped a key product initiative that drove measurable growth, reduced ' +
                 'churn, and improved retention across a core user segment. Real metrics ' +
                 'and details to be filled in Phase 9.',
        skills:  ['Product Strategy', 'B2B SaaS', 'Roadmapping', 'Cross-functional']
      },
      {
        title:   'Project Beta',
        role:    'Product Lead',
        company: 'Company Name',
        years:   '2023–2024',
        impact:  'Led a mobile-first redesign that improved conversion and increased DAU, ' +
                 'validated through A/B testing over 8 weeks. Real metrics and details ' +
                 'to be filled in Phase 9.',
        skills:  ['Mobile', 'Growth', 'A/B Testing', 'User Research']
      },
      {
        title:   'Atsushi\'s PC',
        role:    'Solo Builder',
        company: 'Side Project',
        years:   '2026',
        impact:  'Browser-based Windows 98 desktop simulation serving as a portfolio. ' +
                 'Built with vanilla HTML/CSS/JS, hosted on a Raspberry Pi 3B+ via ' +
                 'Caddy and Cloudflare Tunnel.',
        skills:  ['Vanilla JS', 'Raspberry Pi', 'Caddy', 'CSS']
      }
    ];

    const grid = document.createElement('div');
    grid.className = 'ie-projects__grid';

    projects.forEach(function (proj) {
      const card = document.createElement('div');
      card.className = 'ie-projects__card';

      const cardTitle = document.createElement('h2');
      cardTitle.className = 'ie-projects__card-title';
      cardTitle.textContent = proj.title;

      const cardMeta = document.createElement('p');
      cardMeta.className = 'ie-projects__card-meta';
      cardMeta.textContent = proj.role + ' · ' + proj.company + ' · ' + proj.years;

      const impactSection = document.createElement('div');
      impactSection.className = 'ie-projects__card-section';

      const impactLabel = document.createElement('p');
      impactLabel.className = 'ie-projects__card-label';
      impactLabel.textContent = 'IMPACT';

      const cardImpact = document.createElement('p');
      cardImpact.className = 'ie-projects__card-impact';
      cardImpact.textContent = proj.impact;

      impactSection.appendChild(impactLabel);
      impactSection.appendChild(cardImpact);

      const skillsSection = document.createElement('div');
      skillsSection.className = 'ie-projects__card-section';

      const skillsLabel = document.createElement('p');
      skillsLabel.className = 'ie-projects__card-label';
      skillsLabel.textContent = 'SKILLS';

      const tagsEl = document.createElement('p');
      tagsEl.className = 'ie-projects__card-tags';
      proj.skills.forEach(function (tag) {
        const badge = document.createElement('span');
        badge.className = 'ie-projects__tag';
        badge.textContent = tag;
        tagsEl.appendChild(badge);
      });

      skillsSection.appendChild(skillsLabel);
      skillsSection.appendChild(tagsEl);

      card.appendChild(cardTitle);
      card.appendChild(cardMeta);
      card.appendChild(impactSection);
      card.appendChild(skillsSection);
      grid.appendChild(card);
    });

    const clear = document.createElement('div');
    clear.className = 'ie-projects__clear';
    grid.appendChild(clear);

    page.appendChild(grid);
    pageEl.appendChild(page);
  }

  // --- Guestbook -------------------------------------------------------

  function renderGuestbook() {
    // Inject Altcha web component script once (Pi-hosted, loaded on demand).
    injectAltchaScript();

    const page = document.createElement('div');
    page.className = 'ie-guestbook';

    // Header
    const header = document.createElement('div');
    header.className = 'ie-guestbook__header';

    const h1 = document.createElement('h1');
    h1.className = 'ie-guestbook__title';
    h1.textContent = 'Guestbook';

    const sub = document.createElement('p');
    sub.className = 'ie-guestbook__subtitle';
    sub.textContent = 'Leave a message and say hello!';

    header.appendChild(h1);
    header.appendChild(sub);
    page.appendChild(header);

    // Form section
    const formSection = document.createElement('div');
    formSection.className = 'ie-guestbook__form-section';

    const formTitle = document.createElement('h2');
    formTitle.className = 'ie-guestbook__section-title';
    formTitle.textContent = 'Sign the Book';
    formSection.appendChild(formTitle);

    // formArea holds error + form; on success its contents are replaced
    const formArea = document.createElement('div');
    formArea.className = 'ie-guestbook__form-area';

    // Error message — hidden by default, shown via class removal
    const errorEl = document.createElement('p');
    errorEl.className = 'ie-guestbook__error ie-guestbook__message--hidden';
    errorEl.setAttribute('role', 'alert');
    formArea.appendChild(errorEl);

    const form = document.createElement('form');
    form.className = 'ie-guestbook__form';
    form.setAttribute('novalidate', '');

    // Helper: builds a labeled field row
    function makeField(labelText, inputEl, required) {
      const row = document.createElement('div');
      row.className = 'ie-guestbook__field';
      const label = document.createElement('label');
      label.className = 'ie-guestbook__label';
      label.textContent = labelText + (required ? ' *' : '');
      label.setAttribute('for', inputEl.id);
      row.appendChild(label);
      row.appendChild(inputEl);
      return row;
    }

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'gb-name';
    nameInput.className = 'ie-guestbook__input';
    nameInput.setAttribute('required', '');
    nameInput.setAttribute('maxlength', '100');
    nameInput.setAttribute('autocomplete', 'name');
    form.appendChild(makeField('Name', nameInput, true));

    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'gb-email';
    emailInput.className = 'ie-guestbook__input';
    emailInput.setAttribute('required', '');
    emailInput.setAttribute('maxlength', '200');
    emailInput.setAttribute('autocomplete', 'email');
    form.appendChild(makeField('Email (not displayed)', emailInput, true));

    const websiteInput = document.createElement('input');
    websiteInput.type = 'url';
    websiteInput.id = 'gb-website';
    websiteInput.className = 'ie-guestbook__input';
    websiteInput.placeholder = 'https://';
    websiteInput.setAttribute('maxlength', '200');
    websiteInput.setAttribute('autocomplete', 'url');
    form.appendChild(makeField('Website', websiteInput, false));

    const messageInput = document.createElement('textarea');
    messageInput.id = 'gb-message';
    messageInput.className = 'ie-guestbook__textarea';
    messageInput.setAttribute('required', '');
    messageInput.setAttribute('maxlength', '1000');
    messageInput.rows = 4;
    form.appendChild(makeField('Message', messageInput, true));

    // Resume request checkbox — auto-checked when ?resume=1 param is present
    const resumeRow = document.createElement('div');
    resumeRow.className = 'ie-guestbook__field ie-guestbook__field--checkbox';

    const resumeCheckbox = document.createElement('input');
    resumeCheckbox.type = 'checkbox';
    resumeCheckbox.id = 'gb-resume';
    resumeCheckbox.name = 'resume_requested';
    resumeCheckbox.className = 'ie-guestbook__checkbox';
    if (currentParams.resume === '1') { resumeCheckbox.checked = true; }

    const resumeLabel = document.createElement('label');
    resumeLabel.className = 'ie-guestbook__label ie-guestbook__label--checkbox';
    resumeLabel.setAttribute('for', 'gb-resume');
    resumeLabel.textContent = 'I\'d like a copy of your resume';

    resumeRow.appendChild(resumeCheckbox);
    resumeRow.appendChild(resumeLabel);
    form.appendChild(resumeRow);

    // Altcha proof-of-work widget — resolved by Pi service at /altcha/challenge.
    // Widget adds a hidden input named 'altcha' to the form when solved.
    // Form submits without it until Pocketbase hook verification is added (Phase 6).
    const altchaRow = document.createElement('div');
    altchaRow.className = 'ie-guestbook__field ie-guestbook__field--altcha';
    const altchaWidget = document.createElement('altcha-widget');
    altchaWidget.setAttribute('challengeurl', '/altcha/challenge');
    altchaWidget.setAttribute('name', 'altcha');
    altchaRow.appendChild(altchaWidget);
    form.appendChild(altchaRow);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'ie-guestbook__submit';
    submitBtn.textContent = 'Sign the Book';
    form.appendChild(submitBtn);

    const reqNote = document.createElement('p');
    reqNote.className = 'ie-guestbook__required-note';
    reqNote.textContent = '* Required fields';
    form.appendChild(reqNote);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.classList.add('ie-guestbook__message--hidden');

      const name    = nameInput.value.trim();
      const email   = emailInput.value.trim();
      const website = websiteInput.value.trim();
      const message = messageInput.value.trim();

      if (!name || !email || !message) {
        errorEl.textContent = 'Please fill in all required fields.';
        errorEl.classList.remove('ie-guestbook__message--hidden');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      const payload = {
        name: name,
        email: email,
        message: message,
        resume_requested: resumeCheckbox.checked
      };
      if (website) { payload.website = website; }

      fetch(GUESTBOOK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(async function (res) {
        if (!res.ok) {
          const errBody = await res.json().catch(function () { return {}; });
          console.error('Pocketbase error body:', errBody);
          throw new Error('HTTP ' + res.status);
        }
        return res.json();
      })
      .then(function () {
        if (window.umami) {
          window.umami.track('guestbook_submit', { success: true });
        }
        // Replace form area with success message.
        formArea.innerHTML = '';
        const successEl = document.createElement('p');
        successEl.className = 'ie-guestbook__success';
        successEl.textContent =
          'Thanks for signing the guestbook! Your message will appear within 24 hours ' +
          'after review. If you requested a resume, I will email it to you directly.';
        formArea.appendChild(successEl);
      })
      .catch(function (err) {
        console.error('Guestbook POST failed:', err);
        if (window.umami) {
          window.umami.track('guestbook_submit', { success: false });
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign the Book';
        errorEl.textContent = 'Something went wrong. Please try again later.';
        errorEl.classList.remove('ie-guestbook__message--hidden');
      });
    });

    formArea.appendChild(form);
    formSection.appendChild(formArea);
    page.appendChild(formSection);

    const divider = document.createElement('hr');
    divider.className = 'ie-guestbook__divider';
    divider.setAttribute('aria-hidden', 'true');
    page.appendChild(divider);

    // Entries section
    const entriesSection = document.createElement('div');
    entriesSection.className = 'ie-guestbook__entries-section';

    const entriesTitle = document.createElement('h2');
    entriesTitle.className = 'ie-guestbook__section-title';
    entriesTitle.textContent = 'Recent Entries';
    entriesSection.appendChild(entriesTitle);

    const entriesContainer = document.createElement('div');
    entriesContainer.className = 'ie-guestbook__entries';

    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'ie-guestbook__loading';
    loadingMsg.textContent = 'Loading entries...';
    entriesContainer.appendChild(loadingMsg);

    entriesSection.appendChild(entriesContainer);
    page.appendChild(entriesSection);
    pageEl.appendChild(page);

    // Fetch entries after page is in DOM so async updates render correctly.
    loadGuestbookEntries(entriesContainer);
  }

  // Fetch approved guestbook entries, using a 24h sessionStorage cache.
  function loadGuestbookEntries(container) {
    const cacheTs   = sessionStorage.getItem('guestbook_cache_ts');
    const cacheData = sessionStorage.getItem('guestbook_cache');

    if (cacheTs && cacheData) {
      const age = Date.now() - parseInt(cacheTs, 10);
      if (age < GUESTBOOK_CACHE_TTL_MS) {
        try {
          renderEntries(container, JSON.parse(cacheData));
          return;
        } catch (e) {
          // Cache corrupt — fall through to fetch
        }
      }
    }

    fetch(GUESTBOOK_API_URL + '?filter=(approved%3Dtrue)&sort=-created')
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        const entries = (data && Array.isArray(data.items)) ? data.items : [];
        sessionStorage.setItem('guestbook_cache', JSON.stringify(entries));
        sessionStorage.setItem('guestbook_cache_ts', String(Date.now()));
        renderEntries(container, entries);
      })
      .catch(function () {
        container.innerHTML = '';
        const err = document.createElement('p');
        err.className = 'ie-guestbook__error';
        err.textContent = 'Could not load entries. Please try again later.';
        container.appendChild(err);
      });
  }

  // Render fetched entries into container; all user content via textContent (no XSS).
  function renderEntries(container, entries) {
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ie-guestbook__empty';
      empty.textContent = 'No entries yet. Be the first to sign!';
      container.appendChild(empty);
      return;
    }

    entries.forEach(function (entry) {
      const item = document.createElement('div');
      item.className = 'ie-guestbook__entry';

      const meta = document.createElement('div');
      meta.className = 'ie-guestbook__entry-meta';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ie-guestbook__entry-name';
      nameSpan.textContent = entry.name;
      meta.appendChild(nameSpan);

      // Validate website before rendering as a link — only https/http allowed.
      if (entry.website && isValidUrl(entry.website)) {
        meta.appendChild(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.className = 'ie-guestbook__entry-link';
        link.href = entry.website;
        link.textContent = entry.website;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        meta.appendChild(link);
      }

      if (entry.created) {
        meta.appendChild(document.createTextNode(' · '));
        const dateSpan = document.createElement('span');
        dateSpan.className = 'ie-guestbook__entry-date';
        try {
          dateSpan.textContent = new Date(entry.created).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          });
        } catch (ignore) {
          dateSpan.textContent = entry.created;
        }
        meta.appendChild(dateSpan);
      }

      item.appendChild(meta);

      const msg = document.createElement('p');
      msg.className = 'ie-guestbook__entry-msg';
      msg.textContent = entry.message;
      item.appendChild(msg);

      container.appendChild(item);
    });
  }

  // Inject Altcha web component script into <head> once.
  // Served from Pi at /altcha/altcha.min.js — not a CDN call.
  // Guard prevents double-injection on subsequent guestbook renders.
  function injectAltchaScript() {
    if (document.querySelector('script[data-altcha-widget]')) { return; }
    const s = document.createElement('script');
    s.src = '/altcha/altcha.min.js';
    s.async = true;
    s.setAttribute('data-altcha-widget', '1');
    document.head.appendChild(s);
  }

  // Validate a URL before rendering as an <a> — accepts https/http only.
  // Rejects javascript:, data:, and anything that throws in URL constructor.
  function isValidUrl(str) {
    if (!str || typeof str !== 'string') { return false; }
    try {
      const url = new URL(str);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (e) {
      return false;
    }
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
