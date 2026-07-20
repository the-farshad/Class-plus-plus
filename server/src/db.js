import Database from "libsql";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// Connect to Turso (managed libSQL) when configured, else a local file for dev.
// libsql exposes a *synchronous* API that is a drop-in for better-sqlite3, so
// every prepared statement / transaction elsewhere in the app is unchanged.
export const db = config.tursoUrl
  ? new Database(config.tursoUrl, { authToken: config.tursoAuthToken })
  : localFileDb();

function localFileDb() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const d = new Database(config.dbPath);
  try { d.pragma("journal_mode = WAL"); } catch { /* not applicable to remote */ }
  return d;
}

fs.mkdirSync(config.uploadDir, { recursive: true });

// SQLite defaults foreign keys OFF; the schema relies on ON DELETE CASCADE etc.
try { db.pragma("foreign_keys = ON"); } catch { /* ignore if unsupported */ }

// libsql annotates single-row `.get()` results with an enumerable `_metadata`
// field (query timing). better-sqlite3 does not, and several routes return rows
// straight to `res.json()`, so strip it centrally to keep responses identical.
const _prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = _prepare(sql);
  const _get = stmt.get.bind(stmt);
  stmt.get = (...args) => {
    const row = _get(...args);
    if (row && typeof row === "object" && "_metadata" in row) delete row._metadata;
    return row;
  };
  return stmt;
};

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((r) => r.name)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insert = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)"
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const runMigration = db.transaction(() => {
      db.exec(sql);
      insert.run(file, Date.now());
    });
    runMigration();
    console.log(`migrated: ${file}`);
  }
}

export function bootstrapInstructors() {
  if (!config.initialInstructors.length) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO instructors (email, role) VALUES (?, ?)"
  );
  const update = db.prepare(
    "UPDATE instructors SET role = ? WHERE email = ?"
  );
  for (const email of config.initialInstructors) {
    const e = email.toLowerCase();
    // For now, we make all initial instructors superadmins so they can bootstrap the system.
    stmt.run(e, "superadmin");
    update.run("superadmin", e);
  }
}
