# Class++ API — `classpp-api`

Self-hosted Express + SQLite backend for Class++. Replaces the previous Apps Script setup. Deploys to the existing `minerva-prod` droplet (`164.92.118.125`, sfo3) and **must coexist with the other site already running there**.

## Architecture

- **Static frontend** stays on GitHub Pages at `https://cpp.thefarshad.com`.
- **API** runs on the droplet, listens on `127.0.0.1:3001` only, fronted by **Caddy** (the same web server already running `minerva.thefarshad.com`) as `https://api.thefarshad.com`.
- **SQLite** at `/var/lib/classpp/data.db`. WAL mode.
- **Small attachments** (≤ 5 MB, non-video) under `/var/lib/classpp/uploads/`. Served gated to instructors.
- **Large attachments** (> 5 MB or video) uploaded to a shared **Google Drive** folder via service account.
- **Auth**: Google Sign-In on the frontend → `id_token` posted to `/auth/google` → server verifies, checks `@uwyo.edu` or allowlist/instructors → returns app JWT (HS256, 1h).

## One-time external setup

### 1. Google OAuth Client ID

Cloud Console → **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
- Application type: **Web application**
- Authorized JavaScript origins:
  - `https://cpp.thefarshad.com`
  - `http://localhost:8000`
- Save the **Client ID** → goes into `GOOGLE_CLIENT_ID`.

### 2. Google Drive service account

Cloud Console → **APIs & Services → Library**: enable **Google Drive API**. Then **Credentials → Create credentials → Service account**:
- Name: `classpp-drive`
- No roles needed at the project level.
- After creation, open the account → **Keys → Add key → JSON**. Save the file as `drive-sa.json`.

### 3. Drive folder

In Drive, create a folder called e.g. `Class++ Submissions`. Right-click → **Share** → paste the service account email (looks like `classpp-drive@<project>.iam.gserviceaccount.com`) → role **Editor**. Open the folder; the URL ends in `/folders/<ID>` — that ID goes into `DRIVE_FOLDER_ID`.

### 4. DNS + Cloudflare TLS

The `thefarshad.com` zone is fronted by Cloudflare; the droplet already serves `minerva.thefarshad.com` via Caddy. **Caddy auto-manages TLS** — no certbot, no nginx, no manual cert install.

1. In Cloudflare, add an A record:
   ```
   api.thefarshad.com   A   164.92.118.125   Proxied (orange cloud)
   ```
2. SSL/TLS → Overview: confirm the mode used by the rest of the zone (likely **Full** — `minerva.thefarshad.com` is currently served by a Caddy local cert, which only works under Full, not Full (strict)).
3. On the droplet, append the contents of `caddy/api.thefarshad.com.caddy` to the existing `/etc/caddy/Caddyfile` and reload Caddy. Detailed steps below.

## Local development

```sh
cd server
cp .env.example .env
# Edit .env:
#   GOOGLE_CLIENT_ID=<your client id>
#   JWT_SECRET=$(openssl rand -hex 32)
#   DRIVE_KEY_PATH=$(pwd)/drive-sa.json   # if you want to test Drive locally
#   DRIVE_FOLDER_ID=<your folder id>
#   DB_PATH=./data.db
#   UPLOAD_DIR=./uploads
#   INITIAL_INSTRUCTORS=you@example.com   # gets instructor role on first run
npm ci
npm run dev
# API at http://127.0.0.1:3001/healthz
```

For the static frontend, from the repo root:

```sh
python3 -m http.server 8000
```

Tell the frontend to use the local API by setting a global before module loads — easiest is to open DevTools and run `localStorage.setItem('classpp.api_base', 'http://localhost:3001')` then refresh.

## Production deploy on `minerva-prod`

The other site on this droplet uses nginx + systemd already. We **add** new files only — never edit existing config.

### Discovery (run these read-only first)

```sh
ssh root@164.92.118.125
which node && node -v                                # need ≥ 18, install via NodeSource if missing
caddy version                                        # confirm Caddy is the web server here
ls /etc/caddy/                                       # locate the Caddyfile (usually /etc/caddy/Caddyfile)
ss -tlnp | grep LISTEN                               # confirm port 3001 is free
```

If Node is missing or too old:

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Provision

```sh
# Service user + dirs
sudo adduser --system --group --home /var/lib/classpp classpp
sudo mkdir -p /opt/classpp /var/lib/classpp/uploads /etc/classpp
sudo chown -R classpp:classpp /var/lib/classpp
sudo chmod 750 /etc/classpp

# Code (run from your laptop, in the repo root)
rsync -a --delete server/ root@164.92.118.125:/opt/classpp/server/
ssh root@164.92.118.125 'cd /opt/classpp/server && sudo -u classpp npm ci --omit=dev'

# Env file
sudo install -m 600 -o classpp -g classpp /dev/null /etc/classpp/env
sudo -e /etc/classpp/env       # paste your real values from .env.example

# Service-account key (copy your JSON onto the droplet first)
sudo install -m 600 -o classpp -g classpp drive-sa.json /etc/classpp/drive-sa.json

# systemd unit
sudo cp /opt/classpp/server/systemd/classpp-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now classpp-api
sudo systemctl status classpp-api      # should be active (running)
sudo journalctl -u classpp-api -n 50

# Caddy site — append the prepared site block to the existing Caddyfile.
# (The block lives in this repo at server/caddy/api.thefarshad.com.caddy.)
sudo tee -a /etc/caddy/Caddyfile < /opt/classpp/server/caddy/api.thefarshad.com.caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager   # confirm clean reload, no parse errors
```

No certbot, no nginx — Caddy auto-issues and renews the cert for `api.thefarshad.com`. Cloudflare's edge handles the public-facing TLS to clients.

Sanity check:

```sh
curl -sf https://api.thefarshad.com/healthz   # → {"ok":true}
```

### Updating

```sh
# From your laptop
rsync -a --delete server/ root@164.92.118.125:/opt/classpp/server/
ssh root@164.92.118.125 'cd /opt/classpp/server && sudo -u classpp npm ci --omit=dev && sudo systemctl restart classpp-api'
```

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/healthz` | — | liveness |
| POST | `/auth/google` | — | exchange Google `id_token` for app JWT |
| GET  | `/activities` | bearer | list open activities |
| GET  | `/activities/:id` | bearer | one open activity |
| POST | `/submissions` | bearer | submit (multipart: `activity_id`, `response`, optional `file`) |
| GET  | `/activities/admin/all` | instructor | list all activities |
| POST | `/activities/admin` | instructor | create open activity |
| PATCH | `/activities/admin/:id` | instructor | set status `open`\|`closed` |
| GET  | `/submissions/by-activity/:id` | instructor | review responses |
| GET  | `/uploads/<file>` | instructor | download a small attachment |
| —    | `/admin/roster`, `/admin/allowlist` | instructor | CRUD |

## Operations

- Logs: `journalctl -u classpp-api -f`
- DB shell: `sudo -u classpp sqlite3 /var/lib/classpp/data.db`
- Backup: `sqlite3 /var/lib/classpp/data.db ".backup '/var/backups/classpp-$(date +%F).db'"`
- Rotate JWTs (invalidate sessions): change `JWT_SECRET` in `/etc/classpp/env`, `systemctl restart classpp-api`.
- Add an instructor: insert into the `instructors` table via the sqlite shell, or extend the allowlist UI.
