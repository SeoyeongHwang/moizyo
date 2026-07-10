import type { ButtonHTMLAttributes } from "react";

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
        fontSize: 17,
        fontWeight: 500,
        lineHeight: 1.35,
        letterSpacing: 0,
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
        fontSize: 17,
        fontWeight: 500,
        lineHeight: 1.35,
        letterSpacing: 0,
        cursor: "pointer",
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
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: 0,
        color: "rgba(0,0,0,0.85)",
        cursor: "pointer",
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
    />
  );
}
