if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before boot-scene.js');
// boot-scene.js — Pre-boot desk scene with CRT power-on sequence (#104).
// Inserts between the Matrix rain gate keypress and the POST boot screen.
//
// Flow:
//   gate keypress → (gate fades 600ms) → bootScene.init(onComplete)
//     → desk scene fades in (600ms)
//     → user clicks power button
//     → CRT turn-on sequence (~1.1s)
//     → desk scene fades out (400ms)
//     → destroy() + onComplete() → advanceBootState(POST)
//
// Namespaced under window.APC per project conventions.
// All timing values from window.APC.timing — never hardcoded.
// Issue: #104

window.APC = window.APC || {};

window.APC.bootScene = (function () {
  'use strict';

  // --- Asset coordinates (spec) -----------------------------------------------
  // Raw pixel positions in the 1024×894 source image.

var ASSET_W = 1024;
var ASSET_H = 1172;
  
var SCREEN_X1 = 201, SCREEN_Y1 = 205, SCREEN_X2 = 654, SCREEN_Y2 = 600;
var POWER_X1  = 875, POWER_Y1  = 715, POWER_X2  = 930, POWER_Y2  = 775;

  // Power indicator light (adjacent to power button in asset coordinates).
  var INDICATOR_AX = 875, INDICATOR_AY = 710;
  var INDICATOR_SIZE_PX = 4; // unscaled size

  // Chroma key colors (exact — no tolerance).
  var CHROMA_SCREEN_R = 255, CHROMA_SCREEN_G = 0,   CHROMA_SCREEN_B = 255; // #FF00FF
  var CHROMA_POWER_R  = 0,   CHROMA_POWER_G  = 255, CHROMA_POWER_B  = 255; // #00FFFF

  // Replacement for power button region.
  var BEIGE_R = 200, BEIGE_G = 184, BEIGE_B = 154; // #C8B89A

  // --- Module state -----------------------------------------------------------

  var sceneCanvas = null;
  var sceneCtx    = null;
  var processedBitmap = null; // ImageBitmap after chroma key processing
  var matrixCanvas    = null; // reference to existing #matrix-canvas

  // Viewport-scaled region coordinates. Recomputed on resize.
  var scale   = 1;
  var offsetX = 0;
  var offsetY = 0;
  var screenRegion  = { x: 0, y: 0, w: 0, h: 0 };
  var powerRegion   = { x: 0, y: 0, w: 0, h: 0 };
  var indicatorPos  = { x: 0, y: 0 };
  var indicatorSize = 4;

  // Scene state.
  var onComplete    = null;
  var sceneRaf      = null;
  var flickerTimer  = null;  // handle for the idle flicker setTimeout
  var flickerActive = false; // true for FLICKER_DURATION_MS each cycle

  // CRT state machine.
  // 'idle' → 'btn_flash' → 'flash' → 'dim' → 'scanlines' → 'glow' → 'rain_on' → 'done'
  var crtState    = 'idle';
  var powerOn     = false; // power indicator color
  var powerClicked = false;

  // Pending timeouts — all tracked so destroy() can cancel them.
  var pendingTimeouts = [];

  // --- Utility ----------------------------------------------------------------

  function addTimeout(fn, delay) {
    var id = setTimeout(fn, delay);
    pendingTimeouts.push(id);
    return id;
  }

  function clearAllTimeouts() {
    for (var i = 0; i < pendingTimeouts.length; i++) {
      clearTimeout(pendingTimeouts[i]);
    }
    pendingTimeouts = [];
  }

  // --- Region computation -----------------------------------------------------
  //
  // Scales raw asset coordinates to the current viewport.
  // Called once on init and again on every resize.

  function computeRegions() {
    scale = Math.min(window.innerWidth / ASSET_W, window.innerHeight / ASSET_H);
    var drawW = ASSET_W * scale;
    var drawH = ASSET_H * scale;
    offsetX = (window.innerWidth  - drawW) / 2;
    offsetY = (window.innerHeight - drawH) / 2;

    screenRegion = {
      x: SCREEN_X1 * scale + offsetX,
      y: SCREEN_Y1 * scale + offsetY,
      w: (SCREEN_X2 - SCREEN_X1) * scale,
      h: (SCREEN_Y2 - SCREEN_Y1) * scale
    };

    powerRegion = {
      x: POWER_X1 * scale + offsetX,
      y: POWER_Y1 * scale + offsetY,
      w: (POWER_X2 - POWER_X1) * scale,
      h: (POWER_Y2 - POWER_Y1) * scale
    };

    indicatorPos = {
      x: INDICATOR_AX * scale + offsetX,
      y: INDICATOR_AY * scale + offsetY
    };
    indicatorSize = INDICATOR_SIZE_PX * scale;
  }

  // --- Chroma key processing --------------------------------------------------
  //
  // Draws the PNG onto an offscreen canvas, scans every pixel once:
  //   #FF00FF → fully transparent (CRT screen region — live content shows through)
  //   #00FFFF → #C8B89A beige (power button — matches tower body color)
  // Caches result as an ImageBitmap for efficient reuse every rAF frame.

  function processAsset(img, cb) {
    var offscreen = document.createElement('canvas');
    offscreen.width  = ASSET_W;
    offscreen.height = ASSET_H;
    var octx = offscreen.getContext('2d');
    octx.drawImage(img, 0, 0);

    var imageData = octx.getImageData(0, 0, ASSET_W, ASSET_H);
    var data = imageData.data;

    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];

      if (r === CHROMA_SCREEN_R && g === CHROMA_SCREEN_G && b === CHROMA_SCREEN_B) {
        // CRT screen: punch fully transparent.
        data[i]     = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      } else if (r === CHROMA_POWER_R && g === CHROMA_POWER_G && b === CHROMA_POWER_B) {
        // Power button: replace with beige.
        data[i]     = BEIGE_R;
        data[i + 1] = BEIGE_G;
        data[i + 2] = BEIGE_B;
        // alpha unchanged (keep as-is from source)
      }
    }

    octx.putImageData(imageData, 0, 0);

    createImageBitmap(offscreen).then(function (bitmap) {
      processedBitmap = bitmap;
      cb();
    });
  }

  // --- Resize handler ---------------------------------------------------------

  function onResize() {
    if (!sceneCanvas) { return; }
    sceneCanvas.width  = window.innerWidth;
    sceneCanvas.height = window.innerHeight;
    computeRegions();
  }

  // --- Idle CRT flicker -------------------------------------------------------
  //
  // Every 8–12s the CRT screen dims briefly (0.4 → 0.3 opacity) for 80ms —
  // simulates CRT instability. Only active in 'idle' crtState.

  function scheduleIdleFlicker() {
    if (crtState !== 'idle') { return; }
    var t = window.APC.timing;
    var delay = t.rand(t.CRT_IDLE_FLICKER_INTERVAL_MIN_MS, t.CRT_IDLE_FLICKER_INTERVAL_MAX_MS);
    flickerTimer = addTimeout(function () {
      if (crtState !== 'idle') { return; }
      flickerActive = true;
      addTimeout(function () {
        flickerActive = false;
        scheduleIdleFlicker();
      }, t.CRT_IDLE_FLICKER_DURATION_MS);
    }, delay);
  }

  // --- rAF render loop --------------------------------------------------------
  //
  // Runs every frame. Reads crtState to decide what to render in the CRT region.
  // Layers (bottom to top within the scene canvas):
  //   1. Black fill over CRT region
  //   2. Matrix rain sampled from #matrix-canvas at reduced opacity (idle) or CRT step content
  //   3. Processed desk scene PNG (transparent CRT pixels reveal layers below)
  //   4. CRT glow radial gradient (spills onto bezel)
  //   5. Power indicator dot

  function drawFrame() {
    sceneRaf = requestAnimationFrame(drawFrame);
    var ctx = sceneCtx;
    var sr  = screenRegion;

    ctx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);

    // --- CRT region content (drawn before PNG so PNG transparent pixels reveal it) ---

    if (crtState === 'idle') {
      // CRT is off — pure black. No content until power button is clicked.
      ctx.fillStyle = '#000000';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    } else if (crtState === 'btn_flash') {
      // Power button flash: CRT screen stays dim.
      ctx.fillStyle = '#000000';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    } else if (crtState === 'flash') {
      // Step 1: white flash across CRT screen.
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    } else if (crtState === 'dim') {
      // Step 2: dims to near-black.
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    } else if (crtState === 'scanlines') {
      // Step 3: alternating scanline rows — horizontal bands of #1A1A1A and #000.
      ctx.fillStyle = '#000000';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
      ctx.fillStyle = '#1A1A1A';
      var lineH = Math.max(1, Math.round(scale));
      for (var scanY = sr.y; scanY < sr.y + sr.h; scanY += lineH * 2) {
        ctx.fillRect(sr.x, scanY, sr.w, lineH);
      }

    } else if (crtState === 'glow') {
      // Step 4: phosphor green bloom.
      ctx.fillStyle = 'rgba(0,255,65,0.15)';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    } else if (crtState === 'rain_on') {
      // Step 5: matrix rain at 0.6 opacity — CRT fully alive.
      ctx.fillStyle = '#000000';
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
      if (matrixCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(
          matrixCanvas,
          sr.x, sr.y, sr.w, sr.h,
          sr.x, sr.y, sr.w, sr.h
        );
        ctx.restore();
      }
    }
    // 'done': CRT region is clear — desk scene is fading out, nothing to draw.

    // --- Desk scene PNG (transparent CRT region reveals what was drawn above) ---
    if (processedBitmap) {
      ctx.drawImage(
        processedBitmap,
        offsetX, offsetY,
        ASSET_W * scale, ASSET_H * scale
      );
    }

    // --- CRT glow: soft radial gradient centered on screen region, spills onto bezel ---
    var centerX    = sr.x + sr.w / 2;
    var centerY    = sr.y + sr.h / 2;
    var glowRadius = 80 * scale;
    var grd = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    grd.addColorStop(0, 'rgba(0,255,65,0.08)');
    grd.addColorStop(1, 'rgba(0,255,65,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(
      sr.x - glowRadius, sr.y - glowRadius,
      sr.w + glowRadius * 2, sr.h + glowRadius * 2
    );

    // --- Power indicator dot ---
    ctx.fillStyle = powerOn ? '#00FF41' : '#3A3A3A';
    ctx.fillRect(
      indicatorPos.x,
      indicatorPos.y,
      indicatorSize,
      indicatorSize
    );
  }

  // --- Power button interaction ------------------------------------------------

  function onMouseMove(e) {
    if (powerClicked) { return; }
    var pr = powerRegion;
    var inPower = (
      e.clientX >= pr.x && e.clientX <= pr.x + pr.w &&
      e.clientY >= pr.y && e.clientY <= pr.y + pr.h
    );
    sceneCanvas.style.cursor = inPower ? 'pointer' : 'default';
  }

  function onCanvasClick(e) {
    if (powerClicked) { return; }
    var pr = powerRegion;
    var inPower = (
      e.clientX >= pr.x && e.clientX <= pr.x + pr.w &&
      e.clientY >= pr.y && e.clientY <= pr.y + pr.h
    );
    if (!inPower) { return; }
    startCRTSequence();
  }

  // --- CRT power-on sequence --------------------------------------------------
  //
  // Five steps driven by chained timeouts. The rAF loop reads crtState each frame.
  // All timing from window.APC.timing — no hardcoded values.
  //
  // IMPORTANT: all post-click timeouts use plain setTimeout, NOT addTimeout.
  // addTimeout() tracks into pendingTimeouts which clearAllTimeouts() can cancel.
  // Once the power button is clicked the CRT sequence must run to completion
  // regardless of any other teardown path — it must not be cancellable.

  function startCRTSequence() {
    if (powerClicked) { return; }
    powerClicked = true;

    var t = window.APC.timing;

    // Power indicator turns on immediately.
    powerOn = true;

    // Start HDD audio: poweron.mp3 plays immediately, chatter.mp3 starts at crossfade
    // offset (9950ms). Audio-before-visual — same as a real PC powering on.
    // Guard: defensive check in case boot.js is not yet loaded or playHddAudio was
    // not exposed on the public API.
    if (window.APC.boot && typeof window.APC.boot.playHddAudio === 'function') {
      window.APC.boot.playHddAudio();
    }

    // Refresh matrixCanvas reference — after the wormhole the rain rAF was
    // restarted (PR #123), so the element is live and animating in the DOM.
    matrixCanvas = document.getElementById('matrix-canvas');

    // Power button flash (visual response — CRT screen stays dark).
    crtState = 'btn_flash';

    // Step 1: CRT white flash starts after button flash.
    setTimeout(function () { console.log('[CRT] flash');     crtState = 'flash';     }, t.POWER_BTN_FLASH_MS);

    // Step 2: dim.
    setTimeout(function () { console.log('[CRT] dim');       crtState = 'dim';       },
      t.POWER_BTN_FLASH_MS + t.CRT_FLASH_MS);

    // Step 3: scanlines.
    setTimeout(function () { console.log('[CRT] scanlines'); crtState = 'scanlines'; },
      t.POWER_BTN_FLASH_MS + t.CRT_FLASH_MS + t.CRT_DIM_MS);

    // Step 4: phosphor glow.
    setTimeout(function () { console.log('[CRT] glow');      crtState = 'glow';      },
      t.POWER_BTN_FLASH_MS + t.CRT_FLASH_MS + t.CRT_DIM_MS + t.CRT_SCANLINE_MS);

    // Step 5: rain visible.
    setTimeout(function () { console.log('[CRT] rain_on');   crtState = 'rain_on';   },
      t.POWER_BTN_FLASH_MS + t.CRT_FLASH_MS + t.CRT_DIM_MS +
      t.CRT_SCANLINE_MS + t.CRT_GLOW_MS);

    // After step 5 completes, fade out desk scene and hand off.
    var totalCRTDuration = t.POWER_BTN_FLASH_MS + t.CRT_FLASH_MS + t.CRT_DIM_MS +
                           t.CRT_SCANLINE_MS + t.CRT_GLOW_MS + t.CRT_CONTENT_FADE_MS;
    setTimeout(function () {
      console.log('[CRT] done — fadeOutAndComplete');
      crtState = 'done';
      fadeOutAndComplete();
    }, totalCRTDuration);
  }

  // --- Fade out and teardown --------------------------------------------------
  //
  // Two-phase exit (#124):
  //   Phase 1 — zoom in toward monitor center over DESK_ZOOM_MS (3000ms)
  //   Phase 2 — fade opacity 1→0 over BOOT_SCENE_FADE_OUT_MS (400ms)
  //
  // All plain setTimeout — must NOT be cancellable by clearAllTimeouts().
  // Fix 2 (#124): clear any existing transition before setting the zoom
  // transition so a lingering fade-in transition doesn't override it.

  function fadeOutAndComplete() {
    var t  = window.APC.timing;
    var sr = screenRegion;

    // Anchor the CSS transform origin to the center of the monitor screen region.
    var cx = sr.x + sr.w / 2;
    var cy = sr.y + sr.h / 2;
    sceneCanvas.style.transformOrigin = cx + 'px ' + cy + 'px';

    // Clear any lingering transition (e.g. from fade-in phase) so the zoom
    // transition takes effect cleanly on the next frame.
    sceneCanvas.style.transition = 'none';
    void sceneCanvas.offsetHeight; // force reflow

    // Phase 1: zoom in toward monitor center.
    sceneCanvas.style.transition = 'transform ' + t.DESK_ZOOM_MS + 'ms ease-in';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sceneCanvas.style.transform = 'scale(' + t.DESK_ZOOM_SCALE + ')';
      });
    });

    // Phase 2: after zoom, fade out then hand off.
    setTimeout(function () {
      sceneCanvas.style.transition = 'opacity ' + t.BOOT_SCENE_FADE_OUT_MS + 'ms ease';
      sceneCanvas.style.opacity    = '0';

      setTimeout(function () {
        // Clear stale Matrix rain pixels so they don't bleed through boot screens.
        var mc = document.getElementById('matrix-canvas');
        if (mc) { mc.getContext('2d').clearRect(0, 0, mc.width, mc.height); }

        // Fully hide gate screen (inline opacity overrides any lingering CSS).
        var gs = document.getElementById('gate-screen');
        if (gs) {
          gs.style.opacity    = '0';
          gs.style.transition = 'none';
          gs.classList.add('gate-screen--hidden');
        }

        var cb = onComplete;
        destroy();
        if (cb) { cb(); }
      }, t.BOOT_SCENE_FADE_OUT_MS);
    }, t.DESK_ZOOM_MS);
  }

  // --- Public API -------------------------------------------------------------

  function init(cb) {
    onComplete = cb || null;

    // Reference the existing Matrix rain canvas (keeps animating behind the scene).
    matrixCanvas = document.getElementById('matrix-canvas');

    // Create the desk scene canvas — sits above the gate screen (z-index 98).
    sceneCanvas = document.createElement('canvas');
    sceneCanvas.width  = window.innerWidth;
    sceneCanvas.height = window.innerHeight;
    sceneCanvas.setAttribute('role', 'img');
    sceneCanvas.setAttribute('aria-label', 'IBM Aptiva desk scene — click the power button to start');
    sceneCanvas.style.cssText = [
      'position:fixed;inset:0;',
      'z-index:100;',
      'opacity:0;',
      'display:block;',
      'background:transparent;',
      'pointer-events:none;'
    ].join('');
    document.body.appendChild(sceneCanvas);
    sceneCtx = sceneCanvas.getContext('2d');

    // Lower gate-screen to z-index 98 so it sits just below the scene canvas,
    // and restore opacity to 1 instantly (no transition) so Matrix rain is visible
    // through the transparent areas of the desk scene PNG.
    var gateScreen = document.getElementById('gate-screen');
    if (gateScreen) {
      gateScreen.style.zIndex     = '98';
      gateScreen.style.opacity    = '1';
      gateScreen.style.transition = 'none';
    }

    computeRegions();

    // Load and process the desk scene asset.
    var img = new Image();
    img.addEventListener('error', function () {
      // Asset load failed — skip scene and go straight to boot.
      var cb = onComplete;
      destroy();
      if (cb) { cb(); }
    });
    img.addEventListener('load', function () {
      processAsset(img, function () {
        // Wormhole transition (#106): matrix rain spirals into desk scene.
        // startWormhole takes control of #matrix-canvas, runs four phases,
        // then calls onComplete when the desk scene is fully revealed.
        window.APC.boot.startWormhole(processedBitmap, {
          offsetX: offsetX,
          offsetY: offsetY,
          scale:   scale,
          assetW:  ASSET_W,
          assetH:  ASSET_H
        }, function () {
          // Wormhole complete — snap scene canvas visible and start rAF.
          if (!sceneCanvas) { return; }
          sceneCanvas.style.transition    = 'none';
          sceneCanvas.style.opacity       = '1';
          sceneCanvas.style.pointerEvents = '';
          drawFrame();
          sceneCanvas.addEventListener('mousemove', onMouseMove);
          sceneCanvas.addEventListener('click', onCanvasClick);
          window.addEventListener('resize', onResize);
        });
      });
    });
    img.src = 'assets/images/desk-scene_edited.png';
  }

  function destroy() {
    // 1. Cancel rAF loop.
    if (sceneRaf) {
      cancelAnimationFrame(sceneRaf);
      sceneRaf = null;
    }

    // 2. Cancel flicker timer and all pending timeouts.
    if (flickerTimer) {
      clearTimeout(flickerTimer);
      flickerTimer = null;
    }
    clearAllTimeouts();

    // 3. Remove event listeners.
    if (sceneCanvas) {
      sceneCanvas.removeEventListener('mousemove', onMouseMove);
      sceneCanvas.removeEventListener('click', onCanvasClick);
    }
    window.removeEventListener('resize', onResize);

    // 4. Remove canvas from DOM.
    if (sceneCanvas && sceneCanvas.parentNode) {
      sceneCanvas.parentNode.removeChild(sceneCanvas);
    }
    sceneCanvas = null;
    sceneCtx    = null;

    // 5. Release ImageBitmap.
    if (processedBitmap) {
      processedBitmap.close();
      processedBitmap = null;
    }

    // 6. Reset module state for potential soft restart.
    matrixCanvas  = null;
    onComplete    = null;
    flickerActive = false;
    powerOn       = false;
    powerClicked  = false;
    crtState      = 'idle';
  }

  return { init: init, destroy: destroy };

}());
