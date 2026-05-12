import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db.js";
import { requireInstructor, setPassword, generateTempPassword, hasPassword } from "../auth.js";

export const classesRouter = Router();

// Unambiguous code alphabet (no 0/O/1/I/L) — easier to copy off a projector.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateJoinCode(len = 6) {
  const b = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return out;
}

classesRouter.use(requireInstructor);

classesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM classes ORDER BY created_at DESC").all();
  res.json({ ok: true, classes: rows });
});

classesRouter.post("/", (req, res) => {
  const { name, code, semester } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: "Name is required" });

  try {
    // Generate a unique join_code (very unlikely collision but retry once).
    let joinCode = generateJoinCode();
    if (db.prepare("SELECT 1 FROM classes WHERE join_code = ?").get(joinCode)) {
      joinCode = generateJoinCode();
    }
    const info = db.prepare(
      "INSERT INTO classes (name, code, semester, instructor_email, join_code, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(name, code || null, semester || null, req.user.email, joinCode, Date.now());
    res.json({ ok: true, class_id: info.lastInsertRowid, join_code: joinCode });
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

// Global Roster Export
classesRouter.get("/admin/global-roster", (req, res) => {
  const rows = db.prepare(`
    SELECT cs.student_email, cs.student_id, c.code as class_code, c.name as class_name 
    FROM class_students cs
    LEFT JOIN classes c ON cs.class_id = c.id
    ORDER BY cs.student_email ASC
  `).all();
  res.json({ ok: true, roster: rows });
});

// Class Roster
classesRouter.get("/:id/students", (req, res) => {
  // Students plus per-student counts: how many submissions and poll
  // votes they've made for activities in THIS class. Plus whether they
  // have a password set (so the roster UI can show a green/red dot).
  const sql = `
    SELECT
      cs.student_email, cs.student_id, cs.student_name,
      (SELECT COUNT(DISTINCT s.activity_id)
         FROM submissions s
         JOIN activities a ON a.id = s.activity_id
         WHERE s.email = cs.student_email AND a.class_id = cs.class_id
      ) AS submission_count,
      (SELECT COUNT(DISTINCT pv.activity_id)
         FROM poll_votes pv
         JOIN activities a ON a.id = pv.activity_id
         WHERE pv.email = cs.student_email AND a.class_id = cs.class_id
      ) AS vote_count,
      EXISTS(SELECT 1 FROM user_passwords up WHERE up.email = cs.student_email) AS has_password
    FROM class_students cs
    WHERE cs.class_id = ?
    ORDER BY cs.student_email
  `;
  const rows = db.prepare(sql).all(req.params.id);
  res.json({ ok: true, students: rows });
});

// ---------- Detail / export helpers ----------

// Decide whether a single student answer matches the canonical correct
// answer for an activity. Returns true / false / null (null = ungraded).
function gradeAnswer(activity, studentAnswerObj) {
  const correct = activity.correct_answer ? JSON.parse(activity.correct_answer) : null;
  const opts = activity.poll_options ? JSON.parse(activity.poll_options) : null;
  if (activity.type === "poll" || activity.type === "poll_pie") {
    if (!correct || correct.index == null) return null;
    if (!studentAnswerObj || studentAnswerObj.poll_indices == null) return null;
    return studentAnswerObj.poll_indices.length === 1 &&
           studentAnswerObj.poll_indices[0] === correct.index;
  }
  if (activity.type === "poll_multi") {
    if (!correct || !Array.isArray(correct.indices)) return null;
    if (!studentAnswerObj || !Array.isArray(studentAnswerObj.poll_indices)) return null;
    const a = new Set(correct.indices), b = new Set(studentAnswerObj.poll_indices);
    return a.size === b.size && [...a].every(x => b.has(x));
  }
  if (activity.type === "ordering") {
    if (!opts || !studentAnswerObj || !studentAnswerObj.submission) return null;
    const canonical = opts.map((_, i) => String(i)).join(",");
    return studentAnswerObj.submission.trim() === canonical;
  }
  // word_cloud / submission — never auto-graded.
  return null;
}

// Pull every student answer for one (class, email). Returns:
//   Map<activity_id, { poll_indices?: [...], submission?: "…", submitted_at: N }>
function loadStudentAnswers(classId, email) {
  const subs = db.prepare(`
    SELECT s.activity_id, s.response, s.created_at
      FROM submissions s
      JOIN activities a ON a.id = s.activity_id
     WHERE s.email = ? AND a.class_id = ?
  `).all(email, classId);
  const votes = db.prepare(`
    SELECT pv.activity_id, pv.option_index, pv.created_at
      FROM poll_votes pv
      JOIN activities a ON a.id = pv.activity_id
     WHERE pv.email = ? AND a.class_id = ?
  `).all(email, classId);

  const m = new Map();
  for (const s of subs) {
    m.set(s.activity_id, { submission: s.response, submitted_at: s.created_at });
  }
  for (const v of votes) {
    const cur = m.get(v.activity_id) || {};
    cur.poll_indices = cur.poll_indices || [];
    cur.poll_indices.push(v.option_index);
    cur.submitted_at = Math.max(cur.submitted_at || 0, v.created_at);
    m.set(v.activity_id, cur);
  }
  return m;
}

// GET /admin/classes/:id/students/:email/detail
// Returns the student's activity-by-activity breakdown for this class.
classesRouter.get("/:id/students/:email/detail", (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const student = db.prepare(
    "SELECT * FROM class_students WHERE class_id = ? AND student_email = ?"
  ).get(req.params.id, email);
  if (!student) return res.status(404).json({ ok: false, error: "Not in this class" });

  const activities = db.prepare(`
    SELECT id AS activity_id, prompt, type, status, session_tag, poll_options, correct_answer
      FROM activities WHERE class_id = ? ORDER BY id
  `).all(req.params.id);

  const answers = loadStudentAnswers(req.params.id, email);
  let total = 0, correct = 0, ungraded = 0;
  const rows = activities.map(a => {
    const ans = answers.get(a.activity_id) || null;
    const has = !!ans;
    if (has) total++;
    const ok = has ? gradeAnswer(a, ans) : null;
    if (ok === true) correct++;
    if (has && ok === null) ungraded++;
    return {
      activity_id: a.activity_id,
      prompt: a.prompt,
      type: a.type,
      status: a.status,
      session_tag: a.session_tag,
      poll_options: a.poll_options ? JSON.parse(a.poll_options) : null,
      correct_answer: a.correct_answer ? JSON.parse(a.correct_answer) : null,
      answered: has,
      student_answer: ans,
      is_correct: ok,
      submitted_at: ans ? ans.submitted_at : null,
    };
  });

  res.json({
    ok: true,
    student,
    totals: { total_answered: total, correct, ungraded, total_activities: activities.length },
    activities: rows,
  });
});

// GET /admin/classes/:id/detail
// Per-activity aggregate for the whole class: responders, correct, accuracy.
classesRouter.get("/:id/detail", (req, res) => {
  const cls = db.prepare("SELECT * FROM classes WHERE id = ?").get(req.params.id);
  if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });

  const totalStudents = db.prepare(
    "SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?"
  ).get(req.params.id).n;

  const activities = db.prepare(`
    SELECT id AS activity_id, prompt, type, status, session_tag, poll_options, correct_answer, created_at
      FROM activities WHERE class_id = ? ORDER BY id
  `).all(req.params.id);

  const result = activities.map(a => {
    // Get every student who answered this activity (deduped via Set).
    const emailsSet = new Set();
    db.prepare("SELECT DISTINCT email FROM submissions WHERE activity_id = ?")
      .all(a.activity_id).forEach(r => emailsSet.add(r.email));
    db.prepare("SELECT DISTINCT email FROM poll_votes WHERE activity_id = ?")
      .all(a.activity_id).forEach(r => emailsSet.add(r.email));
    const emails = [...emailsSet];

    let correct = 0, ungraded = 0;
    for (const e of emails) {
      const ans = loadStudentAnswers(req.params.id, e).get(a.activity_id);
      const ok = ans ? gradeAnswer(a, ans) : null;
      if (ok === true) correct++;
      if (ans && ok === null) ungraded++;
    }
    return {
      activity_id: a.activity_id,
      prompt: a.prompt,
      type: a.type,
      status: a.status,
      session_tag: a.session_tag,
      responders: emails.length,
      correct,
      ungraded,
      accuracy_pct: (emails.length - ungraded) > 0
        ? Math.round(100 * correct / (emails.length - ungraded))
        : null,
    };
  });

  res.json({ ok: true, class: cls, total_students: totalStudents, activities: result });
});

// GET /admin/classes/:id/export
// Comprehensive CSV of every student × every activity they answered.
classesRouter.get("/:id/export", (req, res) => {
  const cls = db.prepare("SELECT * FROM classes WHERE id = ?").get(req.params.id);
  if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });

  const students = db.prepare(
    "SELECT student_email, student_id, student_name FROM class_students WHERE class_id = ? ORDER BY student_email"
  ).all(req.params.id);

  const activities = db.prepare(`
    SELECT id AS activity_id, prompt, type, session_tag, poll_options, correct_answer
      FROM activities WHERE class_id = ? ORDER BY id
  `).all(req.params.id);

  const esc = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const header = [
    "student_email", "student_name", "student_id",
    "activity_id", "week", "type", "prompt",
    "answered", "student_answer", "correct_answer", "is_correct", "submitted_at",
  ];
  const lines = [header.join(",")];

  for (const s of students) {
    const answers = loadStudentAnswers(req.params.id, s.student_email);
    for (const a of activities) {
      const ans = answers.get(a.activity_id);
      const correct = a.correct_answer ? JSON.parse(a.correct_answer) : null;
      const opts = a.poll_options ? JSON.parse(a.poll_options) : null;

      // Render student answer + correct answer as readable strings
      let saStr = "", caStr = "";
      if (ans) {
        if (ans.poll_indices) {
          const sorted = [...ans.poll_indices].sort();
          saStr = sorted.map(i => (opts && opts[i]) ? `${i}:${opts[i]}` : i).join(" | ");
        } else if (ans.submission != null) {
          saStr = ans.submission;
        }
      }
      if (correct) {
        if (correct.index != null) caStr = opts ? `${correct.index}:${opts[correct.index]}` : correct.index;
        else if (Array.isArray(correct.indices)) {
          caStr = correct.indices.map(i => opts ? `${i}:${opts[i]}` : i).join(" | ");
        }
      } else if (a.type === "ordering" && opts) {
        caStr = opts.map((_, i) => i).join(",");
      }

      const ok = ans ? gradeAnswer(a, ans) : null;
      const okStr = ok === true ? "1" : ok === false ? "0" : "";

      lines.push([
        s.student_email, s.student_name || "", s.student_id || "",
        a.activity_id, a.session_tag || "", a.type, a.prompt,
        ans ? "1" : "0", saStr, caStr, okStr,
        ans && ans.submitted_at ? new Date(ans.submitted_at).toISOString() : "",
      ].map(esc).join(","));
    }
  }

  const fname = `class-${(cls.code || cls.id).toString().replace(/\s+/g, "_")}-export-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.send(lines.join("\n"));
});

// Aggregate class stats: per-activity participation counts.
classesRouter.get("/:id/stats", (req, res) => {
  const totalStudents = db.prepare(
    "SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?"
  ).get(req.params.id).n;

  const acts = db.prepare(`
    SELECT a.id, a.prompt, a.type, a.status, a.session_tag,
      COALESCE((SELECT COUNT(DISTINCT email) FROM submissions  WHERE activity_id = a.id), 0)
      + COALESCE((SELECT COUNT(DISTINCT email) FROM poll_votes WHERE activity_id = a.id), 0)
        AS unique_responders
    FROM activities a
    WHERE a.class_id = ?
    ORDER BY a.id DESC
  `).all(req.params.id);

  res.json({ ok: true, total_students: totalStudents, activities: acts });
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

classesRouter.post("/:id/students/bulk", (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students)) return res.status(400).json({ ok: false, error: "Expected an array of students" });
  
  try {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO class_students (class_id, student_email, student_id) VALUES (?, ?, ?)"
    );
    const insertMany = db.transaction((stds) => {
      let count = 0;
      for (const s of stds) {
        if (!s.email) continue;
        stmt.run(req.params.id, s.email.toLowerCase(), s.student_id || null);
        count++;
      }
      return count;
    });
    
    const added = insertMany(students);
    res.json({ ok: true, added });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk-generate passwords for every student in the class. By default only
// students who don't already have a password get a new one (so re-running
// is safe). Pass ?rotate=1 to overwrite every existing password.
// Returns the plaintext passwords ONCE — instructor must copy/distribute now.
classesRouter.post("/:id/students/bulk-passwords", (req, res) => {
  try {
    const rotate = req.query && req.query.rotate === "1";
    const students = db.prepare(
      "SELECT student_email, student_name FROM class_students WHERE class_id = ?"
    ).all(req.params.id);
    if (!students.length) return res.json({ ok: true, generated: [], skipped: 0 });

    const generated = [];
    let skipped = 0;
    for (const s of students) {
      if (!rotate && hasPassword(s.student_email)) { skipped++; continue; }
      const password = generateTempPassword(12);
      setPassword(s.student_email, password, req.user.email, /* must_change */ 0);
      generated.push({
        email: s.student_email,
        name: s.student_name || "",
        password,
      });
    }
    res.json({ ok: true, generated, skipped });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Generate (or rotate) a temporary password for a student in this class.
// Returns the plaintext password ONCE — the admin must copy it now.
classesRouter.post("/:id/students/:email/password", (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    // Sanity: student must be in this class roster before we issue a credential.
    const row = db.prepare(
      "SELECT 1 FROM class_students WHERE class_id = ? AND student_email = ?"
    ).get(req.params.id, email);
    if (!row) return res.status(404).json({ ok: false, error: "Student not in this class" });

    const password = generateTempPassword(12);
    setPassword(email, password, req.user.email, /* must_change */ 0);
    res.json({ ok: true, email, password });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reports whether a given student already has a password set, so the
// roster UI can show "Generate" vs. "Rotate".
classesRouter.get("/:id/students/:email/password-status", (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  res.json({ ok: true, has_password: hasPassword(email) });
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
