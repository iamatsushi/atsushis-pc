if (!window.APC?.timing) throw new Error('[APC] win98-timing.js must load before notepad.js');
// notepad.js — Notepad displaying README.txt
// Explains the site, stack, and guestbook in a personal tone.
// Namespaced under window.APC.apps per project conventions.

window.APC = window.APC || {};
window.APC.apps = window.APC.apps || {};

window.APC.apps.notepad = (function () {
  'use strict';

  const README_TEXT = [
    'README.txt',
    '==========',
    '',
    "Hi. If you're reading this, you found the Notepad in My Computer.",
    "Congrats — you clicked around. That's what this thing is for.",
    '',
    '-- What is this site? --',
    '',
    "I'm Atsushi Hisaka, a product manager based in Portland, OR.",
    'Instead of making a boring PDF or a generic Next.js template, I built a',
    "Windows 98 desktop simulation from scratch and put it on the internet.",
    '',
    'No frameworks. No npm. Just HTML, CSS, and vanilla JavaScript.',
    "It runs on a Raspberry Pi 3B+ sitting on my desk. Seriously.",
    '',
    '-- The stack --',
    '',
    '  Web server:  Caddy',
    '  Database:    PocketBase (SQLite, REST API)',
    '  Hosting:     Raspberry Pi 3B+ + Cloudflare Tunnel',
    '  Analytics:   Umami Cloud',
    '  Domain:      ahisaka.com',
    '',
    '-- The guestbook --',
    '',
    "The guestbook is real. If you sign it, I'll see it.",
    "If you check the box asking for my resume, I'll email it to you directly.",
    "That's the whole thing.",
    '',
    '-- Easter eggs --',
    '',
    'You already found one. Keep looking.',
    '',
    '-- Contact --',
    '',
    '  Email:    atsushih@gmail.com',
    '  LinkedIn: linkedin.com/in/atsushihisaka',
    '  GitHub:   github.com/iamatsushi',
    '',
    '-- Thanks for visiting --',
    '',
    'Sign the guestbook and say hi.',
    '',
    '  -- Atsushi, April 2026',
    ''
  ].join('\n');

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
      title: 'README.txt \u2014 Notepad',
      app: 'notepad',
      width: 520,
      height: 400,
      x: 120,
      y: 80
    });

    const closeBtn = winState.el.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { winState = null; });
    }

    const pre = document.createElement('pre');
    pre.className = 'notepad-content';
    pre.textContent = README_TEXT;
    winState.contentEl.appendChild(pre);

    winState.show();

    if (window.umami) { window.umami.track('app_open', { app_name: 'notepad' }); }
  }

  return { open: open };

}());
