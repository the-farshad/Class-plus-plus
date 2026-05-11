-- Allow a user to have multiple rows in poll_votes for a single activity
-- (used by the new poll_multi multi-select activity type). Single-select
-- polls now enforce one-per-user at the application layer (the route
-- DELETEs existing rows before INSERTing new ones, in a transaction).
--
-- SQLite can't drop a UNIQUE constraint in place, so we rebuild the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE poll_votes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO poll_votes_new (id, activity_id, email, option_index, created_at)
SELECT id, activity_id, email, option_index, created_at FROM poll_votes;

DROP TABLE poll_votes;
ALTER TABLE poll_votes_new RENAME TO poll_votes;

CREATE INDEX IF NOT EXISTS idx_poll_votes_activity ON poll_votes(activity_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_email    ON poll_votes(activity_id, email);

PRAGMA foreign_keys = ON;
