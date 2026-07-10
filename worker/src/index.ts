import { Hono } from "hono";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { SLOT_MINUTES } from "./constants";
import { toMeta, sanitizeMarks, type PollRow, type ResponseEntry } from "./types";
import { hashPassword, verifyPassword } from "./auth";

const MIN_PASSWORD_LENGTH = 4;

interface ResponseRow {
  id: number;
  name: string;
  marks: string;
  password_hash: string;
}

type Bindings = { DB: D1Database };
type AppContext = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();

function getPollRow(db: D1Database, id: string): Promise<PollRow | null> {
  return db.prepare("SELECT * FROM polls WHERE id = ?").bind(id).first<PollRow>();
}

async function responseCount(db: D1Database, id: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM responses WHERE poll_id = ?")
    .bind(id)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isWeekdayKey(value: unknown): value is string {
  return typeof value === "string" && /^weekday-[0-6]$/.test(value);
}

async function readBody(c: AppContext): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
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
app.post("/api/polls", async (c) => {
  const { purpose, dates, startHour, endHour, dur } = await readBody(c);

  if (typeof purpose !== "string" || !purpose.trim()) {
    return c.json({ error: "purpose_required" }, 400);
  }
  const dateModeValid =
    Array.isArray(dates) &&
    dates.length >= 1 &&
    dates.length <= 7 &&
    (dates.every(isDateKey) || dates.every(isWeekdayKey));
  if (!dateModeValid) {
    return c.json({ error: "dates_invalid" }, 400);
  }
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    (startHour as number) < 0 ||
    (endHour as number) > 24 ||
    (endHour as number) <= (startHour as number)
  ) {
    return c.json({ error: "hours_invalid" }, 400);
  }
  const hours = ((endHour as number) - (startHour as number)) * 60;
  if (!Number.isInteger(dur) || (dur as number) <= 0 || (dur as number) % SLOT_MINUTES !== 0 || (dur as number) > hours) {
    return c.json({ error: "duration_invalid" }, 400);
  }

  const id = nanoid(8);
  const createdAt = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO polls (id, type, purpose, dates, start_hour, end_hour, dur, required, final, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', NULL, ?)`
  )
    .bind(id, "", purpose.trim(), JSON.stringify([...(dates as string[])].sort()), startHour, endHour, dur, createdAt)
    .run();

  const row = (await getPollRow(c.env.DB, id))!;
  return c.json(toMeta(row, 0), 201);
});

// ---- poll metadata ----
app.get("/api/polls/:id", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);
  return c.json(toMeta(row, await responseCount(c.env.DB, row.id)));
});

// ---- check whether a name+password pair matches an existing response.
//      Names aren't unique (동명이인 can share one), so a mismatch is
//      indistinguishable from "no such response yet" — both just mean
//      the caller is about to create a new entry, not an error. ----
app.post("/api/polls/:id/responses/:name/check", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const { password } = await readBody(c);
  if (typeof password !== "string") {
    return c.json({ error: "password_required" }, 400);
  }

  const name = c.req.param("name").trim();
  const { results: candidates } = await c.env.DB.prepare(
    "SELECT id, name, marks, password_hash FROM responses WHERE poll_id = ? AND name = ?"
  )
    .bind(row.id, name)
    .all<ResponseRow>();

  let match: ResponseRow | undefined;
  for (const candidate of candidates) {
    if (await verifyPassword(password, candidate.password_hash)) {
      match = candidate;
      break;
    }
  }

  if (!match) {
    return c.json({ status: "new" });
  }
  return c.json({ status: "ok", id: match.id, marks: JSON.parse(match.marks) });
});

// ---- submit a participant's response (names may repeat; each row is its own identity) ----
app.post("/api/polls/:id/responses", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const { name, password, marks } = await readBody(c);
  if (typeof name !== "string" || !name.trim()) {
    return c.json({ error: "name_required" }, 400);
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: "password_invalid" }, 400);
  }
  const cleanMarks = sanitizeMarks(marks);
  if (!cleanMarks) {
    return c.json({ error: "marks_invalid" }, 400);
  }

  await c.env.DB.prepare(
    "INSERT INTO responses (poll_id, name, marks, submitted_at, password_hash) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(row.id, name.trim(), JSON.stringify(cleanMarks), Date.now(), await hashPassword(password))
    .run();

  return c.json({ ok: true }, 201);
});

// ---- edit an existing participant's response, addressed by row id ----
app.put("/api/polls/:id/responses/:responseId", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const responseId = Number(c.req.param("responseId"));
  if (!Number.isInteger(responseId)) {
    return c.json({ error: "response_not_found" }, 404);
  }

  const { password, marks } = await readBody(c);
  if (typeof password !== "string") {
    return c.json({ error: "password_required" }, 400);
  }
  const cleanMarks = sanitizeMarks(marks);
  if (!cleanMarks) {
    return c.json({ error: "marks_invalid" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT password_hash FROM responses WHERE id = ? AND poll_id = ?")
    .bind(responseId, row.id)
    .first<Pick<ResponseRow, "password_hash">>();
  if (!existing) {
    return c.json({ error: "response_not_found" }, 404);
  }
  if (!(await verifyPassword(password, existing.password_hash))) {
    return c.json({ error: "invalid_password" }, 403);
  }

  await c.env.DB.prepare("UPDATE responses SET marks = ?, submitted_at = ? WHERE id = ?")
    .bind(JSON.stringify(cleanMarks), Date.now(), responseId)
    .run();

  return c.json({ ok: true });
});

// ---- delete an existing participant response, addressed by row id ----
app.delete("/api/polls/:id/responses/:responseId", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const responseId = Number(c.req.param("responseId"));
  if (!Number.isInteger(responseId)) {
    return c.json({ error: "response_not_found" }, 404);
  }

  const result = await c.env.DB.prepare("DELETE FROM responses WHERE id = ? AND poll_id = ?")
    .bind(responseId, row.id)
    .run();
  if (result.meta.changes === 0) {
    return c.json({ error: "response_not_found" }, 404);
  }

  return c.json({ ok: true });
});

// ---- full results (aggregated view is computed client-side) ----
app.get("/api/polls/:id/results", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const { results: rows } = await c.env.DB.prepare(
    "SELECT id, name, marks FROM responses WHERE poll_id = ? ORDER BY id ASC"
  )
    .bind(row.id)
    .all<{ id: number; name: string; marks: string }>();
  const responses: ResponseEntry[] = rows.map((r) => ({ id: r.id, name: r.name, marks: JSON.parse(r.marks) }));
  return c.json({ poll: toMeta(row, rows.length), responses });
});

// ---- update duration / required participants / final decision ----
app.patch("/api/polls/:id", async (c) => {
  const row = await getPollRow(c.env.DB, c.req.param("id"));
  if (!row) return c.json({ error: "poll_not_found" }, 404);

  const { required, final, dur } = await readBody(c);
  let nextDur = row.dur;
  let nextRequired = row.required;
  let nextFinal = row.final;

  if (dur !== undefined) {
    if (!isValidDuration(row, dur)) {
      return c.json({ error: "duration_invalid" }, 400);
    }
    nextDur = dur;
  }
  if (required !== undefined) {
    if (!Array.isArray(required) || !required.every((n) => typeof n === "string")) {
      return c.json({ error: "required_invalid" }, 400);
    }
    nextRequired = JSON.stringify(required);
  }
  if (final !== undefined) {
    if (final === null) {
      nextFinal = null;
    } else {
      const serializedFinal = serializeFinalSlot(row, final, nextDur);
      if (!serializedFinal) {
        return c.json({ error: "final_invalid" }, 400);
      }
      nextFinal = serializedFinal;
    }
  }

  await c.env.DB.prepare("UPDATE polls SET dur = ?, required = ?, final = ? WHERE id = ?")
    .bind(nextDur, nextRequired, nextFinal, row.id)
    .run();
  const updated = (await getPollRow(c.env.DB, row.id))!;
  return c.json(toMeta(updated, await responseCount(c.env.DB, row.id)));
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
