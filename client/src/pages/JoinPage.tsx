import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { checkResponseAccess, getPoll } from "../lib/api";
import type { PollMeta } from "../lib/scheduling";
import { pollParticipationGuide, pollTitle } from "../lib/scheduling";
import { PrimaryButton } from "../components/ui";
import { captionText, controlActionGap, fieldLabel, metaText, pagePadding, pageTitle, sectionTitle, textInput } from "../components/uiStyles";

const MIN_PASSWORD_LENGTH = 4;

export function JoinPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPoll(id)
      .then(setPoll)
      .catch(() => setNotFound(true));
  }, [id]);

  async function onJoin() {
    if (!id || checking) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력해 주세요");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호를 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요`);
      return;
    }
    setChecking(true);
    try {
      const access = await checkResponseAccess(id, trimmed, password);
      if (access.status === "ok") {
        navigate(`/vote/${id}/respond`, {
          state: { name: trimmed, password, mode: "edit", responseId: access.id, marks: access.marks },
        });
        return;
      }
      // No response matches this name+password — treat as a brand new participant.
      // Names aren't unique, so this covers both "new name" and "동명이인 with a different password."
      navigate(`/vote/${id}/respond`, { state: { name: trimmed, password, mode: "create" } });
    } catch {
      setError("확인 중 문제가 발생했습니다. 다시 시도해 주세요.");
      setChecking(false);
    }
  }

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={sectionTitle}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll) return null;

  return (
    <div style={{ ...pagePadding, padding: "48px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: controlActionGap,
          }}
        >
          <div style={{ width: "100%" }}>
            <div style={{ ...pageTitle, marginBottom: 6 }}>
              {pollTitle(poll)}
            </div>
            <div style={{ ...metaText, whiteSpace: "pre-line" }}>{pollParticipationGuide(poll)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: controlActionGap, width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <label style={fieldLabel}>게스트로 응답하기</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onJoin();
                }}
                placeholder="응답에 사용할 이름"
                style={{ ...textInput, padding: 9 }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onJoin();
                }}
                placeholder="4자리 이상 비밀번호 (응답 수정 시 필요해요)"
                style={{ ...textInput, padding: 9 }}
              />
              {error && <div style={{ ...captionText, color: "var(--color-danger)" }}>{error}</div>}
            </div>
            <PrimaryButton onClick={onJoin} disabled={checking} style={{ minWidth: 120 }}>
              응답하기
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
