import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    db.exec("BEGIN");
    try {
      db.exec(sql);
      insert.run(file, Date.now());
      db.exec("COMMIT");
      console.log(`migrated: ${file}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function bootstrapInstructors() {
  if (!config.initialInstructors.length) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO instructors (email) VALUES (?)"
  );
  for (const email of config.initialInstructors) {
    stmt.run(email.toLowerCase());
  }
}
