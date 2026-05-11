// Seed an "Intro to C++" class with sample students. Does NOT seed
// activities — assignment content should never live in git. Use
// scripts/seed-activities.js with a local JSON file for that.
//
// Usage:
//   node scripts/seed-demo.js <instructor_email>

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
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

// ---- Optional: load the example questions on a fresh / empty class ----
const existing = db.prepare("SELECT COUNT(*) AS n FROM activities WHERE class_id = ?").get(cls.id);
if (existing.n === 0) {
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const examplePath = path.join(__dirname, "questions.example.json");
  if (fs.existsSync(examplePath)) {
    const list = JSON.parse(fs.readFileSync(examplePath, "utf8"));
    // Seeded activities are CLOSED so they don't auto-release to students.
    // The instructor explicitly clicks 'Open' on each one when ready.
    const insertActivity = db.prepare(`
      INSERT INTO activities
        (prompt, type, status, poll_options, class_id, session_tag, release_at, due_at, created_at)
      VALUES (?, ?, 'closed', ?, ?, ?, ?, ?, ?)
    `);
    list.forEach((a, idx) => {
      const opts = a.options ? JSON.stringify(a.options) : null;
      const toMs = v => {
        if (v == null) return null;
        if (typeof v === "number") return v;
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? null : t;
      };
      insertActivity.run(
        a.prompt, a.type, opts, cls.id,
        a.session_tag || null, toMs(a.release_at), toMs(a.due_at),
        now + idx
      );
    });
    console.log(`Seeded ${list.length} example questions from questions.example.json.`);
    console.log("Replace these with your own content via:");
    console.log(`  node scripts/seed-activities.js ${instructor} <your-questions.json> --wipe`);
  }
} else {
  console.log(`Class already has ${existing.n} activities — leaving them as-is.`);
  console.log("To reset: node scripts/seed-activities.js " + instructor + " <questions.json> --wipe");
}
