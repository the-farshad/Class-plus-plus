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
// Curriculum-tied warm-ups across Programs 01–06. Three difficulty levels
// per program: a quick poll, a tricky poll, and an AI-resistant submission
// requiring an artifact only THIS student could produce in THIS course.
const activities = [
  // ----- Program 01: I/O and arithmetic (read 4 ints, sum them) -----
  {
    session_tag: "prog01",
    prompt: "Prog 01 — Which header is required for std::cin and std::cout?",
    type: "poll",
    options: ["<iostream>", "<stdio.h>", "<cstdlib>", "<string>"],
  },
  {
    session_tag: "prog01",
    prompt: "Prog 01 — In `cin >> a >> b >> c >> d;` if the user types `5 10 abc 20`, what's in `c` and `d` after the read?",
    type: "poll",
    options: [
      "c = 0, d = 20 (skips the bad token)",
      "c is unchanged, d is unchanged; stream goes into fail state",
      "c = 'a' (the first char), d = 20",
      "Compile error",
    ],
  },
  {
    session_tag: "prog01",
    prompt: "Prog 01 — Submit a PHOTO of your hand-written pseudocode for Prog 01 BEFORE looking at the .cpp solution. Include your name and the date on the page. No typed text, no AI rewrites — the rubric counts handwriting.",
    type: "submission",
  },

  // ----- Program 02: if/else + while + accumulator product -----
  {
    session_tag: "prog02",
    prompt: "Prog 02 — Why does the pseudocode interchange the two values when value1 > value2?",
    type: "poll",
    options: [
      "So the while loop is guaranteed to execute at least once",
      "So the smaller value is the loop counter and the loop terminates",
      "Because C++ requires it for integer multiplication",
      "It's a style preference; the program works either way",
    ],
  },
  {
    session_tag: "prog02",
    prompt: "Prog 02 — User enters value1 = 3 and value2 = 5. Following the pseudocode (accumulator starts at value1, then loop: increment value1, multiply accumulator by it). What is printed?",
    type: "poll",
    options: ["15", "60", "120", "20"],
  },
  {
    session_tag: "prog02",
    prompt: "Prog 02 — Rate your confidence with `while` loops AFTER finishing Prog 02 (1 = lost, 10 = could teach it).",
    type: "rating",
  },

  // ----- Program 03: for / while / do-while -----
  {
    session_tag: "prog03",
    prompt: "Prog 03 — Which loop is guaranteed to execute its body AT LEAST ONCE, even if the condition is false on entry?",
    type: "poll",
    options: ["for", "while", "do-while", "range-based for"],
  },
  {
    session_tag: "prog03",
    prompt: "Prog 03 — Counting integers strictly between two values (endpoints excluded). User gives 4 and 9. The while loop in the pseudocode initializes the counter to 0 and loop control to smaller+1, looping while < larger. What is the final counter?",
    type: "poll",
    options: ["3", "4", "5", "6"],
  },
  {
    session_tag: "prog03",
    prompt: "Prog 03 — One-word: which keyword exits a loop early in C++?",
    type: "word_cloud",
  },

  // ----- Program 04: functions + factorial -----
  {
    session_tag: "prog04",
    prompt: "Prog 04 — The prompt function loops until the input is non-negative. What's the simplest type to return from that prompt function?",
    type: "poll",
    options: ["int", "bool", "void", "std::string"],
  },
  {
    session_tag: "prog04",
    prompt: "Prog 04 — For input n = 5, what does a correct factorial(n) return?",
    type: "poll",
    options: ["25", "120", "720", "0"],
  },
  {
    session_tag: "prog04",
    prompt: "Prog 04 — In your own handwriting on paper, draw the call stack for factorial(4) using a recursive implementation. Show each frame and the return value bubbling up. Photograph it and submit. AI image generators won't get the stack diagram conventions right — that's the point.",
    type: "submission",
  },
];

const insertActivity = db.prepare(
  "INSERT INTO activities (prompt, type, status, poll_options, class_id, session_tag, created_at) VALUES (?, ?, 'open', ?, ?, ?, ?)"
);

// Clear out previously-seeded demo activities so re-running this script
// doesn't keep duplicating. Drops every activity in this class.
db.prepare("DELETE FROM activities WHERE class_id = ?").run(cls.id);

activities.forEach((a, idx) => {
  const opts = a.options ? JSON.stringify(a.options) : null;
  insertActivity.run(a.prompt, a.type, opts, cls.id, a.session_tag || null, now + idx);
});
console.log(`Seeded ${activities.length} activities across Programs 01–04 (all open).`);

console.log("\nDone. Sign in as the instructor and head to Dashboard → Activities.");
