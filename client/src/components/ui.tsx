import type { ButtonHTMLAttributes, CSSProperties } from "react";

export const pagePadding: CSSProperties = {
  flex: 1,
  display: "flex",
  justifyContent: "center",
};

export const card: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-hairline)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

export const stepBadge: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.125px",
  color: "var(--color-primary)",
  background: "#fff",
  border: "1px solid var(--color-hairline)",
  borderRadius: "var(--radius-full)",
  padding: "4px 10px",
  display: "inline-block",
  marginBottom: 14,
};

export const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.125px",
  color: "var(--color-ink-muted)",
};

export const textInput: CSSProperties = {
  border: "1px solid var(--color-input-border)",
  borderRadius: "var(--radius-xs)",
  padding: 8,
  fontSize: 15,
  color: "rgba(0,0,0,0.9)",
  background: "#fff",
  width: "100%",
};

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { disabled?: boolean };

export function PrimaryButton({ style, disabled, ...props }: BtnProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        background: "var(--color-primary)",
        color: "#fff",
        border: "none",
        borderRadius: "var(--radius-full)",
        padding: "10px 24px",
        fontSize: 16,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        pointerEvents: disabled ? "none" : "auto",
        flex: "none",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget.style.background = "var(--color-primary-active)");
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget.style.background = "var(--color-primary)");
      }}
    />
  );
}

export function SecondaryButton({ style, ...props }: BtnProps) {
  return (
    <button
      {...props}
      style={{
        background: "#fff",
        color: "rgba(0,0,0,0.9)",
        border: "1px solid var(--color-hairline)",
        borderRadius: "var(--radius-full)",
        padding: "10px 22px",
        fontSize: 16,
        fontWeight: 500,
        cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        flex: "none",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
    />
  );
}

export function UtilityButton({ style, ...props }: BtnProps) {
  return (
    <button
      {...props}
      style={{
        background: "#fff",
        border: "1px solid var(--color-hairline)",
        borderRadius: "var(--radius-md)",
        padding: "4px 14px",
        fontSize: 14,
        fontWeight: 500,
        color: "rgba(0,0,0,0.85)",
        cursor: "pointer",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
    />
  );
}
