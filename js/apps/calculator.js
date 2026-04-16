// calculator.js — Calculator mini-app
// Pre-connection (isConnected = false): shows a fully functional Win98-style calculator.
// Post-connection (isConnected = true): rickrolls the user and shows a troll message.
// Per spec: rickroll links to official YouTube only (never served from Pi).
// Namespaced under window.APC.apps per project conventions.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.calculator = (function () {
  'use strict';

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

    const isConnected = !!(window.APC.session && window.APC.session.isConnected);

    winState = window.APC.desktop.createWindow({
      title: 'Calculator',
      app: 'calculator',
      width:  isConnected ? 280 : 240,
      height: isConnected ? 190 : 290,
      x: 140,
      y: 120
    });

    const closeBtn = winState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { winState = null; });
    }

    if (isConnected) {
      buildTrollUI(winState.contentEl);
    } else {
      buildRealCalculator(winState.contentEl);
    }

    winState.show();

    if (window.umami) { window.umami.track('app_open', { app_name: 'calculator' }); }
  }

  // --- Troll / rickroll UI (post-connection) ---------------------------

  function buildTrollUI(contentEl) {
    const root = document.createElement('div');
    root.className = 'calculator-app';

    const loadingMsg = document.createElement('p');
    loadingMsg.className = 'calculator-app__loading';
    loadingMsg.textContent = 'Loading Calculator...';
    root.appendChild(loadingMsg);

    contentEl.appendChild(root);

    setTimeout(function () {
      if (!winState) { return; }
      window.open(RICKROLL_URL, '_blank');
      root.innerHTML = '';
      const trollMsg = document.createElement('p');
      trollMsg.className = 'calculator-app__troll';
      trollMsg.textContent = 'Nice try. No calculator here.';
      root.appendChild(trollMsg);
      if (window.umami) { window.umami.track('easteregg_trigger', { easter_egg: 'rickroll' }); }
    }, 1000);
  }

  // --- Real Win98 calculator (pre-connection) -------------------------

  function buildRealCalculator(contentEl) {
    // All calculator state is local to this closure — each open() call
    // gets a fresh state, and closing the window destroys it naturally.
    let displayVal      = '0';
    let firstOperand    = null;
    let operator        = null;
    let waitingForSecond = false;

    const root = document.createElement('div');
    root.className = 'calc-real';

    // Display
    const display = document.createElement('div');
    display.className = 'calc-real__display';
    display.textContent = '0';
    display.setAttribute('aria-live', 'polite');
    display.setAttribute('aria-label', 'Calculator display');
    root.appendChild(display);

    function updateDisplay() {
      display.textContent = displayVal;
    }

    // --- Button logic ---

    function inputDigit(digit) {
      if (waitingForSecond) {
        displayVal = digit;
        waitingForSecond = false;
      } else {
        displayVal = displayVal === '0' ? digit : displayVal + digit;
      }
      // Cap display length to avoid overflow
      if (displayVal.length > 12) { displayVal = displayVal.slice(0, 12); }
      updateDisplay();
    }

    function inputDot() {
      if (waitingForSecond) {
        displayVal = '0.';
        waitingForSecond = false;
        updateDisplay();
        return;
      }
      if (displayVal.indexOf('.') === -1) {
        displayVal += '.';
        updateDisplay();
      }
    }

    function compute(a, op, b) {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? null : a / b;  // null signals division by zero
        default:  return b;
      }
    }

    function handleOperator(op) {
      const current = parseFloat(displayVal);
      if (firstOperand !== null && !waitingForSecond) {
        // Chain: compute pending operation before storing new one
        const result = compute(firstOperand, operator, current);
        if (result === null) {
          displayVal = 'Error';
          firstOperand = null;
          operator = null;
          waitingForSecond = false;
          updateDisplay();
          return;
        }
        // Format: avoid floating-point noise (e.g. 0.1+0.2)
        displayVal = String(parseFloat(result.toPrecision(10)));
        updateDisplay();
        firstOperand = parseFloat(displayVal);
      } else {
        firstOperand = current;
      }
      operator = op;
      waitingForSecond = true;
    }

    function handleEquals() {
      if (firstOperand === null || operator === null) { return; }
      const current = parseFloat(displayVal);
      const result = compute(firstOperand, operator, current);
      if (result === null) {
        displayVal = 'Error';
      } else {
        displayVal = String(parseFloat(result.toPrecision(10)));
      }
      firstOperand = null;
      operator = null;
      waitingForSecond = false;
      updateDisplay();
    }

    function handleC() {
      displayVal = '0';
      firstOperand = null;
      operator = null;
      waitingForSecond = false;
      updateDisplay();
    }

    function handleCE() {
      displayVal = '0';
      waitingForSecond = false;
      updateDisplay();
    }

    // --- Button grid (table layout — no flex/grid per CLAUDE.md) ---

    const grid = document.createElement('table');
    grid.className = 'calc-real__grid';
    grid.setAttribute('cellpadding', '0');
    grid.setAttribute('cellspacing', '0');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Calculator buttons');

    const tbody = document.createElement('tbody');

    // Helper: create a button <td>
    function makeBtn(label, onClick, colSpan, extraClass) {
      const td = document.createElement('td');
      td.className = 'calc-real__td';
      if (colSpan && colSpan > 1) { td.setAttribute('colspan', String(colSpan)); }
      const btn = document.createElement('button');
      btn.className = 'calc-real__btn' + (extraClass ? ' ' + extraClass : '');
      btn.textContent = label;
      btn.setAttribute('aria-label', label);
      btn.addEventListener('click', onClick);
      td.appendChild(btn);
      return td;
    }

    // Helper: create a table row from an array of td elements
    function makeRow(tds) {
      const tr = document.createElement('tr');
      tds.forEach(function (td) { tr.appendChild(td); });
      return tr;
    }

    // Row 1: C (colspan=2), CE (colspan=2)
    tbody.appendChild(makeRow([
      makeBtn('C',  handleC,  2, 'calc-real__btn--util'),
      makeBtn('CE', handleCE, 2, 'calc-real__btn--util')
    ]));

    // Row 2: 7 8 9 /
    tbody.appendChild(makeRow([
      makeBtn('7', function () { inputDigit('7'); }),
      makeBtn('8', function () { inputDigit('8'); }),
      makeBtn('9', function () { inputDigit('9'); }),
      makeBtn('/', function () { handleOperator('/'); }, 1, 'calc-real__btn--op')
    ]));

    // Row 3: 4 5 6 *
    tbody.appendChild(makeRow([
      makeBtn('4', function () { inputDigit('4'); }),
      makeBtn('5', function () { inputDigit('5'); }),
      makeBtn('6', function () { inputDigit('6'); }),
      makeBtn('*', function () { handleOperator('*'); }, 1, 'calc-real__btn--op')
    ]));

    // Row 4: 1 2 3 -
    tbody.appendChild(makeRow([
      makeBtn('1', function () { inputDigit('1'); }),
      makeBtn('2', function () { inputDigit('2'); }),
      makeBtn('3', function () { inputDigit('3'); }),
      makeBtn('-', function () { handleOperator('-'); }, 1, 'calc-real__btn--op')
    ]));

    // Row 5: 0 . = +
    tbody.appendChild(makeRow([
      makeBtn('0', function () { inputDigit('0'); }),
      makeBtn('.', inputDot),
      makeBtn('=', handleEquals, 1, 'calc-real__btn--eq'),
      makeBtn('+', function () { handleOperator('+'); }, 1, 'calc-real__btn--op')
    ]));

    grid.appendChild(tbody);
    root.appendChild(grid);
    contentEl.appendChild(root);
  }

  return { open: open };

}());
