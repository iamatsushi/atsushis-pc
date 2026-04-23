if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before winamp.js');
// winamp.js — Winamp 2.x music player simulation
// Mini-app: animated spectrum analyzer, no-op transport controls.
// Namespaced under window.APC.apps per project conventions.
//
// Lifecycle hooks exposed on public API:
//   pause()  — breaks rAF chain completely (called by desktop.js on minimize)
//   resume() — restarts rAF chain from scratch (called by desktop.js on restore)
// This ensures zero CPU/battery overhead when the window is minimized.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.winamp = (function () {
  'use strict';

  let winState = null;

  // --- Spectrum state hoisted to module scope ----------------------------
  // Hoisting allows pause() and resume() to break and restart the rAF chain
  // without being trapped inside the startSpectrum closure.

  let spectrumCanvas = null;  // canvas element reference
  let spectrumCtx    = null;  // 2d context
  let spectrumRaf    = null;  // current rAF handle — null when stopped
  let spectrumT      = 0;     // animation time accumulator

  const BARS   = 18;
  const BAR_W  = 12;
  const BAR_GAP = 2;
  const MAX_H  = 36;

  // drawSpectrum is module-scoped so resume() can call requestAnimationFrame(drawSpectrum)
  // to restart the chain cleanly without any spin loop.
  function drawSpectrum() {
    if (!spectrumCanvas || !spectrumCanvas.parentNode) {
      // Canvas removed from DOM (window closed) — stop chain
      spectrumRaf = null;
      return;
    }

    spectrumT += 0.06;
    spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

    for (var i = 0; i < BARS; i++) {
      var h = Math.max(2, (Math.sin(spectrumT * 1.5 + i * 0.4) * 0.5 + 0.5) * MAX_H);
      var x = 2 + i * (BAR_W + BAR_GAP);
      var y = spectrumCanvas.height - h;

      spectrumCtx.fillStyle = '#00BB00';
      spectrumCtx.fillRect(x, y, BAR_W, h);

      // Peak marker: teal, 2px tall, 3px above bar top
      spectrumCtx.fillStyle = '#008080';
      spectrumCtx.fillRect(x, Math.max(0, y - 3), BAR_W, 2);
    }

    spectrumRaf = requestAnimationFrame(drawSpectrum);
  }

  function startSpectrum(canvas) {
    spectrumCanvas = canvas;
    spectrumCtx    = canvas.getContext('2d');
    spectrumT      = 0;
    spectrumRaf    = requestAnimationFrame(drawSpectrum);
  }

  function stopSpectrum() {
    if (spectrumRaf) {
      cancelAnimationFrame(spectrumRaf);
      spectrumRaf = null;
    }
  }

  // --- Lifecycle hooks ---------------------------------------------------

  function pause() {
    // Completely break the rAF chain — zero CPU overhead while minimized
    stopSpectrum();
  }

  function resume() {
    // Restart rAF chain from scratch — only if canvas still exists
    if (spectrumCanvas && spectrumCanvas.parentNode && !spectrumRaf) {
      spectrumRaf = requestAnimationFrame(drawSpectrum);
    }
  }

  // --- Window open -------------------------------------------------------

  function open() {
    if (winState) {
      if (winState.minimized) {
        winState.el.style.display = '';
        winState.minimized = false;
        if (winState.taskbarBtn) {
          winState.taskbarBtn.classList.remove('taskbar-btn--minimized');
          winState.taskbarBtn.classList.add('taskbar-btn--active');
        }
        resume();
      }
      winState.el.dispatchEvent(new MouseEvent('mousedown'));
      return;
    }

    winState = window.APC.desktop.createWindow({
      title: 'Winamp',
      app: 'winamp',
      width: 280,
      height: 165,
      x: 100,
      y: 100
    });

    const closeBtn = winState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        stopSpectrum();
        spectrumCanvas = null;
        spectrumCtx    = null;
        winState       = null;
      });
    }

    buildWinampUI(winState.contentEl);
    winState.show();

    if (window.umami) { window.umami.track('app_open', { app_name: 'winamp' }); }
  }

  function buildWinampUI(contentEl) {
    const root = document.createElement('div');
    root.className = 'winamp';

    // Inner title bar
    const innerTitle = document.createElement('div');
    innerTitle.className = 'winamp__inner-title';
    innerTitle.setAttribute('aria-hidden', 'true');
    innerTitle.textContent = 'Winamp';
    root.appendChild(innerTitle);

    // Track info
    const trackInfo = document.createElement('div');
    trackInfo.className = 'winamp__track-info';

    const trackName = document.createElement('div');
    trackName.className = 'winamp__track-name';
    trackName.textContent = '*** NO MEDIA LOADED ***';
    trackInfo.appendChild(trackName);

    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'winamp__time';
    timeDisplay.setAttribute('aria-label', 'Elapsed time');
    timeDisplay.textContent = '0:00';
    trackInfo.appendChild(timeDisplay);

    root.appendChild(trackInfo);

    // Spectrum analyzer canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'winamp__spectrum';
    canvas.width = 260;
    canvas.height = 40;
    canvas.setAttribute('aria-hidden', 'true');
    root.appendChild(canvas);

    // Transport controls — all decorative no-ops
    const controls = document.createElement('div');
    controls.className = 'winamp__controls';
    const controlDefs = [
      { text: '|◄◄', label: 'Previous track' },
      { text: '►',   label: 'Play'            },
      { text: '||',  label: 'Pause'           },
      { text: '■',   label: 'Stop'            },
      { text: '►|',  label: 'Next track'      }
    ];
    controlDefs.forEach(function (def) {
      const btn = document.createElement('button');
      btn.className = 'winamp__btn';
      btn.textContent = def.text;
      btn.setAttribute('aria-label', def.label);
      controls.appendChild(btn);
    });
    root.appendChild(controls);

    // Volume row (decorative)
    const volRow = document.createElement('div');
    volRow.className = 'winamp__vol-row';

    const volLabel = document.createElement('span');
    volLabel.className = 'winamp__vol-label';
    volLabel.setAttribute('aria-hidden', 'true');
    volLabel.textContent = 'VOL';

    const volTrack = document.createElement('div');
    volTrack.className = 'winamp__vol-track';
    const volFill = document.createElement('div');
    volFill.className = 'winamp__vol-fill';
    volTrack.appendChild(volFill);

    volRow.appendChild(volLabel);
    volRow.appendChild(volTrack);
    root.appendChild(volRow);

    contentEl.appendChild(root);

    startSpectrum(canvas);
  }

  return { open: open, pause: pause, resume: resume };

}());
