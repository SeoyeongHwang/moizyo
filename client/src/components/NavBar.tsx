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
        <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.35, letterSpacing: 0, whiteSpace: "nowrap" }}>moizyo</div>
      </div>
      <button onClick={() => navigate("/")} className="navbar-link-button">
        새 투표 만들기
      </button>
    </div>
  );
}
