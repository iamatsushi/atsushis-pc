#!/bin/bash
set -e

echo "[deploy] ensuring emoji font is installed..."
sudo apt-get install -y fonts-noto-color-emoji 2>/dev/null | tail -1

echo "[deploy] pulling latest from main..."
git pull origin main

echo "[deploy] building css bundle..."
mkdir -p dist
python3 << 'PYEOF'
files = [
    'css/win98.css',
    'css/netescape-base.css',
    'css/netescape-home.css',
    'css/netescape-about.css',
    'css/netescape-thoughts.css',
    'css/netescape-projects.css',
    'css/netescape-guestbook.css',
    'css/netescape-resume.css',
    'css/boot.css',
    'css/winamp.css',
    'css/minesweeper.css',
]
with open('dist/bundle.css', 'w') as out:
    for f in files:
        out.write('/* === ' + f + ' === */\n')
        with open(f, 'r') as src:
            out.write(src.read())
        out.write('\n')
print('[deploy] dist/bundle.css written (' + str(len(files)) + ' files)')
PYEOF

echo "[deploy] patching index.html for production..."
python3 << 'PYEOF'
with open('index.html', 'r') as f:
    content = f.read()

marker_start = '  <!-- ============================================================\n       STYLESHEETS'
marker_end = '  <link rel="stylesheet" href="css/minesweeper.css">'
bundle_link = '  <!-- PRODUCTION: bundled CSS (built by deploy.sh, not in git) -->\n  <link rel="stylesheet" href="dist/bundle.css">'

start = content.find(marker_start)
end = content.find(marker_end)

if start == -1 or end == -1:
    print('[deploy] WARNING: CSS markers not found — index.html unchanged')
else:
    end_pos = end + len(marker_end)
    patched = content[:start] + bundle_link + content[end_pos:]
    with open('index.html', 'w') as f:
        f.write(patched)
    print('[deploy] index.html patched — serving dist/bundle.css')
PYEOF

echo "[deploy] reloading caddy..."
sudo systemctl reload caddy

echo "[deploy] restarting pocketbase..."
sudo systemctl restart pocketbase

echo "[deploy] restarting weather-server..."
sudo systemctl restart weather-server

echo "[deploy] done."
