// Load activities into a class from a JSON file kept OUTSIDE git.
// Each entry: { prompt, type, options?, session_tag?, release_at?, due_at?, status? }
//
// release_at / due_at may be ISO strings ("2026-09-01T08:00:00Z") or unix-ms.
//
// Usage:
//   node scripts/seed-activities.js <instructor_email> <path-to-questions.json> [--class-code=COSC1010] [--wipe]
//
// --wipe removes the class's existing activities first (otherwise we append).
//
// IMPORTANT: keep the JSON file out of git — add it to .gitignore or store
// it under server/data/private/ which is already ignored.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db.js";

const args = process.argv.slice(2);
const instructor = (args[0] || "").toLowerCase();
const jsonPath   = args[1];
const wipe       = args.includes("--wipe");
const classCode  = (args.find(a => a.startsWith("--class-code=")) || "--class-code=COSC1010").split("=")[1];

if (!instructor || !jsonPath) {
  console.error("Usage: node scripts/seed-activities.js <instructor_email> <questions.json> [--class-code=CODE] [--wipe]");
  process.exit(1);
}
if (!fs.existsSync(jsonPath)) {
  console.error(`File not found: ${jsonPath}`);
  process.exit(1);
}

const cls = db.prepare("SELECT id FROM classes WHERE code = ? AND instructor_email = ?")
  .get(classCode, instructor);
if (!cls) {
  console.error(`Class ${classCode} for ${instructor} not found. Run seed-demo.js first or pass --class-code.`);
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, "utf8");
let entries;
try { entries = JSON.parse(raw); }
catch (e) { console.error("Invalid JSON:", e.message); process.exit(1); }
if (!Array.isArray(entries)) { console.error("Expected JSON array of activities."); process.exit(1); }

function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

if (wipe) {
  const r = db.prepare("DELETE FROM activities WHERE class_id = ?").run(cls.id);
  console.log(`Wiped ${r.changes} existing activities from class ${classCode}.`);
}

const insertActivity = db.prepare(`
  INSERT INTO activities
    (prompt, type, status, poll_options, class_id, session_tag, release_at, due_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = Date.now();
let added = 0;
entries.forEach((a, idx) => {
  if (!a.prompt || !a.type) {
    console.error(`Skipping entry ${idx}: missing prompt or type`); return;
  }
  // Default to "closed" — the instructor releases each one explicitly.
  // Pass {"status": "open"} in the JSON to override.
  const status = a.status === "open" ? "open" : "closed";
  const opts = a.options ? JSON.stringify(a.options) : null;
  insertActivity.run(
    a.prompt,
    a.type,
    status,
    opts,
    cls.id,
    a.session_tag || null,
    toMs(a.release_at),
    toMs(a.due_at),
    now + idx
  );
  added++;
});
console.log(`Seeded ${added} activities into ${classCode} from ${path.resolve(jsonPath)}.`);
