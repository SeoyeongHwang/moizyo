import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import { pagePadding, pageTitle, supportingText } from "../components/uiStyles";

interface LocationState {
  name?: string;
}

export function SubmittedPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const name = (location.state as LocationState | null)?.name || "참석자";

  return (
    <div style={{ ...pagePadding, padding: "80px 20px" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 9999,
            background: "rgba(var(--color-best-rgb), 0.12)",
            color: "var(--color-best)",
            fontSize: 26,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
          }}
        >
          ✓
        </div>
        <div style={{ ...pageTitle, marginBottom: 8 }}>
          응답이 제출되었습니다
        </div>
        <div style={{ ...supportingText, marginBottom: 24 }}>
          {name}님의 응답이 저장되었어요.
          <br />
          이제 전체 응답 현황을 확인할 수 있습니다.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <PrimaryButton onClick={() => navigate(`/vote/${id}/results`)}>결과 보기</PrimaryButton>
          <SecondaryButton onClick={() => navigate(`/vote/${id}/join`)}>다른 이름으로 응답</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
