// boot.js — Gate screen (Matrix rain + identity lines) and five-screen boot state machine.
// Sequence: gate → keypress → POST → IBS_SPLASH → DOS_LOG → WINDOORS_LOGO → DESKTOP_ARRIVAL → COMPLETE
// Namespaced under window.APC per project conventions.
// All timing values sourced from window.APC.timing (js/win98-timing.js).
// Issues implemented: #86, #87, #89, #90, #91, #92, #93, #94.

window.APC = window.APC || {};

window.APC.boot = (function () {
  'use strict';

  // --- Constants -------------------------------------------------------

  const MATRIX_COLOR = '#00FF41';
  const FONT_SIZE = 14;
  const MATRIX_EMOJI_FREQUENCY_MIN = 0.01; // emoji appears in 1–5% of characters,
  const MATRIX_EMOJI_FREQUENCY_MAX = 0.05; // re-rolled per draw call

  // Exact character set from CLAUDE.md spec — half-width katakana + ASCII + symbols.
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

  // --- Boot state enum (#89) -------------------------------------------

  const BOOT_STATE = {
    IDLE:            'idle',
    POST:            'post',
    IBS_SPLASH:      'ibs_splash',
    DOS_LOG:         'dos_log',
    WINDOORS_LOGO:   'windoors_logo',
    DESKTOP_ARRIVAL: 'desktop_arrival',
    COMPLETE:        'complete'
  };

  // --- Identity lines (#86) — 8 lines, verbatim, no alteration ---------

  const IDENTITY_LINES = [
    '> welcome to 1998.',
    '> you are about to experience the most powerful home computer money could buy.',
    '> the IBM Aptiva 2139-SE7. Pentium II 450MHz. 128MB RAM.',
    '> $3,299 in 1998. that\'s $6,683 today.',
    '> the internet ran on a 56K modem. pages loaded one bit at a time.',
    '> clicks did not respond in milliseconds. they responded in heartbeats.',
    '> you could hear the machine work.',
    '> take your time. sound on.'
  ];

  // --- DOS bootlog lines (#92) — exact, verbatim, in this order --------

  const DOS_LOG_LINES = [
    'HIMEM is testing extended memory...done.',
    'IBS Captiva Memory Manager v4.1',
    'MSCDEX Version 2.25',
    'Drive D: = Driver CDROM001 unit 0',
    'Loading WINBLAST.SYS...done.',
    'Microblob Mouse Driver v2.3 Initialized',
    'Microblob Corp Plug and Play BIOS Extension v1.0A',
    'Detecting hardware configuration...',
    'IBS Surepath Audio Controller: IRQ 5, DMA 1',
    'Crystal 4235KQ Sound - 16-bit Stereo initialized',
    '56K V.90 Modem - COM3 - Microblob Communications',
    'Loading WINDOORS98.SYS...',
    'Starting Microblob WinDoors 98...'
  ];

  // --- Module state ----------------------------------------------------

  let canvas, ctx, columns, animFrame;
  let hasStarted = false;

  // Identity lines state.
  let identityPhase = 'waiting'; // waiting | line1_instant | line1_hold | typing | pause | done
  let identityTypedLines = [];   // array of typed strings, one per line revealed so far
  let currentLineIdx = 0;        // index of line currently being typed (0-based)

  // Boot state machine (#89) — generation counter prevents stale callbacks
  // from a dismissed screen from firing in the context of a later screen.
  let bootGen = 0;

  // Audio — preloaded on first user gesture (#89, #90, #91, #92, #93, #94).
  let bootAudio = null;

  // Screech roll — decided once at boot start, checked by Screen 3 and 4 (#92, #93).
  let screechFires = false;
  let screechScreen = null;

  // --- Public API ------------------------------------------------------

  // --- Mobile detection ------------------------------------------------
  //
  // All three conditions must be true to show the mobile interstitial:
  // 1. Genuine touch hardware (maxTouchPoints > 1)
  // 2. Physically small screen (screen.width < 1024)
  // 3. No fine pointer (no mouse/trackpad)

  function isMobileOrTouch() {
    return navigator.maxTouchPoints > 1 &&
           screen.width < 1024 &&
           !window.matchMedia('(pointer: fine)').matches;
  }

  function showMobileInterstitial() {
    var w = window.innerWidth;
    var h = window.innerHeight;

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

    var dialog = document.createElement('div');
    dialog.style.cssText = [
      'background:#c0c0c0;',
      'width:320px;',
      'border-top:2px solid #fff;border-left:2px solid #fff;',
      'border-right:2px solid #404040;border-bottom:2px solid #404040;',
      'box-shadow:1px 1px 0 #000;'
    ].join('');

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

    var sep = document.createElement('div');
    sep.style.cssText = [
      'margin:0 8px;height:2px;',
      'border-top:1px solid #808080;border-bottom:1px solid #fff;'
    ].join('');

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

    okBtn.focus();
  }

  // --- Boot init -------------------------------------------------------

  function init() {
    // Hard gate: WinDoors 98 does not run on mobile or touch devices.
    if (isMobileOrTouch()) {
      showMobileInterstitial();
      return;
    }

    // Skip gate and boot sequence if already completed this session.
    if (sessionStorage.getItem('boot_complete')) {
      hideGate();
      goToDesktop(true);
      return;
    }

    canvas = document.getElementById('matrix-canvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    animFrame = requestAnimationFrame(drawFrame);

    // Schedule identity lines to begin after rain has established itself.
    setTimeout(startIdentityLines, window.APC.timing.MATRIX_GATE_START_DELAY_MS);

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

  // --- Identity lines (#86 + #87) --------------------------------------
  //
  // Line 1 appears as a full complete line instantly at the 3s mark.
  // Lines 2–8 type character by character at 20–30ms/char.
  // All drawn onto the canvas each frame so the fade overlay doesn't dim them
  // while they're actively being typed. Y positions recalculate on canvas resize.

  function startIdentityLines() {
    if (hasStarted) { return; }
    const t = window.APC.timing;

    // Line 1 appears as a complete line instantly — no typing animation.
    identityTypedLines = [IDENTITY_LINES[0]];
    currentLineIdx = 0;
    identityPhase = 'line1_hold';

    // Hold 600ms then begin typing lines 2–8.
    setTimeout(function () {
      if (hasStarted) { return; }
      identityPhase = 'typing';
      currentLineIdx = 1;
      identityTypedLines[1] = '';
      typeNextChar();
    }, t.MATRIX_LINE1_HOLD_MS);
  }

  function typeNextChar() {
    if (hasStarted) { return; }
    const t = window.APC.timing;
    const lineIdx = currentLineIdx;
    const targetLine = IDENTITY_LINES[lineIdx];
    const typed = identityTypedLines[lineIdx] || '';

    if (typed.length < targetLine.length) {
      // Advance one character.
      identityTypedLines[lineIdx] = targetLine.slice(0, typed.length + 1);
      setTimeout(typeNextChar,
        t.rand(t.MATRIX_IDENTITY_CHAR_DELAY_MIN_MS, t.MATRIX_IDENTITY_CHAR_DELAY_MAX_MS));
    } else if (lineIdx < IDENTITY_LINES.length - 1) {
      // This line complete — advance to next line.
      currentLineIdx = lineIdx + 1;
      identityTypedLines[currentLineIdx] = '';
      // Inter-line gap uses the same char delay range — keeps rhythm consistent.
      setTimeout(typeNextChar,
        t.rand(t.MATRIX_IDENTITY_CHAR_DELAY_MIN_MS, t.MATRIX_IDENTITY_CHAR_DELAY_MAX_MS));
    } else {
      // All 8 lines complete — pause then fade-in prompt.
      identityPhase = 'pause';
      setTimeout(revealPrompt, t.MATRIX_POST_LINES_PAUSE_MS);
    }
  }

  function revealPrompt() {
    if (hasStarted) { return; }
    identityPhase = 'done';
    const prompt = document.getElementById('gate-prompt');
    if (prompt) {
      // Position prompt at MATRIX_PROMPT_CANVAS_Y_PCT of canvas height.
      prompt.style.top = Math.floor(
        canvas.height * window.APC.timing.MATRIX_PROMPT_CANVAS_Y_PCT
      ) + 'px';
      // Opacity transition is defined in CSS — adding the class triggers it.
      prompt.classList.add('gate-prompt--visible');
    }
  }

  // --- Canvas setup ----------------------------------------------------

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initColumns();
    // Reposition prompt if already visible, so it stays at the correct y position.
    if (identityPhase === 'done') {
      const prompt = document.getElementById('gate-prompt');
      if (prompt) {
        prompt.style.top = Math.floor(
          canvas.height * window.APC.timing.MATRIX_PROMPT_CANVAS_Y_PCT
        ) + 'px';
      }
    }
  }

  function initColumns() {
    const t = window.APC.timing;
    const count = Math.floor(canvas.width / FONT_SIZE);
    const rows = Math.floor(canvas.height / FONT_SIZE);
    columns = [];
    for (let i = 0; i < count; i++) {
      columns.push({
        x: i * FONT_SIZE,
        currentRow: Math.floor(Math.random() * rows),
        nextCharTime: Date.now() + Math.floor(Math.random() * t.MATRIX_RAIN_STAGGER_MAX_MS),
        charDelay: t.rand(t.MATRIX_RAIN_CHAR_MIN_MS, t.MATRIX_RAIN_CHAR_MAX_MS),
        pauseUntil: 0
      });
    }
  }

  // --- Matrix rain render loop -----------------------------------------
  //
  // Per-column typing reveal: each column advances one character at a time,
  // top to bottom, at a randomised 40–180ms cadence. Identity lines are
  // redrawn at full brightness each frame so the fade overlay doesn't dim them.

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

      if (now < col.pauseUntil) { continue; }
      if (now < col.nextCharTime) { continue; }

      const y = (col.currentRow + 1) * FONT_SIZE;

      // Emoji frequency re-rolled per character: random threshold between 1–5%.
      const emojiThreshold = MATRIX_EMOJI_FREQUENCY_MIN +
        Math.random() * (MATRIX_EMOJI_FREQUENCY_MAX - MATRIX_EMOJI_FREQUENCY_MIN);
      const isEmoji = Math.random() < emojiThreshold;

      if (isEmoji) {
        // CSS emoji color filter hack: collapses emoji's native colors to black
        // via brightness(0), then rebuilds to #00FF41 green through the filter chain.
        ctx.filter =
          'brightness(0) saturate(100%) invert(57%) sepia(99%) ' +
          'saturate(400%) hue-rotate(85deg) brightness(110%)';
        ctx.fillText(
          MATRIX_EMOJIS[Math.floor(Math.random() * MATRIX_EMOJIS.length)],
          col.x, y
        );
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = MATRIX_COLOR;
        ctx.fillText(
          MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
          col.x, y
        );
      }

      col.currentRow++;

      if (col.currentRow >= rows) {
        col.pauseUntil = now + t.rand(t.MATRIX_RAIN_RESET_MIN_MS, t.MATRIX_RAIN_RESET_MAX_MS);
        col.currentRow = 0;
        col.charDelay = t.rand(t.MATRIX_RAIN_CHAR_MIN_MS, t.MATRIX_RAIN_CHAR_MAX_MS);
      }

      col.nextCharTime = now + col.charDelay;
    }

    // Redraw identity lines at full brightness each frame so the fade overlay
    // doesn't dim them while they're still being typed.
    // Y positions recalculate from canvas.height on each frame so a resize
    // mid-sequence doesn't leave lines at stale vertical positions.
    if (identityPhase !== 'waiting' && identityTypedLines.length > 0) {
      const startY = canvas.height * t.MATRIX_IDENTITY_START_Y_PCT;
      const lineHeight = FONT_SIZE * 1.6;

      ctx.filter = 'none'; // ensure no leftover filter from emoji columns
      ctx.font = FONT_SIZE + 'px "Courier New", monospace';
      ctx.fillStyle = MATRIX_COLOR;

      for (let li = 0; li < identityTypedLines.length; li++) {
        if (!identityTypedLines[li]) { continue; }
        const lineY = startY + li * lineHeight;
        const measured = ctx.measureText(identityTypedLines[li]).width;
        const lineX = (canvas.width / 2) - (measured / 2);
        ctx.fillText(identityTypedLines[li], lineX, lineY);
      }
    }
  }

  // --- Interaction handlers --------------------------------------------

  function onDocKeyDown(e) {
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) { return; }
    onGateInteract();
  }

  function onGateInteract() {
    if (hasStarted) { return; }
    hasStarted = true;

    // Clean up gate listeners.
    document.getElementById('gate-screen').removeEventListener('click', onGateInteract);
    document.removeEventListener('keydown', onDocKeyDown);
    window.removeEventListener('resize', resizeCanvas);

    // Fire analytics event.
    if (window.umami) { window.umami.track('click_to_start'); }

    // Preload all boot audio assets — user gesture has now satisfied autoplay policy.
    preloadBootAudio();

    // Roll screech decision once (#92, #93). Stored at module level so both
    // Screen 3 and Screen 4 read the same decision — they do not re-roll.
    screechFires = Math.random() < 0.6;
    screechScreen = screechFires
      ? (Math.random() < 0.5 ? 'dos_log' : 'windoors_logo')
      : null;

    const gate = document.getElementById('gate-screen');
    gate.classList.add('gate-screen--fade');
    setTimeout(function () {
      // Clear identity text so drawFrame stops rendering it behind the desk scene.
      identityPhase = 'waiting';
      identityTypedLines = [];

      // Lower gate-screen below the desk scene canvas (z-index:100) and restore
      // opacity instantly so Matrix rain stays visible through transparent PNG areas.
      gate.style.zIndex     = '98';
      gate.style.opacity    = '1';
      gate.style.transition = 'none';
      gate.classList.remove('gate-screen--fade');

      // Hand off to boot scene. onComplete fires after the CRT sequence + fade-out.
      window.APC.bootScene.init(function () {
        cancelAnimationFrame(animFrame);
        hideGate();
        // Guard: preloadBootAudio() should have fired in onGateInteract, but if
        // bootAudio is somehow null (e.g. soft restart race), preload it now so
        // renderPostScreen() can always play hdd-chatter.
        if (!bootAudio) { preloadBootAudio(); }
        advanceBootState(BOOT_STATE.POST);
      });
    }, window.APC.timing.GATE_FADE_MS);
  }

  // --- Audio -----------------------------------------------------------

  function preloadBootAudio() {
    bootAudio = {
      hddChatter: new Audio('assets/audio/hdd-chatter.mp3'),
      postBeep:   new Audio('assets/audio/post-beep.mp3'),
      floppySeek: new Audio('assets/audio/floppy-read.mp3'),
      screech:    new Audio('assets/audio/hdd-screech.mp3'),
      chime:      new Audio('assets/audio/startup.mp3')
    };

    // hdd-chatter does NOT loop — plays once, 59s straight through.
    bootAudio.hddChatter.loop = false;

    // Suppress load errors silently — boot must continue regardless of audio failure.
    Object.keys(bootAudio).forEach(function (key) {
      bootAudio[key].preload = 'auto';
      bootAudio[key].addEventListener('error', function () {});
    });
  }

  // Fade audio volume to 0 over durationMs, then pause it.
  // Calls optional cb when complete. Safe to call with null audio.
  function fadeAudioOut(audio, durationMs, cb) {
    if (!audio) { if (cb) { cb(); } return; }
    const startVol = audio.volume || 1;
    const stepMs = 16;
    const steps = Math.max(1, Math.ceil(durationMs / stepMs));
    let step = 0;
    const timer = setInterval(function () {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(timer);
        try { audio.pause(); } catch (e) {}
        audio.volume = startVol;
        if (cb) { cb(); }
      }
    }, stepMs);
  }

  // --- Gate teardown ---------------------------------------------------

  function hideGate() {
    const gate = document.getElementById('gate-screen');
    if (gate) { gate.classList.add('gate-screen--hidden'); }
  }

  // --- Boot state machine (#89) ----------------------------------------
  //
  // Each screen renders into #boot-sequence. When the state machine advances,
  // the old screen's content is cleared before the new one is rendered.
  // bootGen increments on each advance — stale setTimeout callbacks capture
  // the gen from when they were created and abort if gen has moved on.

  function advanceBootState(state) {
    const gen = ++bootGen;

    const container = document.getElementById('boot-sequence');
    if (!container) { return; }

    container.innerHTML = '';
    container.style.opacity = '';
    container.style.transition = '';
    container.classList.remove('boot-sequence--hidden');

    switch (state) {
      case BOOT_STATE.POST:
        renderPostScreen(gen, container);
        break;
      case BOOT_STATE.IBS_SPLASH:
        renderIBSSplashScreen(gen, container);
        break;
      case BOOT_STATE.DOS_LOG:
        renderDOSLogScreen(gen, container);
        break;
      case BOOT_STATE.WINDOORS_LOGO:
        renderWindoorsLogoScreen(gen, container);
        break;
      case BOOT_STATE.DESKTOP_ARRIVAL:
        renderDesktopArrivalScreen(gen, container);
        break;
      case BOOT_STATE.COMPLETE:
        handleBootComplete(container);
        break;
    }
  }

  // --- Screen 1: POST / RAM count (#90) --------------------------------
  //
  // Black screen, white monospace text, left-aligned.
  // Header lines appear sequentially, then RAM counter animates 0K→131072K.
  // hdd-chatter plays on screen start (spin-up is baked into its first few seconds).
  // post-beep fires when RAM counter completes.

  function renderPostScreen(gen, container) {
    const t = window.APC.timing;
    const bs = t.BOOT_SEQUENCE;

    container.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9000;';

    const output = document.createElement('div');
    output.style.cssText = [
      'position:absolute;top:40px;left:40px;',
      'font-family:"Courier New",Courier,monospace;',
      'font-size:13px;color:#fff;',
      '-webkit-font-smoothing:none;',
      'line-height:1.6;'
    ].join('');
    container.appendChild(output);

    // hdd-chatter plays immediately — spin-up sound is baked into its opening seconds.
    if (bootAudio) {
      try { bootAudio.hddChatter.play().catch(function () {}); } catch (e) {}
    }

    function appendLine(text) {
      const d = document.createElement('div');
      d.textContent = text;
      output.appendChild(d);
    }

    const headerLines = [
      'IBS Surepath BIOS v3.26.11',
      'IBS Captiva 2139-$E7 - Pentium II 450MHz',
      'Microblob Corp - Copyright (C) 1993-1998',
      '\u00a0'  // blank separator line (non-breaking space gives height)
    ];

    let lineIdx = 0;

    function appendNextHeaderLine() {
      if (gen !== bootGen) { return; }
      if (lineIdx < headerLines.length) {
        appendLine(headerLines[lineIdx]);
        lineIdx++;
        setTimeout(appendNextHeaderLine, bs.POST_TEXT_LINE_INTERVAL_MS);
      } else {
        startRAMCounter();
      }
    }

    function startRAMCounter() {
      if (gen !== bootGen) { return; }
      const RAM_TARGET = 131072;
      let ramVal = 0;

      // Memory Test line with an inline span for the counter value.
      const ramDiv = document.createElement('div');
      ramDiv.textContent = 'Memory Test: ';
      const ramCounter = document.createElement('span');
      ramCounter.textContent = '      0K';
      ramDiv.appendChild(ramCounter);
      output.appendChild(ramDiv);

      // Recursive setTimeout with variable tick speed and occasional mechanical
      // hesitation — simulates a real BIOS pausing to test each memory block
      // rather than counting at a robotically fixed rate.
      function tick() {
        if (gen !== bootGen) { return; }
        ramVal = Math.min(ramVal + bs.RAM_STEP_K, RAM_TARGET);
        ramCounter.textContent = (String(ramVal) + 'K').padStart(8, ' ');
        if (ramVal >= RAM_TARGET) {
          onRAMComplete();
          return;
        }
        const nextTick = t.rand(bs.RAM_TICK_MIN_MS, bs.RAM_TICK_MAX_MS);
        if (Math.random() < bs.RAM_HESITATION_CHANCE) {
          // Hesitation: counter stalls as if the machine is verifying that block.
          setTimeout(function () {
            if (gen !== bootGen) { return; }
            setTimeout(tick, nextTick);
          }, t.rand(bs.RAM_HESITATION_MIN_MS, bs.RAM_HESITATION_MAX_MS));
        } else {
          setTimeout(tick, nextTick);
        }
      }

      setTimeout(tick, t.rand(bs.RAM_TICK_MIN_MS, bs.RAM_TICK_MAX_MS));
    }

    function onRAMComplete() {
      if (gen !== bootGen) { return; }
      // post-beep fires exactly when RAM counter reaches 131072K.
      if (bootAudio) {
        try { bootAudio.postBeep.play().catch(function () {}); } catch (e) {}
      }
      // Append confirmation and final prompt lines.
      setTimeout(function () {
        if (gen !== bootGen) { return; }
        appendLine('131072K OK');
        setTimeout(function () {
          if (gen !== bootGen) { return; }
          appendLine('\u00a0');
          appendLine('Press DEL to enter Setup');
          setTimeout(function () {
            if (gen !== bootGen) { return; }
            advanceBootState(BOOT_STATE.IBS_SPLASH);
          }, bs.POST_AFTER_LAST_LINE_MS);
        }, bs.POST_TEXT_LINE_INTERVAL_MS);
      }, bs.POST_TEXT_LINE_INTERVAL_MS);
    }

    appendNextHeaderLine();
  }

  // --- Screen 2: IBS BIOS splash (#91) ---------------------------------
  //
  // Deep navy blue (#102046), "IBS" logotype centered, floppy-seek plays at 0.8–1s.
  // hdd-chatter continues looping from Screen 1.

  function renderIBSSplashScreen(gen, container) {
    const t = window.APC.timing;
    const bs = t.BOOT_SEQUENCE;

    container.style.cssText = [
      'position:fixed;inset:0;background:#102046;z-index:9000;',
      'font-family:Tahoma,Arial,sans-serif;'
    ].join('');

    // Centered content column.
    const col = document.createElement('div');
    col.style.cssText = [
      'position:absolute;top:50%;left:50%;',
      'transform:translate(-50%,-50%);',
      'text-align:center;'
    ].join('');

    const logo = document.createElement('div');
    logo.textContent = 'IBS';
    logo.style.cssText = [
      'font-size:72px;font-weight:bold;',
      'letter-spacing:12px;color:#fff;',
      'text-shadow:2px 2px 4px rgba(0,0,0,0.6);',
      'margin-bottom:24px;'
    ].join('');

    const modelEl = document.createElement('p');
    modelEl.textContent = 'Captiva 2139-$E7';
    modelEl.style.cssText = 'font-size:16px;color:#fff;margin:0 0 8px;';

    const biosEl = document.createElement('p');
    biosEl.textContent = 'Surepath BIOS v3.26.11';
    biosEl.style.cssText = 'font-size:16px;color:#fff;margin:0;';

    col.appendChild(logo);
    col.appendChild(modelEl);
    col.appendChild(biosEl);
    container.appendChild(col);

    // "Press F1" in bottom third — room above the bottom edge.
    const f1El = document.createElement('p');
    f1El.textContent = 'Press F1 to enter Setup';
    f1El.style.cssText = [
      'position:absolute;bottom:25%;left:0;right:0;',
      'text-align:center;',
      'font-family:Tahoma,Arial,sans-serif;',
      'font-size:12px;color:#C0C0C0;margin:0;'
    ].join('');
    container.appendChild(f1El);

    // floppy-seek fires 0.8–1s after screen appears.
    const floppyDelay = t.rand(bs.FLOPPY_SEEK_DELAY_MIN_MS, bs.FLOPPY_SEEK_DELAY_MAX_MS);
    setTimeout(function () {
      if (gen !== bootGen) { return; }
      if (bootAudio) {
        try { bootAudio.floppySeek.play().catch(function () {}); } catch (e) {}
      }
    }, floppyDelay);

    // Advance after splash duration.
    setTimeout(function () {
      if (gen !== bootGen) { return; }
      advanceBootState(BOOT_STATE.DOS_LOG);
    }, bs.IBS_SPLASH_DURATION_MS);
  }

  // --- Screen 3: DOS bootlog (#92) -------------------------------------
  //
  // Black screen, white monospace text, left-aligned. Lines appear one by one
  // at 80–150ms intervals. hdd-screech may play if screechScreen === 'dos_log'.

  function renderDOSLogScreen(gen, container) {
    const t = window.APC.timing;
    const bs = t.BOOT_SEQUENCE;

    container.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9000;';

    const output = document.createElement('div');
    output.style.cssText = [
      'position:absolute;top:40px;left:40px;',
      'font-family:"Courier New",Courier,monospace;',
      'font-size:13px;color:#fff;',
      '-webkit-font-smoothing:none;',
      'line-height:1.6;'
    ].join('');
    container.appendChild(output);

    // Schedule screech if this screen was selected at boot start.
    // Fires at a random timestamp within this screen's duration — overlaid on hdd-chatter.
    if (screechScreen === 'dos_log' && bootAudio) {
      const scDelay = Math.random() * bs.DOS_LOG_DURATION_MS;
      setTimeout(function () {
        if (gen !== bootGen) { return; }
        try { bootAudio.screech.play().catch(function () {}); } catch (e) {}
      }, scDelay);
    }

    let lineIdx = 0;

    function appendNextLine() {
      if (gen !== bootGen) { return; }
      if (lineIdx < DOS_LOG_LINES.length) {
        const d = document.createElement('div');
        d.textContent = DOS_LOG_LINES[lineIdx];
        output.appendChild(d);
        lineIdx++;
        setTimeout(appendNextLine, t.rand(bs.DOS_LOG_LINE_INTERVAL_MIN_MS, bs.DOS_LOG_LINE_INTERVAL_MAX_MS));
      } else {
        // All lines shown — pause then advance.
        setTimeout(function () {
          if (gen !== bootGen) { return; }
          advanceBootState(BOOT_STATE.WINDOORS_LOGO);
        }, bs.DOS_LOG_AFTER_LAST_LINE_MS);
      }
    }

    appendNextLine();
  }

  // --- Screen 4: WinDoors 98 logo + progress bar (#93) -----------------
  //
  // Black screen, WinDoors flag (four CSS divs), "WinDoors 98" text, chunky
  // progress bar with exact stall rhythm: stall at 60% (3.5s), burst, stall at
  // 85% (2s), fast finish. hdd-chatter volume drops to 0.7 during stalls.

  function renderWindoorsLogoScreen(gen, container) {
    const t = window.APC.timing;
    const bs = t.BOOT_SEQUENCE;

    container.style.cssText = [
      'position:fixed;inset:0;background:#000;z-index:9000;',
      'font-family:Tahoma,Arial,sans-serif;'
    ].join('');

    // Center wrapper positioned at ~35% from top.
    const center = document.createElement('div');
    center.style.cssText = [
      'position:absolute;top:35%;left:50%;',
      'transform:translateX(-50%);',
      'text-align:center;'
    ].join('');

    // Title row: flag + "WinDoors 98" side by side.
    const titleRow = document.createElement('div');
    titleRow.style.cssText = [
      'display:inline-flex;align-items:center;',
      'margin-bottom:16px;'
    ].join('');

    // WinDoors flag — four colored divs in 2×2 grid.
    // Colors clockwise from top-left: red, green, blue, yellow.
    // This is a fictional flag — NOT the Windows logo.
    const flag = document.createElement('div');
    flag.setAttribute('aria-hidden', 'true');
    flag.style.cssText = [
      'display:grid;',
      'grid-template-columns:40px 40px;',
      'grid-template-rows:40px 40px;',
      'gap:3px;',
      'margin-right:16px;'
    ].join('');

    ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'].forEach(function (color) {
      const seg = document.createElement('div');
      seg.style.background = color;
      flag.appendChild(seg);
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = 'WinDoors 98';
    titleEl.style.cssText = [
      'font-size:28px;font-weight:bold;font-style:italic;',
      'color:#fff;white-space:nowrap;'
    ].join('');

    titleRow.appendChild(flag);
    titleRow.appendChild(titleEl);

    const subtitleEl = document.createElement('p');
    subtitleEl.textContent = 'Starting Microblob WinDoors 98...';
    subtitleEl.style.cssText = 'font-size:11px;color:#C0C0C0;margin:0 0 16px;';

    // Progress bar trough.
    const trough = document.createElement('div');
    trough.style.cssText = [
      'width:260px;height:18px;',
      'background:#C0C0C0;',
      'border:1px solid #808080;',
      'font-size:0;line-height:0;',
      'text-align:left;',
      'margin:0 auto;',
      'overflow:hidden;'
    ].join('');

    center.appendChild(titleRow);
    center.appendChild(subtitleEl);
    center.appendChild(trough);
    container.appendChild(center);

    // Schedule screech if this screen was selected at boot start.
    // Fires in the first 70% of the screen duration — overlaid on hdd-chatter.
    if (screechScreen === 'windoors_logo' && bootAudio) {
      const scDelay = Math.random() * bs.WINDOORS_LOGO_DURATION_MS * 0.7;
      setTimeout(function () {
        if (gen !== bootGen) { return; }
        try { bootAudio.screech.play().catch(function () {}); } catch (e) {}
      }, scDelay);
    }

    // Progress bar — 20 discrete blocks.
    // Block schedule (0-indexed):
    //   0–5:   600ms each (0–30%)
    //   6–11:  800ms each (30–60%)
    //   after block 11 (60%): stall 3500ms — hdd-chatter drops to 0.7
    //   12–16: 500ms each (60–85%)
    //   after block 16 (85%): stall 2000ms — hdd-chatter drops to 0.7
    //   17–19: 300ms each (85–100%, fast finish)
    const TOTAL_BLOCKS = 20;
    let blockIdx = 0;

    function addBlock() {
      if (gen !== bootGen) { return; }

      if (blockIdx >= TOTAL_BLOCKS) {
        // Bar complete — brief pause then advance to Screen 5.
        setTimeout(function () {
          if (gen !== bootGen) { return; }
          advanceBootState(BOOT_STATE.DESKTOP_ARRIVAL);
        }, bs.WINDOORS_LOGO_COMPLETE_PAUSE_MS);
        return;
      }

      // Add a block to the trough.
      const block = document.createElement('span');
      block.style.cssText = [
        'display:inline-block;',
        'width:11px;height:18px;',
        'background:#102046;',
        'margin-right:1px;',
        'vertical-align:top;'
      ].join('');
      trough.appendChild(block);

      const justAdded = blockIdx;
      blockIdx++;

      // Determine the normal delay before the next block.
      var delay;
      if (justAdded < 6)        { delay = bs.WINDOORS_BLOCK_SPEED_SLOW_MS; }
      else if (justAdded < 12)  { delay = bs.WINDOORS_BLOCK_SPEED_MED_MS; }
      else if (justAdded < 17)  { delay = bs.WINDOORS_BLOCK_SPEED_FAST_MS; }
      else                      { delay = bs.WINDOORS_BLOCK_SPEED_BURST_MS; }

      if (justAdded === 11) {
        // Stall at 60%: machine is thinking. Reduce chatter volume, then resume.
        if (bootAudio && bootAudio.hddChatter) { bootAudio.hddChatter.volume = 0.7; }
        setTimeout(function () {
          if (gen !== bootGen) { return; }
          if (bootAudio && bootAudio.hddChatter) { bootAudio.hddChatter.volume = 1.0; }
          setTimeout(addBlock, delay);
        }, bs.WINDOORS_LOGO_STALL_60_MS);
      } else if (justAdded === 16) {
        // Stall at 85%: final tease.
        if (bootAudio && bootAudio.hddChatter) { bootAudio.hddChatter.volume = 0.7; }
        setTimeout(function () {
          if (gen !== bootGen) { return; }
          if (bootAudio && bootAudio.hddChatter) { bootAudio.hddChatter.volume = 1.0; }
          setTimeout(addBlock, delay);
        }, bs.WINDOORS_LOGO_STALL_85_MS);
      } else {
        setTimeout(addBlock, delay);
      }
    }

    addBlock();
  }

  // --- Screen 5: Desktop arrival (#94) ---------------------------------
  //
  // Fade hdd-chatter out (~300ms), fade #boot-sequence out (1.2s), init desktop,
  // fire startup chime when desktop is fully visible. Mark session complete.

  function renderDesktopArrivalScreen(gen, container) {
    const t = window.APC.timing;
    const bs = t.BOOT_SEQUENCE;

    // Set base styles explicitly — container may have inherited from Screen 4.
    container.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9000;opacity:1;';

    // Fade hdd-chatter volume to 0 and stop — simultaneous with the container fade.
    if (bootAudio && bootAudio.hddChatter) {
      fadeAudioOut(bootAudio.hddChatter, bs.HDD_CHATTER_FADE_MS, null);
    }

    // Reveal desktop behind boot-sequence container before starting fade.
    const desktop = document.getElementById('desktop');
    if (desktop) { desktop.classList.remove('desktop--hidden'); }

    // Init desktop (taskbar, icons, system tray, widgets).
    if (window.APC.desktop && typeof window.APC.desktop.init === 'function') {
      window.APC.desktop.init();
    }

    // Force desktop visible — CSS transition or lingering opacity from desktop--hidden
    // removal may leave #desktop invisible even after init() runs.
    if (desktop) {
      desktop.style.opacity = '1';
      desktop.style.display = 'block';
    }

    // Begin opacity fade on the next frame so the browser has processed the
    // opacity:1 initial style before the transition kicks in.
    container.style.transition = 'opacity ' + bs.DESKTOP_FADE_MS + 'ms ease';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (gen !== bootGen) { return; }
        container.style.opacity = '0';
      });
    });

    // After fade completes — advance to COMPLETE.
    setTimeout(function () {
      if (gen !== bootGen) { return; }
      advanceBootState(BOOT_STATE.COMPLETE);
    }, bs.DESKTOP_FADE_MS);
  }

  // --- Boot complete (#94) ---------------------------------------------

  function handleBootComplete(container) {
    // Fully clear all inline style state left by the Screen 5 fade, then hide.
    // display:none must be inline (not just class) because advanceBootState sets
    // an inline display:block that would otherwise override boot-sequence--hidden.
    container.style.display = 'none';
    container.style.opacity = '';
    container.style.transition = '';
    container.classList.add('boot-sequence--hidden');
    container.innerHTML = '';

    // Fire startup chime the moment desktop is fully visible.
    if (bootAudio && bootAudio.chime) {
      try { bootAudio.chime.play().catch(function () {}); } catch (e) {}
    }

    // Mark session as booted and fire analytics.
    sessionStorage.setItem('boot_complete', '1');
    if (window.umami) { window.umami.track('boot_complete'); }
  }

  // --- Desktop handoff (session restore path only) ---------------------
  //
  // Called when sessionStorage.boot_complete is already set — boot.js was never
  // fully run this session, so bootAudio is null. Audio may not play (no gesture).

  function goToDesktop(skipDelay) {
    var chime = new Audio('assets/audio/startup.mp3');
    chime.preload = 'auto';
    chime.addEventListener('error', function () {});

    const desktop = document.getElementById('desktop');
    desktop.classList.remove('desktop--hidden');

    setTimeout(function () {
      if (window.APC.desktop && typeof window.APC.desktop.init === 'function') {
        window.APC.desktop.init();
      }
      try { chime.play().catch(function () {}); } catch (e) {}
    }, skipDelay ? 0 : window.APC.timing.BOOT_DESKTOP_PAUSE_MS);
  }

  // --- Soft restart ---------------------------------------------------
  // Resets all module state and re-runs the full gate → boot → desktop
  // sequence without a page reload. Called by the Start Menu Shut Down
  // dialog when the user selects "Restart".

  function restart() {
    // Reset gate / identity state.
    hasStarted = false;
    identityPhase = 'waiting';
    identityTypedLines = [];
    currentLineIdx = 0;
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }

    // Invalidate any in-flight boot screen callbacks.
    bootGen++;

    // Clear audio and screech state.
    bootAudio = null;
    screechFires = false;
    screechScreen = null;

    // Reset other module state.
    if (window.APC.session) { window.APC.session.isConnected = false; }
    if (window.APC.netescape && typeof window.APC.netescape.reset === 'function') {
      window.APC.netescape.reset();
    }
    if (window.APC.desktop && typeof window.APC.desktop.reset === 'function') {
      window.APC.desktop.reset();
    }
    if (window.APC.widgets && typeof window.APC.widgets.reset === 'function') {
      window.APC.widgets.reset();
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

    // Reset boot-sequence container.
    var bootSeq = document.getElementById('boot-sequence');
    if (bootSeq) {
      bootSeq.classList.add('boot-sequence--hidden');
      bootSeq.innerHTML = '';
      bootSeq.style.opacity = '';
      bootSeq.style.transition = '';
    }

    // Reset legacy boot-screen (kept in DOM for DOM stability, never shown in new flow).
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

    // Reset prompt — remove visible class, clear JS-set top position.
    var gatePrompt = document.getElementById('gate-prompt');
    if (gatePrompt) {
      gatePrompt.classList.remove('gate-prompt--visible');
      gatePrompt.style.top = '';
    }

    // Re-run the boot init — sets up canvas, rain, and gate listeners.
    init();
  }

  // --- Shutdown screen -------------------------------------------------
  // Shows a non-dismissable "safe to turn off" overlay — the simulation
  // equivalent of WinDoors 98 powering off. Called by taskbar.js.

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

  // --- Wormhole transition (#106) --------------------------------------
  //
  // Takes control of the Matrix rain canvas and runs a four-phase animation:
  //   Phase 1 (0–1.5s)  — characters drift laterally (disturbance)
  //   Phase 2 (1.5–3.5s) — characters spiral inward toward center
  //   Phase 3 (3.5–4.0s) — glow pulse (expand then contract)
  //   Phase 4 (4.0–5.0s) — desk scene revealed via circular clip
  //
  // bitmap     — processedBitmap from boot-scene.js (chroma-keyed desk PNG)
  // bitmapParams — { offsetX, offsetY, scale, assetW, assetH }
  // onComplete — fired when Phase 4 finishes (desk scene fully revealed)
  //
  // All timing from window.APC.timing — no hardcoded values.

  function startWormhole(bitmap, bitmapParams, onComplete) {
    var t = window.APC.timing;

    // Cancel the matrix rain rAF — wormhole takes over the canvas.
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }

    var w  = canvas.width;
    var h  = canvas.height;
    var cx = w / 2;
    var cy = h / 2;

    var bmpOffX  = bitmapParams.offsetX;
    var bmpOffY  = bitmapParams.offsetY;
    var bmpScale = bitmapParams.scale;
    var bmpW     = bitmapParams.assetW;
    var bmpH     = bitmapParams.assetH;

    var DIST_MS      = t.WORMHOLE_DISTURBANCE_MS;
    var SPIRAL_MS    = t.WORMHOLE_SPIRAL_MS;
    var COLLAPSE_MS  = t.WORMHOLE_COLLAPSE_MS;
    var REVEAL_MS    = t.WORMHOLE_REVEAL_MS;
    var GLOW_MAX_R   = t.WORMHOLE_GLOW_MAX_RADIUS;
    var GLOW_PULSE_R = t.WORMHOLE_GLOW_PULSE_RADIUS;

    // --- Build wormhole character grid ---
    // One character per canvas cell at ~60% density, sampled from the full grid.
    // Density keeps frame cost reasonable on large viewports.
    var gridCols = Math.floor(w / FONT_SIZE);
    var gridRows = Math.floor(h / FONT_SIZE);
    var wormChars = [];

    for (var ci = 0; ci < gridCols; ci++) {
      for (var ri = 0; ri < gridRows; ri++) {
        if (Math.random() > 0.6) { continue; }
        var px  = ci * FONT_SIZE + FONT_SIZE / 2;
        var py  = (ri + 1) * FONT_SIZE;
        var dx  = px - cx;
        var dy  = py - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        wormChars.push({
          origX:      px,
          origY:      py,
          initRadius: dist || 1,       // avoid 0-division at exact center
          angle:      Math.atan2(dy, dx),
          driftDir:   Math.random() > 0.5 ? 1 : -1,
          char:       MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        });
      }
    }

    var startTime = null;
    var prevTime  = null;
    var wormRafId = null;

    function drawGlow(glowRadius) {
      if (glowRadius <= 0) { return; }
      var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      grd.addColorStop(0,   'rgba(0,255,65,0.9)');
      grd.addColorStop(0.4, 'rgba(0,255,65,0.4)');
      grd.addColorStop(1,   'rgba(0,255,65,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle   = grd;
      ctx.fillRect(cx - glowRadius, cy - glowRadius, glowRadius * 2, glowRadius * 2);
    }

    function wormFrame(now) {
      if (startTime === null) { startTime = now; prevTime = now; }
      var elapsed   = now - startTime;
      var deltaTime = now - prevTime;
      prevTime = now;

      // Black canvas base.
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#000';
      ctx.fillRect(0, 0, w, h);

      ctx.font      = FONT_SIZE + 'px "Courier New", monospace';
      ctx.fillStyle = MATRIX_COLOR;

      var i, c, glowRadius;

      // --- Phase 1: Disturbance (0 → DIST_MS) ---
      if (elapsed < DIST_MS) {
        var prog     = elapsed / DIST_MS;
        var maxDrift = 30; // px — matches spec

        for (i = 0; i < wormChars.length; i++) {
          c = wormChars[i];
          // Drift perpendicular to radial direction (tangential).
          var perpX = -Math.sin(c.angle);
          var perpY =  Math.cos(c.angle);
          var drift = prog * maxDrift * c.driftDir;
          var dpx   = c.origX + perpX * drift;
          var dpy   = c.origY + perpY * drift;

          // Keep angle updated so Phase 2 starts from drifted position.
          var ddx = dpx - cx;
          var ddy = dpy - cy;
          if (ddx !== 0 || ddy !== 0) { c.angle = Math.atan2(ddy, ddx); }

          ctx.globalAlpha = 1;
          ctx.fillText(c.char, dpx, dpy);
        }

      // --- Phase 2: Spiral (DIST_MS → DIST_MS + SPIRAL_MS) ---
      } else if (elapsed < DIST_MS + SPIRAL_MS) {
        var phaseElapsed = elapsed - DIST_MS;
        var tNorm        = phaseElapsed / SPIRAL_MS;
        var easedT       = tNorm * tNorm; // ease-in: slow start, fast finish

        // Angular velocity increases as radius tightens.
        var rotIncrement = 0.003 * (1 + easedT * 3) * deltaTime;

        // Glow grows 0 → GLOW_MAX using smoothstep.
        var glowProg = tNorm * tNorm * (3 - 2 * tNorm);
        glowRadius   = glowProg * GLOW_MAX_R * bmpScale;

        for (i = 0; i < wormChars.length; i++) {
          c = wormChars[i];
          // Radius formula: initRadius → 0 as easedT → 1 (position-based, no per-frame decay).
          var newRadius = c.initRadius * Math.pow(1 - easedT, 2);
          c.angle      += rotIncrement;
          var spx       = cx + Math.cos(c.angle) * newRadius;
          var spy       = cy + Math.sin(c.angle) * newRadius;

          // Fade over last 40% of travel distance.
          var fadeStart = c.initRadius * 0.4;
          var opacity   = newRadius < fadeStart ? (newRadius / fadeStart) : 1;

          ctx.globalAlpha = Math.max(0, opacity);
          ctx.fillText(c.char, spx, spy);
        }

        drawGlow(glowRadius);

      // --- Phase 3: Collapse (DIST_MS + SPIRAL_MS → … + COLLAPSE_MS) ---
      } else if (elapsed < DIST_MS + SPIRAL_MS + COLLAPSE_MS) {
        var phaseElapsed = elapsed - DIST_MS - SPIRAL_MS;
        var prog         = phaseElapsed / COLLAPSE_MS;

        // Characters all converged to center in Phase 2 — Phase 3 is pure glow pulse.
        // First 40% (200ms): hold at GLOW_MAX. Next 60% (300ms): contract to GLOW_PULSE.
        var EXPAND_FRAC = 0.4;
        if (prog < EXPAND_FRAC) {
          glowRadius = GLOW_MAX_R * bmpScale;
        } else {
          var contractProg = (prog - EXPAND_FRAC) / (1 - EXPAND_FRAC);
          glowRadius = (GLOW_MAX_R - (GLOW_MAX_R - GLOW_PULSE_R) * contractProg) * bmpScale;
        }

        drawGlow(glowRadius);

      // --- Phase 4: Reveal (… + COLLAPSE_MS → … + REVEAL_MS) ---
      } else {
        var phaseElapsed = elapsed - DIST_MS - SPIRAL_MS - COLLAPSE_MS;

        if (phaseElapsed >= REVEAL_MS) {
          // Fully revealed — draw complete bitmap then hand off.
          ctx.globalAlpha = 1;
          ctx.drawImage(bitmap, bmpOffX, bmpOffY, bmpW * bmpScale, bmpH * bmpScale);
          cancelAnimationFrame(wormRafId);
          if (onComplete) { onComplete(); }
          return;
        }

        // Held glow fades as desk scene reveals.
        glowRadius = GLOW_PULSE_R * bmpScale * (1 - phaseElapsed / REVEAL_MS);
        drawGlow(glowRadius);

        // Radial clip reveal: slow start, fast finish (cubic ease).
        var tNorm  = phaseElapsed / REVEAL_MS;
        var easedT = tNorm < 0.5
          ? 2 * tNorm * tNorm
          : -1 + (4 - 2 * tNorm) * tNorm;
        var revealRadius = easedT * Math.max(w, h);

        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, revealRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(bitmap, bmpOffX, bmpOffY, bmpW * bmpScale, bmpH * bmpScale);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      wormRafId = requestAnimationFrame(wormFrame);
    }

    wormRafId = requestAnimationFrame(wormFrame);
  }

  return { init: init, restart: restart, shutdown: shutdown, startWormhole: startWormhole };

}());
