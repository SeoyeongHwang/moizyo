import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import { controlActionGap, pagePadding, pageTitle, supportingText } from "../components/uiStyles";

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
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
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
          제출 완료
        </div>
        <div style={{ ...supportingText, marginBottom: controlActionGap }}>
          {name}님의 응답이 저장되었어요.
          <br />
          같은 이름과 비밀번호를 이용하여 응답을 수정할 수 있어요.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <PrimaryButton onClick={() => navigate(`/vote/${id}/results`)}>결과 보기</PrimaryButton>
          <SecondaryButton onClick={() => navigate(`/vote/${id}/join`)}>응답 수정하기</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
