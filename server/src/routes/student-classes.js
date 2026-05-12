// Student-facing class endpoints. Mounted at /classes so URLs are short.
// Anything here is gated by requireAuth only (no instructor role needed).

import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const studentClassesRouter = Router();

// POST /classes/by-code/:code/enroll
// Self-enroll the authenticated user into the class with this join_code.
// Idempotent — re-running yields the same row in class_students.
studentClassesRouter.post("/by-code/:code/enroll", requireAuth, (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return res.status(400).json({ ok: false, error: "Invalid join code format" });
  }
  const cls = db.prepare(
    "SELECT id, name, code, semester FROM classes WHERE join_code = ?"
  ).get(code);
  if (!cls) return res.status(404).json({ ok: false, error: "No class with that code" });

  db.prepare(
    "INSERT OR IGNORE INTO class_students (class_id, student_email, student_id, student_name) VALUES (?, ?, NULL, NULL)"
  ).run(cls.id, req.user.email);

  res.json({ ok: true, class: cls });
});
