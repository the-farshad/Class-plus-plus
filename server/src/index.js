import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { config } from "./config.js";
import { migrate, bootstrapInstructors } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { activitiesRouter } from "./routes/activities.js";
import { submissionsRouter } from "./routes/submissions.js";
import { rosterRouter } from "./routes/roster.js";
import { allowlistRouter } from "./routes/allowlist.js";
import { instructorsRouter } from "./routes/instructors.js";
import { classesRouter } from "./routes/classes.js";
import { requireInstructor } from "./auth.js";

migrate();
bootstrapInstructors();

const app = express();
app.disable("x-powered-by");

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl, server-to-server
    if (config.allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: false,
}));

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/activities", activitiesRouter);
app.use("/submissions", submissionsRouter);

// Local attachment access — instructors only.
app.use(
  "/uploads",
  requireInstructor,
  express.static(config.uploadDir, { fallthrough: false, index: false })
);

app.use("/admin/roster", rosterRouter);
app.use("/admin/allowlist", allowlistRouter);
app.use("/admin/instructors", instructorsRouter);
app.use("/admin/classes", classesRouter);

app.use((err, _req, res, _next) => {
  if (err && err.message && err.message.startsWith("CORS:")) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ ok: false, error: "File too large" });
  }
  console.error("unhandled error:", err);
  res.status(500).json({ ok: false, error: "Internal error" });
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`classpp-api listening on http://127.0.0.1:${config.port}`);
});
