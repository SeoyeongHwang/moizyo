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

export function seedMarks(
  poll: { dates: string[]; startHour: number; endHour: number },
  index: number
): Marks {
  const marks: Marks = {};
  const sl = slots(poll.startHour, poll.endHour);
  poll.dates.forEach((d) => {
    let run = 0;
    sl.forEach((m) => {
      const hour = m / 60;
      let r = Math.random();
      if (hour >= 12 && hour < 13) r += 0.45; // lunch avoided
      if (hour < 10 && index % 3 === 0) r += 0.3; // some avoid mornings
      if (hour >= 17 && index % 4 === 1) r += 0.3; // some avoid evenings
      if (run > 0) r -= 0.25; // continuity bias
      if (r < 0.42) {
        marks[d + "_" + m] = "best";
        run = 1;
      } else if (r < 0.62) {
        marks[d + "_" + m] = "ok";
        run = 1;
      } else {
        run = 0;
      }
    });
  });
  return marks;
}
