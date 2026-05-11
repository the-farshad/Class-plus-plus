-- Add scheduled_at to activities for time-based rollout
ALTER TABLE activities ADD COLUMN scheduled_at INTEGER;
ALTER TABLE activities ADD COLUMN difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard', 'ai-proof', 'ai-collab'));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_activities_schedule ON activities(scheduled_at);
