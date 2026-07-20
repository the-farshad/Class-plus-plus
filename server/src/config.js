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
  // Microsoft / Azure AD OAuth (optional — only enabled when both vars are set)
  // MICROSOFT_CLIENT_ID = the Application (client) ID of your Azure AD app
  // MICROSOFT_TENANT_ID = your tenant GUID (or "common" for any work/school
  // account, or "organizations" for any work/school tenant). For UWYO, use
  // their tenant GUID for tighter security.
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || "",
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID || "common",
  allowedDomain: process.env.ALLOWED_DOMAIN || "uwyo.edu",
  jwtSecret: required("JWT_SECRET"),

  // Turso (managed libSQL). When TURSO_DATABASE_URL is set the app uses the
  // remote DB and dbPath / journal settings are ignored; leave both unset for a
  // local ./data.db (dev / self-host on a box with a persistent disk).
  tursoUrl: process.env.TURSO_DATABASE_URL || "",
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || "",

  dbPath: path.resolve(process.env.DB_PATH || "./data.db"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "./uploads"),
  driveThresholdBytes: int("DRIVE_THRESHOLD_BYTES", 5 * 1024 * 1024),
  maxUploadBytes: int("MAX_UPLOAD_BYTES", 200 * 1024 * 1024),

  // Drive service-account credentials. Prefer the inline JSON env
  // (serverless-friendly — no file on disk); fall back to a key file locally.
  driveServiceAccountJson: process.env.GOOGLE_DRIVE_SA_JSON || "",
  driveKeyPath: process.env.DRIVE_KEY_PATH || "",
  driveFolderId: process.env.DRIVE_FOLDER_ID || "",

  initialInstructors: list("INITIAL_INSTRUCTORS"),
};
