import { useNavigate } from "react-router-dom";

export function NavBar({ roleLabel }: { roleLabel: string }) {
  const navigate = useNavigate();
  return (
    <div
      style={{
        background: "#ffffff",
        borderBottom: "1px solid var(--color-hairline)",
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
            fontSize: 14,
          }}
        >
          언
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.25px", whiteSpace: "nowrap" }}>언제볼까</div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-primary)",
            background: "#ffffff",
            border: "1px solid var(--color-hairline)",
            borderRadius: 9999,
            padding: "3px 10px",
            letterSpacing: "0.125px",
            whiteSpace: "nowrap",
          }}
        >
          {roleLabel}
        </div>
      </div>
      <button
        onClick={() => navigate("/")}
        style={{
          background: "#ffffff",
          border: "1px solid var(--color-hairline)",
          borderRadius: 8,
          padding: "4px 14px",
          fontSize: 14,
          fontWeight: 500,
          color: "rgba(0,0,0,0.85)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
      >
        새 투표 만들기
      </button>
    </div>
  );
}
