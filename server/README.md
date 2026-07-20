# Class++ API — `classpp-api`

Express backend for Class++. Runs **serverless-friendly**: a stateless Node web
service with all state in **Turso** (managed libSQL) and file uploads in **Google
Drive**, so it needs no persistent disk and can run on a free host.

## Architecture

- **Static frontend** stays on GitHub Pages at `https://cpp.thefarshad.com`.
- **API** is a Node/Express service (this dir). Deployed to **Render** (free web
  service) and reached at `https://api.thefarshad.com`.
- **Database**: **Turso** (managed libSQL). The app uses the `libsql` driver — a
  synchronous drop-in for better-sqlite3 — pointed at the remote DB via
  `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. With those unset it falls back to a
  local `./data.db` (dev / self-host on a box with a disk).
- **Attachments**: uploaded to a shared **Google Drive** folder via a service
  account (`GOOGLE_DRIVE_SA_JSON`). On a serverless host the filesystem is
  ephemeral, so when Drive is configured **all** uploads go to Drive.
- **Auth**: Google Sign-In on the frontend → `id_token` posted to `/auth/google`
  → server verifies, checks `@uwyo.edu` or allowlist/instructors → returns app
  JWT (HS256, 1h).

## One-time external setup

### 1. Google OAuth Client ID

Cloud Console → **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
- Application type: **Web application**
- Authorized JavaScript origins:
  - `https://cpp.thefarshad.com`
  - `http://localhost:8000`
- Save the **Client ID** → `GOOGLE_CLIENT_ID`.

### 2. Google Drive service account

Cloud Console → **APIs & Services → Library**: enable **Google Drive API**. Then
**Credentials → Create credentials → Service account** (`classpp-drive`, no
project roles). Open it → **Keys → Add key → JSON**. You'll paste the JSON's
*contents* into `GOOGLE_DRIVE_SA_JSON` (not a file path).

### 3. Drive folder

Create a Drive folder (e.g. `Class++ Submissions`). Share it with the service
account email (`classpp-drive@<project>.iam.gserviceaccount.com`, role **Editor**).
The folder URL ends in `/folders/<ID>` → `DRIVE_FOLDER_ID`.

### 4. Turso database

```sh
# https://docs.turso.tech/quickstart — install the CLI, then:
turso db create classpp
turso db show classpp --url          # → TURSO_DATABASE_URL (libsql://…)
turso db tokens create classpp       # → TURSO_AUTH_TOKEN
```

The app creates its own schema on first boot (migrations run at startup). To seed
from the archived droplet DB instead:

```sh
# from the sunset archive (better-sqlite3/SQLite file → Turso)
turso db shell classpp < <(sqlite3 classpp-snapshot.db .dump)
```

## Deploy on Render

The repo ships a **Blueprint** (`render.yaml`). In the Render dashboard:
**New → Blueprint → pick this repo**. Render creates the `classpp-api` web
service (root dir `server/`, `npm install` / `npm start`) and prompts for the
`sync: false` secrets — paste the values from the setup steps above:
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`,
`GOOGLE_DRIVE_SA_JSON`, `DRIVE_FOLDER_ID`, `INITIAL_INSTRUCTORS`.

Health check: `https://<service>.onrender.com/healthz` → `{"ok":true}`.

> The `libsql` driver ships prebuilt binaries for Render's Linux runtime. If a
> native build ever fails, switch the service to a Docker deploy of `server/`.

### Custom domain `api.thefarshad.com`

Keep the frontend's API base unchanged by pointing the existing hostname at Render:

1. Render service → **Settings → Custom Domains → Add** `api.thefarshad.com`.
   Render shows a CNAME target (`<service>.onrender.com`).
2. Cloudflare (`thefarshad.com` zone) → replace the old
   `api.thefarshad.com` A record (was the droplet) with a **CNAME** to that
   target. Proxied is fine.
3. SSL/TLS mode **Full** (Render presents a valid cert; Full works, Full-strict
   also works since Render's cert is real).

Free services **sleep after ~15 min idle** (first request after that cold-starts
in ~30-50s). Fine for a class tool; upgrade the plan or move to Fly.io if you want
always-on.

## Local development

```sh
cd server
cp .env.example .env
# Edit .env — leave TURSO_* unset to use a local ./data.db:
#   GOOGLE_CLIENT_ID=<your client id>
#   JWT_SECRET=$(openssl rand -hex 32)
#   DRIVE_KEY_PATH=$(pwd)/drive-sa.json    # local Drive test (or GOOGLE_DRIVE_SA_JSON)
#   DRIVE_FOLDER_ID=<your folder id>
#   INITIAL_INSTRUCTORS=you@example.com    # gets instructor role on first run
npm install
npm run dev
# API at http://127.0.0.1:3001/healthz  (dev binds all interfaces)
```

Static frontend, from the repo root: `python3 -m http.server 8000`, then in
DevTools: `localStorage.setItem('classpp.api_base', 'http://localhost:3001')`.

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
| —    | `/admin/roster`, `/admin/allowlist`, `/admin/classes`, `/admin/categories`, `/admin/instructors` | instructor | CRUD |

## Operations

- Logs: Render dashboard → the service → **Logs**.
- DB shell: `turso db shell classpp`
- Backup: `turso db shell classpp .dump > classpp-$(date +%F).sql`
- Rotate JWTs (invalidate sessions): change `JWT_SECRET` in Render → redeploy.
- Add an instructor: add the email to `INITIAL_INSTRUCTORS` (superadmin on boot),
  or insert into the `instructors` table via `turso db shell`.
