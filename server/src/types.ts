export interface PollRow {
  id: string;
  type: string;
  purpose: string;
  dates: string; // JSON string[]
  start_hour: number;
  end_hour: number;
  dur: number;
  required: string; // JSON string[]
  final: string | null; // JSON {date,startMin,endMin} | null
  created_at: number;
}

export interface FinalSlot {
  date: string;
  startMin: number;
  endMin: number;
}

export interface PollMeta {
  id: string;
  purpose: string;
  dates: string[];
  startHour: number;
  endHour: number;
  dur: number;
  required: string[];
  final: FinalSlot | null;
  responseCount: number;
}

export type Marks = Record<string, "best" | "ok">;

// Names aren't unique (동명이인 can share one), so results are returned as an
// ordered list keyed by response id rather than an object keyed by name.
export interface ResponseEntry {
  id: number;
  name: string;
  marks: Marks;
}

export function sanitizeMarks(input: unknown): Marks | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const clean: Marks = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === "best" || v === "ok") clean[k] = v;
  }
  return clean;
}

export function toMeta(row: PollRow, responseCount: number): PollMeta {
  return {
    id: row.id,
    purpose: row.purpose,
    dates: JSON.parse(row.dates),
    startHour: row.start_hour,
    endHour: row.end_hour,
    dur: row.dur,
    required: JSON.parse(row.required),
    final: row.final ? JSON.parse(row.final) : null,
    responseCount,
  };
}
