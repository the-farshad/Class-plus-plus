CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','closed')),
  asset_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roster (
  student_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS allowlist (
  email TEXT PRIMARY KEY,
  note TEXT,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS instructors (
  email TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id),
  email TEXT NOT NULL,
  student_id TEXT,
  response TEXT NOT NULL,
  attachment_local TEXT,
  attachment_mime TEXT,
  drive_file_id TEXT,
  drive_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_activity ON submissions(activity_id);
CREATE INDEX IF NOT EXISTS idx_roster_email ON roster(email);
