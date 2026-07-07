import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import { db } from "./db.js";
import { SLOT_MINUTES } from "./constants.js";
import { pickDemoNames, seedMarks } from "./scheduling.js";
import { toMeta, type PollRow, type Marks } from "./types.js";

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

function requirePoll(req: express.Request, res: express.Response): PollRow | null {
  const row = getPollRow(String(req.params.id));
  if (!row) {
    res.status(404).json({ error: "poll_not_found" });
    return null;
  }
  return row;
}

// ---- create poll ----
app.post("/api/polls", (req, res) => {
  const { type, purpose, dates, startHour, endHour, dur } = req.body ?? {};

  if (typeof type !== "string" || !type.trim()) {
    return res.status(400).json({ error: "type_required" });
  }
  if (typeof purpose !== "string" || !purpose.trim()) {
    return res.status(400).json({ error: "purpose_required" });
  }
  if (!Array.isArray(dates) || dates.length < 1 || dates.length > 7 || !dates.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
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
  ).run(id, type.trim(), purpose.trim(), JSON.stringify([...dates].sort()), startHour, endHour, dur, createdAt);

  const row = getPollRow(id)!;
  res.status(201).json(toMeta(row, 0));
});

// ---- poll metadata ----
app.get("/api/polls/:id", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;
  res.json(toMeta(row, responseCount(row.id)));
});

// ---- name availability check ----
app.get("/api/polls/:id/responses/:name/exists", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;
  const name = req.params.name.trim();
  const existing = db
    .prepare("SELECT 1 FROM responses WHERE poll_id = ? AND name = ?")
    .get(row.id, name);
  res.json({ exists: !!existing });
});

// ---- submit a participant's response ----
app.post("/api/polls/:id/responses", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const { name, marks } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name_required" });
  }
  if (!marks || typeof marks !== "object" || Array.isArray(marks)) {
    return res.status(400).json({ error: "marks_invalid" });
  }
  const cleanMarks: Marks = {};
  for (const [k, v] of Object.entries(marks as Record<string, unknown>)) {
    if (v === "best" || v === "ok") cleanMarks[k] = v;
  }

  const trimmed = name.trim();
  const existing = db
    .prepare("SELECT 1 FROM responses WHERE poll_id = ? AND name = ?")
    .get(row.id, trimmed);
  if (existing) {
    return res.status(409).json({ error: "duplicate_name" });
  }

  db.prepare(
    "INSERT INTO responses (poll_id, name, marks, submitted_at) VALUES (?, ?, ?, ?)"
  ).run(row.id, trimmed, JSON.stringify(cleanMarks), Date.now());

  res.status(201).json({ ok: true });
});

// ---- full results (aggregated view is computed client-side) ----
app.get("/api/polls/:id/results", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;
  const rows = db
    .prepare("SELECT name, marks FROM responses WHERE poll_id = ?")
    .all(row.id) as { name: string; marks: string }[];
  const responses: Record<string, Marks> = {};
  rows.forEach((r) => {
    responses[r.name] = JSON.parse(r.marks);
  });
  res.json({ poll: toMeta(row, rows.length), responses });
});

// ---- update required participants / final decision ----
app.patch("/api/polls/:id", (req, res) => {
  const row = requirePoll(req, res);
  if (!row) return;

  const { required, final } = req.body ?? {};
  let nextRequired = row.required;
  let nextFinal = row.final;

  if (required !== undefined) {
    if (!Array.isArray(required) || !required.every((n) => typeof n === "string")) {
      return res.status(400).json({ error: "required_invalid" });
    }
    nextRequired = JSON.stringify(required);
  }
  if (final !== undefined) {
    if (final === null) {
      nextFinal = null;
    } else if (
      typeof final === "object" &&
      typeof final.date === "string" &&
      Number.isInteger(final.startMin) &&
      Number.isInteger(final.endMin)
    ) {
      nextFinal = JSON.stringify({ date: final.date, startMin: final.startMin, endMin: final.endMin });
    } else {
      return res.status(400).json({ error: "final_invalid" });
    }
  }

  db.prepare("UPDATE polls SET required = ?, final = ? WHERE id = ?").run(nextRequired, nextFinal, row.id);
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
