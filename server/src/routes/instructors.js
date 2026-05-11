import { Router } from "express";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";

export const instructorsRouter = Router();

// All routes here require superadmin access
instructorsRouter.use(requireSuperAdmin);

instructorsRouter.get("/", (req, res) => {
  const list = db.prepare("SELECT email, role FROM instructors ORDER BY email ASC").all();
  res.json({ ok: true, instructors: list });
});

instructorsRouter.post("/", (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  
  const targetRole = role === "superadmin" ? "superadmin" : "instructor";
  
  try {
    db.prepare("INSERT OR REPLACE INTO instructors (email, role) VALUES (?, ?)")
      .run(email.toLowerCase(), targetRole);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

instructorsRouter.delete("/:email", (req, res) => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ ok: false, error: "Email required" });
  
  // Prevent deleting oneself
  if (email.toLowerCase() === req.user.email.toLowerCase()) {
    return res.status(400).json({ ok: false, error: "Cannot remove yourself" });
  }

  try {
    db.prepare("DELETE FROM instructors WHERE email = ?").run(email.toLowerCase());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
