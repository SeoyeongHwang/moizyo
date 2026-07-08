import { useNavigate } from "react-router-dom";

export function NavBar() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        background: "var(--color-canvas)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        rowGap: 8,
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 6 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "var(--color-primary)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            letterSpacing: 0,
          }}
        >
          언
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.35, letterSpacing: 0, whiteSpace: "nowrap" }}>moiltime</div>
      </div>
      <button
        onClick={() => navigate("/")}
        style={{
          minHeight: 40,
          background: "transparent",
          border: "none",
          borderRadius: "var(--radius-full)",
          padding: "0 14px",
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.35,
          letterSpacing: 0,
          color: "var(--color-ink-secondary)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transitionProperty: "background-color, color",
          transitionDuration: "150ms",
          transitionTimingFunction: "ease-out",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--color-primary-soft)";
          e.currentTarget.style.color = "var(--color-primary-active)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-ink-secondary)";
        }}
      >
        새 투표 만들기
      </button>
    </div>
  );
}
