import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
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

// ---------- Microsoft / Azure AD ID token verification ----------
// Lazily constructed because microsoftClientId may be empty when MS auth
// isn't configured. If it is, we set up a JWKS client pointed at the right
// tenant's discovery endpoint and reuse it across requests.
let msJwks = null;
function getMsJwks() {
  if (!config.microsoftClientId) return null;
  if (msJwks) return msJwks;
  const tenant = config.microsoftTenantId || "common";
  msJwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxEntries: 10,
    cacheMaxAge: 24 * 60 * 60 * 1000, // 24h — JWKS rotates rarely
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
  return msJwks;
}

function getMsSigningKey(header, cb) {
  const client = getMsJwks();
  if (!client) return cb(new Error("Microsoft auth is not configured on the server"));
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    cb(null, key.getPublicKey());
  });
}

export async function verifyMicrosoftIdToken(idToken) {
  if (!config.microsoftClientId) {
    throw new Error("Microsoft sign-in is not enabled on this server");
  }
  // The issuer claim from Microsoft is always
  //   https://login.microsoftonline.com/{tenant_guid_in_token}/v2.0
  // For "common"/"organizations" tenant we can't pin a single issuer string,
  // so we verify signature + audience and then accept any v2.0 MS issuer.
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getMsSigningKey,
      {
        audience: config.microsoftClientId,
        algorithms: ["RS256"],
      },
      (err, payload) => {
        if (err) return reject(err);
        const iss = String(payload.iss || "");
        if (!iss.startsWith("https://login.microsoftonline.com/") || !iss.endsWith("/v2.0")) {
          return reject(new Error("Unexpected token issuer"));
        }
        // Microsoft puts the user's email in `preferred_username` for work
        // and school accounts. Fall back to `email` if present, then `upn`.
        const email = (payload.preferred_username || payload.email || payload.upn || "").toLowerCase();
        if (!email) return reject(new Error("Token has no email/upn"));
        resolve({ ...payload, email, name: payload.name || null });
      }
    );
  });
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
