import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import {
  verifyGoogleIdToken, verifyMicrosoftIdToken,
  verifyEmailPassword, emailIsAllowed, roleFor, issueAppJwt,
} from "../auth.js";

export const authRouter = Router();

authRouter.get("/config", (_req, res) => {
  res.json({
    ok: true,
    google_client_id: config.googleClientId,
    // Empty string when Microsoft sign-in isn't configured on the server —
    // the client checks for a truthy value before showing the MS button.
    microsoft_client_id: config.microsoftClientId,
    microsoft_tenant_id: config.microsoftTenantId,
    allowed_domain: config.allowedDomain,
  });
});

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
});

authRouter.post("/google", limiter, async (req, res) => {
  const idToken = req.body && req.body.id_token;
  if (!idToken) return res.status(400).json({ ok: false, error: "Missing id_token" });
  try {
    const payload = await verifyGoogleIdToken(idToken);
    const email = payload.email;
    if (!emailIsAllowed(email)) {
      return res.status(403).json({ ok: false, error: "Email not authorized" });
    }
    const role = roleFor(email);
    const token = issueAppJwt({ email, role });
    res.json({
      ok: true,
      token,
      user: { email: email.toLowerCase(), role, name: payload.name || null },
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || "Verification failed" });
  }
});

// Email + admin-generated password sign-in.
// The instructor creates a temp password for a student via the dashboard;
// the student then signs in here with their email + that password.
authRouter.post("/password", limiter, (req, res) => {
  const email = (req.body && req.body.email || "").trim().toLowerCase();
  const password = req.body && req.body.password;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required" });
  }
  if (!emailIsAllowed(email)) {
    return res.status(403).json({ ok: false, error: "Email not authorized" });
  }
  if (!verifyEmailPassword(email, password)) {
    return res.status(401).json({ ok: false, error: "Invalid email or password" });
  }
  const role = roleFor(email);
  const token = issueAppJwt({ email, role });
  res.json({
    ok: true,
    token,
    user: { email, role, name: null },
  });
});

// Microsoft / Azure AD sign-in (the path UWYO students will use, since UWYO
// is on Microsoft 365). Same shape and same emailIsAllowed gate as Google.
authRouter.post("/microsoft", limiter, async (req, res) => {
  const idToken = req.body && req.body.id_token;
  if (!idToken) return res.status(400).json({ ok: false, error: "Missing id_token" });
  if (!config.microsoftClientId) {
    return res.status(503).json({ ok: false, error: "Microsoft sign-in not configured" });
  }
  try {
    const payload = await verifyMicrosoftIdToken(idToken);
    const email = payload.email;
    if (!emailIsAllowed(email)) {
      return res.status(403).json({ ok: false, error: "Email not authorized" });
    }
    const role = roleFor(email);
    const token = issueAppJwt({ email, role });
    res.json({
      ok: true,
      token,
      user: { email: email.toLowerCase(), role, name: payload.name || null },
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || "Verification failed" });
  }
});
