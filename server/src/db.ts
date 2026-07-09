import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data.sqlite3");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    purpose TEXT NOT NULL,
    dates TEXT NOT NULL,
    start_hour INTEGER NOT NULL,
    end_hour INTEGER NOT NULL,
    dur INTEGER NOT NULL,
    required TEXT NOT NULL DEFAULT '[]',
    final TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id TEXT NOT NULL REFERENCES polls(id),
    name TEXT NOT NULL,
    marks TEXT NOT NULL,
    submitted_at INTEGER NOT NULL
  );
`);

const responseColumns = db.prepare("PRAGMA table_info(responses)").all() as { name: string }[];
if (!responseColumns.some((c) => c.name === "password_hash")) {
  db.exec("ALTER TABLE responses ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}

// Same-named participants (동명이인) are distinguished by id + password, not by name,
// so the old UNIQUE(poll_id, name) constraint has to go. SQLite can't drop a
// constraint in place, so rebuild the table without it when it's still present.
const responseTableSql = (
  db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'responses'").get() as
    | { sql: string }
    | undefined
)?.sql;
if (responseTableSql?.includes("UNIQUE(poll_id, name)")) {
  db.exec(`
    CREATE TABLE responses_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id TEXT NOT NULL REFERENCES polls(id),
      name TEXT NOT NULL,
      marks TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      password_hash TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO responses_new (id, poll_id, name, marks, submitted_at, password_hash)
      SELECT id, poll_id, name, marks, submitted_at, password_hash FROM responses;
    DROP TABLE responses;
    ALTER TABLE responses_new RENAME TO responses;
  `);
}
