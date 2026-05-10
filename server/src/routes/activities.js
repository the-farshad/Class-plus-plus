import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireInstructor } from "../auth.js";

export const activitiesRouter = Router();

// Public to authed users — students need to pick activities.
activitiesRouter.get("/", requireAuth, (_req, res) => {
  const rows = db.prepare(
    "SELECT id AS activity_id, prompt, asset_url FROM activities WHERE status = 'open' ORDER BY id DESC"
  ).all();
  res.json({ ok: true, activities: rows });
});

activitiesRouter.get("/:id", requireAuth, (req, res) => {
  const row = db.prepare(
    "SELECT id AS activity_id, prompt, asset_url, status FROM activities WHERE id = ?"
  ).get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "Not found" });
  if (row.status !== "open") return res.status(409).json({ ok: false, error: "Activity is closed" });
  res.json({ ok: true, activity: row });
});

// Instructor: list everything.
activitiesRouter.get("/admin/all", requireInstructor, (_req, res) => {
  const rows = db.prepare(
    "SELECT id AS activity_id, prompt, status, asset_url, created_at FROM activities ORDER BY id DESC"
  ).all();
  res.json({ ok: true, activities: rows });
});

activitiesRouter.post("/admin", requireInstructor, (req, res) => {
  const prompt = String(req.body && req.body.prompt || "").trim();
  const assetUrl = req.body && req.body.asset_url ? String(req.body.asset_url) : null;
  if (!prompt) return res.status(400).json({ ok: false, error: "Missing prompt" });
  const info = db.prepare(
    "INSERT INTO activities (prompt, status, asset_url, created_at) VALUES (?, 'open', ?, ?)"
  ).run(prompt, assetUrl, Date.now());
  res.json({ ok: true, activity_id: info.lastInsertRowid });
});

activitiesRouter.patch("/admin/:id", requireInstructor, (req, res) => {
  const status = req.body && req.body.status;
  if (status !== "open" && status !== "closed") {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }
  const info = db.prepare("UPDATE activities SET status = ? WHERE id = ?")
    .run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});
