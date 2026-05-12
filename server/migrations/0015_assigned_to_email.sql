-- Optional per-student assignment. NULL = available to anyone in the
-- class (the default). When set, only that one student sees the activity
-- in their /activities list and can answer it.
ALTER TABLE activities ADD COLUMN assigned_to_email TEXT;
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to_email ON activities(assigned_to_email);
