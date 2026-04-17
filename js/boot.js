// boot.js — Gate screen: Matrix rain, Click to Start, audio unlock
// Handles: Matrix → Win98 boot screen → desktop
// Namespaced under window.APC per project conventions.
// All timing values sourced from window.APC.timing (js/win98-timing.js).

window.APC = window.APC || {};

window.APC.boot = (function () {
  'use strict';

  // --- Constants -------------------------------------------------------

  const MATRIX_COLOR = '#00FF41';
  const FONT_SIZE = 14;
  const MATRIX_EMOJI_FREQUENCY_MIN = 0.01; // emoji appears in 1–5% of characters,
  const MATRIX_EMOJI_FREQUENCY_MAX = 0.05; // re-rolled per draw call

  // Exact character set from CLAUDE.md spec — half-width katakana + ASCII + symbols.
  // Spread operator used for correct Unicode code-point splitting.
  const MATRIX_CHARS = [
    ...'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '0123456789' +
    '@#$%*+-=:<>/\\|'
  ];

  // Curated emoji set — interests and themes personal to Atsushi's PC.
  const MATRIX_EMOJIS = [
    '🎾', '⛳', '🎣', '🍜', '🍕', '🎮', '✈️', '🌍', '🌱',
    '💾', '🖥️', '🔌', '🛠️', '🎭', '🧩', '🧠', '⚙️', '🔍',
    '♟️', '🌉', '📦', '🧨', '📊', '🧭'
  ];

  // --- Module state ----------------------------------------------------

  let canvas, ctx, columns, animFrame;
  let startupAudio;
  let hasStarted = false;

  // Identity lines state — typed portions redrawn each frame at full brightness.
  const IDENTITY_LINE_1 = '> initializing experience on IBM Aptiva SE7';
  const IDENTITY_LINE_2 = '> $3,299 in 1998. the fastest consumer PC money could buy.';

  let identityPhase = 'waiting'; // waiting | line1 | gap | line2 | pause | done
  let identityTyped1 = '';
  let identityTyped2 = '';
  let identityX = 0;
  let identityY1 = 0;
  let identityY2 = 0;

  // --- Public API ------------------------------------------------------

  // --- Mobile detection ----------------------------------------------------

  function isMobileOrTouch() {
    // Both conditions must be true: genuine touch hardware (maxTouchPoints > 1)
    // AND a physically small screen (screen.width, not window.innerWidth).
    // Using screen.width prevents false positives on laptops with small windows.
    // maxTouchPoints > 1 (not > 0) excludes laptops that report a single
    // touch point for Force Touch / precision touchpad on macOS.
    return navigator.maxTouchPoints > 1 && screen.width < 1024;
  }

  function showMobileInterstitial() {
    var w = window.innerWidth;
    var h = window.innerHeight;

    // Full-screen overlay — classic WinDoors 98 teal desktop behind the dialog.
    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'mobile-gate-title');
    overlay.setAttribute('aria-describedby', 'mobile-gate-body');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:#008080;',
      'display:flex;align-items:center;justify-content:center;',
      'z-index:99999;',
      'font-family:"MS Sans Serif",Tahoma,sans-serif;',
      'font-size:11px;'
    ].join('');

    // Win98 dialog box.
    var dialog = document.createElement('div');
    dialog.style.cssText = [
      'background:#c0c0c0;',
      'width:320px;',
      'border-top:2px solid #fff;border-left:2px solid #fff;',
      'border-right:2px solid #404040;border-bottom:2px solid #404040;',
      'box-shadow:1px 1px 0 #000;'
    ].join('');

    // Title bar.
    var titlebar = document.createElement('div');
    titlebar.id = 'mobile-gate-title';
    titlebar.style.cssText = [
      'background:linear-gradient(to right,#000080,#1084d0);',
      'color:#fff;padding:3px 4px 3px 6px;',
      'display:flex;align-items:center;justify-content:space-between;',
      'font-weight:bold;font-size:11px;',
      'user-select:none;'
    ].join('');

    var titleText = document.createElement('span');
    titleText.textContent = 'WinDoors 98';

    // Decorative close button — no action (hard gate).
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close (unavailable)');
    closeBtn.style.cssText = [
      'width:16px;height:14px;',
      'background:#c0c0c0;color:#000;',
      'border-top:1px solid #fff;border-left:1px solid #fff;',
      'border-right:1px solid #404040;border-bottom:1px solid #404040;',
      'font-size:9px;cursor:default;padding:0;line-height:1;'
    ].join('');
    closeBtn.addEventListener('click', function () { /* hard gate — no dismiss */ });

    titlebar.appendChild(titleText);
    titlebar.appendChild(closeBtn);

    // Body — icon + message.
    var body = document.createElement('div');
    body.id = 'mobile-gate-body';
    body.style.cssText = 'padding:16px 12px 8px 12px;display:flex;gap:12px;align-items:flex-start;';

    var icon = document.createElement('div');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'font-size:32px;line-height:1;flex-shrink:0;';
    icon.textContent = '🖥️';

    var text = document.createElement('div');
    text.style.cssText = 'line-height:1.5;color:#000;';
    text.innerHTML = [
      '<p style="margin:0 0 8px;font-weight:bold;">',
      'This program cannot run on a mobile or touch device.',
      '</p>',
      '<p style="margin:0 0 6px;">',
      'WinDoors 98 requires a minimum screen resolution of 800\u00d7600.',
      '</p>',
      '<p style="margin:0 0 6px;">',
      'Detected resolution: <strong>' + w + '\u00d7' + h + 'px</strong>',
      '</p>',
      '<p style="margin:0;">',
      'Please switch to a desktop or laptop computer.',
      '</p>'
    ].join('');

    body.appendChild(icon);
    body.appendChild(text);

    // Separator.
    var sep = document.createElement('div');
    sep.style.cssText = [
      'margin:0 8px;height:2px;',
      'border-top:1px solid #808080;border-bottom:1px solid #fff;'
    ].join('');

    // Footer — OK button.
    var footer = document.createElement('div');
    footer.style.cssText = 'padding:8px;text-align:center;';

    var okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.setAttribute('aria-label', 'OK');
    okBtn.style.cssText = [
      'width:72px;height:23px;',
      'background:#c0c0c0;color:#000;',
      'border-top:2px solid #fff;border-left:2px solid #fff;',
      'border-right:2px solid #404040;border-bottom:2px solid #404040;',
      'font-family:"MS Sans Serif",Tahoma,sans-serif;font-size:11px;',
      'cursor:pointer;'
    ].join('');
    okBtn.addEventListener('click', function () { window.location.reload(); });

    footer.appendChild(okBtn);

    dialog.appendChild(titlebar);
    dialog.appendChild(body);
    dialog.appendChild(sep);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus OK button for keyboard accessibility.
    okBtn.focus();
  }

  // --- Boot init -----------------------------------------------------------

  function init() {
    // Hard gate: WinDoors 98 does not run on mobile or touch devices.
    // Boot sequence never initialises — interstitial is shown and we return.
    if (isMobileOrTouch()) {
      showMobileInterstitial();
      return;
    }

    // Skip both gate and boot screens if already completed this session.
    if (sessionStorage.getItem('boot_complete')) {
      hideGate();
      goToDesktop(true);  // skip delay and audio on session restore
      return;
    }

    canvas = document.getElementById('matrix-canvas');
    ctx = canvas.getContext('2d');

    // Preload startup audio. .play() is deferred until after user gesture
    // to comply with browser autoplay policy — never call before interaction.
    startupAudio = new Audio('assets/audio/startup.mp3');
    startupAudio.preload = 'auto';
    // Suppress load errors (e.g. 404) silently — boot must continue regardless.
    startupAudio.addEventListener('error', () => {});

    resizeCanvas();
    animFrame = requestAnimationFrame(drawFrame);

    // Schedule identity lines to begin after rain has established itself.
    // Prompt stays hidden until the full sequence completes.
    setTimeout(startIdentityLines, window.APC.timing.MATRIX_IDENTITY_START_MS);

    // Gate screen catches all clicks anywhere on screen.
    const gate = document.getElementById('gate-screen');
    gate.addEventListener('click', onGateInteract);

    // Any keydown (except modifier-only) triggers start.
    document.addEventListener('keydown', onDocKeyDown);

    // Resize canvas on window resize to keep rain full-bleed.
    window.addEventListener('resize', resizeCanvas);

    // Auto-focus the prompt so keyboard users can interact immediately.
    document.getElementById('gate-prompt').focus();
  }

  // --- Identity lines --------------------------------------------------
  //
  // Two lines type character-by-character onto the canvas at 40–60ms/char,
  // appearing as part of the rain. Both are redrawn at full brightness every
  // frame so the 0.15 fade overlay doesn't dim them while they're typing.
  // All timeouts abort immediately if the user has already interacted.

  function startIdentityLines() {
    if (hasStarted) { return; }
    const rows = Math.floor(canvas.height / FONT_SIZE);
    // Anchor roughly 42% down the screen — prompt at 50% will sit below.
    const anchorRow = Math.floor(rows * 0.42);
    identityX  = 2 * FONT_SIZE;
    identityY1 = (anchorRow + 1) * FONT_SIZE;
    identityY2 = (anchorRow + 2) * FONT_SIZE;
    identityPhase = 'line1';
    typeNextChar();
  }

  function typeNextChar() {
    if (hasStarted) { return; }
    const t = window.APC.timing;

    if (identityPhase === 'line1') {
      const idx = identityTyped1.length;
      if (idx < IDENTITY_LINE_1.length) {
        identityTyped1 += IDENTITY_LINE_1[idx];
        setTimeout(typeNextChar, t.rand(t.MATRIX_IDENTITY_CHAR_MIN_MS, t.MATRIX_IDENTITY_CHAR_MAX_MS));
      } else {
        // Line 1 complete — pause before line 2.
        identityPhase = 'gap';
        setTimeout(function () {
          if (hasStarted) { return; }
          identityPhase = 'line2';
          typeNextChar();
        }, t.MATRIX_IDENTITY_LINE_GAP_MS);
      }

    } else if (identityPhase === 'line2') {
      const idx = identityTyped2.length;
      if (idx < IDENTITY_LINE_2.length) {
        identityTyped2 += IDENTITY_LINE_2[idx];
        setTimeout(typeNextChar, t.rand(t.MATRIX_IDENTITY_CHAR_MIN_MS, t.MATRIX_IDENTITY_CHAR_MAX_MS));
      } else {
        // Line 2 complete — pause then reveal prompt.
        identityPhase = 'pause';
        setTimeout(revealPrompt, t.MATRIX_IDENTITY_PROMPT_GAP_MS);
      }
    }
  }

  function revealPrompt() {
    if (hasStarted) { return; }
    identityPhase = 'done';
    const prompt = document.getElementById('gate-prompt');
    if (prompt) { prompt.classList.remove('gate-prompt--hidden'); }
  }

  // --- Canvas setup ----------------------------------------------------

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initColumns();
  }

  function initColumns() {
    const t = window.APC.timing;
    const count = Math.floor(canvas.width / FONT_SIZE);
    const rows = Math.floor(canvas.height / FONT_SIZE);
    columns = [];
    for (let i = 0; i < count; i++) {
      columns.push({
        x: i * FONT_SIZE,
        // Stagger starting row so columns don't all begin at the top simultaneously.
        currentRow: Math.floor(Math.random() * rows),
        // Stagger initial start time so columns begin typing at different moments.
        nextCharTime: Date.now() + Math.floor(Math.random() * t.MATRIX_RAIN_STAGGER_MAX_MS),
        charDelay: t.rand(t.MATRIX_RAIN_CHAR_MIN_MS, t.MATRIX_RAIN_CHAR_MAX_MS),
        pauseUntil: 0
      });
    }
  }

  // --- Matrix rain render loop -----------------------------------------
  //
  // Per-column typing reveal: each column advances one character at a time,
  // top to bottom, at a randomised 40–180ms cadence. No smooth y-drop,
  // no frame throttle — rAF runs at native speed; columns self-pace via
  // nextCharTime. After filling to the bottom, each column pauses 800–2500ms
  // before resetting to row 0 with a new random char delay.

  function drawFrame() {
    animFrame = requestAnimationFrame(drawFrame);

    const now = Date.now();
    const rows = Math.floor(canvas.height / FONT_SIZE);
    const t = window.APC.timing;

    // Fade-to-black trail — dims older characters naturally each frame.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = FONT_SIZE + 'px "Courier New", monospace';

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];

      // Column is in post-fill pause — skip until pause expires.
      if (now < col.pauseUntil) { continue; }

      // Not yet time to type the next character.
      if (now < col.nextCharTime) { continue; }

      // Draw one character at the current row position.
      const y = (col.currentRow + 1) * FONT_SIZE;  // +1 offsets for font baseline

      // Frequency re-rolled per character: random threshold between 1–5%.
      const emojiThreshold = MATRIX_EMOJI_FREQUENCY_MIN +
        Math.random() * (MATRIX_EMOJI_FREQUENCY_MAX - MATRIX_EMOJI_FREQUENCY_MIN);
      const isEmoji = Math.random() < emojiThreshold;

      if (isEmoji) {
        // CSS emoji color filter hack: collapses emoji's native colors to black
        // via brightness(0), then rebuilds to #00FF41 green through the filter
        // chain. Alpha (shape) is preserved throughout. Reset to 'none' immediately
        // after to avoid bleeding into subsequent draw calls.
        ctx.filter =
          'brightness(0) saturate(100%) invert(57%) sepia(99%) ' +
          'saturate(400%) hue-rotate(85deg) brightness(110%)';
        ctx.fillText(
          MATRIX_EMOJIS[Math.floor(Math.random() * MATRIX_EMOJIS.length)],
          col.x,
          y
        );
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = MATRIX_COLOR;
        ctx.fillText(
          MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
          col.x,
          y
        );
      }

      col.currentRow++;

      if (col.currentRow >= rows) {
        // Column has filled to bottom — pause before resetting to row 0.
        col.pauseUntil = now + t.rand(t.MATRIX_RAIN_RESET_MIN_MS, t.MATRIX_RAIN_RESET_MAX_MS);
        col.currentRow = 0;
        col.charDelay = t.rand(t.MATRIX_RAIN_CHAR_MIN_MS, t.MATRIX_RAIN_CHAR_MAX_MS);
      }

      col.nextCharTime = now + col.charDelay;
    }

    // Redraw typed identity lines at full brightness each frame so the fade
    // overlay doesn't dim them while they're still being typed.
    if (identityPhase !== 'waiting') {
      ctx.font = FONT_SIZE + 'px "Courier New", monospace';
      ctx.fillStyle = MATRIX_COLOR;
      if (identityTyped1) {
        ctx.fillText(identityTyped1, identityX, identityY1);
      }
      if (identityTyped2) {
        ctx.fillText(identityTyped2, identityX, identityY2);
      }
    }
  }

  // --- Interaction handlers --------------------------------------------

  function onDocKeyDown(e) {
    // Pass through modifier-only keypresses — they don't count as "any key".
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) { return; }
    onGateInteract();
  }

  function onGateInteract() {
    if (hasStarted) { return; }
    hasStarted = true;

    // Clean up listeners.
    document.getElementById('gate-screen').removeEventListener('click', onGateInteract);
    document.removeEventListener('keydown', onDocKeyDown);
    window.removeEventListener('resize', resizeCanvas);

    // Audio element was preloaded at init — the gate click is the first user gesture
    // that satisfies autoplay policy. .play() is deferred to goToDesktop() so the
    // chime fires as the teal desktop fades in, not at the gate click.

    // Fire Umami analytics event. Guard in case script hasn't loaded yet.
    if (window.umami) {
      window.umami.track('click_to_start');
    }

    // Begin fade-out, then hand off to next boot stage.
    const gate = document.getElementById('gate-screen');
    gate.classList.add('gate-screen--fade');
    setTimeout(() => {
      cancelAnimationFrame(animFrame);
      hideGate();
      complete();
    }, window.APC.timing.GATE_FADE_MS);
  }

  // --- Teardown --------------------------------------------------------

  function hideGate() {
    const gate = document.getElementById('gate-screen');
    if (gate) { gate.classList.add('gate-screen--hidden'); }
  }

  function complete() {
    showBootScreen();
  }

  // --- Win98 boot sequence ---------------------------------------------

  function showBootScreen() {
    const bootScreen = document.getElementById('boot-screen');
    bootScreen.classList.remove('boot-screen--hidden');
    // Brief settle delay before progress bar begins — mirrors real Win98 timing.
    setTimeout(animateProgressBar, window.APC.timing.BOOT_SETTLE_MS);
  }

  function animateProgressBar() {
    const t = window.APC.timing;
    const track = document.getElementById('boot-progress-track');
    let blocksFilled = 0;

    // Simulate Win98 uneven disk loading — occasional stalls mirror real HDD seek
    // behavior on the IBM Aptiva SE7's 5400 RPM Deskstar.
    function randomBlockDelay() {
      if (Math.random() < t.BOOT_BLOCK_STALL_CHANCE) {
        return t.rand(t.BOOT_BLOCK_STALL_MIN_MS, t.BOOT_BLOCK_STALL_MAX_MS);
      }
      return t.rand(t.BOOT_BLOCK_NORMAL_MIN_MS, t.BOOT_BLOCK_NORMAL_MAX_MS);
    }

    function addBlock() {
      if (blocksFilled >= t.BOOT_BLOCK_COUNT) {
        // Bar is full — hold briefly so it's visible, then complete boot.
        setTimeout(completeBootScreen, t.BOOT_HOLD_MS);
        return;
      }

      const block = document.createElement('span');
      block.className = 'boot-progress__block';
      track.appendChild(block);

      blocksFilled++;

      // Update ARIA progress value as a percentage for screen readers.
      const pct = Math.round((blocksFilled / t.BOOT_BLOCK_COUNT) * 100);
      track.setAttribute('aria-valuenow', pct);

      setTimeout(addBlock, randomBlockDelay());
    }

    addBlock();
  }

  function completeBootScreen() {
    // Mark boot as complete before the fade so a mid-fade refresh skips
    // both the gate screen and boot sequence entirely.
    sessionStorage.setItem('boot_complete', '1');

    // Fire Umami boot_complete event.
    if (window.umami) {
      window.umami.track('boot_complete');
    }

    const bootScreen = document.getElementById('boot-screen');
    bootScreen.classList.add('boot-screen--fade');

    setTimeout(() => {
      bootScreen.classList.add('boot-screen--hidden');
      bootScreen.classList.remove('boot-screen--fade');
      goToDesktop();
    }, window.APC.timing.BOOT_SCREEN_FADE_MS);
  }

  // --- Desktop handoff -------------------------------------------------

  function goToDesktop(skipDelay) {
    // Play startup chime as the teal desktop fades in.
    // startupAudio is null on session restore (init() never ran), so this guard
    // ensures the chime only fires on a real first-boot, never on page refresh.
    if (startupAudio) {
      try {
        startupAudio.play().catch(() => {});
      } catch (e) {
        // Silent fallback — audio failure must never block the desktop reveal.
      }
    }

    const desktop = document.getElementById('desktop');
    desktop.classList.remove('desktop--hidden');

    // Pause before desktop init — teal background is visible but empty, simulating
    // Win98's 'loading desktop' moment before icons and taskbar appear.
    // skipDelay is true on session restore so refreshes are instant.
    setTimeout(function () {
      if (window.APC.desktop && typeof window.APC.desktop.init === 'function') {
        window.APC.desktop.init();
      }
    }, skipDelay ? 0 : window.APC.timing.BOOT_DESKTOP_PAUSE_MS);
  }

  // --- Soft restart ---------------------------------------------------
  // Resets all module state and re-runs the full gate → boot → desktop
  // sequence without a page reload. Called by the Start Menu Shut Down
  // dialog when the user selects "Restart the computer".

  function restart() {
    // Reset module-level animation state.
    hasStarted = false;
    identityPhase = 'waiting';
    identityTyped1 = '';
    identityTyped2 = '';
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    startupAudio = null;

    // Reset session connection state.
    if (window.APC.session) { window.APC.session.isConnected = false; }

    // Reset netescape and desktop module state (avoids dangling references).
    if (window.APC.netescape && typeof window.APC.netescape.reset === 'function') {
      window.APC.netescape.reset();
    }
    if (window.APC.desktop && typeof window.APC.desktop.reset === 'function') {
      window.APC.desktop.reset();
    }

    // Clear session keys so init() runs the full sequence.
    sessionStorage.removeItem('boot_complete');
    sessionStorage.removeItem('ne_history');

    // Reset DOM — hide desktop, clear open windows and taskbar buttons.
    var desktop = document.getElementById('desktop');
    if (desktop) { desktop.classList.add('desktop--hidden'); }

    var windowLayer = document.getElementById('window-layer');
    if (windowLayer) { windowLayer.innerHTML = ''; }

    var taskbarWindows = document.getElementById('taskbar-windows');
    if (taskbarWindows) { taskbarWindows.innerHTML = ''; }

    // Reset boot progress track.
    var track = document.getElementById('boot-progress-track');
    if (track) { track.innerHTML = ''; track.setAttribute('aria-valuenow', '0'); }

    var bootScreen = document.getElementById('boot-screen');
    if (bootScreen) {
      bootScreen.classList.add('boot-screen--hidden');
      bootScreen.classList.remove('boot-screen--fade');
    }

    // Show gate screen fresh.
    var gate = document.getElementById('gate-screen');
    if (gate) {
      gate.classList.remove('gate-screen--hidden');
      gate.classList.remove('gate-screen--fade');
    }

    var gatePrompt = document.getElementById('gate-prompt');
    if (gatePrompt) { gatePrompt.classList.add('gate-prompt--hidden'); }

    // Re-run the boot init — sets up canvas, rain, and gate listeners.
    init();
  }

  // --- Shutdown screen -------------------------------------------------
  // Shows a non-dismissable "safe to turn off" overlay — the simulation
  // equivalent of WinDoors 98 powering off.

  function shutdown() {
    if (window.umami) { window.umami.track('shutdown_trigger'); }

    var overlay = document.createElement('div');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Shut down');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:#000000;',
      'z-index:99999;',
      'font-family:"MS Sans Serif",Tahoma,sans-serif;'
    ].join('');

    var msg = document.createElement('div');
    msg.style.cssText = [
      'position:absolute;bottom:80px;left:0;right:0;',
      'color:#FFFFFF;font-size:13px;text-align:center;',
      'line-height:1.8;'
    ].join('');
    msg.textContent = 'It is now safe to turn off your computer.';

    overlay.appendChild(msg);
    document.body.appendChild(overlay);
  }

  return { init: init, restart: restart, shutdown: shutdown };

}());
