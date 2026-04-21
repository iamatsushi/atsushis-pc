// js/apps/diskcleanup.js
// Disk Cleanup for (C:) — simulated Win98 maintenance utility
//
// PROTECTED PATH — launch is instant, no delay, no failure.
// Simulated latency is internal: scan phase + cleanup phase only.
//
// Two-phase UI:
//   Phase 1 — Scan: category sweep with sparse file ticker
//   Phase 2 — Clean: progress bar fill to completion
//
// On completion fires: window.dispatchEvent(new CustomEvent('diskcleanup:complete'))
// Consumed by widgets.js — suppresses Low Disk Space balloon for the session.
//
// Public API: window.APC.apps.diskcleanup = { open() }

(function () {
  'use strict';

  window.APC = window.APC || {};
  window.APC.apps = window.APC.apps || {};

  // Fake file paths for the sparse ticker — aesthetic only
  var FILE_TICKER_PATHS = [
    'C:\\TEMP\\cache_12.tmp',
    'C:\\TEMP\\~DF3A21.tmp',
    'C:\\WINDOWS\\log\\setup.log',
    'C:\\WINDOWS\\TEMP\\wininst.tmp',
    'C:\\TEMP\\cache_07.tmp',
    'C:\\WINDOWS\\log\\netsetup.log',
    'C:\\TEMP\\~DF8812.tmp',
    'C:\\WINDOWS\\TEMP\\dd_NET_Framework.txt',
    'C:\\TEMP\\cache_31.tmp',
    'C:\\WINDOWS\\log\\setupapi.log',
    'C:\\TEMP\\~DF1190.tmp',
    'C:\\WINDOWS\\TEMP\\cab_3882_0',
  ];

  // Scan categories — displayed sequentially during phase 1
  var SCAN_CATEGORIES = [
    'Checking Temporary Internet Files\u2026',
    'Analyzing Recycle Bin\u2026',
    'Checking Temporary Files\u2026',
    'Scanning Downloaded Program Files\u2026',
    'Analyzing Old Windows Files\u2026',
  ];

  // Generate freed space value — biased toward 10–16 MB cluster
  // Range: 8.0–24.0 MB, one decimal precision
  function generateFreedSpace() {
    var r = Math.random();
    var mb;
    if (r < 0.65) {
      // 65% of results land in 10.0–16.0 (core cluster)
      mb = 10.0 + Math.random() * 6.0;
    } else if (r < 0.85) {
      // 20% land in 8.0–10.0 (low tail)
      mb = 8.0 + Math.random() * 2.0;
    } else {
      // 15% land in 16.0–24.0 (high tail)
      mb = 16.0 + Math.random() * 8.0;
    }
    return Math.round(mb * 10) / 10;
  }

  var isOpen = false;
  var tickerTimer = null;
  var scanTimer = null;
  var cleanTimer = null;
  var progressTimer = null;

  function clearAllTimers() {
    if (tickerTimer)   { clearInterval(tickerTimer);  tickerTimer   = null; }
    if (scanTimer)     { clearTimeout(scanTimer);      scanTimer     = null; }
    if (cleanTimer)    { clearTimeout(cleanTimer);     cleanTimer    = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  function close() {
    clearAllTimers();
    var win = document.getElementById('diskcleanup-window');
    if (win) win.remove();
    isOpen = false;
  }

  function buildWindow() {
    var t = window.APC.timing;
    var freedMB = generateFreedSpace();

    // -----------------------------------------------------------------------
    // Root window
    // -----------------------------------------------------------------------
    var win = document.createElement('div');
    win.id = 'diskcleanup-window';
    win.className = 'win98-window';
    win.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%)',
      'width:420px',
      'z-index:3000',
      'display:flex',
      'flex-direction:column',
    ].join(';');

    // -----------------------------------------------------------------------
    // Title bar
    // -----------------------------------------------------------------------
    var titleBar = document.createElement('div');
    titleBar.className = 'win98-titlebar win98-titlebar--active';
    titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:2px 4px;user-select:none;';

    var titleText = document.createElement('span');
    titleText.className = 'win98-titlebar__text';
    titleText.textContent = 'Disk Cleanup for (C:)';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'win98-titlebar__btn win98-titlebar__btn--close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', close);

    titleBar.appendChild(titleText);
    titleBar.appendChild(closeBtn);

    // -----------------------------------------------------------------------
    // Body
    // -----------------------------------------------------------------------
    var body = document.createElement('div');
    body.className = 'win98-window__body';
    body.style.cssText = 'padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px;';

    // Header label
    var header = document.createElement('div');
    header.style.cssText = 'font-size:11px;color:#000;margin-bottom:2px;';
    header.textContent = 'Disk Cleanup is calculating how much space you will be able to free on (C:).';

    // Status label — updated during scan
    var statusLabel = document.createElement('div');
    statusLabel.id = 'diskcleanup-status';
    statusLabel.style.cssText = 'font-size:11px;color:#000080;height:16px;';
    statusLabel.textContent = SCAN_CATEGORIES[0];

    // Progress bar container
    var progressWrap = document.createElement('div');
    progressWrap.style.cssText = 'border:1px solid #808080;height:16px;background:#fff;position:relative;overflow:hidden;';

    var progressBar = document.createElement('div');
    progressBar.id = 'diskcleanup-progress';
    progressBar.style.cssText = 'height:100%;width:0%;background:#000080;transition:none;';
    progressWrap.appendChild(progressBar);

    // File ticker — sparse, aesthetic only
    var tickerEl = document.createElement('div');
    tickerEl.id = 'diskcleanup-ticker';
    tickerEl.style.cssText = [
      'font-family:monospace',
      'font-size:10px',
      'color:#444',
      'height:14px',
      'overflow:hidden',
      'white-space:nowrap',
      'text-overflow:ellipsis',
    ].join(';');
    tickerEl.textContent = '\u00a0';

    // Completion area — hidden until done
    var completionEl = document.createElement('div');
    completionEl.id = 'diskcleanup-completion';
    completionEl.style.cssText = 'display:none;font-size:11px;color:#000;margin-top:4px;';

    // OK button — hidden until done
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px;';

    var okBtn = document.createElement('button');
    okBtn.className = 'win98-btn';
    okBtn.style.cssText = 'display:none;min-width:72px;';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', function () {
      window.dispatchEvent(new CustomEvent('diskcleanup:complete'));
      close();
    });
    btnRow.appendChild(okBtn);

    // Assemble body
    body.appendChild(header);
    body.appendChild(statusLabel);
    body.appendChild(progressWrap);
    body.appendChild(tickerEl);
    body.appendChild(completionEl);
    body.appendChild(btnRow);

    win.appendChild(titleBar);
    win.appendChild(body);
    document.body.appendChild(win);

    // -----------------------------------------------------------------------
    // Phase 1 — Scan
    // -----------------------------------------------------------------------
    var categoryIndex = 0;
    var scanStepMs = Math.floor(t.DISK_CLEANUP_SCAN_MS / SCAN_CATEGORIES.length);
    var tickerIndex = 0;

    // Rotate status label through categories
    function advanceCategory() {
      categoryIndex++;
      if (categoryIndex < SCAN_CATEGORIES.length) {
        statusLabel.textContent = SCAN_CATEGORIES[categoryIndex];
        // Animate scan progress proportionally
        var pct = Math.round((categoryIndex / SCAN_CATEGORIES.length) * 60);
        progressBar.style.width = pct + '%';
      }
    }

    var categoryTimer = setInterval(advanceCategory, scanStepMs);

    // Sparse file ticker — fires independently at TICKER_INTERVAL_MS
    tickerTimer = setInterval(function () {
      tickerEl.textContent = FILE_TICKER_PATHS[tickerIndex % FILE_TICKER_PATHS.length];
      tickerIndex++;
    }, t.DISK_CLEANUP_TICKER_INTERVAL_MS);

    // -----------------------------------------------------------------------
    // Phase 2 — Cleanup (fires after scan completes)
    // -----------------------------------------------------------------------
    scanTimer = setTimeout(function () {
      clearInterval(categoryTimer);
      clearInterval(tickerTimer);
      tickerTimer = null;

      statusLabel.textContent = 'Cleaning up files\u2026';
      tickerEl.textContent = '\u00a0';

      // Progress 60% → 100% over DISK_CLEANUP_CLEAN_MS
      var startPct = 60;
      var stepMs   = 50;
      var steps    = Math.floor(t.DISK_CLEANUP_CLEAN_MS / stepMs);
      var increment = (100 - startPct) / steps;
      var currentPct = startPct;

      progressTimer = setInterval(function () {
        currentPct = Math.min(100, currentPct + increment);
        progressBar.style.width = Math.round(currentPct) + '%';

        if (currentPct >= 100) {
          clearInterval(progressTimer);
          progressTimer = null;
          showCompletion();
        }
      }, stepMs);

    }, t.DISK_CLEANUP_SCAN_MS);

    // -----------------------------------------------------------------------
    // Completion state
    // -----------------------------------------------------------------------
    function showCompletion() {
      statusLabel.style.display = 'none';
      header.textContent = 'Disk Cleanup complete.';
      completionEl.style.display = 'block';
      completionEl.textContent = freedMB.toFixed(1) + ' MB of disk space freed.';
      okBtn.style.display = 'inline-block';
      okBtn.focus();
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  window.APC.apps.diskcleanup = {
    open: function () {
      if (isOpen) {
        var win = document.getElementById('diskcleanup-window');
        if (win) win.focus();
        return;
      }
      isOpen = true;
      buildWindow();
    }
  };

}());
