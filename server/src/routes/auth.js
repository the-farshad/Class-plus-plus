import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import {
  verifyGoogleIdToken, emailIsAllowed, roleFor, issueAppJwt,
} from "../auth.js";

export const authRouter = Router();

authRouter.get("/config", (_req, res) => {
  res.json({
    ok: true,
    google_client_id: config.googleClientId,
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
