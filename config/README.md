# config/ — Server Infrastructure Reference

These are **documentation copies** of the live server files on the Raspberry Pi.
The live files run from `~/` (Pi home directory). This folder is committed for
reference and version history only — never treat these as the source of truth
for what is currently running.

If you edit a file here, manually sync it to the Pi:
```
scp config/<file> atsushispc:~/<file>
```
Then restart the relevant service (see per-file notes below).

---

## Python Microservers

Three lightweight Python HTTP servers run as systemd services on the Pi.
All listen on localhost only — Caddy reverse-proxies public routes to them.

### ram-server.py

| Property | Value |
|----------|-------|
| Live path | `~/ram-server.py` |
| Port | `127.0.0.1:8091` |
| Caddy route | `GET /ram` |
| Systemd service | `ram-server` |
| Env vars | none |

Reads `/proc/meminfo` directly and returns JSON:
```json
{"total": 1048576, "available": 512000, "used": 536576}
```
Values are in kilobytes. Used by `js/widgets.js` for the taskbar RAM widget,
polled every 30 seconds.

**Restart after update:**
```bash
sudo systemctl restart ram-server
```

**Test:**
```bash
curl http://127.0.0.1:8091/ram
```

---

### weather-server.py

| Property | Value |
|----------|-------|
| Live path | `~/weather-server.py` |
| Port | `127.0.0.1:8092` |
| Caddy route | `GET /weather` |
| Systemd service | `weather-server` |
| Env vars | `OPENWEATHERMAP_API_KEY` |

Proxies requests to `api.openweathermap.org/data/2.5/weather`. Accepts optional
`?lat=X&lon=Y` query params from the browser Geolocation API (sent by
`js/widgets.js`). Falls back to Portland, OR (lat=45.5051, lon=-122.6750) if
no params are supplied. Returns the raw OpenWeatherMap JSON to the client.
Units are imperial (°F).

**First-time deploy (new Pi setup):**
```bash
scp config/weather-server.py atsushispc:~/weather-server.py
scp config/weather-server.service atsushispc:/tmp/weather-server.service
ssh atsushispc 'sudo mv /tmp/weather-server.service /etc/systemd/system/weather-server.service && sudo systemctl daemon-reload && sudo systemctl enable weather-server && sudo systemctl start weather-server'
```

**Restart after update:**
```bash
sudo systemctl restart weather-server
```

**Test:**
```bash
curl "http://127.0.0.1:8092/weather?lat=45.5051&lon=-122.6750"
```

---

### altcha-server.py

| Property | Value |
|----------|-------|
| Live path | `~/altcha-server.py` |
| Port | `127.0.0.1:8093` |
| Caddy route | `GET /altcha/challenge` |
| Systemd service | `altcha-server` |
| Env vars | `ALTCHA_HMAC_SECRET` |

Generates Altcha proof-of-work challenges for the guestbook CAPTCHA widget.
Each request returns a fresh challenge JSON:
```json
{
  "algorithm": "SHA-256",
  "challenge": "<sha256 hex>",
  "maxnumber": 10000,
  "salt": "<24 hex chars>",
  "signature": "<hmac-sha256 hex>"
}
```

The client brute-forces `n` where `SHA-256(salt + n) == challenge`, then
submits the encoded payload with the guestbook form. The HMAC signature
lets server-side verification (see `pb_hooks/`) confirm the challenge was
issued by this server.

`ALTCHA_HMAC_SECRET` must match between this server and the pb_hooks
verification logic. Rotate it by updating the Pi `.env` file and restarting
the service.

**Restart after update:**
```bash
sudo systemctl restart altcha-server
```

**Test:**
```bash
curl http://127.0.0.1:8093/altcha/challenge
```

---

## Shell Scripts

### deploy.sh

| Property | Value |
|----------|-------|
| Live path | `~/deploy.sh` |
| Log | `/var/log/deploy.log` |
| Trigger | Manual (`ssh atsushispc '~/deploy.sh'`) |

Pulls latest code from GitHub and reloads Caddy:
```bash
cd /home/atsushi/site && git pull origin main
sudo systemctl reload caddy
```

Run this after merging a PR to push changes to production.

---

### backup-pocketbase.sh

| Property | Value |
|----------|-------|
| Live path | `~/backup-pocketbase.sh` |
| Log | `/var/log/pb-backup.log` |
| Cron | `0 2 * * *` (daily at 2 AM) |

Copies the Pocketbase SQLite database to `~/backups/`, commits it to the
private backup GitHub repo (`iamatsushi/atsushis-pc-backup`), then deletes
local backup files older than 30 days.

Uses the `github-backup` SSH key alias (`~/.ssh/id_ed25519_backup`) which
has write access to the backup repo only.

---

### check-caddy.sh

| Property | Value |
|----------|-------|
| Live path | `~/check-caddy.sh` |
| Log | `/var/log/caddy-health.log` |
| Cron | `*/5 * * * *` (every 5 minutes) |

Checks if the `caddy` systemd service is active. If not, restarts it and
logs the event. This is the auto-recovery mechanism for Caddy crashes.

---

## Systemd Service Files

### pocketbase.service

Manages the Pocketbase binary at `/home/atsushi/pocketbase/pocketbase`.
Listens on `127.0.0.1:8090`. Caddy proxies `/api/*` here.

Live location: `/etc/systemd/system/pocketbase.service`

### ram-server.service

Manages `~/ram-server.py` under Python 3. Sources `/home/atsushi/.env`
for environment variables before starting.

Live location: `/etc/systemd/system/ram-server.service`

---

## Caddyfile

Caddy config for the site. Live location: `/etc/caddy/Caddyfile`.

After editing, sync and reload:
```bash
scp config/Caddyfile atsushispc:/etc/caddy/Caddyfile
ssh atsushispc 'sudo systemctl reload caddy'
```

Key routes:
- `/api/*` → `127.0.0.1:8090` (Pocketbase)
- `/ram` → `127.0.0.1:8091` (RAM server)
- `/weather` → `127.0.0.1:8092` (Weather server)
- `/altcha/*` → `127.0.0.1:8093` (Altcha server)
- `/_/*` and `/api/admins/*` → 403 Forbidden

---

## Quick Diagnostics

```bash
# Check all services
ssh atsushispc 'sudo systemctl status caddy pocketbase ram-server weather-server altcha-server cloudflared'

# Tail logs
ssh atsushispc 'tail -f /var/log/deploy.log /var/log/pb-backup.log /var/log/caddy-health.log'

# Test all local endpoints
ssh atsushispc 'curl -s http://127.0.0.1:8091/ram && curl -s "http://127.0.0.1:8092/weather" | head -c 100 && curl -s http://127.0.0.1:8093/altcha/challenge | head -c 100'
```
