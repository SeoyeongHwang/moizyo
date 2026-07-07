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
    submitted_at INTEGER NOT NULL,
    UNIQUE(poll_id, name)
  );
`);
