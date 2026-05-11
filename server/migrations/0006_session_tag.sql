-- Tag activities with the curriculum session they belong to (e.g., "prog03",
-- "lab07"). Null = untagged / general. Lets instructors browse activities by
-- the lab or program they're currently teaching.
ALTER TABLE activities ADD COLUMN session_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_activities_session_tag ON activities(session_tag);
