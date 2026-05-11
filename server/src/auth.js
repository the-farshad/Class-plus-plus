import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { db } from "./db.js";

const oauth = new OAuth2Client(config.googleClientId);

export async function verifyGoogleIdToken(idToken) {
  const ticket = await oauth.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email_verified) {
    throw new Error("Email not verified");
  }
  return payload;
}

export function emailIsAllowed(email) {
  const e = email.toLowerCase();
  if (e.endsWith(`@${config.allowedDomain.toLowerCase()}`)) return true;
  const allow = db.prepare("SELECT 1 FROM allowlist WHERE email = ?").get(e);
  if (allow) return true;
  const inst = db.prepare("SELECT 1 FROM instructors WHERE email = ?").get(e);
  if (inst) return true;
  return false;
}

export function roleFor(email) {
  const e = email.toLowerCase();
  const inst = db.prepare("SELECT role FROM instructors WHERE email = ?").get(e);
  return inst ? inst.role : "student";
}

export function studentIdFor(email) {
  const row = db.prepare("SELECT student_id FROM roster WHERE email = ? AND active = 1")
    .get(email.toLowerCase());
  return row ? row.student_id : null;
}

export function issueAppJwt({ email, role }) {
  return jwt.sign(
    { sub: email.toLowerCase(), role },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: "4h" }
  );
}

function readBearer(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const claims = readBearer(req);
  if (!claims) return res.status(401).json({ ok: false, error: "Unauthorized" });
  req.user = { email: claims.sub, role: claims.role };
  next();
}

export function requireInstructor(req, res, next) {
  const claims = readBearer(req);
  if (!claims) return res.status(401).json({ ok: false, error: "Unauthorized" });
  if (claims.role !== "instructor" && claims.role !== "superadmin") {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  req.user = { email: claims.sub, role: claims.role };
  next();
}

export function requireSuperAdmin(req, res, next) {
  const claims = readBearer(req);
  if (!claims) return res.status(401).json({ ok: false, error: "Unauthorized" });
  if (claims.role !== "superadmin") {
    return res.status(403).json({ ok: false, error: "Forbidden: Superadmin access required" });
  }
  req.user = { email: claims.sub, role: claims.role };
  next();
}
