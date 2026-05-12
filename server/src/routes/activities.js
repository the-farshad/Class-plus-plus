import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireInstructor } from "../auth.js";

export const activitiesRouter = Router();

// ---------- SSE broadcast ----------
const sseClients = new Set();

function notifySSE() {
  const msg = `data: ${JSON.stringify({ type: "activities_changed" })}\n\n`;
  sseClients.forEach(res => { try { res.write(msg); } catch { sseClients.delete(res); } });
}

// Public endpoint — only sends "something changed", no data, no auth needed.
activitiesRouter.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/caddy buffering
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  // Keep-alive ping every 25 s so connections don't time out
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(ping); sseClients.delete(res); }
  }, 25_000);

  sseClients.add(res);
  req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
});

// Public to authed users — students need to pick activities.
// Time-gating: only show rows that (a) are status='open',
// (b) have no release_at or release_at <= now, AND
// (c) have no due_at or due_at > now.
activitiesRouter.get("/", requireAuth, (req, res) => {
  const { class_id } = req.query;
  const now = Date.now();
  let sql = `
    SELECT id AS activity_id, prompt, asset_url, type, poll_options, difficulty,
           session_tag, release_at, due_at
    FROM activities
    WHERE status = 'open'
      AND (scheduled_at IS NULL OR scheduled_at <= ?)
      AND (release_at IS NULL OR release_at <= ?)
      AND (due_at IS NULL OR due_at > ?)
  `;
  const params = [now, now, now];
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
    "SELECT id AS activity_id, prompt, asset_url, status, type, poll_options, session_tag, release_at, due_at FROM activities WHERE id = ?"
  ).get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "Not found" });
  if (row.status !== "open") return res.status(409).json({ ok: false, error: "Activity is closed" });
  const now = Date.now();
  if (row.release_at && row.release_at > now) {
    return res.status(409).json({ ok: false, error: "Activity has not been released yet" });
  }
  if (row.due_at && row.due_at <= now) {
    return res.status(409).json({ ok: false, error: "Activity is past its due date" });
  }
  res.json({ ok: true, activity: row });
});

// Instructor: list everything.
activitiesRouter.get("/admin/all", requireInstructor, (req, res) => {
  const { class_id } = req.query;
  let sql = `SELECT id AS activity_id, prompt, status, asset_url, type, class_id,
                    session_tag, release_at, due_at, created_at
             FROM activities`;
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
  // 'rating' removed from the UI but kept in the CHECK constraint so existing
  // rows (if any) still validate. New creations from the UI never request it.
  const VALID_TYPES = new Set(["submission", "poll", "poll_pie", "poll_multi", "word_cloud", "ordering"]);
  const type = VALID_TYPES.has(req.body?.type) ? req.body.type : "submission";
  // poll_options stores: choices for poll/poll_pie/poll_multi, OR the
  // canonical (correct) order for ordering activities. Stored as JSON.
  const pollOptions = ["poll", "poll_pie", "poll_multi", "ordering"].includes(type)
    ? JSON.stringify(req.body.poll_options || [])
    : null;
  const difficulty = req.body && req.body.difficulty ? req.body.difficulty : 'easy';
  const scheduledAt = req.body && req.body.scheduled_at ? parseInt(req.body.scheduled_at, 10) : null;
  // Session tag = "prog01".."prog14", "lab01".."lab14", or null.
  const rawTag = req.body && typeof req.body.session_tag === "string" ? req.body.session_tag.trim().toLowerCase() : "";
  // session_tag accepts week01..week14 (preferred) AND legacy prog/lab tags
  // so old data still validates. UI now only shows weeks.
  const sessionTag = /^(week|prog|lab)(0[1-9]|1[0-4])$/.test(rawTag) ? rawTag : null;
  // Accept release_at / due_at as either ms or ISO string from the client.
  function toMs(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const releaseAt = toMs(req.body && req.body.release_at);
  const dueAt = toMs(req.body && req.body.due_at);

  if (!prompt) return res.status(400).json({ ok: false, error: "Missing prompt" });
  const info = db.prepare(
    `INSERT INTO activities
       (prompt, status, asset_url, class_id, type, poll_options, difficulty,
        scheduled_at, session_tag, release_at, due_at, created_at)
     VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(prompt, assetUrl, classId, type, pollOptions, difficulty,
        scheduledAt, sessionTag, releaseAt, dueAt, Date.now());
  res.json({ ok: true, activity_id: info.lastInsertRowid });
  notifySSE();
});

activitiesRouter.patch("/admin/:id", requireInstructor, (req, res) => {
  const { status, prompt, type, poll_options, difficulty, scheduled_at, class_id } = req.body;
  
  if (status && status !== "open" && status !== "closed") {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }

  try {
    const current = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
    if (!current) return res.status(404).json({ ok: false, error: "Not found" });

    const newStatus = status !== undefined ? status : current.status;
    const newPrompt = prompt !== undefined ? String(prompt).trim() : current.prompt;
    const newType = type !== undefined ? type : current.type;
    const newPollOptions = newType === "poll" && poll_options !== undefined ? JSON.stringify(poll_options) : current.poll_options;
    const newDifficulty = difficulty !== undefined ? difficulty : current.difficulty;
    const newScheduledAt = scheduled_at !== undefined ? scheduled_at : current.scheduled_at;
    const newClassId = class_id !== undefined ? class_id : current.class_id;

    const info = db.prepare(
      "UPDATE activities SET status = ?, prompt = ?, type = ?, poll_options = ?, difficulty = ?, scheduled_at = ?, class_id = ? WHERE id = ?"
    ).run(newStatus, newPrompt, newType, newPollOptions, newDifficulty, newScheduledAt, newClassId, req.params.id);
    
    if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true });
    notifySSE();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

activitiesRouter.delete("/admin/:id", requireInstructor, (req, res) => {
  try {
    const info = db.prepare("DELETE FROM activities WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true });
    notifySSE();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Record an answer for a poll-style activity. Accepts either a single
// option_index (poll / poll_pie) or an array option_indices (poll_multi).
// Replaces the user's previous answer atomically.
activitiesRouter.post("/:id/vote", requireAuth, (req, res) => {
  const activityId = req.params.id;
  const { option_index, option_indices } = req.body || {};
  const indices = Array.isArray(option_indices)
    ? option_indices
    : (option_index !== undefined ? [option_index] : []);
  if (!indices.length) return res.status(400).json({ ok: false, error: "Option index required" });

  try {
    const tx = db.transaction((idxs) => {
      // Wipe this user's previous answer(s) so re-answering replaces them
      // (UNIQUE(activity_id,email) only allows one row in single-select).
      db.prepare("DELETE FROM poll_votes WHERE activity_id = ? AND email = ?")
        .run(activityId, req.user.email);
      const ins = db.prepare(
        "INSERT INTO poll_votes (activity_id, email, option_index, created_at) VALUES (?, ?, ?, ?)"
      );
      const now = Date.now();
      for (const i of idxs) ins.run(activityId, req.user.email, i, now);
    });
    tx(indices);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get tallied results for any option-bearing activity (poll, poll_pie,
// poll_multi). Returns the original options + per-option vote counts.
activitiesRouter.get("/:id/results", requireAuth, (req, res) => {
  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
  if (!activity) return res.status(404).json({ ok: false, error: "Activity not found" });
  const tallyTypes = new Set(["poll", "poll_pie", "poll_multi"]);
  if (!tallyTypes.has(activity.type)) {
    return res.status(409).json({ ok: false, error: `No tally available for type '${activity.type}'` });
  }

  const votes = db.prepare(
    "SELECT option_index, COUNT(*) as count FROM poll_votes WHERE activity_id = ? GROUP BY option_index"
  ).all(req.params.id);

  res.json({ ok: true, options: JSON.parse(activity.poll_options || "[]"), votes });
});
