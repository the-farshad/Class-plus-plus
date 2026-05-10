import { Router } from "express";
import { db } from "../db.js";
import { requireInstructor } from "../auth.js";

export const allowlistRouter = Router();

allowlistRouter.use(requireInstructor);

allowlistRouter.get("/", (_req, res) => {
  const rows = db.prepare(
    "SELECT email, note, added_at FROM allowlist ORDER BY added_at DESC"
  ).all();
  res.json({ ok: true, allowlist: rows });
});

allowlistRouter.post("/", (req, res) => {
  const email = String(req.body && req.body.email || "").trim().toLowerCase();
  const note = String(req.body && req.body.note || "").trim() || null;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Valid email required" });
  }
  db.prepare(
    "INSERT OR REPLACE INTO allowlist (email, note, added_at) VALUES (?, ?, ?)"
  ).run(email, note, Date.now());
  res.json({ ok: true });
});

allowlistRouter.delete("/:email", (req, res) => {
  const info = db.prepare("DELETE FROM allowlist WHERE email = ?")
    .run(req.params.email.toLowerCase());
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});
