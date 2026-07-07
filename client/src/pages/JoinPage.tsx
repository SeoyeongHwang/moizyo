import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { checkNameExists, getPoll } from "../lib/api";
import type { PollMeta } from "../lib/scheduling";
import { pollRangeLine, pollTitle } from "../lib/scheduling";
import { pagePadding, PrimaryButton, textInput } from "../components/ui";

export function JoinPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
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
    setChecking(true);
    try {
      const { exists } = await checkNameExists(id, trimmed);
      if (exists) {
        setError("이미 같은 이름의 응답이 있습니다. 다른 이름을 사용해 주세요.");
        setChecking(false);
        return;
      }
      navigate(`/vote/${id}/respond`, { state: { name: trimmed } });
    } catch {
      setError("확인 중 문제가 발생했습니다. 다시 시도해 주세요.");
      setChecking(false);
    }
  }

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll) return null;

  return (
    <div style={{ ...pagePadding, padding: "64px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-hairline)",
            borderRadius: "var(--radius-xl)",
            padding: 28,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.625px", lineHeight: 1.23, marginBottom: 6 }}>
              {pollTitle(poll)}
            </div>
            <div style={{ fontSize: 14, color: "var(--color-ink-muted)", lineHeight: 1.43 }}>{pollRangeLine(poll)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.125px", color: "var(--color-ink-muted)" }}>
              이름
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onJoin();
              }}
              placeholder="이름을 입력하세요"
              style={{ ...textInput, padding: 9 }}
            />
            {error && <div style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</div>}
          </div>
          <PrimaryButton onClick={onJoin} disabled={checking}>
            계속하기
          </PrimaryButton>
          <div style={{ fontSize: 13, color: "var(--color-ink-faint)", lineHeight: 1.45 }}>
            다른 참가자의 응답은 입력이 끝날 때까지 표시되지 않아요. 눈치 보지 말고 솔직하게 입력해 주세요.
          </div>
        </div>
      </div>
    </div>
  );
}
