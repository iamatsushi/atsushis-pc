if (!window.APC || !window.APC.timing) throw new Error('[APC] win98-timing.js must load before netescape-destinations.js');
// js/apps/netescape-destinations.js
// NetEscape Curated Destinations — canvas scan-reveal of 2001-era Wayback screenshots.
//
// Exports: window.APC.neDestinations = { isDestination, render, cleanup }
//
// Integration point: netescape.js navigate() calls isDestination(normalized) after
// the isConnected check and before renderPartialLoad(). If true, calls render(normalized)
// and returns early. No other changes to netescape.js.
//
// All timing values come from window.APC.timing.DESTINATIONS_* tokens.
// Never hardcode ms values here.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DESTINATIONS map — single source of truth.
  // To add or remove a destination, edit only this object.
  // Keys are normalized URLs (no protocol, no www., no trailing slash).
  // screenshot: path relative to site root, or null for Napster special case.
  // folder: 'games' | 'cartoons' | 'sports' | 'cool-stuff' | null (root level)
  // ---------------------------------------------------------------------------

  var DESTINATIONS = {
    // Games
    'miniclip.com': {
      label: 'Miniclip',
      screenshot: 'assets/destinations/miniclip.jpg',
      folder: 'games'
    },
    'ebaumsworld.com': {
      label: "eBaum's World",
      screenshot: 'assets/destinations/ebaumsworld.jpg',
      folder: 'games'
    },
    'games.com': {
      label: 'Games.com',
      screenshot: 'assets/destinations/games.jpg',
      folder: 'games'
    },
    'shockwave.com': {
      label: 'Shockwave',
      screenshot: 'assets/destinations/shockwave.jpg',
      folder: 'games'
    },
    'addictinggames.com': {
      label: 'AddictingGames',
      screenshot: 'assets/destinations/addictinggames.jpg',
      folder: 'games'
    },
    'neopets.com': {
      label: 'Neopets',
      screenshot: 'assets/destinations/neopets.jpg',
      folder: 'games'
    },
    // Cartoons
    'cartoonnetwork.com': {
      label: 'Cartoon Network',
      screenshot: 'assets/destinations/cartoonnetwork.jpg',
      folder: 'cartoons'
    },
    'nick.com': {
      label: 'Nick.com',
      screenshot: 'assets/destinations/nick.jpg',
      folder: 'cartoons'
    },
    'adultswim.com': {
      label: 'Adult Swim',
      screenshot: 'assets/destinations/adultswim.jpg',
      folder: 'cartoons'
    },
    // Sports
    'sports.yahoo.com': {
      label: 'Yahoo Sports',
      screenshot: 'assets/destinations/yahoo-sports.jpg',
      folder: 'sports'
    },
    'basketball.fantasysports.yahoo.com': {
      label: 'Yahoo Fantasy Basketball',
      screenshot: 'assets/destinations/yahoo-fantasy-basketball.jpg',
      folder: 'sports'
    },
    'nba.com': {
      label: 'NBA.com',
      screenshot: 'assets/destinations/nba.jpg',
      folder: 'sports'
    },
    'trailblazers.com': {
      label: 'Trail Blazers',
      screenshot: 'assets/destinations/trailblazers.jpg',
      folder: 'sports'
    },
    // Cool Stuff
    'toysrus.com': {
      label: 'Toys"R"Us',
      screenshot: 'assets/destinations/toysrus.jpg',
      folder: 'cool-stuff'
    },
    'blockbuster.com': {
      label: 'Blockbuster',
      screenshot: 'assets/destinations/blockbuster.jpg',
      folder: 'cool-stuff'
    },
    // Root (no folder)
    'yahooligans.com': {
      label: 'Yahooligans',
      screenshot: 'assets/destinations/yahooligans.jpg',
      folder: null
    },
    'ask.com': {
      label: 'Ask Jeeves',
      screenshot: 'assets/destinations/ask.jpg',
      folder: null
    },
    // Napster — special case. No screenshot, no audio, no canvas.
    // White page with verbatim July 2001 RIAA court shutdown notice.
    'napster.com': {
      label: 'Napster',
      screenshot: null,
      folder: null
    }
  };

  // ---------------------------------------------------------------------------
  // Module-level state
  // revealTimer: the setInterval handle for scan-reveal; must be cleared in cleanup().
  // clickListener: the canvas click handler; stored so it can be removed on cleanup.
  // ---------------------------------------------------------------------------

  var revealTimer = null;
  var clickListener = null;
  var activeCanvas = null;  // the canvas currently in pageEl, if any

  // Modem handshake audio — preloaded once at module init.
  // Same pattern as dialupAudio in netescape.js.
  // .play() is only called inside render(), after a user gesture has occurred.
  var modemAudio = new Audio('assets/audio/modem-handshake.mp3');
  modemAudio.preload = 'auto';
  modemAudio.addEventListener('error', function () {});

  // ---------------------------------------------------------------------------
  // cleanup() — cancel any in-flight reveal, stop audio, remove canvas.
  // Called by netescape.js navigate() before any new render begins.
  // Must be idempotent — safe to call when nothing is active.
  // ---------------------------------------------------------------------------

  function cleanup() {
    if (revealTimer !== null) {
      clearInterval(revealTimer);
      revealTimer = null;
    }
    if (modemAudio) {
      modemAudio.pause();
      modemAudio.currentTime = 0;
    }
    if (activeCanvas && clickListener) {
      activeCanvas.removeEventListener('click', clickListener);
      clickListener = null;
    }
    activeCanvas = null;
  }

  // ---------------------------------------------------------------------------
  // isDestination(normalized) — returns true if the URL is in DESTINATIONS.
  // ---------------------------------------------------------------------------

  function isDestination(normalized) {
    return Object.prototype.hasOwnProperty.call(DESTINATIONS, normalized);
  }

  // ---------------------------------------------------------------------------
  // render(normalized) — main entry point called by netescape.js navigate().
  // Handles both Napster special case and standard canvas scan-reveal.
  // ---------------------------------------------------------------------------

  function render(normalized) {
    var config = DESTINATIONS[normalized];
    if (!config) { return; }

    // Require pageEl from netescape.js via the window-level navigate() caller.
    // We reach pageEl through the netescape chrome — find it in the live DOM.
    var pageEl = document.querySelector('.netescape-chrome__page');
    if (!pageEl) { return; }

    var statusEl = document.querySelector('.netescape-chrome__status-text');

    // Always clean up any previous destination render before starting a new one.
    cleanup();
    pageEl.innerHTML = '';

    var t = window.APC.timing;

    // Status bar: "Connecting to [domain]..."
    if (statusEl) { statusEl.textContent = 'Connecting to ' + normalized + '...'; }

    if (config.screenshot === null) {
      // --- Napster special case ---
      // No audio. No canvas. Silence, then the court notice.
      renderNapster(pageEl, statusEl, t);
    } else {
      // --- Standard scan-reveal ---
      renderScanReveal(normalized, config, pageEl, statusEl, t);
    }
  }

  // ---------------------------------------------------------------------------
  // renderNapster — white page, court notice, no audio, no canvas.
  // ---------------------------------------------------------------------------

  function renderNapster(pageEl, statusEl, t) {
    // Wait DESTINATIONS_STATUS_CONNECTING_MS, then DESTINATIONS_NAPSTER_PAUSE_MS,
    // then render the notice. Total silence before text appears.
    setTimeout(function () {
      setTimeout(function () {
        if (statusEl) { statusEl.textContent = 'Done'; }

        var notice = document.createElement('div');
        notice.className = 'netescape-napster-notice';
        notice.setAttribute('role', 'main');
        notice.setAttribute('aria-label', 'Napster shutdown notice');

        var p = document.createElement('p');
        p.textContent =
          'NOTICE: On July 11, 2001, the Ninth Circuit Court of Appeals ' +
          'affirmed the preliminary injunction against Napster, Inc. ' +
          'As required by court order, Napster has been shut down. ' +
          'Napster has been working diligently to comply with the court order. ' +
          'The Napster service has been suspended effective today.';
        notice.appendChild(p);

        // Page el already cleared by render() before this call.
        pageEl.appendChild(notice);

        if (window.umami) {
          window.umami.track('destination_navigate', { domain: 'napster.com', type: 'napster' });
        }
      }, t.DESTINATIONS_NAPSTER_PAUSE_MS);
    }, t.DESTINATIONS_STATUS_CONNECTING_MS);
  }

  // ---------------------------------------------------------------------------
  // renderScanReveal — canvas-based top-to-bottom progressive reveal.
  // ---------------------------------------------------------------------------

  function renderScanReveal(normalized, config, pageEl, statusEl, t) {
    setTimeout(function () {
      // Load the screenshot image.
      var img = new Image();

      img.onerror = function () {
        // Graceful degradation: show plain error text, never crash.
        if (statusEl) { statusEl.textContent = 'Error'; }
        var errEl = document.createElement('p');
        errEl.textContent = 'Could not load page.';
        pageEl.innerHTML = '';
        pageEl.appendChild(errEl);
      };

      img.onload = function () {
        // Canvas sized to pageEl width; height preserves image aspect ratio.
        var canvasWidth = pageEl.clientWidth || 680;
        var scale = canvasWidth / img.naturalWidth;
        var canvasHeight = Math.round(img.naturalHeight * scale);

        var canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.display = 'block';
        canvas.style.width = canvasWidth + 'px';
        canvas.setAttribute('aria-label', config.label + ' — 2001 screenshot');
        canvas.setAttribute('role', 'img');

        // Mount canvas into pageEl before reveal starts.
        pageEl.innerHTML = '';
        pageEl.appendChild(canvas);
        activeCanvas = canvas;

        var ctx = canvas.getContext('2d');
        var revealY = 0;

        // Play modem audio at reveal start.
        try {
          modemAudio.currentTime = 0;
          modemAudio.play().catch(function () {});
        } catch (e) {}

        if (statusEl) { statusEl.textContent = 'Loading ' + normalized + '...'; }

        // Scan-reveal: each tick draws a band of random height from the current y position.
        revealTimer = setInterval(function () {
          if (revealY >= canvasHeight) {
            // Reveal complete.
            clearInterval(revealTimer);
            revealTimer = null;

            modemAudio.pause();
            modemAudio.currentTime = 0;

            if (statusEl) { statusEl.textContent = 'Done'; }

            // Draw any remaining pixels (ensure full image is visible).
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

            // Attach click-anywhere error dialog.
            attachClickDialog(canvas, normalized, statusEl);

            if (window.umami) {
              window.umami.track('destination_navigate', { domain: normalized, type: 'destination' });
            }
            return;
          }

          // Random strip height for this tick.
          var stripH = t.rand(t.DESTINATIONS_REVEAL_STRIP_MIN_PX, t.DESTINATIONS_REVEAL_STRIP_MAX_PX);
          // Clamp so we never overdraw past the bottom.
          if (revealY + stripH > canvasHeight) { stripH = canvasHeight - revealY; }

          // Draw the corresponding slice of the source image.
          // Source rect: full width, stripH px tall, from y = revealY (scaled back to image coords).
          var srcY = Math.round(revealY / scale);
          var srcH = Math.round(stripH / scale);
          ctx.drawImage(
            img,
            0, srcY, img.naturalWidth, srcH,  // source rect
            0, revealY, canvasWidth, stripH    // dest rect
          );

          revealY += stripH;
        }, t.DESTINATIONS_REVEAL_INTERVAL_MS);
      };

      img.src = config.screenshot;

    }, t.DESTINATIONS_STATUS_CONNECTING_MS);
  }

  // ---------------------------------------------------------------------------
  // attachClickDialog — adds the click-anywhere error dialog to the canvas.
  // Only attached after reveal completes — no clicks during reveal.
  // Uses existing netescape-freeze-dialog CSS classes (no new CSS).
  // ---------------------------------------------------------------------------

  function attachClickDialog(canvas, normalized, statusEl) {
    clickListener = function () {
      showDestinationDialog(canvas, normalized);
    };
    canvas.style.cursor = 'default';
    canvas.addEventListener('click', clickListener);
  }

  function showDestinationDialog(canvas, normalized) {
    // Remove click listener to prevent double-dialog.
    if (clickListener) {
      canvas.removeEventListener('click', clickListener);
      clickListener = null;
    }

    // Find chrome container — dialog is appended inside the chrome, not body.
    var container = canvas.parentNode ? canvas.parentNode.parentNode : document.body;

    var overlay = document.createElement('div');
    overlay.className = 'netescape-freeze-dialog';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'dest-dialog-msg');

    var win = document.createElement('div');
    win.className = 'netescape-freeze-dialog__win';

    var titlebar = document.createElement('div');
    titlebar.className = 'netescape-freeze-dialog__titlebar';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'netescape-freeze-dialog__title';
    titleSpan.textContent = 'NetEscape';
    titlebar.appendChild(titleSpan);
    win.appendChild(titlebar);

    var body = document.createElement('div');
    body.className = 'netescape-freeze-dialog__body';

    var icon = document.createElement('span');
    icon.className = 'netescape-freeze-dialog__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u26A0'; // ⚠

    var msg = document.createElement('p');
    msg.className = 'netescape-freeze-dialog__msg';
    msg.id = 'dest-dialog-msg';
    msg.textContent =
      'This page cannot be displayed \u2014 ahisaka.com is a selective recreation. ' +
      'Screenshots are provided for historical authenticity. ' +
      'Full navigation is not available.';

    body.appendChild(icon);
    body.appendChild(msg);
    win.appendChild(body);

    var footer = document.createElement('div');
    footer.className = 'netescape-freeze-dialog__footer';

    var okBtn = document.createElement('button');
    okBtn.className = 'win98-button netescape-freeze-dialog__btn';
    okBtn.textContent = 'OK';

    footer.appendChild(okBtn);
    win.appendChild(footer);
    overlay.appendChild(win);
    container.appendChild(overlay);

    okBtn.focus();

    function close() {
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      // Re-attach click listener so subsequent clicks show the dialog again.
      if (activeCanvas) {
        clickListener = function () {
          showDestinationDialog(activeCanvas, normalized);
        };
        activeCanvas.addEventListener('click', clickListener);
      }
      if (window.umami) {
        window.umami.track('destination_screenshot_dismiss', { domain: normalized });
      }
    }

    okBtn.addEventListener('click', close);

    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Enter') { close(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.APC = window.APC || {};
  window.APC.neDestinations = {
    isDestination: isDestination,
    render: render,
    cleanup: cleanup
  };

}());
