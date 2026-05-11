// Seed an "Intro to C++" class with sample students. Does NOT seed
// activities — assignment content should never live in git. Use
// scripts/seed-activities.js with a local JSON file for that.
//
// Usage:
//   node scripts/seed-demo.js <instructor_email>

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
  console.log(`Class already exists (id=${cls.id}).`);
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

console.log("\nNow add activities via the dashboard (Activities → New) OR run:");
console.log("  node scripts/seed-activities.js " + instructor + " <path-to-questions.json>");
