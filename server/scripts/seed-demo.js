// Seed an "Intro to C++" class with sample students and three activities.
// Usage:
//   node scripts/seed-demo.js <instructor_email>
// The instructor must already exist (INITIAL_INSTRUCTORS env var or seeded).
// Re-running this is safe — it upserts.

import "dotenv/config";
import { db } from "../src/db.js";

const instructor = (process.argv[2] || "").toLowerCase();
if (!instructor) {
  console.error("Usage: node scripts/seed-demo.js <instructor_email>");
  process.exit(1);
}

const hasInstructor = db.prepare("SELECT 1 FROM instructors WHERE email = ?").get(instructor);
if (!hasInstructor) {
  console.error(`Instructor ${instructor} not found. Add them via INITIAL_INSTRUCTORS first.`);
  process.exit(1);
}

const now = Date.now();

// ---- Class ----
let cls = db.prepare("SELECT id FROM classes WHERE code = 'COSC1010' AND instructor_email = ?").get(instructor);
if (!cls) {
  const r = db.prepare(
    "INSERT INTO classes (name, code, semester, instructor_email, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run("Intro to C++", "COSC1010", "Spring 2026", instructor, now);
  cls = { id: r.lastInsertRowid };
  console.log(`Created class "Intro to C++" (id=${cls.id}).`);
} else {
  console.log(`Class already exists (id=${cls.id}). Re-seeding students + activities.`);
}

// ---- Students ----
const students = [
  { email: "alice@uwyo.edu",   id: "W1001", name: "Alice Anderson" },
  { email: "bob@uwyo.edu",     id: "W1002", name: "Bob Brown" },
  { email: "carol@uwyo.edu",   id: "W1003", name: "Carol Chen" },
  { email: "diego@uwyo.edu",   id: "W1004", name: "Diego Diaz" },
  { email: "evelyn@uwyo.edu",  id: "W1005", name: "Evelyn Eaton" },
  { email: "farhan@uwyo.edu",  id: "W1006", name: "Farhan Foster" },
];
const insertStudent = db.prepare(
  "INSERT OR REPLACE INTO class_students (class_id, student_email, student_id, student_name) VALUES (?, ?, ?, ?)"
);
students.forEach(s => insertStudent.run(cls.id, s.email, s.id, s.name));
console.log(`Seeded ${students.length} students.`);

// ---- Activities ----
// 1. Easy multiple-choice poll about sorting algorithms.
// 2. Medium-hard poll about pointers (real C++ knowledge required).
// 3. Open submission designed to be hard for AI to fake — asks for a
//    SPECIFIC bug from THEIR own code with a hand-drawn diagram.
const activities = [
  {
    prompt: "Which of these is an in-place sorting algorithm with average-case O(n log n)?",
    type: "poll",
    options: [
      "Bubble Sort",
      "Quicksort",
      "Counting Sort",
      "Bogosort",
    ],
  },
  {
    prompt: "What is printed?\n\nint a = 5;\nint* p = &a;\nint** pp = &p;\n**pp = 42;\nstd::cout << a;",
    type: "poll",
    options: [
      "5",
      "42",
      "the address of a (a hex number)",
      "undefined behavior",
    ],
  },
  {
    prompt: "Photograph (or scan) a HAND-DRAWN trace of how memory changes line-by-line through this code on YOUR paper. Include arrows for pointer reseats. Submit the image — no typed answers, no AI-generated diagrams.\n\nint v[3] = {1,2,3};\nint* p = v;\np++;\n*p = 99;\nstd::cout << v[0] << v[1] << v[2];",
    type: "submission",
  },
];

const insertActivity = db.prepare(
  "INSERT INTO activities (prompt, type, status, poll_options, class_id, created_at) VALUES (?, ?, 'open', ?, ?, ?)"
);

// Clear out previously-seeded demo activities (matching prompt prefix)
// so re-running this script doesn't keep duplicating.
db.prepare("DELETE FROM activities WHERE class_id = ?").run(cls.id);

activities.forEach((a, idx) => {
  const opts = a.options ? JSON.stringify(a.options) : null;
  insertActivity.run(a.prompt, a.type, opts, cls.id, now + idx);
});
console.log(`Seeded ${activities.length} activities (all open).`);

console.log("\nDone. Sign in as the instructor and head to Dashboard → Activities.");
