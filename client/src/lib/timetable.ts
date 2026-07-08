import type { CSSProperties } from "react";
import { timeAxisLabel } from "./scheduling";

export const timetableLabelWidth = 66;
export const timetableSlotHeight = 34;
const timetableDateMinWidth = 104;

const tabularNumberStyle = { fontVariantNumeric: "tabular-nums" as const };

export function timetableGridColumns(dateCount: number): string {
  return `${timetableLabelWidth}px repeat(${dateCount}, minmax(0, 1fr))`;
}

export function timetableContentWidth(dateCount: number): string {
  return `max(100%, ${timetableLabelWidth + dateCount * timetableDateMinWidth}px)`;
}

export function timetableAxisText(minute: number): string {
  return minute % 60 === 0 ? timeAxisLabel(minute) : "";
}

export const timetableScrollFrameStyle: CSSProperties = {
  overflowX: "auto",
  padding: "8px 2px 18px",
  margin: "-8px -2px -2px",
  scrollbarGutter: "stable",
};

export const timetableDateHeaderStyle: CSSProperties = {
  textAlign: "center",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  letterSpacing: 0,
  color: "var(--color-ink-secondary)",
};

export const timetableAxisLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: 0,
  color: "var(--color-ink-faint)",
  textAlign: "right",
  paddingRight: 8,
  transform: "translateY(-6px)",
  whiteSpace: "nowrap",
  ...tabularNumberStyle,
};

export function timetableCellFrameStyle(minute: number): CSSProperties {
  return {
    height: timetableSlotHeight,
    borderRight: "1px solid rgba(255,255,255,0.6)",
    borderTop: minute % 60 === 0 ? "1px solid rgba(0,0,0,0.12)" : "1px dashed rgba(52,50,48,0.18)",
  };
}
