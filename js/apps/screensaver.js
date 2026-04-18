// js/apps/screensaver.js — Signal Drift screensaver
// Idle-triggered full-viewport canvas animation. Injected into <body> on
// start, removed cleanly on stop. Exit on first keydown or mousedown.
//
// Motion model: 30 nodes drift via sine/cosine paths. Lines connect nodes
// within 120px; opacity proportional to proximity (closer = brighter).
// Trail effect via rgba(0,0,0,0.15) overdraw each frame — no clearRect.
//
// Namespaced at window.APC.apps.screensaver per project conventions.

window.APC       = window.APC       || {};
window.APC.apps  = window.APC.apps  || {};

window.APC.apps.screensaver = (function () {
  'use strict';

  // --- Visual constants (not timing — see win98-timing.js for delays) -----

  var NODE_COUNT     = 30;
  var CONNECTION_PX  = 120;         // proximity threshold for line drawing
  var NODE_RADIUS    = 2;           // filled circle radius in px
  var NODE_COLOR     = '#00FF41';   // terminal green — shared with Matrix rain
  var LINE_WEIGHT    = 0.5;         // line stroke width in px
  var TRAIL_ALPHA    = 'rgba(0,0,0,0.15)';  // overdraw per frame (motion blur)

  var AMP_MIN    = 60;   // node drift amplitude range (px)
  var AMP_MAX    = 120;
  var SPEED_MIN  = 0.3;  // sine/cosine frequency range (radians/second)
  var SPEED_MAX  = 0.8;

  // --- Module state (all reset to null/[] on every start()) ---------------

  var canvas      = null;
  var ctx         = null;
  var animFrameId = null;
  var nodes       = [];
  var reseedTimer = null;
  var startTime   = 0;
  var onExitCb    = null;

  // Exit listener references held for manual removeEventListener on stop()
  var onKeyDown   = null;
  var onMouseDown = null;

  // --- Helpers ------------------------------------------------------------

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // Initialise a single node with fully randomised motion parameters.
  function initNode(w, h) {
    return {
      x0:     rand(0, w),          // origin X (reseed only updates x0/y0)
      y0:     rand(0, h),          // origin Y
      ampX:   rand(AMP_MIN, AMP_MAX),
      ampY:   rand(AMP_MIN, AMP_MAX),
      speedX: rand(SPEED_MIN, SPEED_MAX),
      speedY: rand(SPEED_MIN, SPEED_MAX),
      phaseX: rand(0, Math.PI * 2),
      phaseY: rand(0, Math.PI * 2)
    };
  }

  // Compute node screen position at time t (seconds since start).
  function nodePos(node, t) {
    return {
      x: node.x0 + node.ampX * Math.sin(t * node.speedX + node.phaseX),
      y: node.y0 + node.ampY * Math.cos(t * node.speedY + node.phaseY)
    };
  }

  // --- Reseed -------------------------------------------------------------
  // Re-randomise each node's origin (x0, y0) only — speed, phase, and
  // amplitude stay constant so the transition looks organic rather than
  // abrupt. Schedules its own next reseed after running.

  function reseedNodes() {
    if (!canvas) { return; }
    var w = canvas.width;
    var h = canvas.height;
    nodes.forEach(function (node) {
      node.x0 = rand(0, w);
      node.y0 = rand(0, h);
    });
    scheduleReseed();
  }

  function scheduleReseed() {
    var t = window.APC.timing;
    reseedTimer = setTimeout(reseedNodes,
      t.rand(t.SCREENSAVER_RESEED_MIN_MS, t.SCREENSAVER_RESEED_MAX_MS));
  }

  // --- Draw loop ----------------------------------------------------------

  function draw() {
    if (!canvas) { return; }

    var t = (Date.now() - startTime) / 1000;
    var w = canvas.width;
    var h = canvas.height;

    // Trail: overdraw with semi-transparent black instead of clearRect.
    // Older characters fade naturally without an explicit erase step.
    ctx.fillStyle = TRAIL_ALPHA;
    ctx.fillRect(0, 0, w, h);

    // Compute all current node positions up front (reused for both lines and dots).
    var positions = nodes.map(function (node) { return nodePos(node, t); });

    // Connections — O(n²) at n=30 is 870 checks/frame: trivially fast.
    ctx.lineWidth = LINE_WEIGHT;
    for (var i = 0; i < positions.length; i++) {
      for (var j = i + 1; j < positions.length; j++) {
        var dx   = positions[i].x - positions[j].x;
        var dy   = positions[i].y - positions[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_PX) {
          // Closer → more opaque; floor at 0 to avoid rgba artefacts.
          var alpha = (1 - dist / CONNECTION_PX).toFixed(3);
          ctx.strokeStyle = 'rgba(0,255,65,' + alpha + ')';
          ctx.beginPath();
          ctx.moveTo(positions[i].x, positions[i].y);
          ctx.lineTo(positions[j].x, positions[j].y);
          ctx.stroke();
        }
      }
    }

    // Nodes drawn on top of lines so they stay crisp.
    ctx.fillStyle = NODE_COLOR;
    positions.forEach(function (pos) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });

    animFrameId = requestAnimationFrame(draw);
  }

  // --- Public API ---------------------------------------------------------

  // start(onExit) — inject canvas, initialise nodes, begin animation.
  // onExit is called after stop() completes (used by desktop.js to restart
  // the idle timer after the screensaver dismisses).
  function start(onExit) {
    if (canvas) { return; } // guard: already running

    onExitCb = onExit || null;

    // Full-viewport canvas, highest z-index on the page.
    canvas = document.createElement('canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'z-index:9999;background:#000000;display:block;';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    ctx = canvas.getContext('2d');
    // Fill black before first frame so the trail overdraw starts clean.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Initialise nodes.
    nodes = [];
    for (var i = 0; i < NODE_COUNT; i++) {
      nodes.push(initNode(canvas.width, canvas.height));
    }

    startTime = Date.now();
    scheduleReseed();
    animFrameId = requestAnimationFrame(draw);

    // Exit listeners — { once: true } auto-removes after first fire.
    // stop() also removes them explicitly in case it is called programmatically.
    onKeyDown = function () { stop(); };
    onMouseDown = function () { stop(); };
    document.addEventListener('keydown',   onKeyDown,   { once: true });
    document.addEventListener('mousedown', onMouseDown, { once: true });
  }

  // stop() — cancel animation, clear timers, remove canvas, fire onExit.
  // Safe to call multiple times (idempotent guards throughout).
  function stop() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (reseedTimer !== null) {
      clearTimeout(reseedTimer);
      reseedTimer = null;
    }

    // Remove exit listeners regardless of whether { once } already fired.
    // removeEventListener with a reference that no longer exists is a no-op.
    if (onKeyDown)   { document.removeEventListener('keydown',   onKeyDown);   onKeyDown   = null; }
    if (onMouseDown) { document.removeEventListener('mousedown', onMouseDown); onMouseDown = null; }

    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    canvas = null;
    ctx    = null;
    nodes  = [];

    // Fire exit callback after all teardown is complete.
    var cb = onExitCb;
    onExitCb = null;
    if (cb) { cb(); }
  }

  return { start: start, stop: stop };

}());
