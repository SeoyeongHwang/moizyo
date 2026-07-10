import { SLOT_MINUTES } from "./constants.js";
import type { Marks } from "./types.js";

export function slots(startHour: number, endHour: number): number[] {
  const out: number[] = [];
  for (let m = startHour * 60; m + SLOT_MINUTES <= endHour * 60; m += SLOT_MINUTES) out.push(m);
  return out;
}

const DEMO_NAMES = ["김지현", "박민수", "이서연", "최준호", "정다은", "한상우", "오유진"];

export function pickDemoNames(existing: string[], count: number): string[] {
  return DEMO_NAMES.filter((n) => !existing.includes(n)).slice(0, count);
}

interface DemoPoll {
  id?: string;
  dates: string[];
  startHour: number;
  endHour: number;
  dur: number;
}

interface DemoProfile {
  preferredMid: number;
  secondaryMid: number;
  earliest: number;
  latest: number;
  secondWindowChance: number;
  okBias: number;
  dayOffModulo: number;
}

const DEMO_PROFILES: DemoProfile[] = [
  { preferredMid: 10 * 60 + 15, secondaryMid: 15 * 60, earliest: 9 * 60, latest: 17 * 60 + 30, secondWindowChance: 0.32, okBias: 0.16, dayOffModulo: 4 },
  { preferredMid: 14 * 60 + 30, secondaryMid: 10 * 60 + 45, earliest: 10 * 60, latest: 18 * 60, secondWindowChance: 0.24, okBias: 0.26, dayOffModulo: 3 },
  { preferredMid: 11 * 60, secondaryMid: 16 * 60, earliest: 9 * 60 + 30, latest: 17 * 60, secondWindowChance: 0.38, okBias: 0.18, dayOffModulo: 5 },
  { preferredMid: 16 * 60, secondaryMid: 13 * 60 + 45, earliest: 11 * 60, latest: 19 * 60, secondWindowChance: 0.28, okBias: 0.3, dayOffModulo: 4 },
  { preferredMid: 13 * 60 + 45, secondaryMid: 10 * 60 + 15, earliest: 9 * 60, latest: 16 * 60 + 30, secondWindowChance: 0.22, okBias: 0.22, dayOffModulo: 3 },
  { preferredMid: 10 * 60 + 30, secondaryMid: 15 * 60 + 30, earliest: 8 * 60 + 30, latest: 18 * 60, secondWindowChance: 0.42, okBias: 0.14, dayOffModulo: 6 },
  { preferredMid: 15 * 60 + 15, secondaryMid: 11 * 60 + 30, earliest: 10 * 60 + 30, latest: 18 * 60 + 30, secondWindowChance: 0.26, okBias: 0.28, dayOffModulo: 4 },
];

const DATE_THEME_MIDS = [10 * 60 + 30, 14 * 60 + 15, 16 * 60, 11 * 60 + 30];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function floorSlot(minute: number): number {
  return Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES;
}

function ceilSlot(minute: number): number {
  return Math.ceil(minute / SLOT_MINUTES) * SLOT_MINUTES;
}

function hitsLunch(minute: number): boolean {
  return minute < 13 * 60 && minute + SLOT_MINUTES > 12 * 60;
}

function addWindow(
  marks: Marks,
  poll: DemoPoll,
  profile: DemoProfile,
  date: string,
  mid: number,
  length: number,
  rnd: () => number
): void {
  const pollStart = poll.startHour * 60;
  const pollEnd = poll.endHour * 60;
  const start = clamp(floorSlot(mid - length / 2), Math.max(pollStart, profile.earliest), Math.min(pollEnd, profile.latest));
  const end = clamp(ceilSlot(mid + length / 2), Math.max(pollStart, profile.earliest), Math.min(pollEnd, profile.latest));
  if (end - start < SLOT_MINUTES) return;

  for (let m = start; m + SLOT_MINUTES <= end; m += SLOT_MINUTES) {
    if (hitsLunch(m) && rnd() > 0.08) continue;
    const edge = m < start + 30 || m + SLOT_MINUTES > end - 30;
    const outsideCore = Math.abs(m + SLOT_MINUTES / 2 - profile.preferredMid) > 90;
    marks[`${date}_${m}`] = edge || (outsideCore && rnd() < 0.42) || rnd() < profile.okBias ? "ok" : "best";
  }
}

function pruneShortRuns(marks: Marks, date: string, sl: number[], minRunMinutes: number): void {
  let run: string[] = [];
  const flush = () => {
    if (run.length * SLOT_MINUTES < minRunMinutes) {
      run.forEach((key) => delete marks[key]);
    }
    run = [];
  };

  sl.forEach((m) => {
    const key = `${date}_${m}`;
    if (marks[key]) {
      run.push(key);
    } else {
      flush();
    }
  });
  flush();
}

export function seedMarks(
  poll: DemoPoll,
  index: number
): Marks {
  const marks: Marks = {};
  const profile = DEMO_PROFILES[index % DEMO_PROFILES.length];
  const sl = slots(poll.startHour, poll.endHour);
  if (!sl.length) return marks;

  const seed = hashSeed([poll.id ?? "demo", poll.dates.join(","), poll.startHour, poll.endHour, poll.dur, index].join("|"));
  const rnd = seededRandom(seed);
  const minUsefulRun = Math.max(60, Math.min(poll.dur, 120));
  const minWindow = Math.max(poll.dur + 30, 90);
  const maxWindow = Math.max(minWindow, Math.min(210, poll.dur + 90));

  poll.dates.forEach((date, dateIndex) => {
    const unavailableDay =
      poll.dates.length > 1 && dateIndex !== index % poll.dates.length && (dateIndex + index + 1) % profile.dayOffModulo === 0;
    if (unavailableDay && rnd() < 0.74) return;

    const themeMid = DATE_THEME_MIDS[dateIndex % DATE_THEME_MIDS.length];
    const personalWeight = 0.72 + rnd() * 0.12;
    const jitter = (Math.floor(rnd() * 5) - 2) * SLOT_MINUTES;
    const primaryMid = profile.preferredMid * personalWeight + themeMid * (1 - personalWeight) + jitter;
    const primaryLength = minWindow + Math.floor(rnd() * Math.max(1, (maxWindow - minWindow) / SLOT_MINUTES + 1)) * SLOT_MINUTES;
    addWindow(marks, poll, profile, date, primaryMid, primaryLength, rnd);

    if (rnd() < profile.secondWindowChance && !unavailableDay) {
      const secondaryJitter = (Math.floor(rnd() * 5) - 2) * SLOT_MINUTES;
      const secondaryLength = Math.max(minWindow, poll.dur + (2 + Math.floor(rnd() * 4)) * SLOT_MINUTES);
      addWindow(marks, poll, profile, date, profile.secondaryMid + secondaryJitter, secondaryLength, rnd);
    }

    pruneShortRuns(marks, date, sl, minUsefulRun);
  });

  if (!Object.keys(marks).length) {
    const fallbackDate = poll.dates[index % poll.dates.length];
    addWindow(marks, poll, profile, fallbackDate, profile.preferredMid, minWindow, rnd);
    poll.dates.forEach((date) => {
      pruneShortRuns(marks, date, sl, minUsefulRun);
    });
  }

  return marks;
}
