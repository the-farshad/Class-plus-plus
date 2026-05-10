import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { uploadToDrive } from "./drive.js";

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf",
]);

function safeExt(name) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.length > 1 && ext.length <= 6 ? ext : "";
}

function shouldUseDrive(file) {
  if (file.mimetype.startsWith("video/")) return true;
  return file.size > config.driveThresholdBytes;
}

/**
 * Persist an uploaded file. Returns one of:
 *   { kind: "local", path: "<uuid.ext>", mime }
 *   { kind: "drive", file_id, url, mime }
 */
export async function persistUpload(file) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    const err = new Error(`Unsupported file type: ${file.mimetype}`);
    err.status = 415;
    throw err;
  }

  if (shouldUseDrive(file)) {
    const { file_id, web_view_link } = await uploadToDrive(
      file.buffer, file.originalname, file.mimetype
    );
    return { kind: "drive", file_id, url: web_view_link, mime: file.mimetype };
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = crypto.randomUUID() + safeExt(file.originalname);
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer, { mode: 0o640 });
  return { kind: "local", path: name, mime: file.mimetype };
}
