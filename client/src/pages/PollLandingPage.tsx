import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPoll, seedDemo } from "../lib/api";
import type { PollMeta } from "../lib/scheduling";
import { pollLink, pollRangeLine, pollTitle, responseCountText } from "../lib/scheduling";
import { copyText } from "../lib/clipboard";
import { useToast } from "../components/Toast";
import { card, pagePadding, PrimaryButton, SecondaryButton, stepBadge, textInput, UtilityButton } from "../components/ui";

export function PollLandingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refetch = useCallback(() => {
    if (!id) return;
    getPoll(id)
      .then(setPoll)
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    refetch();
    const timer = window.setInterval(refetch, 4000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  if (notFound) {
    return <NotFoundPanel />;
  }
  if (!poll) return null;

  const link = pollLink(poll.id);

  async function onSeed() {
    if (!id) return;
    const result = await seedDemo(id);
    if (result.added > 0) {
      showToast(`데모 응답 ${result.added}명이 추가되었습니다`);
      refetch();
    } else {
      showToast("추가할 수 있는 데모 이름이 없습니다");
    }
  }

  return (
    <div style={{ ...pagePadding, padding: "48px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={stepBadge}>STEP 2 · 링크 공유</div>
        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-1px", marginBottom: 10 }}>
          투표가 생성되었습니다
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--color-ink-muted)", marginBottom: 28 }}>
          아래 링크를 팀 채팅방에 공유하세요. 참가자의 응답은 서로에게 보이지 않습니다.
        </div>

        <div style={card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.125px" }}>{pollTitle(poll)}</div>
            <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>{pollRangeLine(poll)}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div
              style={{
                ...textInput,
                flex: 1,
                background: "var(--color-canvas-soft)",
                color: "var(--color-ink-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                padding: "9px 12px",
              }}
            >
              {link}
            </div>
            <UtilityButton onClick={() => copyText(link, () => showToast("링크가 복사되었습니다"))}>
              복사
            </UtilityButton>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 9999, background: "var(--color-best)" }} />
            <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>{responseCountText(poll.responseCount)}</div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              borderTop: "1px solid var(--color-hairline)",
              paddingTop: 20,
            }}
          >
            <PrimaryButton onClick={() => navigate(`/vote/${poll.id}/join`)}>참가자로 응답하기</PrimaryButton>
            <SecondaryButton onClick={() => navigate(`/vote/${poll.id}/results`)}>결과 보기 (생성자)</SecondaryButton>
            <UtilityButton onClick={onSeed}>데모 응답 7명 채우기</UtilityButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>투표를 찾을 수 없습니다</div>
        <div style={{ fontSize: 15, color: "var(--color-ink-muted)" }}>링크가 정확한지 확인해 주세요.</div>
      </div>
    </div>
  );
}
