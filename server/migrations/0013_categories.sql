-- User-owned categories for grouping activities. The previously hardcoded
-- week01..week14 tags become rows here so old data keeps grouping correctly.
--
-- Activities reference categories via activities.session_tag (a slug). No
-- FK constraint — we want graceful degradation when a category is deleted
-- (handled in the route by UPDATE-to-NULL).

CREATE TABLE IF NOT EXISTS categories (
  instructor_email TEXT NOT NULL,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (instructor_email, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_instructor_pos
  ON categories(instructor_email, position);

-- Backfill: every weekNN tag in use by any activity becomes a category
-- for the class's owning instructor.
INSERT OR IGNORE INTO categories (instructor_email, slug, name, position, created_at)
SELECT DISTINCT
  c.instructor_email,
  a.session_tag,
  CASE a.session_tag
    WHEN 'week01' THEN 'Week 01 — I/O + arithmetic'
    WHEN 'week02' THEN 'Week 02 — if/else + while'
    WHEN 'week03' THEN 'Week 03 — for/while/do-while'
    WHEN 'week04' THEN 'Week 04 — functions + factorial'
    WHEN 'week05' THEN 'Week 05 — Madhava-Leibniz series'
    WHEN 'week06' THEN 'Week 06 — validation + geometry'
    WHEN 'week07' THEN 'Week 07 — arrays'
    WHEN 'week08' THEN 'Week 08 — 2D arrays'
    WHEN 'week09' THEN 'Week 09 — references / least squares'
    WHEN 'week10' THEN 'Week 10 — classes (Polynomial)'
    WHEN 'week11' THEN 'Week 11 — operator overloading (String)'
    WHEN 'week12' THEN 'Week 12 — new / delete / heap'
    WHEN 'week13' THEN 'Week 13 — inheritance + virtual'
    WHEN 'week14' THEN 'Week 14 — STL'
    ELSE a.session_tag
  END AS name,
  CAST(SUBSTR(a.session_tag, 5) AS INTEGER) AS position,
  strftime('%s', 'now') * 1000
FROM activities a
JOIN classes c ON c.id = a.class_id
WHERE a.session_tag IS NOT NULL
  AND a.session_tag LIKE 'week__';
