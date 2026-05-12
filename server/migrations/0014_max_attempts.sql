-- Cap how many times a student can answer a given activity.
-- NULL semantics: a max_attempts of NULL means "unlimited" on the wire,
-- but we store a concrete number for the new default. Use 1 for both
-- existing rows (per user request, treat them as one-shot) and as the
-- default for new ones.

-- max_attempts is nullable so instructors can opt into unlimited
-- (NULL or <= 0) per-activity. The DEFAULT applies on row insert,
-- but the ALTER TABLE pass also leaves existing rows NULL on some
-- SQLite builds, so we backfill explicitly below.
ALTER TABLE activities ADD COLUMN max_attempts INTEGER DEFAULT 1;
UPDATE activities SET max_attempts = 1 WHERE max_attempts IS NULL;

-- Per-(activity, student) attempt counter. One row per pair, never
-- deleted — even if the student deletes their last response, the
-- counter stays so they can't refresh-and-retry their way past the cap.
CREATE TABLE IF NOT EXISTS activity_attempts (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  email       TEXT    NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  last_at     INTEGER NOT NULL,
  PRIMARY KEY (activity_id, email)
);
CREATE INDEX IF NOT EXISTS idx_activity_attempts_email ON activity_attempts(email);

-- Backfill from existing answers so nobody's prior responses get
-- silently un-counted. Polls only ever store the LAST attempt
-- (vote replaces), so a poll row counts as exactly 1 attempt.
INSERT OR IGNORE INTO activity_attempts (activity_id, email, used, last_at)
SELECT activity_id, email, 1, MAX(created_at)
FROM poll_votes
GROUP BY activity_id, email;

-- Submissions append on every attempt, so the row count IS the attempt
-- count. If a poll-row backfill already created a counter for the same
-- (activity, email), bump it by the submission count.
INSERT INTO activity_attempts (activity_id, email, used, last_at)
SELECT activity_id, email, COUNT(*), MAX(created_at)
FROM submissions
GROUP BY activity_id, email
ON CONFLICT (activity_id, email) DO UPDATE SET
  used    = activity_attempts.used + excluded.used,
  last_at = MAX(activity_attempts.last_at, excluded.last_at);
