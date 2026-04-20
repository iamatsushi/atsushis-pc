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

    MATRIX_GATE_START_DELAY_MS:      1000,  // rain runs before any text appears
    MATRIX_IDENTITY_CHAR_DELAY_MIN_MS: 20, // min ms per character (lines 2–8)
    MATRIX_IDENTITY_CHAR_DELAY_MAX_MS: 30, // max ms per character (lines 2–8)
    MATRIX_LINE1_HOLD_MS:             600,  // hold after line 1 before lines 2–8 begin
    MATRIX_POST_LINES_PAUSE_MS:       800,  // pause after line 8 before prompt fades in
    MATRIX_PROMPT_FADE_MS:            300,  // prompt opacity fade-in duration
    MATRIX_PROMPT_CANVAS_Y_PCT:      0.70,  // prompt vertical position (84% of canvas height)
    MATRIX_IDENTITY_START_Y_PCT:     0.30,  // identity lines top anchor (30% of canvas height)

    // Rain column typing pace — per-column typing reveal model.
    // Columns advance one character at a time at a randomised speed.
    MATRIX_RAIN_RESET_MIN_MS:          0,  // no pause between streams — columns restart immediately
    MATRIX_RAIN_RESET_MAX_MS:          0,
    MATRIX_RAIN_STAGGER_MAX_MS:      500,  // max random start delay per column on init

    MATRIX_DURATION_MIN_MS:         3000,  // minimum rain duration before prompt appears
    MATRIX_DURATION_MAX_MS:        12000,  // maximum rain duration
    MATRIX_COL_SPEED_MIN_PCT:       0.40,  // per-column speed floor (80% of base velocity)
    MATRIX_COL_SPEED_MAX_PCT:       1.30,  // per-column speed ceiling (100% of base velocity)
    MATRIX_EMOJI_FREQUENCY:         0.02,  // superseded by emojiStream column model — kept for reference
    MATRIX_EMOJI_STREAM_CHANCE:     0.01,  // 1% of columns are emoji-only; remaining 99% never produce emojis
    MATRIX_TRAIL_OVERDRAW_ALPHA:    0.04,  // per-frame canvas fade alpha; lower = longer visible trail
    MATRIX_STREAM_BASE_DELAY_MS:     160,  // base ms per head advance (was hardcoded 100 — 25% slower)
    MATRIX_STREAM_LEN_MIN:            15,  // min visible characters per column stream
    MATRIX_STREAM_LEN_MAX:            80,  // max — exceeds screen rows; tail clips naturally at canvas edge
    MATRIX_CURSOR_BLINK_MS:          530,  // terminal prompt cursor blink interval (matches CSS)
    MATRIX_SESSION_TTL_MS:             0,  // TTL disabled — every visit gets the full boot experience

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
    SUBMENU_CLOSE_DELAY_MS:    300, // delay before submenu closes after mouse leaves

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

    TRAY_POPUP_MIN_MS:           90000, // min interval between balloon appearances
    TRAY_POPUP_MAX_MS:          300000, // max interval
    TRAY_POPUP_DISPLAY_MS:       10000, // balloon visible duration (XP spec: ~10s)

    TRAY_CLICK_MIN_MS:             100, // response delay on balloon body/icon click
    TRAY_CLICK_MAX_MS:             200,

    TRAY_BALLOON_ENTRY_MS:         150, // CSS transition: translateY + opacity in
    TRAY_BALLOON_EXIT_MS:          100, // CSS transition: opacity out
    TRAY_BALLOON_GLITCH_CHANCE:   1/20, // probability balloon renders behind taskbar
    TRAY_BALLOON_GLITCH_MIN_MS:    400, // how long glitch persists before self-correcting
    TRAY_BALLOON_GLITCH_MAX_MS:    600,
    TRAY_BALLOON_Z_INDEX:         4000, // normal balloon z-index (above taskbar at 999)
    TRAY_BALLOON_GLITCH_Z_INDEX:   998, // glitch z-index (below taskbar)

    // -------------------------------------------------------------------------
    // System Properties Dialog  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    SYSPROPS_CLOSE_MIN_MS:     200,  // OK button close delay
    SYSPROPS_CLOSE_MAX_MS:     400,

    // -------------------------------------------------------------------------
    // Screensaver — Signal Drift  —  ambient; not latency simulation
    // -------------------------------------------------------------------------

    SCREENSAVER_IDLE_MS:       90000, // no-input idle before screensaver fires
    SCREENSAVER_RESEED_MIN_MS: 25000, // min interval between node origin reseeds
    SCREENSAVER_RESEED_MAX_MS: 35000, // max interval

    // -------------------------------------------------------------------------
    // Recycle Bin — easter egg progress dialog  —  TEXTURE ZONE
    // -------------------------------------------------------------------------

    RECYCLEBIN_EMPTY_MIN_MS:       2000, // min total duration of progress fill
    RECYCLEBIN_EMPTY_MAX_MS:       3000, // max total duration
    RECYCLEBIN_PROGRESS_STEP_MS:     50, // setInterval tick for progress bar update

    // -------------------------------------------------------------------------
    // HDD Audio — boot sequence ambient sound
    //
    // hdd-poweron.mp3: plays once on power button click (10s, no loop)
    //   Contains: power button click sound + HDD spin-up whirr
    //   Trigger: power button click in boot-scene.js via window.APC.boot.playHddAudio()
    //
    // hdd-chatter.mp3: loops from crossfade point through entire session (41s, loop=true)
    //   Contains: steady white noise HDD chatter, clean loop point
    //   Start: HDD_POWERON_DURATION_MS - HDD_CHATTER_CROSSFADE_MS = 9950ms after power click
    //   Ends: never — fades to HDD_CHATTER_SETTLE_VOL after startup.mp3 chime ends
    // -------------------------------------------------------------------------

    HDD_POWERON_DURATION_MS:  10000,  // hdd-poweron.mp3 file length in ms
    HDD_CHATTER_CROSSFADE_MS:    50,  // chatter starts this many ms before poweron ends
                                      // overlap masks the seam — both in steady noise by this point
    HDD_CHATTER_SETTLE_MS:     3000,  // duration of volume fade after startup.mp3 ends (ms)
    HDD_CHATTER_SETTLE_VOL:     0.5,  // target background volume — HDD still spinning, quieter

    // -------------------------------------------------------------------------
    // Boot sequence — five-screen state machine (#89–#94)
    // Placeholder values; final tuning in issue #95.
    // -------------------------------------------------------------------------

    BOOT_SEQUENCE: {
      POST_TEXT_LINE_INTERVAL_MS:      100, // ms between each header/footer line
      POST_AFTER_LAST_LINE_MS:         400, // pause after "Press DEL" before advance
      RAM_TICK_MIN_MS:                  30, // fastest tick between RAM counter steps
      RAM_TICK_MAX_MS:                  90, // slowest tick
      RAM_HESITATION_CHANCE:          0.08, // ~1-in-12 chance of mechanical pause per step
      RAM_HESITATION_MIN_MS:           200, // min hesitation duration
      RAM_HESITATION_MAX_MS:           600, // max hesitation duration
      RAM_STEP_K:                     2048, // KB increment per step (131072K / 64 steps)

      IBS_SPLASH_DURATION_MS:         6000, // total time on IBS BIOS splash screen
      FLOPPY_SEEK_DELAY_MIN_MS:        800, // floppy-seek fires this long after screen appears
      FLOPPY_SEEK_DELAY_MAX_MS:       1000,

      DOS_LOG_LINE_INTERVAL_MIN_MS:    160, // min ms between bootlog lines
      DOS_LOG_LINE_INTERVAL_MAX_MS:    300, // max ms between bootlog lines
      DOS_LOG_AFTER_LAST_LINE_MS:      600, // pause after final line before advance
      DOS_LOG_DURATION_MS:            5000, // reference ceiling for screech scheduling

      WINDOORS_LOGO_STALL_60_MS:      3500, // stall at 60% progress (3.5s)
      WINDOORS_LOGO_STALL_85_MS:      2000, // stall at 85% progress (2s)
      WINDOORS_LOGO_COMPLETE_PAUSE_MS: 500, // pause after 100% before advance
      WINDOORS_LOGO_DURATION_MS:     15000, // reference ceiling for screech scheduling
      WINDOORS_BLOCK_SPEED_SLOW_MS:    600, // blocks 0–5  (0–30%)
      WINDOORS_BLOCK_SPEED_MED_MS:     800, // blocks 6–11 (30–60%)
      WINDOORS_BLOCK_SPEED_FAST_MS:    500, // blocks 12–16 (60–85%, burst after stall)
      WINDOORS_BLOCK_SPEED_BURST_MS:   300, // blocks 17–19 (85–100%, fast finish)

      DESKTOP_FADE_MS:                1200, // #boot-sequence fade-out duration
    },

    // -------------------------------------------------------------------------
    // Boot scene — pre-boot desk scene + CRT power-on sequence (#104)
    // Inserts between Matrix gate keypress and POST screen.
    // -------------------------------------------------------------------------

    BOOT_SCENE_FADE_IN_MS:              600, // desk scene canvas fade-in duration
    BOOT_SCENE_FADE_OUT_MS:            3000, // desk scene canvas fade-out after zoom completes
    DESK_ZOOM_MS:                      1500, // zoom-into-monitor animation duration (#124)
    DESK_ZOOM_SCALE:                      8, // scale factor — monitor fills viewport at end

    CRT_FLASH_MS:                        80, // step 1: CRT screen white flash duration
    CRT_DIM_MS:                        1060, // step 2: dims to #1A1A1A
    CRT_SCANLINE_MS:                   1100, // step 3: alternating scanline rows visible
    CRT_GLOW_MS:                       1150, // step 4: phosphor green glow fill
    CRT_CONTENT_FADE_MS:                700, // step 5: matrix rain fades in at 0.6 opacity

    POWER_BTN_FLASH_MS:                 100, // power button white flash on click

    CRT_IDLE_FLICKER_INTERVAL_MIN_MS:  8000, // min interval between idle CRT flickers
    CRT_IDLE_FLICKER_INTERVAL_MAX_MS: 12000, // max interval
    CRT_IDLE_FLICKER_DURATION_MS:        80, // how long the flicker dim lasts

    // -------------------------------------------------------------------------
    // Wormhole transition — Matrix rain → desk scene (#106)
    // Fires on keypress at gate prompt. Four-phase, 5 seconds total.
    // -------------------------------------------------------------------------

    WORMHOLE_DISTURBANCE_MS:    1500,  // phase 1 — lateral drift before spiral
    WORMHOLE_SPIRAL_MS:         2000,  // phase 2 — full inward vortex
    WORMHOLE_COLLAPSE_MS:        500,  // phase 3 — final rush + glow pulse
    WORMHOLE_REVEAL_MS:         2000,  // phase 4 — desk scene radial reveal
    WORMHOLE_GLOW_MAX_RADIUS:    120,  // peak glow radius in px (pre-scale)
    WORMHOLE_GLOW_PULSE_RADIUS:   20,  // contracted radius after collapse pulse

  };

}());
