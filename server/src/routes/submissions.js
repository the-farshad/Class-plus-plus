import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireAuth, requireInstructor, studentIdFor } from "../auth.js";
import { persistUpload } from "../storage.js";

export const submissionsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

const submitLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
});

submissionsRouter.post(
  "/",
  requireAuth,
  submitLimiter,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const activityId = parseInt(String(req.body.activity_id || ""), 10);
      const response = String(req.body.response || "").trim();
      if (!activityId || !response) {
        return res.status(400).json({ ok: false, error: "Missing activity_id or response" });
      }

      const activity = db.prepare(
        "SELECT id, status FROM activities WHERE id = ?"
      ).get(activityId);
      if (!activity) return res.status(404).json({ ok: false, error: "Activity not found" });
      if (activity.status !== "open") {
        return res.status(409).json({ ok: false, error: "Activity is closed" });
      }

      let attachmentLocal = null;
      let attachmentMime = null;
      let driveFileId = null;
      let driveUrl = null;

      if (req.file) {
        const stored = await persistUpload(req.file);
        attachmentMime = stored.mime;
        if (stored.kind === "local") {
          attachmentLocal = stored.path;
        } else {
          driveFileId = stored.file_id;
          driveUrl = stored.url;
        }
      }

      const studentId = studentIdFor(req.user.email);

      const info = db.prepare(`
        INSERT INTO submissions
          (activity_id, email, student_id, response,
           attachment_local, attachment_mime, drive_file_id, drive_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        activityId, req.user.email, studentId, response,
        attachmentLocal, attachmentMime, driveFileId, driveUrl, Date.now()
      );

      res.json({ ok: true, submission_id: info.lastInsertRowid });
    } catch (err) {
      if (err.status === 415) {
        return res.status(415).json({ ok: false, error: err.message });
      }
      next(err);
    }
  }
);

submissionsRouter.get(
  "/by-activity/:activityId",
  requireInstructor,
  (req, res) => {
    const rows = db.prepare(`
      SELECT id, activity_id, email, student_id, response,
             attachment_local, attachment_mime, drive_file_id, drive_url, created_at
      FROM submissions
      WHERE activity_id = ?
      ORDER BY id DESC
    `).all(req.params.activityId);
    res.json({ ok: true, submissions: rows });
  }
);
