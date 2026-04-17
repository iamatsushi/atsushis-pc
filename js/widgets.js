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

  // --- Tray pop-up state ----------------------------------------------

  var trayPopupTimer = null;

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
          if (ramEl) { ramEl.textContent = lastRamText; }
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

  // --- Tray pop-ups  (Texture Zone) -----------------------------------
  // Simulates Win98 security/system notifications from the notification area.
  // Fires every TRAY_POPUP_MIN–MAX ms; each balloon stays for TRAY_POPUP_DISPLAY ms.
  // Close button has TRAY_CLICK ms response delay per the timing spec.

  function initTrayPopups() {
    scheduleTrayPopup();
  }

  function scheduleTrayPopup() {
    var t = window.APC.timing;
    trayPopupTimer = setTimeout(function () {
      var messages = [
        'Your computer may be at risk.',
        'Low disk space on C:'
      ];
      showTrayPopup(messages[Math.floor(Math.random() * messages.length)]);
      scheduleTrayPopup();
    }, t.rand(t.TRAY_POPUP_MIN_MS, t.TRAY_POPUP_MAX_MS));
  }

  function showTrayPopup(message) {
    var t = window.APC.timing;

    var popup = document.createElement('div');
    popup.className = 'win98-tray-popup';
    popup.setAttribute('role', 'alert');
    popup.setAttribute('aria-live', 'assertive');

    var msgEl = document.createElement('span');
    msgEl.className = 'win98-tray-popup__msg';
    msgEl.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'win98-tray-popup__close';
    closeBtn.textContent = '\u00D7';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');

    popup.appendChild(msgEl);
    popup.appendChild(closeBtn);
    document.body.appendChild(popup);

    var autoTimer = setTimeout(dismiss, t.rand(t.TRAY_POPUP_DISPLAY_MIN_MS, t.TRAY_POPUP_DISPLAY_MAX_MS));

    function dismiss() {
      clearTimeout(autoTimer);
      if (popup.parentNode) { popup.parentNode.removeChild(popup); }
    }

    // TRAY_CLICK_MIN/MAX delay on close button response (Texture Zone tray click latency)
    closeBtn.addEventListener('click', function () {
      setTimeout(dismiss, t.rand(t.TRAY_CLICK_MIN_MS, t.TRAY_CLICK_MAX_MS));
    });
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

  function init() {
    initWeather();
    initRam();
    initTrayPopups();
  }

  return { init: init };

}());
