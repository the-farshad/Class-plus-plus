import { Router } from "express";
import { db } from "../db.js";
import { requireInstructor } from "../auth.js";

export const rosterRouter = Router();

rosterRouter.use(requireInstructor);

rosterRouter.get("/", (_req, res) => {
  const rows = db.prepare(
    "SELECT student_id, name, email, active FROM roster ORDER BY student_id"
  ).all();
  res.json({ ok: true, roster: rows });
});

rosterRouter.post("/", (req, res) => {
  const studentId = String(req.body && req.body.student_id || "").trim();
  const name = String(req.body && req.body.name || "").trim() || null;
  const email = String(req.body && req.body.email || "").trim().toLowerCase();
  const active = req.body && req.body.active === false ? 0 : 1;
  if (!studentId || !email) {
    return res.status(400).json({ ok: false, error: "student_id and email required" });
  }
  try {
    db.prepare(
      "INSERT INTO roster (student_id, name, email, active) VALUES (?, ?, ?, ?)"
    ).run(studentId, name, email, active);
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ ok: false, error: err.message });
  }
});

rosterRouter.patch("/:studentId", (req, res) => {
  const fields = [];
  const values = [];
  for (const key of ["name", "email", "active"]) {
    if (key in (req.body || {})) {
      fields.push(`${key} = ?`);
      values.push(key === "active" ? (req.body.active ? 1 : 0)
        : key === "email" ? String(req.body.email).toLowerCase()
        : req.body[key]);
    }
  }
  if (!fields.length) return res.status(400).json({ ok: false, error: "No fields" });
  values.push(req.params.studentId);
  const info = db.prepare(
    `UPDATE roster SET ${fields.join(", ")} WHERE student_id = ?`
  ).run(...values);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});

rosterRouter.delete("/:studentId", (req, res) => {
  const info = db.prepare("DELETE FROM roster WHERE student_id = ?")
    .run(req.params.studentId);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});
