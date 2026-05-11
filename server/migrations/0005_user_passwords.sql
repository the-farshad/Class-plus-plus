-- Email + admin-generated-password authentication.
-- Keyed by email so a single password works regardless of which class
-- the student is in (class_students is per-(class,email); passwords are global).
CREATE TABLE IF NOT EXISTS user_passwords (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  set_at INTEGER NOT NULL,
  set_by TEXT,
  must_change INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_passwords_set_at ON user_passwords(set_at);
