// widgets.js — Taskbar weather and RAM widgets
// Fetches /weather (Caddy proxy → OpenWeatherMap) and /ram (Caddy proxy → Pi RAM server).
// All fetches use setTimeout-chained scheduling — never setInterval (per project rules).
// API key for OpenWeatherMap lives only in Pi env vars; client-side JS never sees it.
// Namespaced under window.APC.widgets per project conventions.

window.APC = window.APC || {};

window.APC.widgets = (function () {
  'use strict';

  // Fetch intervals
  const WEATHER_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
  const RAM_INTERVAL_MS     = 30 * 1000;        // 30 seconds

  // --- Weather condition code → emoji ---------------------------------
  // Maps OpenWeatherMap condition ID groups to display emoji.
  // Group boundaries: 2xx thunderstorm, 3xx drizzle, 5xx rain,
  // 6xx snow, 7xx atmosphere, 800 clear, 80x clouds.

  function getWeatherEmoji(id) {
    if (id === 800) { return '\u2600\uFE0F'; }  // ☀️
    if (id === 801) { return '\uD83C\uDF24'; }  // 🌤
    if (id === 802) { return '\u26C5'; }         // ⛅
    if (id === 803) { return '\uD83C\uDF25'; }  // 🌥
    if (id === 804) { return '\u2601\uFE0F'; }  // ☁️
    const group = Math.floor(id / 100);
    if (group === 2) { return '\u26C8'; }        // ⛈
    if (group === 3) { return '\uD83C\uDF26'; } // 🌦
    if (group === 5) { return '\uD83C\uDF27'; } // 🌧
    if (group === 6) { return '\uD83C\uDF28'; } // 🌨
    if (group === 7) { return '\uD83C\uDF2B'; } // 🌫
    return '\uD83C\uDF21'; // 🌡 fallback
  }

  // --- Weather widget -------------------------------------------------

  var weatherEl = null;
  var lastWeatherText = '--';

  function initWeather() {
    weatherEl = document.getElementById('taskbar-weather');
    if (weatherEl) { weatherEl.textContent = '--'; }
    fetchWeather();
  }

  function fetchWeather() {
    fetch('/weather')
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        // OpenWeatherMap response shape: { main: { temp }, weather: [{ id }] }
        var temp = Math.round(data.main.temp);
        var condId = data.weather && data.weather[0] ? data.weather[0].id : null;
        var emoji = condId !== null ? getWeatherEmoji(condId) : '\uD83C\uDF21';
        lastWeatherText = emoji + ' ' + temp + '\u00B0F';
        if (weatherEl) { weatherEl.textContent = lastWeatherText; }
      })
      .catch(function () {
        // Silent fail — display keeps last known value (initialized to '--')
      })
      .then(function () {
        // Always schedule the next fetch, success or failure
        setTimeout(fetchWeather, WEATHER_INTERVAL_MS);
      });
  }

  // --- RAM widget -----------------------------------------------------

  var ramEl = null;
  var lastRamText = '--';

  function initRam() {
    ramEl = document.getElementById('taskbar-ram');
    if (ramEl) { ramEl.textContent = '--'; }
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
        if (ramEl) { ramEl.textContent = lastRamText; }
      })
      .catch(function () {
        // Silent fail — display keeps last known value (initialized to '--')
      })
      .then(function () {
        setTimeout(fetchRam, RAM_INTERVAL_MS);
      });
  }

  // --- Public API -----------------------------------------------------

  function init() {
    initWeather();
    initRam();
  }

  return { init: init };

}());
