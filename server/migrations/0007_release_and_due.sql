-- Time-gated activities. Both columns are unix-ms or null = no gate.
-- release_at: students cannot see the activity until now() >= release_at.
-- due_at:     the activity is treated as closed once now() > due_at.
ALTER TABLE activities ADD COLUMN release_at INTEGER;
ALTER TABLE activities ADD COLUMN due_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_activities_release_at ON activities(release_at);
CREATE INDEX IF NOT EXISTS idx_activities_due_at ON activities(due_at);
