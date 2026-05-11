import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireInstructor } from "../auth.js";

export const activitiesRouter = Router();

// Public to authed users — students need to pick activities.
activitiesRouter.get("/", requireAuth, (req, res) => {
  const { class_id } = req.query;
  let sql = "SELECT id AS activity_id, prompt, asset_url, type, poll_options FROM activities WHERE status = 'open'";
  const params = [];
  if (class_id) {
    sql += " AND class_id = ?";
    params.push(class_id);
  }
  sql += " ORDER BY id DESC";
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, activities: rows });
});

activitiesRouter.get("/:id", requireAuth, (req, res) => {
  const row = db.prepare(
    "SELECT id AS activity_id, prompt, asset_url, status, type, poll_options FROM activities WHERE id = ?"
  ).get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "Not found" });
  if (row.status !== "open") return res.status(409).json({ ok: false, error: "Activity is closed" });
  res.json({ ok: true, activity: row });
});

// Instructor: list everything.
activitiesRouter.get("/admin/all", requireInstructor, (req, res) => {
  const { class_id } = req.query;
  let sql = "SELECT id AS activity_id, prompt, status, asset_url, type, class_id, created_at FROM activities";
  const params = [];
  if (class_id) {
    sql += " WHERE class_id = ?";
    params.push(class_id);
  }
  sql += " ORDER BY id DESC";
  const rows = db.prepare(sql).all(...params);
  res.json({ ok: true, activities: rows });
});

activitiesRouter.post("/admin", requireInstructor, (req, res) => {
  const prompt = String(req.body && req.body.prompt || "").trim();
  const assetUrl = req.body && req.body.asset_url ? String(req.body.asset_url) : null;
  const classId = req.body && req.body.class_id ? parseInt(req.body.class_id, 10) : null;
  const type = req.body && req.body.type === "poll" ? "poll" : "submission";
  const pollOptions = type === "poll" ? JSON.stringify(req.body.poll_options || []) : null;

  if (!prompt) return res.status(400).json({ ok: false, error: "Missing prompt" });
  const info = db.prepare(
    "INSERT INTO activities (prompt, status, asset_url, class_id, type, poll_options, created_at) VALUES (?, 'open', ?, ?, ?, ?, ?)"
  ).run(prompt, assetUrl, classId, type, pollOptions, Date.now());
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

// Vote in a poll
activitiesRouter.post("/:id/vote", requireAuth, (req, res) => {
  const { option_index } = req.body;
  const activityId = req.params.id;
  
  if (option_index === undefined) return res.status(400).json({ ok: false, error: "Option index required" });

  try {
    db.prepare(
      "INSERT OR REPLACE INTO poll_votes (activity_id, email, option_index, created_at) VALUES (?, ?, ?, ?)"
    ).run(activityId, req.user.email, option_index, Date.now());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get poll results
activitiesRouter.get("/:id/results", requireAuth, (req, res) => {
  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!activity || activity.type !== 'poll') return res.status(404).json({ ok: false, error: "Poll not found" });

  const votes = db.prepare(
    "SELECT option_index, COUNT(*) as count FROM poll_votes WHERE activity_id = ? GROUP BY option_index"
  ).all(req.params.id);

  res.json({ ok: true, options: JSON.parse(activity.poll_options), votes });
});
