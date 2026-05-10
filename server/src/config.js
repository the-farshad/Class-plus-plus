import "dotenv/config";
import path from "node:path";

function required(name) {
  const v = process.env[name];
  if (!v || v.startsWith("REPLACE_ME")) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer`);
  return n;
}

function list(name, fallback = []) {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: int("PORT", 3001),
  allowedOrigins: list("ALLOWED_ORIGINS", ["http://localhost:8000"]),

  googleClientId: required("GOOGLE_CLIENT_ID"),
  allowedDomain: process.env.ALLOWED_DOMAIN || "uwyo.edu",
  jwtSecret: required("JWT_SECRET"),

  dbPath: path.resolve(process.env.DB_PATH || "./data.db"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "./uploads"),
  driveThresholdBytes: int("DRIVE_THRESHOLD_BYTES", 5 * 1024 * 1024),
  maxUploadBytes: int("MAX_UPLOAD_BYTES", 200 * 1024 * 1024),

  driveKeyPath: process.env.DRIVE_KEY_PATH || "",
  driveFolderId: process.env.DRIVE_FOLDER_ID || "",

  initialInstructors: list("INITIAL_INSTRUCTORS"),
};
