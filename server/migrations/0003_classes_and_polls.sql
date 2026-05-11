-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT, -- e.g. CS101
  semester TEXT, -- e.g. Fall 2026
  instructor_email TEXT NOT NULL REFERENCES instructors(email),
  created_at INTEGER NOT NULL
);

-- Link students to classes (Roster per class)
CREATE TABLE IF NOT EXISTS class_students (
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  student_id TEXT,
  student_name TEXT,
  PRIMARY KEY (class_id, student_email)
);

-- Update activities to link to classes and support polling
ALTER TABLE activities ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE activities ADD COLUMN type TEXT NOT NULL DEFAULT 'submission' CHECK (type IN ('submission', 'poll'));
ALTER TABLE activities ADD COLUMN poll_options TEXT; -- JSON array of options for polls

-- Create poll_votes table
CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(activity_id, email) -- One vote per student per poll
);

-- Update submissions to handle students more consistently
-- (Existing submissions table is fine, but we might want to index by class_id later via activities)
