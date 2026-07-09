// Ported from the "언제볼까 MVP" design prototype's scheduling logic.

export const SLOT_MINUTES = 15;

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

function dateKeyUtcDay(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86400000;
}

function consecutiveDateRangeLabel(dateKeys: string[]): string | null {
  const sorted = [...dateKeys].sort();
  const days = sorted.map(dateKeyUtcDay);
  if (days.some((day) => day === null)) return null;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i]! - days[i - 1]! !== 1) return null;
  }
  return `${dateLabel(sorted[0])}부터 ${dateLabel(sorted[sorted.length - 1])}까지`;
}

function consecutiveWeekdayRangeLabel(dateKeys: string[]): string | null {
  const indices = dateKeys.map(weekdayIndex);
  if (indices.some((index) => index === null)) return null;
  const unique = Array.from(new Set(indices as number[])).sort((a, b) => a - b);
  if (unique.length !== dateKeys.length) return null;
  if (unique.length === WEEKDAY_LABELS.length) {
    return `${WEEKDAY_LABELS[0]}부터 ${WEEKDAY_LABELS[WEEKDAY_LABELS.length - 1]}까지`;
  }

  const selected = new Set(unique);
  const start = unique.find((candidate) => {
    for (let offset = 0; offset < unique.length; offset += 1) {
      if (!selected.has((candidate + offset) % WEEKDAY_LABELS.length)) return false;
    }
    return true;
  });
  if (start === undefined) return null;

  const end = (start + unique.length - 1) % WEEKDAY_LABELS.length;
  return `${WEEKDAY_LABELS[start]}부터 ${WEEKDAY_LABELS[end]}까지`;
}

function dateSelectionLabel(dateKeys: string[]): string {
  if (dateKeys.length === 1) return dateLabel(dateKeys[0]);

  if (dateKeys.every(isWeekdayKey)) {
    return consecutiveWeekdayRangeLabel(dateKeys) ?? `${dateLabel(dateKeys[0])} 외 ${dateKeys.length - 1}개 요일`;
  }

  return consecutiveDateRangeLabel(dateKeys) ?? `${dateLabel(dateKeys[0])} 외 ${dateKeys.length - 1}일`;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}시간 ${mins}분`;
  if (hours > 0) return `${hours}시간`;
  return `${mins}분`;
}

function dateSelectionScopeLabel(dateKeys: string[]): string {
  return dateSelectionLabel(dateKeys).replace(/까지$/, "");
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
  return `${dateSelectionScopeLabel(poll.dates)} 중,\n${fmtMin(poll.startHour * 60)}부터 ${fmtMin(poll.endHour * 60)} 사이 ${poll.dur}분 예상`;
}

export function pollParticipationGuide(poll: { dates: string[]; startHour: number; endHour: number; dur: number }): string {
  return `${dateSelectionScopeLabel(poll.dates)} 중,\n${fmtMin(poll.startHour * 60)}부터 ${fmtMin(poll.endHour * 60)} 사이 가능한 시간을 알려주세요.\n미팅은 ${durationLabel(poll.dur)} 정도로 예상됩니다.`;
}

export function responseCountText(total: number): string {
  return total ? `현재 ${total}명 응답 완료` : "0명 응답";
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

export function pollJoinLink(pollId: string): string {
  return `${window.location.origin}/vote/${pollId}/join`;
}

// 동명이인 can submit under the same display name; the recommendation
// engine below identifies people purely by the key in a Record<string, Marks>,
// so give each duplicate a distinguishing label ("영희 (2)") in submission
// order before feeding results into it.
export interface LabeledResponseEntry {
  id: number;
  name: string;
  label: string;
  marks: Marks;
}

export function labelResponseEntries(entries: { id: number; name: string; marks: Marks }[]): LabeledResponseEntry[] {
  const seenCounts: Record<string, number> = {};
  return entries.map(({ id, name, marks }) => {
    const count = (seenCounts[name] = (seenCounts[name] ?? 0) + 1);
    return {
      id,
      name,
      label: count === 1 ? name : `${name} (${count})`,
      marks,
    };
  });
}

export function dedupeResponseNames(entries: { id: number; name: string; marks: Marks }[]): Record<string, Marks> {
  const result: Record<string, Marks> = {};
  labelResponseEntries(entries).forEach(({ label, marks }) => {
    result[label] = marks;
  });
  return result;
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
  const dateOrder = new Map(poll.dates.map((date, index) => [date, index]));
  const reqAvailCount = (candidate: Candidate) => req.filter((n) => candidate.avail.includes(n)).length;

  poll.dates.forEach((d) => {
    for (let i = 0; i + k <= sl.length; i++) {
      const startMin = sl[i];
      const endMin = sl[i] + k * SLOT_MINUTES;
      const { keys, avail, bestAll, okAny, reqOk } = evaluateSlot(poll, responses, d, startMin, endMin);
      if (!avail.length) continue;
      all.push({ date: d, startMin, endMin, keys, avail, bestAll, okAny, reqOk });
    }
  });

  all.sort((a, b) => {
    if (req.length) {
      const reqOkDiff = Number(b.reqOk) - Number(a.reqOk);
      if (reqOkDiff) return reqOkDiff;

      const reqAvailDiff = reqAvailCount(b) - reqAvailCount(a);
      if (reqAvailDiff) return reqAvailDiff;
    }

    return (
      b.avail.length - a.avail.length ||
      b.bestAll.length - a.bestAll.length ||
      (dateOrder.get(a.date) ?? 0) - (dateOrder.get(b.date) ?? 0) ||
      a.startMin - b.startMin ||
      a.endMin - b.endMin
    );
  });
  const picked: Candidate[] = [];
  for (const c of all) {
    if (picked.length >= 3) break;
    if (picked.some((p) => p.date === c.date && c.startMin < p.endMin && c.endMin > p.startMin)) continue;
    picked.push(c);
  }
  return picked;
}

export function recommendationHighlight(
  candidate: { avail: string[]; okAny: string[] },
  otherCandidates: Array<{ okAny: string[] }>,
  total: number
): string | null {
  const burdened = candidate.okAny.length;
  if (burdened === 0) {
    return total > 0 && candidate.avail.length === total
      ? "모두가 선호하는 시간"
      : "참석 가능한 모두가 선호하는 시간";
  }
  const minBurdened = Math.min(...otherCandidates.map((c) => c.okAny.length));
  if (otherCandidates.length > 1 && burdened === minBurdened) {
    return "많은 참석자가 가장 부담 덜 한 시간";
  }
  return null;
}

export function buildConfirmationMessage(
  candidate: { date: string; startMin: number; endMin: number; avail: string[]; okAny: string[]; reqOk: boolean },
  poll: PollMeta,
  totalResponses: number,
  otherCandidates: Array<{ okAny: string[] }> = [candidate]
): string {
  const req = poll.required || [];
  const lines: string[] = [];
  lines.push(`${poll.purpose} 시간이 확정되었습니다.`);
  lines.push("");
  lines.push(`일시: ${dateLabel(candidate.date)} ${fmtMin(candidate.startMin)} ~ ${fmtMin(candidate.endMin)}`);
  lines.push("");
  lines.push("이렇게 정했어요");
  if (req.length) {
    lines.push(candidate.reqOk ? "- 필수 참석자 모두 가능" : "- 필수 참석자 일부 불가");
  }
  lines.push(
    totalResponses > 0 && candidate.avail.length === totalResponses
      ? "- 모든 참석자 가능"
      : `- ${totalResponses}명 중 ${candidate.avail.length}명 가능`
  );
  const highlight = recommendationHighlight(candidate, otherCandidates, totalResponses);
  if (highlight) lines.push(`- ${highlight}`);
  lines.push("");
  lines.push(`결과 보기: ${pollLink(poll.id)}`);
  return lines.join("\n");
}
