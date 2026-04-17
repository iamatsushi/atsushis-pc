// boot.js — Gate screen: Matrix rain, Click to Start, audio unlock
// Handles: Matrix → (future) terminal prompt → loading bar → desktop
// Namespaced under window.APC per project conventions.

window.APC = window.APC || {};

window.APC.boot = (function () {
  'use strict';

  // --- Constants -------------------------------------------------------

  const MATRIX_COLOR = '#00FF41';
  const FONT_SIZE = 14;
  const MATRIX_EMOJI_FREQUENCY_MIN = 0.01; // emoji appears in 1–5% of characters,
  const MATRIX_EMOJI_FREQUENCY_MAX = 0.05; // re-rolled per draw call
  const FADE_DURATION_MS = 600;

  const BOOT_BLOCK_COUNT = 20;
  const BOOT_FADE_DURATION_MS = 600;
  const BOOT_DESKTOP_PAUSE_MS = 1500;  // teal desktop visible before icons populate

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
  let lastFrameTime = 0;

  // --- Public API ------------------------------------------------------

  function init() {
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

  // --- Canvas setup ----------------------------------------------------

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initColumns();
  }

  function initColumns() {
    const count = Math.floor(canvas.width / FONT_SIZE);
    columns = [];
    for (let i = 0; i < count; i++) {
      columns.push({
        x: i * FONT_SIZE,
        // Stagger columns randomly off the top to avoid simultaneous rain start.
        y: Math.random() * -canvas.height,
        speed: 0.5 + Math.random() * 2.5
      });
    }
  }

  // --- Matrix rain render loop -----------------------------------------

  function drawFrame() {
    animFrame = requestAnimationFrame(drawFrame);

    // Throttle to ~20fps — skip render if less than 50ms has elapsed.
    const now = Date.now();
    if (now - lastFrameTime < 50) { return; }
    lastFrameTime = now;

    // Semi-transparent black overlay fades trailing characters each frame.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = FONT_SIZE + 'px "Courier New", monospace';

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
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
          col.y
        );
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = MATRIX_COLOR;
        ctx.fillText(
          MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
          col.x,
          col.y
        );
      }

      col.y += FONT_SIZE * col.speed;

      // When a column exits the bottom, reset it to a random position above
      // the top edge so columns re-enter at different times.
      if (col.y > canvas.height + FONT_SIZE) {
        col.y = Math.random() * -canvas.height;
        col.speed = 0.5 + Math.random() * 2.5;
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
    }, FADE_DURATION_MS);
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
    setTimeout(animateProgressBar, 200);
  }

  function animateProgressBar() {
    const track = document.getElementById('boot-progress-track');
    let blocksFilled = 0;

    // Simulate Win98 uneven disk loading: 85% normal (200–600ms), 15% stall (800–1200ms).
    // Expected avg ~490ms × 20 blocks ≈ 8–10s total fill time per session.
    function randomBlockDelay() {
      if (Math.random() < 0.15) {
        return 800 + Math.floor(Math.random() * 400);   // occasional stall
      }
      return 200 + Math.floor(Math.random() * 400);     // normal uneven load
    }

    function addBlock() {
      if (blocksFilled >= BOOT_BLOCK_COUNT) {
        // Bar is full — hold briefly so it's visible, then complete boot.
        setTimeout(completeBootScreen, 500);
        return;
      }

      const block = document.createElement('span');
      block.className = 'boot-progress__block';
      track.appendChild(block);

      blocksFilled++;

      // Update ARIA progress value as a percentage for screen readers.
      const pct = Math.round((blocksFilled / BOOT_BLOCK_COUNT) * 100);
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
    }, BOOT_FADE_DURATION_MS);
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
    }, skipDelay ? 0 : BOOT_DESKTOP_PAUSE_MS);
  }

  return { init };

}());
