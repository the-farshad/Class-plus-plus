-- Per-activity toggle for whether STUDENTS see the live tally while/after
-- answering. Instructors always see it. Default 1 to preserve the
-- previous behavior — set to 0 to hide tallies until the instructor
-- decides to share them.
ALTER TABLE activities ADD COLUMN show_results INTEGER NOT NULL DEFAULT 1;
