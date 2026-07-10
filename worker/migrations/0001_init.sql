-- Migration number: 0001 	 init
-- server/src/db.ts의 최종 스키마와 동일: password_hash 포함, UNIQUE(poll_id, name) 없음
-- (동명이인은 id + password로 구분한다)

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
  password_hash TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_responses_poll_id ON responses(poll_id);
