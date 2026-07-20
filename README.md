# Class++ or C++

**Class++** is a lightweight classroom engagement tool for live check-ins, short activities, response collection, and participation tracking.

The frontend is a static site on GitHub Pages. The backend is a small, stateless Node.js API on Render (free tier) with its data in Turso (managed libSQL) and file uploads routed to Google Drive — so it needs no server of its own. Sign-in is Google OAuth, restricted to a configured email domain plus an allowlist.

The project is designed to make attendance more meaningful by turning class check-ins into quick learning checkpoints. While it can be used for general classroom activities, it also works well for programming courses with prompts such as predicting C++ output, finding bugs, tracing code, or explaining errors.

## Features

- QR-code based access
- Google Sign-In (domain-restricted + allowlist)
- Short in-class activities, opened/closed by the instructor
- Optional file attachments per submission (image, PDF, or video)
- File attachments uploaded to Google Drive (service account)
- Timestamped submissions in libSQL (Turso)
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
- **Backend**: Node.js + Express + libSQL (`libsql` driver)
- **Hosting (backend)**: Render (free web service) at `api.thefarshad.com`
- **Database**: Turso (managed libSQL)
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

1. **Backend**: follow [`server/README.md`](server/README.md) — sets up the Google OAuth Client ID, the Drive service account + folder, a Turso database, and deploys the Node API to Render (Blueprint in `render.yaml`) at `api.thefarshad.com`.
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
