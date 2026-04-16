// minesweeper.js — Fully playable Minesweeper mini-app
// 9x9 board, 10 mines. Left-click reveal, right-click flag cycle, chord click.
// First click is always safe. Win/lose states with LCD timer and mine counter.
// Namespaced under window.APC.apps per project conventions.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.minesweeper = (function () {
  'use strict';

  const ROWS  = 9;
  const COLS  = 9;
  const MINES = 10;

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
      title: 'Minesweeper',
      app: 'minesweeper',
      width: 220,
      height: 280,
      x: 160,
      y: 100
    });

    const closeBtn = winState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { winState = null; });
    }

    buildMinesweeperUI(winState.contentEl);
    winState.show();

    if (window.umami) { window.umami.track('app_open', { app_name: 'minesweeper' }); }
  }

  function buildMinesweeperUI(contentEl) {
    // --- Game state (closure-local) ---
    var board = [];        // [r][c] = { mine, revealed, flagged, question, adjacent, exploded }
    var gameState = 'idle'; // 'idle' | 'playing' | 'won' | 'lost'
    var minesLeft = MINES;
    var timerVal = 0;
    var timerInterval = null;
    var firstClick = true;

    // DOM refs set during build
    var mineCountEl = null;
    var timerEl = null;
    var smileyBtn = null;
    var cellEls = [];        // [r][c]

    // --- Helpers ---

    function formatLcd(n) {
      var s = String(Math.max(0, Math.min(999, n)));
      while (s.length < 3) { s = '0' + s; }
      return s;
    }

    function setSmiley(face) {
      if (smileyBtn) { smileyBtn.textContent = face; }
    }

    function startTimer() {
      stopTimer();
      timerInterval = setInterval(function () {
        if (timerVal < 999) {
          timerVal++;
          if (timerEl) { timerEl.textContent = formatLcd(timerVal); }
        }
      }, 1000);
    }

    function stopTimer() {
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    // --- Board logic ---

    function initBoard() {
      board = [];
      for (var r = 0; r < ROWS; r++) {
        board[r] = [];
        for (var c = 0; c < COLS; c++) {
          board[r][c] = {
            mine: false, revealed: false, flagged: false,
            question: false, adjacent: 0, exploded: false
          };
        }
      }
      gameState = 'idle';
      minesLeft = MINES;
      timerVal = 0;
      firstClick = true;
      stopTimer();
    }

    // Place mines avoiding the clicked cell and its 8 neighbors.
    // Adjacent counts are computed immediately after placement.
    function placeMines(safeR, safeC) {
      var placed = 0;
      while (placed < MINES) {
        var r = Math.floor(Math.random() * ROWS);
        var c = Math.floor(Math.random() * COLS);
        if (board[r][c].mine) { continue; }
        if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) { continue; }
        board[r][c].mine = true;
        placed++;
      }
      // Compute adjacent counts for every non-mine cell
      for (var ri = 0; ri < ROWS; ri++) {
        for (var ci = 0; ci < COLS; ci++) {
          if (board[ri][ci].mine) { continue; }
          var count = 0;
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) { continue; }
              var nr = ri + dr; var nc = ci + dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc].mine) {
                count++;
              }
            }
          }
          board[ri][ci].adjacent = count;
        }
      }
    }

    // Iterative flood fill: reveals empty cells and their zero-adjacent neighbors.
    function floodFill(startR, startC) {
      var stack = [[startR, startC]];
      while (stack.length > 0) {
        var pos = stack.pop();
        var r = pos[0]; var c = pos[1];
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) { continue; }
        var cell = board[r][c];
        if (cell.revealed || cell.flagged || cell.mine) { continue; }
        cell.revealed = true;
        if (cell.adjacent === 0) {
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) { continue; }
              stack.push([r + dr, c + dc]);
            }
          }
        }
      }
    }

    // Reveal all non-flagged mines (called on loss).
    function revealAllMines() {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (board[r][c].mine && !board[r][c].flagged) {
            board[r][c].revealed = true;
          }
        }
      }
    }

    // Check win: all non-mine cells are revealed.
    function checkWin() {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          if (!board[r][c].mine && !board[r][c].revealed) { return; }
        }
      }
      gameState = 'won';
      stopTimer();
      setSmiley('\uD83D\uDE0E'); // 😎
      // Auto-flag remaining mines
      for (var ri = 0; ri < ROWS; ri++) {
        for (var ci = 0; ci < COLS; ci++) {
          if (board[ri][ci].mine) { board[ri][ci].flagged = true; }
        }
      }
      minesLeft = 0;
      if (mineCountEl) { mineCountEl.textContent = '000'; }
    }

    // --- Action handlers ---

    function handleLeftClick(r, c) {
      if (gameState === 'won' || gameState === 'lost') { return; }
      var cell = board[r][c];
      if (cell.flagged || cell.question || cell.revealed) { return; }

      if (firstClick) {
        firstClick = false;
        gameState = 'playing';
        placeMines(r, c);
        startTimer();
      }

      if (cell.mine) {
        cell.exploded = true;
        cell.revealed = true;
        gameState = 'lost';
        stopTimer();
        setSmiley('\uD83D\uDE35'); // 😵
        revealAllMines();
        renderAll();
        return;
      }

      floodFill(r, c);
      checkWin();
      renderAll();
    }

    function handleRightClick(r, c) {
      if (gameState === 'won' || gameState === 'lost') { return; }
      var cell = board[r][c];
      if (cell.revealed) { return; }

      if (!cell.flagged && !cell.question) {
        cell.flagged = true;
        minesLeft--;
      } else if (cell.flagged) {
        cell.flagged = false;
        cell.question = true;
        minesLeft++;
      } else {
        cell.question = false;
      }

      if (mineCountEl) {
        mineCountEl.textContent = formatLcd(Math.max(0, minesLeft));
      }
      renderCell(r, c);
    }

    // Chord: if flagged-neighbor count matches cell.adjacent, reveal all
    // unflagged unrevealed neighbors. Triggers on simultaneous left+right click.
    function handleChord(r, c) {
      if (gameState === 'won' || gameState === 'lost') { return; }
      var cell = board[r][c];
      if (!cell.revealed || cell.adjacent === 0) { return; }

      var flagCount = 0;
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) { continue; }
          var nr = r + dr; var nc = c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) { continue; }
          if (board[nr][nc].flagged) { flagCount++; }
        }
      }
      if (flagCount !== cell.adjacent) { return; }

      var hitMine = false;
      for (var dr2 = -1; dr2 <= 1; dr2++) {
        for (var dc2 = -1; dc2 <= 1; dc2++) {
          if (dr2 === 0 && dc2 === 0) { continue; }
          var nr2 = r + dr2; var nc2 = c + dc2;
          if (nr2 < 0 || nr2 >= ROWS || nc2 < 0 || nc2 >= COLS) { continue; }
          var neighbor = board[nr2][nc2];
          if (!neighbor.revealed && !neighbor.flagged) {
            if (neighbor.mine) {
              neighbor.exploded = true;
              neighbor.revealed = true;
              hitMine = true;
            } else {
              floodFill(nr2, nc2);
            }
          }
        }
      }

      if (hitMine) {
        gameState = 'lost';
        stopTimer();
        setSmiley('\uD83D\uDE35'); // 😵
        revealAllMines();
      } else {
        checkWin();
      }
      renderAll();
    }

    // --- Rendering ---

    function renderCell(r, c) {
      var cellEl = cellEls[r][c];
      var cell = board[r][c];

      cellEl.className = 'ms-cell';
      cellEl.textContent = '';

      if (cell.revealed) {
        cellEl.classList.add('ms-cell--revealed');
        if (cell.mine) {
          if (cell.exploded) { cellEl.classList.add('ms-cell--exploded'); }
          cellEl.textContent = '\uD83D\uDCA3'; // 💣
        } else if (cell.adjacent > 0) {
          cellEl.textContent = String(cell.adjacent);
          cellEl.classList.add('ms-n' + cell.adjacent);
        }
        // adjacent === 0: empty revealed cell, no text
      } else if (cell.flagged) {
        // Show wrong flag as ✗ after a loss
        if (gameState === 'lost' && !cell.mine) {
          cellEl.textContent = '\u2717'; // ✗
        } else {
          cellEl.textContent = '\uD83D\uDEA9'; // 🚩
        }
      } else if (cell.question) {
        cellEl.textContent = '?';
      }
    }

    function renderAll() {
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          renderCell(r, c);
        }
      }
    }

    // --- Reset ---

    function reset() {
      initBoard();
      setSmiley('\uD83D\uDE42'); // 🙂
      if (mineCountEl) { mineCountEl.textContent = formatLcd(MINES); }
      if (timerEl) { timerEl.textContent = '000'; }
      renderAll();
    }

    // --- Build DOM ---

    var outer = document.createElement('div');
    outer.className = 'ms-outer';

    // Info bar (table layout: left LCD, centered smiley, right LCD)
    var infoBar = document.createElement('div');
    infoBar.className = 'ms-info';

    var infoTable = document.createElement('table');
    infoTable.className = 'ms-info-table';
    infoTable.setAttribute('cellpadding', '0');
    infoTable.setAttribute('cellspacing', '0');

    var infoTbody = document.createElement('tbody');
    var infoTr = document.createElement('tr');

    var tdLeft = document.createElement('td');
    tdLeft.className = 'ms-info-cell';
    mineCountEl = document.createElement('span');
    mineCountEl.className = 'ms-lcd';
    mineCountEl.setAttribute('aria-label', 'Mines remaining');
    mineCountEl.textContent = formatLcd(MINES);
    tdLeft.appendChild(mineCountEl);

    var tdCenter = document.createElement('td');
    tdCenter.className = 'ms-info-cell ms-info-cell--center';
    smileyBtn = document.createElement('button');
    smileyBtn.className = 'ms-smiley';
    smileyBtn.setAttribute('aria-label', 'New game');
    smileyBtn.textContent = '\uD83D\uDE42'; // 🙂
    smileyBtn.addEventListener('click', reset);
    tdCenter.appendChild(smileyBtn);

    var tdRight = document.createElement('td');
    tdRight.className = 'ms-info-cell ms-info-cell--right';
    timerEl = document.createElement('span');
    timerEl.className = 'ms-lcd';
    timerEl.setAttribute('aria-label', 'Elapsed time in seconds');
    timerEl.textContent = '000';
    tdRight.appendChild(timerEl);

    infoTr.appendChild(tdLeft);
    infoTr.appendChild(tdCenter);
    infoTr.appendChild(tdRight);
    infoTbody.appendChild(infoTr);
    infoTable.appendChild(infoTbody);
    infoBar.appendChild(infoTable);
    outer.appendChild(infoBar);

    // Game board
    var boardEl = document.createElement('div');
    boardEl.className = 'ms-board';
    boardEl.setAttribute('role', 'grid');
    boardEl.setAttribute('aria-label', 'Minesweeper board');

    initBoard();
    cellEls = [];

    for (var r = 0; r < ROWS; r++) {
      cellEls[r] = [];
      var rowEl = document.createElement('div');
      rowEl.className = 'ms-row';
      rowEl.setAttribute('role', 'row');

      for (var c = 0; c < COLS; c++) {
        // IIFE to capture r/c in event handler closures
        (function (row, col) {
          var cellEl = document.createElement('div');
          cellEl.className = 'ms-cell';
          cellEl.setAttribute('role', 'gridcell');
          cellEl.setAttribute('tabindex', '0');
          cellEl.setAttribute('aria-label', 'Cell ' + (row + 1) + ',' + (col + 1));
          cellEls[row][col] = cellEl;

          cellEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

          // Track per-cell button state for chord detection
          var leftHeld = false;
          var rightHeld = false;

          cellEl.addEventListener('mousedown', function (e) {
            if (gameState === 'won' || gameState === 'lost') { return; }
            e.preventDefault();
            if (e.button === 0) { leftHeld = true; }
            if (e.button === 2) { rightHeld = true; }
            // Anticipation face on left mousedown over unrevealed unflagged cell
            if (e.button === 0 && !board[row][col].revealed && !board[row][col].flagged) {
              setSmiley('\uD83D\uDE2E'); // 😮
            }
          });

          cellEl.addEventListener('mouseup', function (e) {
            e.preventDefault();
            if (gameState === 'won' || gameState === 'lost') {
              leftHeld = false; rightHeld = false; return;
            }

            var wasLeft = leftHeld;
            var wasRight = rightHeld;
            if (e.button === 0) { leftHeld = false; }
            if (e.button === 2) { rightHeld = false; }

            // Chord: both buttons were held when one was released
            if (wasLeft && wasRight) {
              setSmiley('\uD83D\uDE42'); // 🙂
              handleChord(row, col);
              return;
            }

            if (e.button === 0 && wasLeft) {
              setSmiley('\uD83D\uDE42'); // 🙂
              handleLeftClick(row, col);
              return;
            }

            if (e.button === 2 && wasRight) {
              handleRightClick(row, col);
            }
          });

          // Reset held state if mouse leaves without releasing (prevents stuck states)
          cellEl.addEventListener('mouseleave', function () {
            leftHeld = false;
            rightHeld = false;
            if (gameState === 'playing' || gameState === 'idle') {
              setSmiley('\uD83D\uDE42'); // 🙂
            }
          });

          rowEl.appendChild(cellEl);
        })(r, c);
      }

      boardEl.appendChild(rowEl);
    }

    outer.appendChild(boardEl);
    contentEl.appendChild(outer);

    // Stop timer when window is closed (avoids orphaned setIntervals)
    if (winState) {
      var innerCloseBtn = winState.el.querySelector('[data-action="close"]');
      if (innerCloseBtn) {
        innerCloseBtn.addEventListener('click', function () { stopTimer(); });
      }
    }

    // Initial board render
    renderAll();
  }

  return { open: open };

}());
