import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireInstructor } from "../auth.js";
import { gradeAnswer, exposeCorrectAnswer, shouldRevealCorrect } from "../grading.js";

export const activitiesRouter = Router();

// Normalize an incoming max_attempts value.
//   undefined  -> fallback (used by PATCH for "field not present")
//   null/0/""  -> null  (unlimited)
//   N >= 1     -> floor(N), clamped to 999
//   anything else -> fallback
export function normalizeMaxAttempts(v, fallback = 1) {
  if (v === undefined) return fallback;
  if (v === null || v === "" || v === 0 || v === "0") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 999);
}

// Read the current attempt counter for (activity, email). Always returns
// a finite number (0 when no row exists yet).
export function attemptsUsed(activityId, email) {
  const row = db.prepare(
    "SELECT used FROM activity_attempts WHERE activity_id = ? AND email = ?"
  ).get(activityId, email);
  return row ? row.used : 0;
}

// Throw a structured error if the student has no attempts left. Caller is
// responsible for converting it to a 409 response. Keeping this as a
// throw lets both /vote and /submissions short-circuit early.
export function ensureAttemptsRemaining(activity, email) {
  if (activity.max_attempts == null || activity.max_attempts <= 0) return;
  const used = attemptsUsed(activity.id, email);
  if (used >= activity.max_attempts) {
    const err = new Error("No attempts remaining");
    err.code = "ATTEMPTS_EXHAUSTED";
    err.attempts_used = used;
    err.max_attempts = activity.max_attempts;
    throw err;
  }
}

// Normalize a comma- or whitespace-separated list of student emails into
// a canonical comma-joined string (lowercased, deduped, validated).
// Returns null when no valid emails were supplied — that's the wire
// shape for "available to the whole class".
export function normalizeAssignedEmails(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const emails = trimmed
    .split(/[,\s;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!emails.length) return null;
  return [...new Set(emails)].join(",");
}

// True when `email` is allowed to interact with `activity` based on the
// assigned_to_email field. NULL / "" means everyone is allowed.
export function isAssignedTo(activity, email) {
  if (!activity.assigned_to_email) return true;
  const list = activity.assigned_to_email.split(",").map(s => s.trim().toLowerCase());
  return list.includes((email || "").toLowerCase());
}

// Strip the difficulty-tag prefix from a prompt before it goes to a
// student. The seeded questions are authored with markers like
// "**Week 01 · AI-resistant.** Drag these..." — instructors want them
// (it's a teaching cue) but students shouldn't see whether a question
// is Easy / Medium / Hard / AI-resistant. We drop the whole leading
// "**Week NN · <difficulty>.**" prefix, leaving the bare question body.
export function scrubDifficultyForStudent(prompt) {
  if (!prompt || typeof prompt !== "string") return prompt;
  // The middle-dot separator can render as U+00B7 (·) or U+2022 (•).
  // Handle either, plus optional whitespace around it.
  return prompt.replace(
    /^\s*\*\*\s*Week\s+\d+\s*[·•]\s*[^.\n]+?\.\s*\*\*\s*/i,
    ""
  );
}

// Atomically bump the attempt counter. Returns the new used value.
export function bumpAttempt(activityId, email) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO activity_attempts (activity_id, email, used, last_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (activity_id, email) DO UPDATE SET
      used    = activity_attempts.used + 1,
      last_at = excluded.last_at
  `).run(activityId, email, now);
  return attemptsUsed(activityId, email);
}

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
  // assigned_to_email gates per-student assignments:
  //   NULL                 -> visible to anyone (default)
  //   matches caller email -> visible to them only
  //   anything else        -> hidden from this caller
  // assigned_to_email holds a comma-separated list of emails when set
  // (or a single email — backward compatible). Match by anchoring the
  // caller email between commas in both sides of the comparison so
  // partial-prefix matches can't false-positive (e.g. bob@ vs bob.alt@).
  let sql = `
    SELECT id AS activity_id, prompt, asset_url, type, poll_options, difficulty,
           session_tag, release_at, due_at, max_attempts, assigned_to_email, show_results
    FROM activities
    WHERE status = 'open'
      AND (scheduled_at IS NULL OR scheduled_at <= ?)
      AND (release_at IS NULL OR release_at <= ?)
      AND (due_at IS NULL OR due_at > ?)
      AND (
        assigned_to_email IS NULL
        OR (',' || assigned_to_email || ',') LIKE ?
      )
  `;
  const params = [now, now, now, `%,${req.user.email.toLowerCase()},%`];
  if (class_id) {
    sql += " AND class_id = ?";
    params.push(class_id);
  }
  sql += " ORDER BY id DESC";
  const rows = db.prepare(sql).all(...params);
  // Annotate each row with the caller's attempt count so the student
  // client can show "Attempt 2 of 3" or lock the form on load.
  // Also scrub the instructor-only difficulty tag out of the prompt.
  const email = req.user.email;
  for (const r of rows) {
    r.attempts_used = attemptsUsed(r.activity_id, email);
    r.prompt = scrubDifficultyForStudent(r.prompt);
  }
  res.json({ ok: true, activities: rows });
});

activitiesRouter.get("/:id", requireAuth, (req, res) => {
  const row = db.prepare(
    "SELECT id AS activity_id, prompt, asset_url, status, type, poll_options, session_tag, release_at, due_at, max_attempts, assigned_to_email, show_results FROM activities WHERE id = ?"
  ).get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: "Not found" });
  if (row.status !== "open") return res.status(409).json({ ok: false, error: "Activity is closed" });
  // Per-student assignment: if the caller isn't on the list, hide it as
  // if it didn't exist (404 rather than 403 — don't leak existence).
  if (!isAssignedTo(row, req.user.email)) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  const now = Date.now();
  if (row.release_at && row.release_at > now) {
    return res.status(409).json({ ok: false, error: "Activity has not been released yet" });
  }
  if (row.due_at && row.due_at <= now) {
    return res.status(409).json({ ok: false, error: "Activity is past its due date" });
  }
  row.attempts_used = attemptsUsed(row.activity_id, req.user.email);
  row.prompt = scrubDifficultyForStudent(row.prompt);
  res.json({ ok: true, activity: row });
});

// Instructor: list everything.
activitiesRouter.get("/admin/all", requireInstructor, (req, res) => {
  const { class_id } = req.query;
  // poll_options + correct_answer are required by the edit modal to
  // rehydrate the option rows and correctness checkboxes. Without them
  // the modal opens with an empty option list and silently nukes the
  // saved options on submit.
  let sql = `SELECT id AS activity_id, prompt, status, asset_url, type, class_id,
                    session_tag, release_at, due_at, max_attempts,
                    poll_options, correct_answer, assigned_to_email,
                    show_results, created_at
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
  // session_tag accepts any user-defined category slug. The slug is just
  // free-form metadata; categories are owned by the instructor (see the
  // /admin/categories CRUD endpoints).
  const sessionTag = /^[a-z0-9_-]{1,40}$/.test(rawTag) ? rawTag : null;
  // Accept release_at / due_at as either ms or ISO string from the client.
  function toMs(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const releaseAt = toMs(req.body && req.body.release_at);
  const dueAt = toMs(req.body && req.body.due_at);

  // Correct answer:
  //   poll, poll_pie   -> { "index": N }
  //   poll_multi       -> { "indices": [a,b,...] }
  //   ordering         -> not stored (canonical order)
  //   else             -> null
  let correctAnswer = null;
  const ca = req.body && req.body.correct_answer;
  if (type === "poll" || type === "poll_pie") {
    const idx = ca && typeof ca.index === "number" ? ca.index : null;
    if (idx !== null) correctAnswer = JSON.stringify({ index: idx });
  } else if (type === "poll_multi") {
    const arr = ca && Array.isArray(ca.indices) ? ca.indices.filter(n => Number.isInteger(n)) : null;
    if (arr && arr.length) correctAnswer = JSON.stringify({ indices: arr });
  }

  const maxAttempts = normalizeMaxAttempts(req.body && req.body.max_attempts, 1);
  // Per-student assignment. Accepts one or more emails (comma / newline
  // separated). Empty / null = available to the whole class.
  const assignedTo = normalizeAssignedEmails(req.body && req.body.assigned_to_email);
  // show_results: defaults to 1 (visible to students). Pass false / 0 to hide.
  const showResults = req.body && (req.body.show_results === false || req.body.show_results === 0) ? 0 : 1;

  if (!prompt) return res.status(400).json({ ok: false, error: "Missing prompt" });
  const info = db.prepare(
    `INSERT INTO activities
       (prompt, status, asset_url, class_id, type, poll_options, difficulty,
        scheduled_at, session_tag, release_at, due_at, correct_answer,
        max_attempts, assigned_to_email, show_results, created_at)
     VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(prompt, assetUrl, classId, type, pollOptions, difficulty,
        scheduledAt, sessionTag, releaseAt, dueAt, correctAnswer,
        maxAttempts, assignedTo, showResults, Date.now());
  res.json({ ok: true, activity_id: info.lastInsertRowid });
  notifySSE();
});

activitiesRouter.patch("/admin/:id", requireInstructor, (req, res) => {
  // Every editable field is optional in the body. Anything absent stays at
  // the current value; anything explicitly null is treated as a clear.
  const {
    status, prompt, type, poll_options, difficulty, scheduled_at, class_id,
    session_tag, release_at, due_at, correct_answer, max_attempts,
    assigned_to_email, show_results,
  } = req.body;

  if (status && status !== "open" && status !== "closed") {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }

  try {
    const current = db.prepare("SELECT * FROM activities WHERE id = ?").get(req.params.id);
    if (!current) return res.status(404).json({ ok: false, error: "Not found" });

    const newStatus = status !== undefined ? status : current.status;
    const newPrompt = prompt !== undefined ? String(prompt).trim() : current.prompt;
    const newType = type !== undefined ? type : current.type;

    // poll_options applies to every option-bearing type; previously this
    // was gated on type==='poll' which silently dropped edits for
    // poll_pie / poll_multi / ordering.
    const optionTypes = new Set(["poll", "poll_pie", "poll_multi", "ordering"]);
    const newPollOptions = optionTypes.has(newType) && poll_options !== undefined
      ? JSON.stringify(poll_options)
      : current.poll_options;

    const newDifficulty = difficulty !== undefined ? difficulty : current.difficulty;
    const newScheduledAt = scheduled_at !== undefined ? scheduled_at : current.scheduled_at;
    const newClassId = class_id !== undefined ? class_id : current.class_id;

    // session_tag: undefined = leave alone, "" / null = clear, otherwise
    // must look like a valid slug.
    let newSessionTag = current.session_tag;
    if (session_tag === null || session_tag === "") newSessionTag = null;
    else if (typeof session_tag === "string") {
      const t = session_tag.trim().toLowerCase();
      if (/^[a-z0-9_-]{1,40}$/.test(t)) newSessionTag = t;
    }

    // Date fields: accept number (ms), ISO string, or explicit null.
    function asMs(v, fallback) {
      if (v === undefined) return fallback;
      if (v === null || v === "") return null;
      if (typeof v === "number") return v;
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? fallback : t;
    }
    const newReleaseAt = asMs(release_at, current.release_at);
    const newDueAt = asMs(due_at, current.due_at);

    // correct_answer JSON. Only meaningful for poll / poll_pie / poll_multi.
    let newCorrectAnswer = current.correct_answer;
    if (correct_answer === null) newCorrectAnswer = null;
    else if (correct_answer && typeof correct_answer === "object") {
      if (newType === "poll" || newType === "poll_pie") {
        const idx = typeof correct_answer.index === "number" ? correct_answer.index : null;
        newCorrectAnswer = idx !== null ? JSON.stringify({ index: idx }) : null;
      } else if (newType === "poll_multi") {
        const arr = Array.isArray(correct_answer.indices)
          ? correct_answer.indices.filter(n => Number.isInteger(n)) : null;
        newCorrectAnswer = arr && arr.length ? JSON.stringify({ indices: arr }) : null;
      }
    }

    const newMaxAttempts = normalizeMaxAttempts(max_attempts, current.max_attempts);

    // assigned_to_email: undefined = leave alone, "" / null = clear,
    // anything else = pass through the multi-email normalizer.
    let newAssignedTo = current.assigned_to_email;
    if (assigned_to_email === null) newAssignedTo = null;
    else if (typeof assigned_to_email === "string") {
      // An empty string clears the assignment; otherwise normalize.
      newAssignedTo = assigned_to_email.trim() === ""
        ? null
        : normalizeAssignedEmails(assigned_to_email);
    }

    // show_results: undefined = leave alone, else coerce to 0/1.
    let newShowResults = current.show_results;
    if (show_results !== undefined) {
      newShowResults = (show_results === false || show_results === 0 || show_results === "0") ? 0 : 1;
    }

    const info = db.prepare(`
      UPDATE activities SET
        status = ?, prompt = ?, type = ?, poll_options = ?,
        difficulty = ?, scheduled_at = ?, class_id = ?,
        session_tag = ?, release_at = ?, due_at = ?, correct_answer = ?,
        max_attempts = ?, assigned_to_email = ?, show_results = ?
      WHERE id = ?
    `).run(
      newStatus, newPrompt, newType, newPollOptions,
      newDifficulty, newScheduledAt, newClassId,
      newSessionTag, newReleaseAt, newDueAt, newCorrectAnswer,
      newMaxAttempts, newAssignedTo, newShowResults,
      req.params.id
    );

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

// Wipe every recorded response for this activity. Touches three tables:
//   - poll_votes        (poll / poll_pie / poll_multi)
//   - submissions       (word_cloud / ordering / submission)
//   - activity_attempts (the attempt counter; without resetting this
//     students stay locked out even though their answers are gone)
// The activity itself is preserved.
activitiesRouter.delete("/admin/:id/responses", requireInstructor, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: "Bad id" });
  const exists = db.prepare("SELECT 1 FROM activities WHERE id = ?").get(id);
  if (!exists) return res.status(404).json({ ok: false, error: "Not found" });

  const tx = db.transaction(() => {
    const v = db.prepare("DELETE FROM poll_votes        WHERE activity_id = ?").run(id);
    const s = db.prepare("DELETE FROM submissions       WHERE activity_id = ?").run(id);
    const a = db.prepare("DELETE FROM activity_attempts WHERE activity_id = ?").run(id);
    return { votes: v.changes, submissions: s.changes, attempts: a.changes };
  });
  const result = tx();
  res.json({ ok: true, ...result });
  notifySSE();
});

// Record an answer for a poll-style activity. Accepts either a single
// option_index (poll / poll_pie) or an array option_indices (poll_multi).
// Replaces the user's previous answer atomically.
activitiesRouter.post("/:id/vote", requireAuth, (req, res) => {
  const activityId = parseInt(req.params.id, 10);
  const { option_index, option_indices } = req.body || {};
  const indices = Array.isArray(option_indices)
    ? option_indices
    : (option_index !== undefined ? [option_index] : []);
  if (!indices.length) return res.status(400).json({ ok: false, error: "Option index required" });

  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(activityId);
  if (!activity) return res.status(404).json({ ok: false, error: "Activity not found" });
  if (!isAssignedTo(activity, req.user.email)) {
    return res.status(404).json({ ok: false, error: "Activity not found" });
  }

  try {
    ensureAttemptsRemaining(activity, req.user.email);
  } catch (err) {
    if (err.code === "ATTEMPTS_EXHAUSTED") {
      return res.status(409).json({
        ok: false, error: err.message,
        attempts_used: err.attempts_used,
        max_attempts: err.max_attempts,
      });
    }
    return res.status(500).json({ ok: false, error: err.message });
  }

  try {
    const tx = db.transaction((idxs) => {
      // Wipe previous answers so re-answering replaces them. Each call here
      // counts as ONE attempt regardless of how many options it carries.
      db.prepare("DELETE FROM poll_votes WHERE activity_id = ? AND email = ?")
        .run(activityId, req.user.email);
      const ins = db.prepare(
        "INSERT INTO poll_votes (activity_id, email, option_index, created_at) VALUES (?, ?, ?, ?)"
      );
      const now = Date.now();
      for (const i of idxs) ins.run(activityId, req.user.email, i, now);
    });
    tx(indices);
    const used = bumpAttempt(activityId, req.user.email);

    const isCorrect = gradeAnswer(activity, { poll_indices: indices });
    const reveal = shouldRevealCorrect(activity, isCorrect, used);
    res.json({
      ok: true,
      is_correct: isCorrect,
      // Withhold the right answer while attempts remain — otherwise a
      // multi-attempt cap leaks the answer on the first wrong guess.
      correct_answer: reveal ? exposeCorrectAnswer(activity) : null,
      attempts_used: used,
      max_attempts: activity.max_attempts,
    });
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
  // show_results gate: instructors and superadmins always see the tally
  // (they need it for the live-results view and the present-mode page).
  // Students only see it when the instructor has enabled show_results.
  const isInstructor = req.user.role === "instructor" || req.user.role === "superadmin";
  if (!isInstructor && activity.show_results !== 1) {
    return res.status(403).json({ ok: false, error: "Results are hidden by the instructor" });
  }

  const votes = db.prepare(
    "SELECT option_index, COUNT(*) as count FROM poll_votes WHERE activity_id = ? GROUP BY option_index"
  ).all(req.params.id);

  res.json({ ok: true, options: JSON.parse(activity.poll_options || "[]"), votes });
});
