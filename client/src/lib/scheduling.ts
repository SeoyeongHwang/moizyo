// Ported from the "언제볼까 MVP" design prototype's scheduling logic.

export const SLOT_MINUTES = 30;

export type Category = "best" | "ok";
export type Marks = Record<string, Category>;

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

export interface FinalSlot {
  date: string;
  startMin: number;
  endMin: number;
}

export interface Candidate {
  date: string;
  startMin: number;
  endMin: number;
  keys: string[];
  avail: string[];
  bestAll: string[];
  okAny: string[];
  reqOk: boolean;
  score: number;
}

const WEEKDAYS = "일월화수목금토";
const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function weekdayIndex(dateKey: string): number | null {
  const match = /^weekday-([0-6])$/.exec(dateKey);
  return match ? Number(match[1]) : null;
}

function isWeekdayKey(dateKey: string): boolean {
  return weekdayIndex(dateKey) !== null;
}

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

export function timeAxisLabel(m: number): string {
  const h = Math.floor(m / 60);
  const period = h < 12 ? "오전" : "오후";
  const hour = h % 12 || 12;
  return `${period} ${hour}시`;
}

export function weekday(dateKey: string): string {
  const index = weekdayIndex(dateKey);
  if (index !== null) return WEEKDAYS[index];
  const d = new Date(dateKey + "T00:00:00");
  return WEEKDAYS[d.getDay()];
}

export function dateLabel(dateKey: string): string {
  const index = weekdayIndex(dateKey);
  if (index !== null) return WEEKDAY_LABELS[index];
  const d = new Date(dateKey + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday(dateKey)})`;
}

export function dateShort(dateKey: string): string {
  const index = weekdayIndex(dateKey);
  if (index !== null) return WEEKDAY_LABELS[index];
  const d = new Date(dateKey + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()} (${weekday(dateKey)})`;
}

export function nextDays(n: number): string[] {
  const out: string[] = [];
  const t = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    out.push(
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
    );
  }
  return out;
}

export function slots(poll: { startHour: number; endHour: number }): number[] {
  const out: number[] = [];
  for (let m = poll.startHour * 60; m + SLOT_MINUTES <= poll.endHour * 60; m += SLOT_MINUTES) out.push(m);
  return out;
}

export function pollTitle(poll: { purpose: string }): string {
  return poll.purpose;
}

export function pollRangeLine(poll: { dates: string[]; startHour: number; endHour: number; dur: number }): string {
  const isWeekdayPoll = poll.dates.every(isWeekdayKey);
  const extra = poll.dates.length > 1 ? ` 외 ${poll.dates.length - 1}${isWeekdayPoll ? "개 요일" : "일"}` : "";
  return `${dateLabel(poll.dates[0])}${extra} ${fmtMin(poll.startHour * 60)}부터 ${fmtMin(poll.endHour * 60)} 중, ${poll.dur}분 예상`;
}

export function responseCountText(total: number): string {
  return total ? `현재 ${total}명 응답 완료` : "아직 응답이 없습니다";
}

export function keyTitle(key: string): string {
  const idx = key.lastIndexOf("_");
  const d = key.slice(0, idx);
  const m = Number(key.slice(idx + 1));
  return `${dateLabel(d)} ${fmtMin(m)} ~ ${fmtMin(m + SLOT_MINUTES)}`;
}

export function pollLink(pollId: string): string {
  return `${window.location.origin}/vote/${pollId}`;
}

export interface AggEntry {
  best: string[];
  ok: string[];
}

export function aggregate(responses: Record<string, Marks>): Record<string, AggEntry> {
  const map: Record<string, AggEntry> = {};
  Object.entries(responses).forEach(([name, marks]) => {
    Object.entries(marks).forEach(([key, cat]) => {
      if (!map[key]) map[key] = { best: [], ok: [] };
      map[key][cat === "best" ? "best" : "ok"].push(name);
    });
  });
  return map;
}

export function evaluateSlot(
  poll: PollMeta,
  responses: Record<string, Marks>,
  date: string,
  startMin: number,
  endMin: number
): { keys: string[]; avail: string[]; bestAll: string[]; okAny: string[]; reqOk: boolean } {
  const keys: string[] = [];
  for (let m = startMin; m < endMin; m += SLOT_MINUTES) keys.push(date + "_" + m);
  const names = Object.keys(responses);
  const req = poll.required || [];
  const avail: string[] = [];
  const bestAll: string[] = [];
  const okAny: string[] = [];
  names.forEach((n) => {
    const m = responses[n];
    if (!keys.every((key) => m[key])) return;
    avail.push(n);
    if (keys.every((key) => m[key] === "best")) bestAll.push(n);
    else okAny.push(n);
  });
  const reqOk = req.length ? req.every((n) => avail.includes(n)) : true;
  return { keys, avail, bestAll, okAny, reqOk };
}

export function candidates(poll: PollMeta, responses: Record<string, Marks>): Candidate[] {
  const names = Object.keys(responses);
  if (!names.length) return [];
  const req = poll.required || [];
  const k = Math.max(1, Math.round(poll.dur / SLOT_MINUTES));
  const sl = slots(poll);
  const all: Candidate[] = [];

  poll.dates.forEach((d) => {
    for (let i = 0; i + k <= sl.length; i++) {
      const startMin = sl[i];
      const endMin = sl[i] + k * SLOT_MINUTES;
      const { keys, avail, bestAll, okAny, reqOk } = evaluateSlot(poll, responses, d, startMin, endMin);
      if (!avail.length) continue;
      const reqAvail = req.filter((n) => avail.includes(n)).length;
      const score = (reqOk ? 100000 : 0) + reqAvail * 5000 + avail.length * 100 + bestAll.length * 10 - okAny.length;
      all.push({ date: d, startMin, endMin, keys, avail, bestAll, okAny, reqOk, score });
    }
  });

  all.sort((a, b) => b.score - a.score);
  const picked: Candidate[] = [];
  for (const c of all) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.date === c.date && !(c.endMin <= p.startMin || c.startMin >= p.endMin))) continue;
    picked.push(c);
  }
  return picked;
}

export function buildConfirmationMessage(
  candidate: { date: string; startMin: number; endMin: number; avail: string[]; okAny: string[]; reqOk: boolean },
  poll: PollMeta,
  totalResponses: number
): string {
  const req = poll.required || [];
  const lines: string[] = [];
  lines.push(`${poll.purpose} 시간이 확정되었습니다.`);
  lines.push("");
  lines.push(`일시: ${dateLabel(candidate.date)} ${fmtMin(candidate.startMin)} ~ ${fmtMin(candidate.endMin)}`);
  lines.push("");
  lines.push("이렇게 선정 했어요");
  lines.push(
    totalResponses > 0 && candidate.avail.length === totalResponses
      ? "- 모든 참석자 가능"
      : `- 응답자 ${totalResponses}명 중 ${candidate.avail.length}명이 참석 가능합니다`
  );
  if (req.length) {
    lines.push(candidate.reqOk ? `- 필수 참석자 ${req.length}명 모두 참석 가능합니다` : "- 필수 참석자 중 일부는 참석이 어렵습니다");
  }
  if (candidate.okAny.length > 0) lines.push(`- ${candidate.okAny.length}명에게는 이 시간이 부담스러울 수있어요`);
  lines.push("");
  lines.push(`투표 결과 보기: ${pollLink(poll.id)}`);
  return lines.join("\n");
}
