// phonedialer.js — Phone Dialer for Atsushi's PC
// Programs > Accessories > Communications > Phone Dialer
// DTMF tones via Web Audio API. Dial always returns a busy signal.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.phonedialer = (function () {
 'use strict';

 var DTMF = {
 '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
 '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
 '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
 '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
 };

 var BUSY_FREQ_1 = 480;
 var BUSY_FREQ_2 = 620;

 var winState = null;
 var audioCtx = null;
 var numberBuf = '';
 var displayEl = null;

 var dialTimer = null;
 var busyIntervalTimer = null;
 var busyStopTimer = null;
 var busyNodes = null;
 var activeDialog = null;

 function open() {
 if (winState && winState.el && winState.el.parentNode) {
 if (window.APC.desktop && typeof window.APC.desktop.focusWindow === 'function') {
 window.APC.desktop.focusWindow(winState);
 } else if (typeof winState.show === 'function') {
 winState.show();
 }
 return;
 }

 if (winState && (!winState.el || !winState.el.parentNode)) {
 cleanupOnly();
 }

 if (!window.APC.desktop || typeof window.APC.desktop.createWindow !== 'function') { return; }

 ensureAudioContext();
 numberBuf = '';

 winState = window.APC.desktop.createWindow({
 title: 'Phone Dialer',
 app: 'phonedialer',
 width: 240,
 height: 300,
 x: 200,
 y: 120
 });

 buildUI(winState.contentEl);

 var closeBtn = winState.el.querySelector('[data-action="close"]');
 if (closeBtn) {
 closeBtn.addEventListener('click', function () { cleanupOnly(); });
 }

 winState.show();

 if (window.umami) { window.umami.track('app_open', { app: 'phonedialer' }); }
 }

 function close() {
 cleanupOnly();
 }

 function cleanupOnly() {
 clearDialTimer();
 stopBusy();
 dismissDialog(false);
 winState = null;
 displayEl = null;
 numberBuf = '';
 }

 function ensureAudioContext() {
 if (audioCtx) {
 if (audioCtx.state === 'suspended') { audioCtx.resume().catch(function () {}); }
 return audioCtx;
 }
 try {
 audioCtx = new (window.AudioContext || window.webkitAudioContext)();
 } catch (e) {
 audioCtx = null;
 }
 return audioCtx;
 }

 function buildUI(contentEl) {
 contentEl.style.cssText = [
 'background:#c0c0c0',
 'padding:8px',
 'display:flex',
 'flex-direction:column',
 'gap:8px',
 'box-sizing:border-box',
 'height:100%'
 ].join(';');

 displayEl = document.createElement('input');
 displayEl.type = 'text';
 displayEl.readOnly = true;
 displayEl.setAttribute('aria-label', 'Number to dial');
 displayEl.style.cssText = [
 'width:100%',
 'box-sizing:border-box',
 'font-family:"Courier New",monospace',
 'font-size:14px',
 'padding:3px 5px',
 'border-top:2px solid #808080',
 'border-left:2px solid #808080',
 'border-right:2px solid #fff',
 'border-bottom:2px solid #fff',
 'background:#fff',
 'color:#000',
 'letter-spacing:2px'
 ].join(';');
 contentEl.appendChild(displayEl);

 var grid = document.createElement('div');
 grid.style.cssText = [
 'display:grid',
 'grid-template-columns:repeat(3,1fr)',
 'gap:4px',
 'grid-auto-rows:36px'
 ].join(';');
 grid.setAttribute('role', 'group');
 grid.setAttribute('aria-label', 'Phone keypad');

 ['1','2','3','4','5','6','7','8','9','*','0','#'].forEach(function (key) {
 var btn = makeButton(key, true);
 btn.setAttribute('aria-label', 'Dial ' + key);
 btn.addEventListener('click', function () {
 ensureAudioContext();
 numberBuf = (numberBuf + key).slice(-20);
 if (displayEl) { displayEl.value = numberBuf; }
 playDTMF(key);
 });
 grid.appendChild(btn);
 });
 contentEl.appendChild(grid);

 var actions = document.createElement('div');
 actions.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-shrink:0';

 var dialBtn = makeButton('Dial', false);
 dialBtn.style.flex = '1';
 dialBtn.addEventListener('click', function () { startDialing(); });

 var clearBtn = makeButton('Clear', false);
 clearBtn.addEventListener('click', function () {
 clearDialTimer();
 stopBusy();
 numberBuf = '';
 if (displayEl) { displayEl.value = ''; }
 });

 actions.appendChild(dialBtn);
 actions.appendChild(clearBtn);
 contentEl.appendChild(actions);
 }

 function makeButton(label, isKeypad) {
 var btn = document.createElement('button');
 btn.textContent = label;
 btn.style.cssText = [
 'font-family:"MS Sans Serif",Tahoma,sans-serif',
 'font-size:' + (isKeypad ? '16px' : '11px'),
 'font-weight:' + (isKeypad ? 'bold' : 'normal'),
 'padding:' + (isKeypad ? '0' : '3px 10px'),
 'cursor:pointer',
 'background:#c0c0c0',
 'color:#000',
 'border-top:2px solid #fff',
 'border-left:2px solid #fff',
 'border-right:2px solid #404040',
 'border-bottom:2px solid #404040',
 'min-height:' + (isKeypad ? '36px' : '24px')
 ].join(';');

 btn.addEventListener('mousedown', function () { pressButton(btn); });
 btn.addEventListener('mouseup', function () { releaseButton(btn); });
 btn.addEventListener('mouseleave', function () { releaseButton(btn); });

 return btn;
 }

 function pressButton(btn) {
 btn.style.borderTop = '2px solid #404040';
 btn.style.borderLeft = '2px solid #404040';
 btn.style.borderRight = '2px solid #fff';
 btn.style.borderBottom = '2px solid #fff';
 }

 function releaseButton(btn) {
 btn.style.borderTop = '2px solid #fff';
 btn.style.borderLeft = '2px solid #fff';
 btn.style.borderRight = '2px solid #404040';
 btn.style.borderBottom = '2px solid #404040';
 }

 function playDTMF(key) {
 var ctx = ensureAudioContext();
 if (!ctx || !DTMF[key]) { return; }

 var t = window.APC.timing;
 var now = ctx.currentTime;
 var durationSeconds = t.PHONE_DIALER_DTMF_MS / 1000;

 var gain = ctx.createGain();
 gain.gain.setValueAtTime(0.18, now);
 gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);
 gain.connect(ctx.destination);

 DTMF[key].forEach(function (freq) {
 var osc = ctx.createOscillator();
 osc.type = 'sine';
 osc.frequency.setValueAtTime(freq, now);
 osc.connect(gain);
 osc.start(now);
 osc.stop(now + durationSeconds);
 });
 }

 function startDialing() {
 clearDialTimer();
 stopBusy();

 if (!numberBuf) {
 showDialog('Please enter a number to dial.', false);
 return;
 }

 ensureAudioContext();

 if (displayEl) { displayEl.value = 'Dialing ' + numberBuf + '...'; }

 var t = window.APC.timing;
 dialTimer = setTimeout(function () {
 dialTimer = null;
 if (!winState || !displayEl) { return; }

 displayEl.value = numberBuf;
 startBusy();
 showDialog(
 'The number you have dialed is not available.\n\n' +
 'Please check the number and try your call again.\n\n' +
 '(It will never connect. This is 1998.)',
 true
 );

 if (window.umami) {
 window.umami.track('phonedialer_dial', { number_length: numberBuf.length });
 }
 }, t.rand(t.PHONE_DIALER_DIAL_MIN_MS, t.PHONE_DIALER_DIAL_MAX_MS));
 }

 function clearDialTimer() {
 if (dialTimer) {
 clearTimeout(dialTimer);
 dialTimer = null;
 }
 }

 function startBusy() {
 var ctx = ensureAudioContext();
 if (!ctx) { return; }

 stopBusy();

 function toneOn() {
 var now = ctx.currentTime;
 var gain = ctx.createGain();
 gain.gain.setValueAtTime(0.14, now);
 gain.connect(ctx.destination);

 var osc1 = ctx.createOscillator();
 osc1.type = 'sine';
 osc1.frequency.setValueAtTime(BUSY_FREQ_1, now);
 osc1.connect(gain);
 osc1.start(now);

 var osc2 = ctx.createOscillator();
 osc2.type = 'sine';
 osc2.frequency.setValueAtTime(BUSY_FREQ_2, now);
 osc2.connect(gain);
 osc2.start(now);

 busyNodes = { osc1: osc1, osc2: osc2, gain: gain };

 busyStopTimer = setTimeout(function () {
 busyStopTimer = null;
 stopBusyNodes();
 }, window.APC.timing.PHONE_DIALER_BUSY_ON_MS);
 }

 toneOn();
 busyIntervalTimer = setInterval(
 toneOn,
 window.APC.timing.PHONE_DIALER_BUSY_ON_MS + window.APC.timing.PHONE_DIALER_BUSY_OFF_MS
 );
 }

 function stopBusyNodes() {
 if (!busyNodes) { return; }
 try { busyNodes.osc1.stop(); } catch (e) {}
 try { busyNodes.osc2.stop(); } catch (e) {}
 try { busyNodes.osc1.disconnect(); } catch (e) {}
 try { busyNodes.osc2.disconnect(); } catch (e) {}
 try { busyNodes.gain.disconnect(); } catch (e) {}
 busyNodes = null;
 }

 function stopBusy() {
 if (busyIntervalTimer) {
 clearInterval(busyIntervalTimer);
 busyIntervalTimer = null;
 }
 if (busyStopTimer) {
 clearTimeout(busyStopTimer);
 busyStopTimer = null;
 }
 stopBusyNodes();
 }

 function showDialog(message, stopBusyOnDismiss) {
 dismissDialog(false);

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

 var row = document.createElement('div');
 row.style.cssText = 'display:flex;gap:12px;align-items:flex-start;margin-bottom:10px';

 var icon = document.createElement('span');
 icon.setAttribute('aria-hidden', 'true');
 icon.style.cssText = 'font-size:28px;line-height:1;flex-shrink:0';
 icon.textContent = '\u260E';

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
 dismissDialog(stopBusyOnDismiss);
 }

 overlay._phonedialerKey = function (e) {
 if (e.key === 'Escape') { dismiss(); }
 };

 document.addEventListener('keydown', overlay._phonedialerKey);
 xBtn.addEventListener('click', dismiss);
 okBtn.addEventListener('click', dismiss);
 overlay.addEventListener('click', function (e) {
 if (e.target === overlay) { dismiss(); }
 });

 activeDialog = overlay;
 okBtn.focus();
 }

 function dismissDialog(shouldStopBusy) {
 if (!activeDialog) { return; }
 if (activeDialog._phonedialerKey) {
 document.removeEventListener('keydown', activeDialog._phonedialerKey);
 }
 if (activeDialog.parentNode) {
 activeDialog.parentNode.removeChild(activeDialog);
 }
 activeDialog = null;
 if (shouldStopBusy) { stopBusy(); }
 }

 return {
 open: open,
 close: close
 };

}());
