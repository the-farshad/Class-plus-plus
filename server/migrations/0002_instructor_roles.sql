-- Add role column to instructors table
ALTER TABLE instructors ADD COLUMN role TEXT NOT NULL DEFAULT 'instructor';

-- Upgrade existing instructors to superadmin (optional, but requested for the initial setup)
-- We will handle the specific farshad.1991@gmail.com email in the bootstrap logic or a manual update.
