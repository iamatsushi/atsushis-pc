// calculator.js — Calculator troll mini-app
// Shows a loading message for 1 second, then rickrolls and displays a troll message.
// Per spec: links to official YouTube only (never serves the video from the Pi).
// Namespaced under window.APC.apps per project conventions.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.calculator = (function () {
  'use strict';

  // Official YouTube video — never served from Pi
  const RICKROLL_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  let winState = null;

  function open() {
    if (winState) {
      if (winState.minimized) {
        winState.el.style.display = '';
        winState.minimized = false;
        if (winState.taskbarBtn) {
          winState.taskbarBtn.classList.remove('taskbar-btn--minimized');
          winState.taskbarBtn.classList.add('taskbar-btn--active');
        }
      }
      winState.el.dispatchEvent(new MouseEvent('mousedown'));
      return;
    }

    winState = window.APC.desktop.createWindow({
      title: 'Calculator',
      app: 'calculator',
      width: 280,
      height: 190,
      x: 140,
      y: 120
    });

    const closeBtn = winState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { winState = null; });
    }

    buildCalculatorUI(winState.contentEl);
    winState.show();

    if (window.umami) { window.umami.track('app_open', { app_name: 'calculator' }); }
  }

  function buildCalculatorUI(contentEl) {
    const root = document.createElement('div');
    root.className = 'calculator-app';

    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'calculator-app__loading';
    loadingMsg.textContent = 'Loading Calculator...';
    root.appendChild(loadingMsg);

    contentEl.appendChild(root);

    setTimeout(function () {
      // Guard: window may have been closed during the 1s delay
      if (!winState) { return; }

      window.open(RICKROLL_URL, '_blank');

      root.innerHTML = '';
      const trollMsg = document.createElement('p');
      trollMsg.className = 'calculator-app__troll';
      trollMsg.textContent = 'Nice try. No calculator here.';
      root.appendChild(trollMsg);

      if (window.umami) { window.umami.track('easteregg_trigger'); }
    }, 1000);
  }

  return { open: open };

}());
