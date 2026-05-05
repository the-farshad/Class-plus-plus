# Apps Script Backend

The frontend never touches the Sheet directly — all reads and writes go through this Web App.

## One-time setup

### 1. Create the Sheet

Create a new Google Sheet with three tabs and these exact headers in row 1:

| Tab | Headers (row 1) |
|---|---|
| `Roster` | `student_id`, `name`, `email`, `active` |
| `Activities` | `activity_id`, `prompt`, `created_at`, `status` |
| `Submissions` | `timestamp`, `activity_id`, `student_id`, `response` |

Add a few test roster rows with `active = TRUE`.

### 2. Bind Apps Script

From the Sheet: **Extensions → Apps Script**. Replace the default `Code.gs` contents with the contents of this folder's `Code.gs`. Save.

### 3. Set the instructor token

In the Apps Script editor: **Project Settings (gear) → Script Properties → Add script property**.

- Property: `INSTRUCTOR_TOKEN`
- Value: any random string you'll share with instructors

### 4. Deploy as a Web App

**Deploy → New deployment → Type: Web app**

- Description: `Class++ backend`
- Execute as: **Me**
- Who has access: **Anyone**

Authorize when prompted. Copy the `/exec` URL.

### 5. Wire the frontend

Open `js/api.js` and replace the `WEB_APP_URL` placeholder with the URL from step 4. Commit and push.

## Updating the script

Each time you edit `Code.gs`, **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**. The URL stays the same.

## Endpoints

Public (no token):
- `GET ?action=activities` — list open activities
- `GET ?action=activity&id=<id>` — fetch one open activity
- `POST {action: "submit", activity_id, student_id, response}` — submit a response

Instructor (require `token` matching `INSTRUCTOR_TOKEN`):
- `GET ?action=all_activities&token=<t>` — list every activity
- `GET ?action=submissions&activity_id=<id>&token=<t>` — submissions for one activity
- `POST {action: "create_activity", prompt, token}` — create + open
- `POST {action: "set_status", activity_id, status, token}` — `open` or `closed`

## Notes

- POSTs are sent with `Content-Type: text/plain` to skip CORS preflight; the body is still JSON.
- The instructor token is a shared secret, not per-user auth. Treat it like a password and rotate when needed by changing the Script Property.
