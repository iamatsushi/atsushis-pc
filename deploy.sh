#!/bin/bash
set -e

echo "[deploy] ensuring emoji font is installed..."
sudo apt-get install -y fonts-noto-color-emoji 2>/dev/null | tail -1

echo "[deploy] pulling latest from main..."
git checkout -- index.html
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
import re
with open('dist/bundle.css', 'w') as out:
    for f in files:
        with open(f, 'r') as src:
            css = src.read()
            # 1. Strip CSS block comments
            css = re.sub(r'/\*[\s\S]*?\*/', '', css)
            # 2. Collapse all tabs, newlines, and multi-spaces into a single space
            css = re.sub(r'\s+', ' ', css)
            out.write(css)
print('[deploy] dist/bundle.css written (' + str(len(files)) + ' files)')
PYEOF

echo "[deploy] patching index.html for production..."
python3 << 'PYEOF'
import re, sys

with open('index.html', 'r') as f:
    content = f.read()

bundle_link = '  <!-- PRODUCTION: bundled CSS (built by deploy.sh, not in git) -->\n  <link rel="stylesheet" href="dist/bundle.css">'

# Match either the original CSS comment block (first deploy) or the already-deployed
# production comment (re-deploy). Makes the patch idempotent regardless of file state.
match_start = re.search(
    r'  <!-- ={10,}[\s\S]*?STYLESHEETS|  <!-- PRODUCTION: bundled CSS',
    content
)

# Match either the original last CSS link (first deploy) or the already-deployed
# bundle link (re-deploy).
match_end = re.search(
    r'  <link rel="stylesheet" href="css/minesweeper\.css">|  <link rel="stylesheet" href="dist/bundle\.css">',
    content
)

if not match_start or not match_end:
    print('[deploy] ERROR: CSS markers not found in index.html — patch failed')
    sys.exit(1)

start   = match_start.start()
end_pos = match_end.end()
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
