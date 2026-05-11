import { Router } from "express";
import { db } from "../db.js";
import { requireInstructor } from "../auth.js";

export const classesRouter = Router();

classesRouter.use(requireInstructor);

classesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM classes ORDER BY created_at DESC").all();
  res.json({ ok: true, classes: rows });
});

classesRouter.post("/", (req, res) => {
  const { name, code, semester } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: "Name is required" });

  try {
    const info = db.prepare(
      "INSERT INTO classes (name, code, semester, instructor_email, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(name, code || null, semester || null, req.user.email, Date.now());
    res.json({ ok: true, class_id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

classesRouter.delete("/:id", (req, res) => {
  try {
    const info = db.prepare("DELETE FROM classes WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Class Roster
classesRouter.get("/:id/students", (req, res) => {
  const rows = db.prepare("SELECT * FROM class_students WHERE class_id = ?").all(req.params.id);
  res.json({ ok: true, students: rows });
});

classesRouter.post("/:id/students", (req, res) => {
  const { email, student_id, student_name } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  try {
    db.prepare(
      "INSERT OR REPLACE INTO class_students (class_id, student_email, student_id, student_name) VALUES (?, ?, ?, ?)"
    ).run(req.params.id, email.toLowerCase(), student_id || null, student_name || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

classesRouter.delete("/:id/students/:email", (req, res) => {
  try {
    db.prepare("DELETE FROM class_students WHERE class_id = ? AND student_email = ?")
      .run(req.params.id, req.params.email.toLowerCase());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
