# Class++ or C++

**Class++** is a lightweight classroom engagement tool for live check-ins, short activities, response collection, and participation tracking.

The frontend is a static site on GitHub Pages. The backend is a small Node.js + SQLite API on a DigitalOcean droplet, with large file uploads (videos, big images) routed to Google Drive. Sign-in is Google OAuth, restricted to a configured email domain plus an allowlist.

The project is designed to make attendance more meaningful by turning class check-ins into quick learning checkpoints. While it can be used for general classroom activities, it also works well for programming courses with prompts such as predicting C++ output, finding bugs, tracing code, or explaining errors.

## Features

- QR-code based access
- Google Sign-In (domain-restricted + allowlist)
- Short in-class activities, opened/closed by the instructor
- Optional file attachments per submission (image, PDF, or video)
- Auto-routing: small files on the API server, big files to Google Drive
- Timestamped submissions in SQLite
- Easy review and CSV export of participation records
- Built-in Markdown notes / blog section

## Basic Workflow

1. Instructor opens an activity.
2. Students scan a QR code (or open the share link).
3. Students sign in with their university Google account.
4. Students submit a short response, optionally with a file.
5. The response (and attachment, on disk or in Drive) is saved.
6. The instructor reviews participation and responses.

## Blog / Learning Notes

Class++ includes a simple blog/notes section where instructors can publish explanations, examples, and extra details using Markdown files.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (no build step), Google Identity Services
- **Hosting (frontend)**: GitHub Pages at `cpp.thefarshad.com`
- **Backend**: Node.js + Express + better-sqlite3
- **Hosting (backend)**: DigitalOcean droplet (`minerva-prod`) at `api.thefarshad.com`
- **Large files**: Google Drive (service account)
- **Auth**: Google OAuth (id_token verified server-side, app JWT issued)

## Project Layout

```
/                       student submission page (index.html)
/instructor/            instructor dashboard
/blog/                  Markdown notes (posts/*.md + index.json)
/js/                    api.js, student.js, instructor.js, blog.js
/css/styles.css
/server/                Node.js API + deployment templates (see server/README.md)
```

## Setup

1. **Backend**: follow [`server/README.md`](server/README.md) — sets up the Google OAuth Client ID, the Drive service account + folder, and deploys the Node API to the droplet behind nginx + Let's Encrypt at `api.thefarshad.com`.
2. **Frontend**: nothing to configure on a fresh deploy. `js/api.js` defaults to `https://api.thefarshad.com`. Push to `main` and GitHub Pages serves the site at the CNAME domain.

## Local Development

The frontend uses ES modules with absolute paths, so it must be served — opening files via `file://` won't work.

```sh
# Terminal 1 — API
cd server && npm ci && cp .env.example .env   # then edit .env (see server/README.md)
npm run dev

# Terminal 2 — static site
python3 -m http.server 8000
# In browser DevTools: localStorage.setItem('classpp.api_base', 'http://localhost:3001')
# then refresh http://localhost:8000/
```

## Adding a Blog Post

1. Add `blog/posts/<slug>.md`.
2. Append an entry to `blog/posts/index.json` with `slug`, `title`, `date`, and `summary`.
3. Commit and push.

## Goal

Class++ helps instructors encourage active participation, collect quick feedback, and track engagement without requiring a complex backend system.
