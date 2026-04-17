// js/win98-timing.js
// Centralised timing token system for the WinDoors 98 behavioral fidelity simulation.
//
// Every delay value in this project lives here. Never hardcode ms values elsewhere —
// always reference window.APC.timing.<TOKEN>.
//
// Grounded in IBM Aptiva SE7 hardware (1998) on a V.90 56K modem at ~30 kbps actual
// throughput. When validating a delay, ask: "Would this be noticeable on an IBM Aptiva
// SE7 running WinDoors 98 on a 30 kbps connection?"
//
// Two behavioral zones govern all timing and failure rules:
//
//   PROTECTED PATH — recruiter-facing workflows (NetEscape pages, Guestbook, resume flow)
//     • Max delay: 1000ms total
//     • No failures, no error states
//     • Always show visible progress feedback
//
//   TEXTURE ZONE — ambient / system UI (desktop apps, Start Menu, System Tray, Explorer)
//     • Max delay: 6000ms
//     • Minor, recoverable failures permitted — never block Protected Path
//     • Always show UI feedback (hourglass, status bar) for delays > 300ms

(function () {
  'use strict';

  window.APC = window.APC || {};

  window.APC.timing = {

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    // Return a random integer in [min, max] inclusive.
    rand: function (min, max) {
      return min + Math.floor(Math.random() * (max - min + 1));
    },

    // -------------------------------------------------------------------------
    // Matrix Gate Screen
    // Choreography timings — not latency simulation.
    // The gate screen loads instantly; these values govern the animation sequence
    // that plays after the rain has established itself.
    // -------------------------------------------------------------------------

    MATRIX_IDENTITY_START_MS:       2000,  // rain runs; identity lines begin typing
    MATRIX_IDENTITY_CHAR_MIN_MS:      40,  // min ms per character
    MATRIX_IDENTITY_CHAR_MAX_MS:      60,  // max ms per character
    MATRIX_IDENTITY_LINE_GAP_MS:     600,  // pause between line 1 and line 2
    MATRIX_IDENTITY_PROMPT_GAP_MS:  1000,  // pause after line 2 before prompt appears

    // Rain column typing pace — per-column typing reveal model.
    // Columns advance one character at a time at a randomised speed.
    MATRIX_RAIN_CHAR_MIN_MS:          40,  // fastest column (programmer typing speed)
    MATRIX_RAIN_CHAR_MAX_MS:         180,  // slowest column
    MATRIX_RAIN_RESET_MIN_MS:        800,  // pause after column fills before reset to top
    MATRIX_RAIN_RESET_MAX_MS:       2500,
    MATRIX_RAIN_STAGGER_MAX_MS:     2000,  // max random start delay per column on init

    // -------------------------------------------------------------------------
    // Boot Screen sequence
    // Fixed choreography — not latency simulation.
    // -------------------------------------------------------------------------

    GATE_FADE_MS:                    600,  // gate screen CSS fade-out before boot begins
    BOOT_SETTLE_MS:                  200,  // pause before progress bar starts animating
    BOOT_BLOCK_COUNT:                 20,  // number of blocks in the Win98 progress bar
    BOOT_BLOCK_NORMAL_MIN_MS:        200,  // normal block fill delay (85% of blocks)
    BOOT_BLOCK_NORMAL_MAX_MS:        600,
    BOOT_BLOCK_STALL_MIN_MS:         800,  // occasional stall delay (15% of blocks)
    BOOT_BLOCK_STALL_MAX_MS:        1200,
    BOOT_BLOCK_STALL_CHANCE:        0.15,  // probability of stall vs normal delay
    BOOT_HOLD_MS:                    500,  // full bar visible before fade begins
    BOOT_SCREEN_FADE_MS:             600,  // boot screen CSS fade-out duration
    BOOT_DESKTOP_PAUSE_MS:          1500,  // teal desktop visible before icons populate

    // -------------------------------------------------------------------------
    // NetEscape Browser  —  PROTECTED PATH
    // Max 1000ms per navigation. No failures. Always show status bar feedback.
    // -------------------------------------------------------------------------

    NE_INITIAL_LOAD_MIN_MS:   300,  // first page load after dial-up completes
    NE_INITIAL_LOAD_MAX_MS:   900,
    NE_NAV_MIN_MS:            150,  // in-session link navigation
    NE_NAV_MAX_MS:            500,
    NE_BACK_FWD_MIN_MS:       100,  // back / forward buttons
    NE_BACK_FWD_MAX_MS:       400,
    NE_MANUAL_URL_MIN_MS:    1000,  // manual URL entry (dial-up simulation delay)
    NE_MANUAL_URL_MAX_MS:    4000,
    NE_FREEZE_DELAY_MS:      2500,  // unknown URL: stub renders then freezes before dialog

    // -------------------------------------------------------------------------
    // Start Menu  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    MENU_OPEN_MIN_MS:          80,  // start button pressed → menu visible
    MENU_OPEN_MAX_MS:         180,
    MENU_SUBMENU_MIN_MS:      200,  // hover → submenu expand
    MENU_SUBMENU_MAX_MS:      400,
    MENU_ACTION_MIN_MS:       100,  // item click → action fires
    MENU_ACTION_MAX_MS:       250,
    MENU_FLICKER_CHANCE:      1/12, // probability menu flickers closed on open

    // -------------------------------------------------------------------------
    // Desktop App Launches  —  TEXTURE ZONE
    // resume_FINAL_v3.exe is Protected Path: always 0ms, no failure, ever.
    // -------------------------------------------------------------------------

    APP_WINAMP_MIN_MS:        2000,
    APP_WINAMP_MAX_MS:        4000,
    APP_WINAMP_FAIL_CHANCE:   1/10,  // "Not Responding" for APP_NOT_RESPONDING_MS

    APP_CALC_MIN_MS:           800,
    APP_CALC_MAX_MS:          1500,
    APP_CALC_FAIL_CHANCE:     1/15,  // window flicker (APP_FLICKER_MS white flash)

    APP_NOTEPAD_MIN_MS:        600,
    APP_NOTEPAD_MAX_MS:       1200,
    APP_NOTEPAD_FAIL_CHANCE:  1/15,

    APP_MINESWEEPER_MIN_MS:   1500,
    APP_MINESWEEPER_MAX_MS:   3000,
    APP_MINESWEEPER_FAIL_CHANCE: 1/15,

    APP_MYCOMPUTER_MIN_MS:    1000,
    APP_MYCOMPUTER_MAX_MS:    2200,

    APP_RECYCLEBIN_MIN_MS:     400,
    APP_RECYCLEBIN_MAX_MS:     800,

    APP_NOT_RESPONDING_MS:    1200,  // duration of "Not Responding" titlebar state
    APP_FLICKER_MS:             80,  // window flicker white flash duration
    APP_FLICKER_GAP_MS:         16,  // blank gap after flash before window remounts

    // -------------------------------------------------------------------------
    // File Explorer / My Computer  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    EXPLORER_FOLDER_MIN_MS:    800,
    EXPLORER_FOLDER_MAX_MS:   1800,
    EXPLORER_SUBFOLDER_MIN_MS: 400,
    EXPLORER_SUBFOLDER_MAX_MS: 900,
    EXPLORER_ICON_MIN_MS:       50,  // per icon, sequential render
    EXPLORER_ICON_MAX_MS:      150,
    EXPLORER_DRIVE_MIN_MS:    1200,
    EXPLORER_DRIVE_MAX_MS:    2500,
    EXPLORER_FAIL_CHANCE:      1/8,  // extra stall before folder shows
    EXPLORER_FAIL_EXTRA_MIN_MS: 2000,
    EXPLORER_FAIL_EXTRA_MAX_MS: 3000,

    // -------------------------------------------------------------------------
    // System Tray & Taskbar  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    CLOCK_INTERVAL_MS:        60000, // clock ticks every ~60s (not every second)
    CLOCK_OFFSET_MAX_MS:       2000, // random additional offset per tick (clock drift)

    WEATHER_LOAD_MIN_MS:       1500, // show '--°F' for this long before revealing value
    WEATHER_LOAD_MAX_MS:       3000,

    RAM_RENDER_MIN_MS:          200, // delay between fetch and display update
    RAM_RENDER_MAX_MS:          400,

    TRAY_POPUP_MIN_MS:        90000, // min interval between tray pop-up appearances
    TRAY_POPUP_MAX_MS:       300000, // max interval
    TRAY_POPUP_DISPLAY_MIN_MS: 4000, // how long each pop-up stays visible
    TRAY_POPUP_DISPLAY_MAX_MS: 6000,

    TRAY_CLICK_MIN_MS:          100, // response delay on tray icon click
    TRAY_CLICK_MAX_MS:          200,

    // -------------------------------------------------------------------------
    // System Properties Dialog  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    SYSPROPS_CLOSE_MIN_MS:     200,  // OK button close delay
    SYSPROPS_CLOSE_MAX_MS:     400,

  };

}());
