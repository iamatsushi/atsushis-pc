# config/ — Server Infrastructure

## Critical: These Are Reference Copies

Every file in `config/` is a documentation copy of a live file on the Raspberry Pi.
They are NOT what's running. Live files run from `~/` (Pi home directory).

After editing any file here, manually sync it to the Pi:

```bash
scp config/<file> atsushispc:~/<file>
# then restart the relevant service
```

Never assume editing `config/` changes production behavior.

---

## Services and Ports

| Service | Live path | Port | Caddy route | Systemd unit |
|---|---|---|---|---|
| Caddy | `/usr/bin/caddy` | 80 | — | `caddy` |
| PocketBase | `~/pocketbase/pocketbase` | 8090 (localhost) | `/api/*` | `pocketbase` |
| RAM server | `~/ram-server.py` | 8091 (localhost) | `/ram` | `ram-server` |
| Weather server | `~/weather-server.py` | 8092 (localhost) | `/weather` | `weather-server` |
| Altcha server | `~/altcha-server.py` | 8093 (localhost) | `/altcha/*` | `altcha-server` |
| Cloudflare Tunnel | `/usr/bin/cloudflared` | outbound | — | `cloudflared` |

Quick status check:
```bash
ssh atsushispc 'sudo systemctl status caddy pocketbase ram-server weather-server altcha-server cloudflared'
```

---

## Environment Variables

Secrets live in `/home/atsushi/.env` (chmod 600, never committed).
Template in repo: `.env.example` (variable names only).

Required variables:
- `ALTCHA_HMAC_SECRET` — shared between altcha-server.py and pb_hooks/
- `OPENWEATHERMAP_API_KEY` — proxied through weather-server.py, never in client JS
- `CF_TUNNEL_TOKEN` — Cloudflare Tunnel auth
- `GITHUB_PAT` — write access to backup repo only

Never hardcode any of these values in any committed file.

---

## Deploy Workflow

After merging a PR to main:

```bash
ssh atsushispc '~/deploy.sh'
```

`deploy.sh` pulls latest code from GitHub and reloads Caddy. Logs to `/var/log/deploy.log`.

---

## PocketBase Hooks

JS hooks live in `pb_hooks/` in the repo. Deploy to Pi:

```bash
scp pb_hooks/guestbook_verify.pb.js atsushispc:~/pocketbase/pb_hooks/
ssh atsushispc 'sudo systemctl restart pocketbase'
```

Altcha verification uses a Python proxy pattern — the PocketBase hook calls
`http://127.0.0.1:8093/altcha/verify` via `$http.send()`. The JSVM cannot do
base64 decode or HMAC natively. Never attempt to rewrite verification inline.

---

## SSH Keys on Pi

- `~/.ssh/id_ed25519` — read-only deploy key (Host alias: `github-site`)
- `~/.ssh/id_ed25519_backup` — write key for backup repo (Host alias: `github-backup`)

Git remotes on Pi:
- Site: `git@github-site:iamatsushi/atsushis-pc.git`
- Backup: `git@github-backup:iamatsushi/atsushis-pc-backup.git`

---

## Cron Jobs

```
0 2 * * *    ~/backup-pocketbase.sh   # daily PocketBase SQLite backup
*/5 * * * *  ~/check-caddy.sh         # Caddy health check + auto-restart
```

---

## Filesystem Map

| Path | Purpose |
|---|---|
| `/home/atsushi/site/` | Repo root (served by Caddy) |
| `/home/atsushi/pocketbase/pb_data/` | PocketBase data (gitignored, backed up daily) |
| `/home/atsushi/pocketbase/pb_hooks/` | Live hooks — deploy from repo `pb_hooks/` |
| `/home/atsushi/backups/` | SQLite staging (30-day retention) |
| `/home/atsushi/.env` | Secrets (chmod 600) |
| `/etc/caddy/Caddyfile` | Live Caddy config (reference: `config/Caddyfile`) |
| `/etc/cloudflared/config.yml` | Cloudflare Tunnel config |
| `/var/log/deploy.log` | Deploy log |
| `/var/log/pb-backup.log` | Backup log |
| `/var/log/caddy-health.log` | Caddy health log |
