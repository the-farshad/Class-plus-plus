-- Migration 0003 locked the `type` column to ('submission','poll'). The app
-- has since gained poll_pie / rating / word_cloud types. SQLite can't drop
-- a CHECK constraint in place, so we recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE activities_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','closed')),
  asset_url TEXT,
  created_at INTEGER NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'submission'
    CHECK (type IN ('submission','poll','poll_pie','rating','word_cloud')),
  poll_options TEXT,
  scheduled_at INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy','medium','hard','ai-proof','ai-collab')),
  session_tag TEXT,
  release_at INTEGER,
  due_at INTEGER
);

INSERT INTO activities_new
  (id, prompt, status, asset_url, created_at, class_id, type, poll_options,
   scheduled_at, difficulty, session_tag, release_at, due_at)
SELECT
   id, prompt, status, asset_url, created_at, class_id, type, poll_options,
   scheduled_at, difficulty, session_tag, release_at, due_at
FROM activities;

DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX IF NOT EXISTS idx_activities_schedule    ON activities(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_activities_session_tag ON activities(session_tag);
CREATE INDEX IF NOT EXISTS idx_activities_release_at  ON activities(release_at);
CREATE INDEX IF NOT EXISTS idx_activities_due_at      ON activities(due_at);

PRAGMA foreign_keys = ON;
