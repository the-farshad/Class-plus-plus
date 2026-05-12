// Instructor-owned categories for grouping activities.
// Activities reference a category via activities.session_tag = slug.

import { Router } from "express";
import { db } from "../db.js";
import { requireInstructor } from "../auth.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireInstructor);

const SLUG_RE = /^[a-z0-9_-]{1,40}$/;

categoriesRouter.get("/", (req, res) => {
  const rows = db.prepare(`
    SELECT c.slug, c.name, c.position, c.created_at,
      (SELECT COUNT(*) FROM activities a
        JOIN classes cl ON cl.id = a.class_id
        WHERE a.session_tag = c.slug AND cl.instructor_email = c.instructor_email
      ) AS activity_count
    FROM categories c
    WHERE c.instructor_email = ?
    ORDER BY c.position, c.name
  `).all(req.user.email);
  res.json({ ok: true, categories: rows });
});

categoriesRouter.post("/", (req, res) => {
  const slug = String(req.body?.slug || "").trim().toLowerCase();
  const name = String(req.body?.name || "").trim();
  const position = Number.isInteger(req.body?.position) ? req.body.position : null;
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ ok: false, error: "slug must be 1–40 chars, [a-z0-9_-]" });
  }
  if (!name) return res.status(400).json({ ok: false, error: "name is required" });
  try {
    const finalPos = position == null
      ? (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories WHERE instructor_email = ?")
          .get(req.user.email).p)
      : position;
    db.prepare(
      "INSERT INTO categories (instructor_email, slug, name, position, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(req.user.email, slug, name, finalPos, Date.now());
    res.json({ ok: true, slug, name, position: finalPos });
  } catch (err) {
    if (/UNIQUE/.test(err.message)) {
      return res.status(409).json({ ok: false, error: "A category with that slug already exists" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

categoriesRouter.patch("/:slug", (req, res) => {
  const slug = req.params.slug;
  const cat = db.prepare("SELECT * FROM categories WHERE instructor_email = ? AND slug = ?")
    .get(req.user.email, slug);
  if (!cat) return res.status(404).json({ ok: false, error: "Not found" });

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : cat.name;
  const position = Number.isInteger(req.body?.position) ? req.body.position : cat.position;
  if (!name) return res.status(400).json({ ok: false, error: "name cannot be empty" });

  db.prepare(
    "UPDATE categories SET name = ?, position = ? WHERE instructor_email = ? AND slug = ?"
  ).run(name, position, req.user.email, slug);
  res.json({ ok: true });
});

categoriesRouter.delete("/:slug", (req, res) => {
  const slug = req.params.slug;
  const tx = db.transaction(() => {
    // Clear the tag on every activity that referenced this category in any
    // class this instructor owns. Activities themselves are NOT deleted.
    db.prepare(`
      UPDATE activities SET session_tag = NULL
      WHERE session_tag = ?
        AND class_id IN (SELECT id FROM classes WHERE instructor_email = ?)
    `).run(slug, req.user.email);
    const r = db.prepare("DELETE FROM categories WHERE instructor_email = ? AND slug = ?")
      .run(req.user.email, slug);
    return r.changes;
  });
  const changes = tx();
  if (!changes) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
});

// Bulk update every activity in a category: status (open/closed) and/or
// release_at / due_at. Each field is optional. Scoped to this instructor's
// classes so an instructor can never touch another's data.
categoriesRouter.post("/:slug/bulk", (req, res) => {
  const slug = req.params.slug;
  const cat = db.prepare("SELECT 1 FROM categories WHERE instructor_email = ? AND slug = ?")
    .get(req.user.email, slug);
  if (!cat) return res.status(404).json({ ok: false, error: "Category not found" });

  const sets = [];
  const params = [];
  if (req.body?.status === "open" || req.body?.status === "closed") {
    sets.push("status = ?"); params.push(req.body.status);
  }
  function asMs(v) {
    if (v === null) return null;            // explicit clear
    if (v === undefined) return undefined;  // absent — don't touch
    if (typeof v === "number") return v;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  const rel = asMs(req.body?.release_at);
  if (rel !== undefined) { sets.push("release_at = ?"); params.push(rel); }
  const due = asMs(req.body?.due_at);
  if (due !== undefined) { sets.push("due_at = ?"); params.push(due); }

  // max_attempts: absent = leave alone, null/0 = unlimited, N>=1 = cap
  if (req.body && req.body.max_attempts !== undefined) {
    const v = req.body.max_attempts;
    if (v === null || v === 0 || v === "" || v === "0") {
      sets.push("max_attempts = NULL");
    } else {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1) {
        sets.push("max_attempts = ?"); params.push(Math.min(Math.floor(n), 999));
      }
    }
  }

  if (!sets.length) return res.status(400).json({ ok: false, error: "Nothing to update" });

  const sql = `
    UPDATE activities SET ${sets.join(", ")}
    WHERE session_tag = ?
      AND class_id IN (SELECT id FROM classes WHERE instructor_email = ?)
  `;
  params.push(slug, req.user.email);
  const r = db.prepare(sql).run(...params);
  res.json({ ok: true, updated: r.changes });
});
