import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { SLOT_MINUTES } from "./constants.js";
import { pickDemoNames, seedMarks } from "./scheduling.js";
import { toMeta, sanitizeMarks, type PollRow, type ResponseEntry } from "./types.js";
import { hashPassword, verifyPassword } from "./auth.js";

const MIN_PASSWORD_LENGTH = 4;

interface ResponseRow {
  id: number;
  name: string;
  marks: string;
  password_hash: string;
}

const app = express();
app.use(cors());
app.use(express.json());

function getPollRow(id: string): PollRow | undefined {
  return db.prepare("SELECT * FROM polls WHERE id = ?").get(id) as PollRow | undefined;
}

function responseCount(id: string): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM responses WHERE poll_id = ?").get(id) as { c: number };
  return row.c;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWeekdayKey(value: unknown): value is string {
  return typeof value === "string" && /^weekday-[0-6]$/.test(value);
}

function requirePoll(req: express.Request, res: express.Response): PollRow | null {
  const row = getPollRow(String(req.params.id));
  if (!row) {
    res.status(404).json({ error: "poll_not_found" });
    return null;
  }
  return row;
}

function isValidDuration(row: PollRow, duration: unknown): duration is number {
  if (typeof duration !== "number" || !Number.isInteger(duration)) return false;
  return (
    duration > 0 &&
    duration % SLOT_MINUTES === 0 &&
    duration <= (row.end_hour - row.start_hour) * 60
  );
}

function serializeFinalSlot(row: PollRow, final: unknown, duration: number): string | null {
  if (
    !final ||
    typeof final !== "object" ||
    typeof (final as { date?: unknown }).date !== "string" ||
    !Number.isInteger((final as { startMin?: unknown }).startMin) ||
    !Number.isInteger((final as { endMin?: unknown }).endMin)
  ) {
    return null;
  }

  const { date, startMin, endMin } = final as { date: string; startMin: number; endMin: number };
  const dates = JSON.parse(row.dates) as string[];
  const expectedEndMin = startMin + duration;
  if (
    !dates.includes(date) ||
    startMin < row.start_hour * 60 ||
    startMin % SLOT_MINUTES !== 0 ||
    endMin !== expectedEndMin ||
    expectedEndMin > row.end_hour * 60
  ) {
    return null;
  }

  return JSON.stringify({ date, startMin, endMin: expectedEndMin });
}

// ---- create poll ----
app.post("/api/polls", (req, res) => {
  const { purpose, dates, startHour, endHour, dur } = req.body ?? {};

  if (typeof purpose !== "string" || !purpose.trim()) {
    return res.status(400).json({ error: "purpose_required" });
  }
  const dateModeValid =
    Array.isArray(dates) &&
    dates.length >= 1 &&
    dates.length <= 7 &&
    (dates.every(isDateKey) || dates.every(isWeekdayKey));
  if (!dateModeValid) {
    return res.status(400).json({ error: "dates_invalid" });
  }
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || endHour <= startHour) {
    return res.status(400).json({ error: "hours_invalid" });
  }
  if (!Number.isInteger(dur) || dur <= 0 || dur % SLOT_MINUTES !== 0 || dur > (endHour - startHour) * 60) {
    return res.status(400).json({ error: "duration_invalid" });
  }

  const id = nanoid(8);
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO polls (id, type, purpose, dates, start_hour, end_hour, dur, required, final, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?)`
  ).run(id, "", purpose.trim(), JSON.stringify([...dates].sort()), startHour, endHour, dur, createdAt);

  const row = getPollRow(id)!;
  res.status(201).json(toMeta(row, 0));
});

// ---- poll metadata ----
app.get("/api/polls/:id", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;
  res.json(toMeta(row, responseCount(row.id)));
});

// ---- check whether a name+password pair matches an existing response.
//      Names aren't unique (동명이인 can share one), so a mismatch is
//      indistinguishable from "no such response yet" — both just mean
//      the caller is about to create a new entry, not an error. ----
app.post("/api/polls/:id/responses/:name/check", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const { password } = req.body ?? {};
  if (typeof password !== "string") {
    return res.status(400).json({ error: "password_required" });
  }

  const name = req.params.name.trim();
  const candidates = db
    .prepare("SELECT id, name, marks, password_hash FROM responses WHERE poll_id = ? AND name = ?")
    .all(row.id, name) as ResponseRow[];
  const match = candidates.find((c) => verifyPassword(password, c.password_hash));

  if (!match) {
    return res.json({ status: "new" });
  }
  res.json({ status: "ok", id: match.id, marks: JSON.parse(match.marks) });
});

// ---- submit a participant's response (names may repeat; each row is its own identity) ----
app.post("/api/polls/:id/responses", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const { name, password, marks } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name_required" });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "password_invalid" });
  }
  const cleanMarks = sanitizeMarks(marks);
  if (!cleanMarks) {
    return res.status(400).json({ error: "marks_invalid" });
  }

  db.prepare(
    "INSERT INTO responses (poll_id, name, marks, submitted_at, password_hash) VALUES (?, ?, ?, ?, ?)"
  ).run(row.id, name.trim(), JSON.stringify(cleanMarks), Date.now(), hashPassword(password));

  res.status(201).json({ ok: true });
});

// ---- edit an existing participant's response, addressed by row id ----
app.put("/api/polls/:id/responses/:responseId", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const responseId = Number(req.params.responseId);
  if (!Number.isInteger(responseId)) {
    return res.status(404).json({ error: "response_not_found" });
  }

  const { password, marks } = req.body ?? {};
  if (typeof password !== "string") {
    return res.status(400).json({ error: "password_required" });
  }
  const cleanMarks = sanitizeMarks(marks);
  if (!cleanMarks) {
    return res.status(400).json({ error: "marks_invalid" });
  }

  const existing = db
    .prepare("SELECT password_hash FROM responses WHERE id = ? AND poll_id = ?")
    .get(responseId, row.id) as Pick<ResponseRow, "password_hash"> | undefined;
  if (!existing) {
    return res.status(404).json({ error: "response_not_found" });
  }
  if (!verifyPassword(password, existing.password_hash)) {
    return res.status(403).json({ error: "invalid_password" });
  }

  db.prepare("UPDATE responses SET marks = ?, submitted_at = ? WHERE id = ?").run(
    JSON.stringify(cleanMarks),
    Date.now(),
    responseId
  );

  res.json({ ok: true });
});

// ---- delete an existing participant response, addressed by row id ----
app.delete("/api/polls/:id/responses/:responseId", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const responseId = Number(req.params.responseId);
  if (!Number.isInteger(responseId)) {
    return res.status(404).json({ error: "response_not_found" });
  }

  const result = db.prepare("DELETE FROM responses WHERE id = ? AND poll_id = ?").run(responseId, row.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "response_not_found" });
  }

  res.json({ ok: true });
});

// ---- full results (aggregated view is computed client-side) ----
app.get("/api/polls/:id/results", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;
  const rows = db
    .prepare("SELECT id, name, marks FROM responses WHERE poll_id = ? ORDER BY id ASC")
    .all(row.id) as { id: number; name: string; marks: string }[];
  const responses: ResponseEntry[] = rows.map((r) => ({ id: r.id, name: r.name, marks: JSON.parse(r.marks) }));
  res.json({ poll: toMeta(row, rows.length), responses });
});

// ---- update duration / required participants / final decision ----
app.patch("/api/polls/:id", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const { required, final, dur } = req.body ?? {};
  let nextDur = row.dur;
  let nextRequired = row.required;
  let nextFinal = row.final;

  if (dur !== undefined) {
    if (!isValidDuration(row, dur)) {
      return res.status(400).json({ error: "duration_invalid" });
    }
    nextDur = dur;
  }
  if (required !== undefined) {
    if (!Array.isArray(required) || !required.every((n) => typeof n === "string")) {
      return res.status(400).json({ error: "required_invalid" });
    }
    nextRequired = JSON.stringify(required);
  }
  if (final !== undefined) {
    if (final === null) {
      nextFinal = null;
    } else {
      const serializedFinal = serializeFinalSlot(row, final, nextDur);
      if (!serializedFinal) {
        return res.status(400).json({ error: "final_invalid" });
      }
      nextFinal = serializedFinal;
    }
  }

  db.prepare("UPDATE polls SET dur = ?, required = ?, final = ? WHERE id = ?").run(
    nextDur,
    nextRequired,
    nextFinal,
    row.id
  );
  const updated = getPollRow(row.id)!;
  res.json(toMeta(updated, responseCount(row.id)));
});

// ---- fill demo responses (testing aid, matches original design's "showSeedTools" toggle) ----
app.post("/api/polls/:id/seed-demo", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const existingNames = (
    db.prepare("SELECT name FROM responses WHERE poll_id = ?").all(row.id) as { name: string }[]
  ).map((r) => r.name);
  const names = pickDemoNames(existingNames, 7);
  if (!names.length) {
    return res.status(200).json({ added: 0 });
  }

  const poll = toMeta(row, 0);
  const insert = db.prepare(
    "INSERT INTO responses (poll_id, name, marks, submitted_at) VALUES (?, ?, ?, ?)"
  );
  const now = Date.now();
  const tx = db.transaction(() => {
    names.forEach((name, i) => {
      const marks = seedMarks(poll, i);
      insert.run(row.id, name, JSON.stringify(marks), now);
    });
  });
  tx();

  res.status(201).json({ added: names.length });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
});
