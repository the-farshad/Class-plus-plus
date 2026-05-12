-- Store the correct answer for gradable activities (polls, multi-polls)
-- as a JSON blob. Ordering activities derive correctness implicitly from
-- the canonical option order, so they don't need this column populated.
ALTER TABLE activities ADD COLUMN correct_answer TEXT;

-- Per-class self-enroll code. Students join by visiting a URL that ends
-- in ?join=<code>, which the server resolves to this class.
ALTER TABLE classes ADD COLUMN join_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);

-- Backfill: give every existing class a code. Uses a hex slice of the
-- rowid bumped through a small mixing function so codes are not obvious
-- successors of one another. (Re-running this is harmless because we
-- only update rows that still have a NULL.)
UPDATE classes
SET join_code = upper(substr(
  hex(randomblob(4)),  -- 8 hex chars
  1, 6))
WHERE join_code IS NULL;
