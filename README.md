# Class++ or C++

**Class++** is a lightweight classroom engagement tool for live check-ins, short activities, response collection, and participation tracking.

It uses a simple web interface for students and Google Sheets as a lightweight backend for storing rosters, submissions, timestamps, and participation records.

The project is designed to make attendance more meaningful by turning class check-ins into quick learning checkpoints. While it can be used for general classroom activities, it also works well for programming courses with prompts such as predicting C++ output, finding bugs, tracing code, or explaining errors.

## Features

- QR-code based access
- Student identifier validation
- Short in-class activities
- Google Sheets storage
- Timestamped submissions
- Multiple checkpoints per class
- Easy review and export of participation records

## Basic Workflow

1. Instructor opens an activity.
2. Students scan a QR code.
3. Students enter an approved identifier.
4. Students submit a short response.
5. The response is saved to Google Sheets.
6. The instructor reviews participation and responses.


## Blog / Learning Notes

Class++ can include a simple blog or notes section where instructors can publish explanations, examples, and extra details using Markdown files.

This can be used for:

- Explaining activity solutions
- Posting short lesson notes
- Sharing C++ examples
- Providing follow-up explanations after class
- Adding setup or usage documentation
- Keeping project updates or teaching reflections

## Tech Stack

- HTML, CSS, JavaScript
- GitHub Pages
- Google Sheets
- Google Apps Script

## Project Layout

```
/                         student submission page (index.html)
/instructor/              instructor dashboard
/blog/                    Markdown notes (posts/*.md + index.json)
/js/                      api.js, student.js, instructor.js, blog.js
/css/styles.css
/apps-script/Code.gs      backend Web App (deploy to Google Apps Script)
```

## Setup

1. Follow `apps-script/README.md` to create the Google Sheet, deploy `Code.gs` as a Web App, and set the `INSTRUCTOR_TOKEN` script property.
2. Paste the deployed `/exec` URL into `WEB_APP_URL` at the top of `js/api.js`.
3. Push to `main` — GitHub Pages serves the static frontend at the CNAME domain.

## Local Development

The frontend uses ES modules with absolute paths, so it must be served — opening files via `file://` won't work.

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Adding a Blog Post

1. Add `blog/posts/<slug>.md`.
2. Append an entry to `blog/posts/index.json` with `slug`, `title`, `date`, and `summary`.
3. Commit and push.

## Goal

Class++ helps instructors encourage active participation, collect quick feedback, and track engagement without requiring a complex backend system.
