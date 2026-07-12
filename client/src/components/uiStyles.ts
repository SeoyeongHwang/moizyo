import type { CSSProperties } from "react";

export const pagePadding: CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center",
};

export const postIntroContentGap = 28;
export const controlActionGap = postIntroContentGap + 8;

export const card: CSSProperties = {
  background: "transparent",
  border: 0,
  borderRadius: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

export const fieldLabel: CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1.35,
  color: "var(--color-ink-secondary)",
};

export const pageTitle: CSSProperties = {
  fontSize: "clamp(28px, 7vw, 40px)",
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: 0,
  textWrap: "balance",
};

export const sectionTitle: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.32,
  letterSpacing: 0,
  textWrap: "balance",
};

export const cardTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1.35,
  letterSpacing: 0,
  textWrap: "balance",
};

export const supportingText: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  letterSpacing: 0,
  color: "var(--color-ink-muted)",
  textWrap: "pretty",
};

export const metaText: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.45,
  letterSpacing: 0,
  color: "var(--color-ink-muted)",
};

export const captionText: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.4,
  letterSpacing: 0,
  color: "var(--color-ink-muted)",
};

export const textInput: CSSProperties = {
  border: "1px solid var(--color-input-border)",
  borderRadius: "var(--radius-xs)",
  padding: 8,
  fontSize: 16,
  lineHeight: 1.4,
  letterSpacing: 0,
  color: "rgba(0,0,0,0.9)",
  background: "#fff",
  width: "100%",
};
