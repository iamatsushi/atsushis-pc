if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before widgets.js');
// widgets.js — Taskbar weather and RAM widgets
// Fetches /weather (Caddy proxy → OpenWeatherMap) and /ram (Caddy proxy → Pi RAM server).
// All fetches use setTimeout-chained scheduling — never setInterval (per project rules).
// Weather uses browser Geolocation API to pass visitor coords to the proxy; falls back
// to Pi default (Portland, OR) if geolocation is denied or unavailable.
// API key for OpenWeatherMap lives only in Pi env vars; client-side JS never sees it.
// Namespaced under window.APC.widgets per project conventions.

window.APC = window.APC || {};

window.APC.widgets = (function () {
  'use strict';

  // Fetch intervals
  const WEATHER_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
  const RAM_INTERVAL_MS     = 30 * 1000;        // 30 seconds

  // Easter egg thresholds
  const RAM_EGG_CLICKS  = 5;
  const RAM_EGG_WINDOW  = 3000;  // ms

  // --- Weather condition code → emoji ---------------------------------
  // Maps OpenWeatherMap condition ID groups to display emoji.
  // Group boundaries: 2xx thunderstorm, 3xx drizzle, 5xx rain,
  // 6xx snow, 7xx atmosphere, 800 clear, 801 few clouds, 802–899 cloudy.

  function getWeatherEmoji(id) {
    if (id === 800)                { return '\u2600\uFE0F'; }  // ☀️  clear sky
    if (id === 801)                { return '\u26C5'; }         // ⛅  few clouds
    if (id >= 802 && id <= 899)   { return '\u2601\uFE0F'; }  // ☁️  cloudy (802–899)
    const group = Math.floor(id / 100);
    if (group === 2) { return '\u26C8'; }        // ⛈  thunderstorm (200–299)
    if (group === 3) { return '\uD83C\uDF26'; }  // 🌦  drizzle     (300–399)
    if (group === 5) { return '\uD83C\uDF27'; }  // 🌧  rain        (500–599)
    if (group === 6) { return '\uD83C\uDF28'; }  // 🌨  snow        (600–699)
    if (group === 7) { return '\uD83C\uDF2B'; }  // 🌫  atmosphere  (700–799)
    return '\uD83C\uDF21';                        // 🌡  fallback
  }

  // --- Weather widget -------------------------------------------------

  var weatherEl = null;
  var lastWeatherText = '--\u00B0F';  // placeholder shown while first fetch is in-flight
  var cachedLat = null;   // visitor latitude from Geolocation API (null until resolved)
  var cachedLon = null;   // visitor longitude

  function initWeather() {
    weatherEl = document.getElementById('taskbar-weather');
    if (weatherEl) { weatherEl.textContent = '--\u00B0F'; }

    // Request geolocation once; cache coords for all subsequent fetches.
    // If denied, timed out, or unavailable, fall back to Pi default (Portland).
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          cachedLat = pos.coords.latitude;
          cachedLon = pos.coords.longitude;
          fetchWeather();
        },
        function () {
          // Permission denied or error — proceed without coords
          fetchWeather();
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    } else {
      fetchWeather();
    }
  }

  // Build the /weather URL, appending visitor coords when available.
  function buildWeatherUrl() {
    if (cachedLat !== null && cachedLon !== null) {
      return '/weather?lat=' + cachedLat.toFixed(4) + '&lon=' + cachedLon.toFixed(4);
    }
    return '/weather';
  }

  function fetchWeather() {
    fetch(buildWeatherUrl())
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        // OWM response: { main: { temp }, weather: [{ id }], name: 'CityName' }
        var temp = Math.round(data.main.temp);
        var condId = data.weather && data.weather[0] ? data.weather[0].id : null;
        var emoji = condId !== null ? getWeatherEmoji(condId) : '\uD83C\uDF21';
        var city = (data.name && data.name.length) ? data.name : 'Local';
        lastWeatherText = emoji + ' ' + city + ' ' + temp + '\u00B0F';
        // Render delay: keep '--°F' visible for WEATHER_LOAD ms before revealing (Texture Zone)
        var t = window.APC.timing;
        setTimeout(function () {
          if (weatherEl) { weatherEl.textContent = lastWeatherText; }
        }, t.rand(t.WEATHER_LOAD_MIN_MS, t.WEATHER_LOAD_MAX_MS));
      })
      .catch(function () {
        // Silent fail — display keeps last known value (initialized to '--')
      })
      .then(function () {
        // Always schedule the next fetch, success or failure
        setTimeout(fetchWeather, WEATHER_INTERVAL_MS);
      });
  }

  // --- Tray balloon state ---------------------------------------------
  // XP-style balloon notifications. Two types alternate (never random) —
  // Low Disk Space and Security Risk. Suppressed while a balloon is visible
  // or while Protected Path is active (window.APC.session.protectedPathActive).

  var isBalloonVisible = false;    // prevents overlapping balloons
  var firstBalloonFired = false;    // true after first balloon has shown; switches to normal interval
  var balloonTypeIndex = 0;        // alternates through BALLOON_TYPES
  var currentBalloon = null;       // live DOM element (or null)
  var trayPopupTimer = null;       // inter-balloon schedule timer
  var autoTimerId = null;          // auto-dismiss timer for live balloon
  var glitchTimerId = null;        // self-correct timer for behind-taskbar glitch
  var diskReappearTimer = null;    // re-show Low Disk Space after ❌ dismiss
  var diskCleanupDone = false;     // true after diskcleanup:complete fires — suppresses Low Disk Space
  // Persistent ARIA live region — appended once on init, mutated per balloon.
  var liveRegion = null;

  // Low Disk Space body click — opens Disk Cleanup modal (spec 24c49bfe)
  function handleLowDiskClick() {
    clearTimeout(diskReappearTimer);
    diskReappearTimer = null;
    if (window.APC.apps && window.APC.apps.diskcleanup && typeof window.APC.apps.diskcleanup.open === 'function') {
      window.APC.apps.diskcleanup.open();
    }
    if (window.umami) {
      window.umami.track('tray_balloon_action', { balloon_type: 'low_disk_space' });
    }
  }

  // Called when user clicks ❌ on Low Disk Space balloon without cleaning.
  // Schedules reappearance after TRAY_DISK_REAPPEAR_MS (2 minutes).
  function scheduleLowDiskReappear() {
    clearTimeout(diskReappearTimer);
    var t = window.APC.timing;
    diskReappearTimer = setTimeout(function () {
      diskReappearTimer = null;
      if (!diskCleanupDone && !isBalloonVisible) {
        var session = window.APC && window.APC.session;
        if (!(session && session.protectedPathActive)) {
          showTrayBalloon(BALLOON_TYPES[0]); // always Low Disk Space
        }
      }
    }, t.TRAY_DISK_REAPPEAR_MS);
  }

  function handleSecurityRiskClick() {
    showWidgetModal('Security Center', 'No threats detected. Atsushi\u2019s code is clean.');
    if (window.umami) {
      window.umami.track('tray_balloon_action', { balloon_type: 'security_risk' });
    }
  }

  var BALLOON_TYPES = [
    {
      type: 'low_disk_space',
      icon: '\u26A0\uFE0F',
      title: 'Low Disk Space',
      body: 'You are running low on disk space on Local Disk (C:). Click here to see if you can free space on this drive.',
      onBodyClick: handleLowDiskClick
    },
    {
      type: 'security_risk',
      icon: '\uD83D\uDEE1\uFE0F',
      title: 'Your computer may be at risk',
      body: 'Antivirus software might not be installed. Click this balloon to fix this problem.',
      onBodyClick: handleSecurityRiskClick
    }
  ];

  // --- RAM widget -----------------------------------------------------

  var ramEl = null;
  var lastRamText = '--';
  var ramClickCount = 0;
  var ramFirstClickTime = 0;

  function initRam() {
    ramEl = document.getElementById('taskbar-ram');
    if (ramEl) {
      ramEl.textContent = '--';
      bindRamEasterEgg();
    }
    fetchRam();
  }

  function fetchRam() {
    fetch('/ram')
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        // /ram response shape: { total, available, used } in kB
        if (!data || !data.total || data.total === 0) { throw new Error('Invalid RAM data'); }
        var pct = Math.round((data.used / data.total) * 100);
        lastRamText = 'RAM: ' + pct + '%';
        // Render delay: wait RAM_RENDER ms before updating display (Texture Zone)
        var t = window.APC.timing;
        setTimeout(function () {
          if (ramEl && !window.APC.isRamSpiking) { ramEl.textContent = lastRamText; }
        }, t.rand(t.RAM_RENDER_MIN_MS, t.RAM_RENDER_MAX_MS));
        // Schedule next fetch from success path — explicit, not chained after .catch()
        setTimeout(fetchRam, RAM_INTERVAL_MS);
      })
      .catch(function () {
        // Silent fail — display keeps last known value (initialized to '--')
        // Schedule next fetch from failure path so polling always continues
        setTimeout(fetchRam, RAM_INTERVAL_MS);
      });
  }

  // --- RAM easter egg -------------------------------------------------
  // 5 clicks within 3 seconds → FATAL ERROR dialog

  function bindRamEasterEgg() {
    ramEl.addEventListener('click', function () {
      var now = Date.now();
      if (ramClickCount > 0 && now - ramFirstClickTime > RAM_EGG_WINDOW) {
        ramClickCount = 0;
      }
      if (ramClickCount === 0) { ramFirstClickTime = now; }
      ramClickCount++;
      if (ramClickCount >= RAM_EGG_CLICKS) {
        ramClickCount = 0;
        ramFirstClickTime = 0;
        showWidgetModal(
          'FATAL ERROR',
          'Insufficient memory to complete this operation. ' +
          'Please close all programs and sacrifice a floppy disk to continue.'
        );
        if (window.umami) {
          window.umami.track('easteregg_trigger', { easter_egg: 'ram_overload' });
        }
      }
    });
  }

  // --- Tray balloons  (Texture Zone) ----------------------------------
  // XP-style balloon notifications from the notification area.
  // Types alternate: Low Disk Space → Security Risk → repeat.
  // Suppressed while balloon is visible or Protected Path is active.
  // Behind-taskbar glitch fires 1-in-20: renders at z-index 998 (below
  // taskbar at 999) then self-corrects after TRAY_BALLOON_GLITCH_MIN/MAX ms.

  function initTrayPopups() {
    // Persistent ARIA live region — must exist before text is set.
    // Mutating a pre-existing region is reliable; appending a new
    // populated aria-live element is not.
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.position = 'absolute';
    liveRegion.style.width = '1px';
    liveRegion.style.height = '1px';
    liveRegion.style.overflow = 'hidden';
    liveRegion.style.clip = 'rect(0,0,0,0)';
    liveRegion.style.whiteSpace = 'nowrap';
    document.body.appendChild(liveRegion);
    scheduleTrayPopup();

    // diskcleanup:complete → suppress Low Disk Space for rest of session
    document.addEventListener('diskcleanup:complete', function () {
      diskCleanupDone = true;
      clearTimeout(diskReappearTimer);
      diskReappearTimer = null;
      if (window.umami) {
        window.umami.track('disk_cleanup_success');
      }
    });
  }

  function scheduleTrayPopup() {
    var t = window.APC.timing;
    // First balloon fires after TRAY_FIRST_POPUP_MS (45s) so most visitors see at least one.
    // Subsequent balloons use the normal TRAY_POPUP_MIN/MAX_MS interval (90–300s).
    var delay = firstBalloonFired
      ? t.rand(t.TRAY_POPUP_MIN_MS, t.TRAY_POPUP_MAX_MS)
      : t.TRAY_FIRST_POPUP_MS;
    trayPopupTimer = setTimeout(function () {
      var session = window.APC && window.APC.session;
      // Skip if a balloon is already up or Protected Path is active
      if (!isBalloonVisible && !(session && session.protectedPathActive)) {
        showTrayBalloon(BALLOON_TYPES[balloonTypeIndex % BALLOON_TYPES.length]);
        balloonTypeIndex++;
        firstBalloonFired = true;
      }
      scheduleTrayPopup();
    }, delay);
  }

  function showTrayBalloon(spec) {
    var t = window.APC.timing;
    isBalloonVisible = true;

    // Build XP balloon DOM
    var balloon = document.createElement('div');
    balloon.className = 'tray-balloon';
    balloon.setAttribute('role', 'alert');
    balloon.setAttribute('aria-label', spec.title + ': ' + spec.body);

    var header = document.createElement('div');
    header.className = 'tray-balloon__header';

    var iconEl = document.createElement('span');
    iconEl.className = 'tray-balloon__icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = spec.icon;

    var titleEl = document.createElement('span');
    titleEl.className = 'tray-balloon__title';
    titleEl.textContent = spec.title;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'tray-balloon__close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Dismiss');

    header.appendChild(iconEl);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    var bodyEl = document.createElement('div');
    bodyEl.className = 'tray-balloon__body';
    bodyEl.textContent = spec.body;

    balloon.appendChild(header);
    balloon.appendChild(bodyEl);
    document.body.appendChild(balloon);
    currentBalloon = balloon;

    // Behind-taskbar glitch: 1-in-20 chance renders below taskbar (z-index 998)
    // Self-corrects after TRAY_BALLOON_GLITCH_MIN/MAX ms
    if (Math.random() < t.TRAY_BALLOON_GLITCH_CHANCE) {
      balloon.style.zIndex = t.TRAY_BALLOON_GLITCH_Z_INDEX;
      glitchTimerId = setTimeout(function () {
        if (balloon.parentNode) { balloon.style.zIndex = t.TRAY_BALLOON_Z_INDEX; }
        glitchTimerId = null;
      }, t.rand(t.TRAY_BALLOON_GLITCH_MIN_MS, t.TRAY_BALLOON_GLITCH_MAX_MS));
    }

    // Double-rAF: browser must lay out the element before the --visible class
    // triggers the CSS transition; single rAF is not reliable across all engines.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        balloon.classList.add('tray-balloon--visible');
      });
    });

    // Announce via persistent live region
    if (liveRegion) { liveRegion.textContent = spec.title + ': ' + spec.body; }

    if (window.umami) {
      window.umami.track('tray_balloon_shown', { balloon_type: spec.type });
    }

    // Auto-dismiss: Security Risk only (10s). Low Disk Space never auto-dismisses.
    if (spec.type !== 'low_disk_space') {
      autoTimerId = setTimeout(function () {
        dismissBalloon(balloon, 'auto');
      }, t.TRAY_POPUP_DISPLAY_MS);
    }

    // Close button — delayed response per timing spec (Texture Zone click latency)
    closeBtn.addEventListener('click', function () {
      setTimeout(function () {
        dismissBalloon(balloon, 'close');
        // Low Disk Space ❌ → schedule reappear in 2 minutes
        if (spec.type === 'low_disk_space' && !diskCleanupDone) {
          scheduleLowDiskReappear();
        }
      }, t.rand(t.TRAY_CLICK_MIN_MS, t.TRAY_CLICK_MAX_MS));
    });

    // Body click — delayed response → action handler
    bodyEl.addEventListener('click', function () {
      setTimeout(function () {
        dismissBalloon(balloon, 'body');
        spec.onBodyClick();
      }, t.rand(t.TRAY_CLICK_MIN_MS, t.TRAY_CLICK_MAX_MS));
    });
  }

  function dismissBalloon(balloon, source) {
    if (!balloon || !balloon.parentNode) { return; }
    var t = window.APC.timing;

    clearTimeout(autoTimerId);
    autoTimerId = null;
    clearTimeout(glitchTimerId);
    glitchTimerId = null;

    // body-click fires its own analytics event via the action handler
    if (window.umami && source !== 'body') {
      window.umami.track('tray_balloon_dismissed', { source: source });
    }

    // Exit transition: add --exit, then remove element after TRAY_BALLOON_EXIT_MS
    balloon.classList.add('tray-balloon--exit');
    setTimeout(function () {
      if (balloon.parentNode) { balloon.parentNode.removeChild(balloon); }
      if (currentBalloon === balloon) { currentBalloon = null; }
      isBalloonVisible = false;
      if (liveRegion) { liveRegion.textContent = ''; }
    }, t.TRAY_BALLOON_EXIT_MS);
  }

  // --- Shared modal helper --------------------------------------------
  // Builds a Win98-style message dialog using the .win98-msgbox-overlay
  // CSS classes defined in win98.css. Shared by widget easter eggs.

  function showWidgetModal(title, message) {
    const overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';

    const box = document.createElement('div');
    box.className = 'win98-msgbox';

    const tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = title;
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
    msg.textContent = message;
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

    okBtn.focus();
  }

  // --- Public API -----------------------------------------------------

  // --- Dial-Up Struggle Sequence -------------------------------------
  // Triggered once per session when netescape.js fires system:high_load_start
  // (i.e. the user successfully completes the dial-up sequence).
  // Simulates the 1998 machine straining under the weight of the internet:
  //   - RAM gauge spikes to 99% (overrides real Pi stats temporarily)
  //   - HDD chatter ramps up 30% via the controlled boot.js valve
  //   - Anti-Virus balloon fires immediately
  //   - Low Disk Space balloon fires 8 seconds later (if cleanup not done)
  // One-fire guard prevents repeat on soft restart within same page session.

  var highLoadTriggered = false;

  function initHighLoadEndListener() {
    document.addEventListener('system:high_load_end', function () {
      // 1. Release the RAM gauge back to live Pi fetching
      window.APC.isRamSpiking = false;

      // 2. Fade HDD chatter back down to quiet background level over 3 seconds
      if (window.APC.boot && typeof window.APC.boot.setHddVolume === 'function') {
        window.APC.boot.setHddVolume(0.2, 3000);
      }

      if (window.umami) {
        window.umami.track('system_high_load_end');
      }
    });
  }

  function initHighLoadListener() {
    document.addEventListener("system:high_load_start", function () {
      if (highLoadTriggered) { return; }
      highLoadTriggered = true;

      // 1. Spike the RAM gauge visually for 30 seconds
      window.APC.isRamSpiking = true;
      if (ramEl) { ramEl.textContent = "RAM: 99%"; }
      setTimeout(function () {
        window.APC.isRamSpiking = false;
      }, 30000);

      // 2. Ramp up HDD chatter volume (~30% above background 0.2 level)
      if (window.APC.boot && typeof window.APC.boot.setHddVolume === "function") {
        window.APC.boot.setHddVolume(0.5, 2000);
      }

      // 3. Anti-Virus balloon fires immediately
      var session = window.APC && window.APC.session;
      if (!isBalloonVisible && !(session && session.protectedPathActive)) {
        showTrayBalloon({
          type: "security_risk",
          icon: "\u26A0\uFE0F",
          title: "Anti-Virus Warning",
          body: "Virus definitions are out of date. Your computer may be at risk.",
          onBodyClick: handleSecurityRiskClick
        });
      }

      // 4. Low Disk Space balloon fires 8 seconds later
      setTimeout(function () {
        if (!diskCleanupDone && !isBalloonVisible) {
          var sess = window.APC && window.APC.session;
          if (!(sess && sess.protectedPathActive)) {
            showTrayBalloon(BALLOON_TYPES[0]);
          }
        }
      }, 8000);

      if (window.umami) {
        window.umami.track("system_high_load_start");
      }
    });
  }

  function init() {
    initWeather();
    initRam();
    initTrayPopups();
    initHighLoadListener();
    initHighLoadEndListener();
  }

  // Called by boot.restart() to cancel all in-flight timers and clear any
  // live balloon so soft restarts don't accumulate parallel popup chains.
  function reset() {
    clearTimeout(trayPopupTimer);
    trayPopupTimer = null;
    clearTimeout(autoTimerId);
    autoTimerId = null;
    clearTimeout(glitchTimerId);
    glitchTimerId = null;
    if (currentBalloon && currentBalloon.parentNode) {
      currentBalloon.parentNode.removeChild(currentBalloon);
      currentBalloon = null;
    }
    isBalloonVisible = false;
    balloonTypeIndex = 0;
    firstBalloonFired = false;
    clearTimeout(diskReappearTimer);
    diskReappearTimer = null;
    diskCleanupDone = false;
    if (liveRegion) { liveRegion.textContent = ''; }
  }

  return { init: init, reset: reset };

}());
