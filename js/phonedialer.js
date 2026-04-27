// phonedialer.js — Phone Dialer app for Atsushi's PC
// Programs > Accessories > Communications > Phone Dialer
// Plays real DTMF tones on keypad clicks. Dial always gets a busy signal.
// Registered as window.APC.apps.phonedialer.
// Lifecycle: open() / close() — close() stops all audio and clears timers.
// desktop.reset() reaches close() via the window.APC.apps loop.

window.APC       = window.APC       || {};
window.APC.apps  = window.APC.apps  || {};

window.APC.apps.phonedialer = (function () {
  'use strict';

  // --- DTMF frequency table -------------------------------------------
  // Standard dual-tone pairs (row Hz, col Hz) per ITU-T Q.23.
  var DTMF = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  // Busy signal: 480 Hz + 620 Hz, 0.5s on / 1.0s off (North American standard).
  var BUSY_FREQ_1    = 480;
  var BUSY_FREQ_2    = 620;
  var BUSY_ON_MS     = 500;
  var BUSY_OFF_MS    = 1000;
  var DTMF_DURATION  = 0.20;  // seconds — long enough to feel tactile
  var DTMF_GAIN      = 0.18;  // keep it quiet; two tones sum to ~0.36

  // --- Module state ----------------------------------------------------
  var winState   = null;   // desktop window state object (null = closed)
  var audioCtx   = null;   // shared AudioContext (created once, reused)
  var busyNodes  = null;   // { osc1, osc2, gain } while busy signal plays
  var busyTimer  = null;   // setInterval ID for busy signal on/off cycle
  var numberBuf  = '';     // digits entered so far

  // --- Public API -------------------------------------------------------

  function open() {
    // Singleton: focus if already open.
    if (winState) {
      if (winState.minimized) {
        window.APC.desktop.reset && null; // no-op guard
        var ids = Object.keys(window.APC.desktop && {} || {});
        // Use desktop's restoreWindow indirectly — just bring to front.
        winState.el.style.display = '';
        winState.minimized = false;
        if (winState.taskbarBtn) {
          winState.taskbarBtn.classList.remove('taskbar-btn--minimized');
          winState.taskbarBtn.classList.add('taskbar-btn--active');
        }
      }
      winState.el.style.zIndex = String(parseInt(winState.el.style.zIndex || 100, 10) + 1);
      return;
    }

    // Lazy-init AudioContext on first open (requires user gesture — satisfied by menu click).
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }

    numberBuf = '';

    var state = window.APC.desktop.createWindow({
      title:  'Phone Dialer',
      app:    'phonedialer',
      width:  240,
      height: 320,
      x:      200,
      y:      120
    });

    winState = state;
    buildUI(state.contentEl);

    // Intercept the window close button to run our teardown.
    var closeBtn = state.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      // The existing listener calls desktop.closeWindow(state) which calls
      // delete windows[id] — we piggyback our own teardown here.
      closeBtn.addEventListener('click', function () { close(); });
    }

    state.show();

    if (window.umami) { window.umami.track('app_open', { app: 'phonedialer' }); }
  }

  function close() {
    stopBusy();
    if (winState) {
      // desktop.closeWindow handles DOM removal and windows[] cleanup.
      // Only call it if the window is still in the DOM — the close button
      // listener in desktop.js may have already removed it.
      if (winState.el && winState.el.parentNode) {
        // Trigger via desktop API so taskbar button is also removed.
        // We can't call closeWindow() directly (it's private), so
        // simulate clicking the close button if it exists and we haven't
        // already. Guard: if parentNode is gone, it's already closed.
        try {
          var cb = winState.el.querySelector('[data-action="close"]');
          // Don't re-click — that would recurse. DOM removal is enough.
          if (winState.el.parentNode) {
            winState.el.parentNode.removeChild(winState.el);
          }
          if (winState.taskbarBtn && winState.taskbarBtn.parentNode) {
            winState.taskbarBtn.parentNode.removeChild(winState.taskbarBtn);
          }
        } catch (e) {}
      }
      winState = null;
    }
    numberBuf = '';
  }

  // --- UI builder -------------------------------------------------------

  function buildUI(contentEl) {
    contentEl.style.cssText = [
      'background:#c0c0c0;',
      'padding:8px;',
      'display:flex;',
      'flex-direction:column;',
      'gap:6px;',
      'box-sizing:border-box;',
      'height:100%;'
    ].join('');

    // Number display
    var display = document.createElement('input');
    display.type = 'text';
    display.readOnly = true;
    display.setAttribute('aria-label', 'Number to dial');
    display.style.cssText = [
      'width:100%;',
      'box-sizing:border-box;',
      'font-family:"Courier New",monospace;',
      'font-size:14px;',
      'padding:3px 5px;',
      'border-top:2px solid #808080;',
      'border-left:2px solid #808080;',
      'border-right:2px solid #fff;',
      'border-bottom:2px solid #fff;',
      'background:#fff;',
      'color:#000;',
      'letter-spacing:2px;'
    ].join('');
    contentEl.appendChild(display);

    // Keypad grid
    var grid = document.createElement('div');
    grid.style.cssText = [
      'display:grid;',
      'grid-template-columns:repeat(3,1fr);',
      'gap:4px;',
      'flex:1;'
    ].join('');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Keypad');

    var keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
    keys.forEach(function (k) {
      var btn = makeKey(k);
      btn.addEventListener('click', function () {
        numberBuf = (numberBuf + k).slice(-20); // cap at 20 digits
        display.value = numberBuf;
        playDTMF(k);
      });
      grid.appendChild(btn);
    });
    contentEl.appendChild(grid);

    // Action row: Dial + Clear
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;';

    var dialBtn = makeActionBtn('Dial');
    dialBtn.style.flex = '1';
    dialBtn.addEventListener('click', function () { startDialing(display); });

    var clearBtn = makeActionBtn('Clear');
    clearBtn.addEventListener('click', function () {
      stopBusy();
      numberBuf = '';
      display.value = '';
    });

    actions.appendChild(dialBtn);
    actions.appendChild(clearBtn);
    contentEl.appendChild(actions);
  }

  // --- Key + button builders --------------------------------------------

  function makeKey(label) {
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.setAttribute('aria-label', 'Dial ' + label);
    btn.style.cssText = [
      'font-family:"MS Sans Serif",Tahoma,sans-serif;',
      'font-size:16px;',
      'font-weight:bold;',
      'padding:0;',
      'cursor:pointer;',
      'background:#c0c0c0;',
      'color:#000;',
      'border-top:2px solid #fff;',
      'border-left:2px solid #fff;',
      'border-right:2px solid #404040;',
      'border-bottom:2px solid #404040;',
      'box-shadow:1px 1px 0 #000;',
      'active:border-top:2px solid #404040;'
    ].join('');

    // Win98 button press effect
    btn.addEventListener('mousedown', function () {
      btn.style.borderTop    = '2px solid #404040';
      btn.style.borderLeft   = '2px solid #404040';
      btn.style.borderRight  = '2px solid #fff';
      btn.style.borderBottom = '2px solid #fff';
    });
    btn.addEventListener('mouseup', function () {
      btn.style.borderTop    = '2px solid #fff';
      btn.style.borderLeft   = '2px solid #fff';
      btn.style.borderRight  = '2px solid #404040';
      btn.style.borderBottom = '2px solid #404040';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.borderTop    = '2px solid #fff';
      btn.style.borderLeft   = '2px solid #fff';
      btn.style.borderRight  = '2px solid #404040';
      btn.style.borderBottom = '2px solid #404040';
    });
    return btn;
  }

  function makeActionBtn(label) {
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'font-family:"MS Sans Serif",Tahoma,sans-serif;',
      'font-size:11px;',
      'padding:3px 10px;',
      'cursor:pointer;',
      'background:#c0c0c0;',
      'color:#000;',
      'border-top:2px solid #fff;',
      'border-left:2px solid #fff;',
      'border-right:2px solid #404040;',
      'border-bottom:2px solid #404040;',
      'box-shadow:1px 1px 0 #000;'
    ].join('');
    btn.addEventListener('mousedown', function () {
      btn.style.borderTop    = '2px solid #404040';
      btn.style.borderLeft   = '2px solid #404040';
      btn.style.borderRight  = '2px solid #fff';
      btn.style.borderBottom = '2px solid #fff';
    });
    btn.addEventListener('mouseup', function () {
      btn.style.borderTop    = '2px solid #fff';
      btn.style.borderLeft   = '2px solid #fff';
      btn.style.borderRight  = '2px solid #404040';
      btn.style.borderBottom = '2px solid #404040';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.borderTop    = '2px solid #fff';
      btn.style.borderLeft   = '2px solid #fff';
      btn.style.borderRight  = '2px solid #404040';
      btn.style.borderBottom = '2px solid #404040';
    });
    return btn;
  }

  // --- Audio: DTMF tone -------------------------------------------------

  function playDTMF(key) {
    if (!audioCtx) { return; }
    var freqs = DTMF[key];
    if (!freqs) { return; }
    var now  = audioCtx.currentTime;
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(DTMF_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DTMF_DURATION);
    gain.connect(audioCtx.destination);

    freqs.forEach(function (freq) {
      var osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + DTMF_DURATION);
      // Oscillators auto-disconnect after stop() — no manual cleanup needed.
    });
  }

  // --- Audio: busy signal -----------------------------------------------

  function startBusyTone() {
    if (!audioCtx) { return; }
    stopBusy(); // clear any previous cycle

    function onCycle() {
      // Start tone burst
      var now  = audioCtx.currentTime;
      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.connect(audioCtx.destination);

      var osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(BUSY_FREQ_1, now);
      osc1.connect(gain);
      osc1.start(now);

      var osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(BUSY_FREQ_2, now);
      osc2.connect(gain);
      osc2.start(now);

      busyNodes = { osc1: osc1, osc2: osc2, gain: gain };

      // Stop after ON duration
      var stopTimer = setTimeout(function () {
        stopBusyNodes();
      }, BUSY_ON_MS);
      // Store stopTimer on busyNodes so stopBusy() can cancel it
      busyNodes.stopTimer = stopTimer;
    }

    // First burst immediately, then repeat every ON+OFF interval
    onCycle();
    busyTimer = setInterval(onCycle, BUSY_ON_MS + BUSY_OFF_MS);
  }

  function stopBusyNodes() {
    if (!busyNodes) { return; }
    if (busyNodes.stopTimer) { clearTimeout(busyNodes.stopTimer); }
    try { busyNodes.osc1.stop(); busyNodes.osc1.disconnect(); } catch (e) {}
    try { busyNodes.osc2.stop(); busyNodes.osc2.disconnect(); } catch (e) {}
    try { busyNodes.gain.disconnect(); } catch (e) {}
    busyNodes = null;
  }

  function stopBusy() {
    if (busyTimer) { clearInterval(busyTimer); busyTimer = null; }
    stopBusyNodes();
  }

  // --- Dial flow --------------------------------------------------------

  function startDialing(display) {
    // Stop any previous busy signal
    stopBusy();

    if (!numberBuf) {
      showBusyDialog('Please enter a number to dial.');
      return;
    }

    // Animate dialing: show each digit as "dialing..."
    display.value = 'Dialing ' + numberBuf + '...';

    var t = window.APC.timing;
    var dialDelay = t.rand
      ? t.rand(800, 2200)
      : (800 + Math.floor(Math.random() * 1400));

    var dialTimer = setTimeout(function () {
      if (!winState) { return; } // window closed during delay
      display.value = numberBuf;
      startBusyTone();
      showBusyDialog(
        'The number you have dialed is not available.\n\n' +
        'Please check the number and try your call again.\n\n' +
        '(It will never connect. This is 1998.)'
      );
      if (window.umami) { window.umami.track('phonedialer_dial', { number_length: numberBuf.length }); }
    }, dialDelay);

    // Store dial timer on winState so close() can cancel it if window closes mid-dial
    if (winState) { winState._dialTimer = dialTimer; }
  }

  // --- Busy dialog ------------------------------------------------------

  function showBusyDialog(message) {
    var overlay = document.createElement('div');
    overlay.className = 'win98-msgbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'phonedialer-dialog-title');

    var box = document.createElement('div');
    box.className = 'win98-msgbox';

    var tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.id = 'phonedialer-dialog-title';
    titleSpan.textContent = 'Phone Dialer';
    var ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    var xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    ctrls.appendChild(xBtn);
    tb.appendChild(titleSpan);
    tb.appendChild(ctrls);
    box.appendChild(tb);

    var body = document.createElement('div');
    body.className = 'win98-msgbox__body';

    // Icon + message row
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;margin-bottom:10px;';
    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = 'font-size:28px;line-height:1;flex-shrink:0;';
    icon.textContent = '\u260E'; // ☎
    var msg = document.createElement('p');
    msg.className = 'win98-msgbox__msg';
    msg.style.margin = '0';
    message.split('\n').forEach(function (line, i) {
      if (i > 0) { msg.appendChild(document.createElement('br')); }
      msg.appendChild(document.createTextNode(line));
    });
    row.appendChild(icon);
    row.appendChild(msg);
    body.appendChild(row);

    var okBtn = document.createElement('button');
    okBtn.className = 'win98-msgbox__ok';
    okBtn.textContent = 'OK';
    body.appendChild(okBtn);
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function dismiss() {
      stopBusy();
      if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
      document.removeEventListener('keydown', onKey);
    }
    var onKey = function (e) { if (e.key === 'Escape') { dismiss(); } };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', dismiss);
    okBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { dismiss(); }
    });
    okBtn.focus();
  }

  // --- Exports ----------------------------------------------------------

  return { open: open, close: close };

}());
