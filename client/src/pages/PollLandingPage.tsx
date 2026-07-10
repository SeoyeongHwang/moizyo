import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getPoll } from "../lib/api";
import type { PollMeta } from "../lib/scheduling";
import { pollJoinLink, pollParticipationGuide, pollRangeLine, pollTitle } from "../lib/scheduling";
import { copyText } from "../lib/clipboard";
import { useToast } from "../components/Toast";
import { PrimaryButton, SecondaryButton, UtilityButton } from "../components/ui";
import {
  card,
  cardTitle,
  controlActionGap,
  metaText,
  pagePadding,
  pageTitle,
  postIntroContentGap,
  sectionTitle,
  supportingText,
  textInput,
} from "../components/uiStyles";

interface LocationState {
  created?: boolean;
}

export function PollLandingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const createdFromState = Boolean((location.state as LocationState | null)?.created);
  const isCreatorView = createdFromState;
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

  const link = pollJoinLink(poll.id);

  return (
    <div style={{ ...pagePadding, padding: "48px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
        <div style={{ ...pageTitle, marginBottom: 10 }}>
          {isCreatorView ? (
            "링크가 생성되었어요"
          ) : (
            <>
              <span>{pollTitle(poll)}</span>
              <br />
              <span>일정 투표 참여하기</span>
            </>
          )}
        </div>
        <div style={{ ...supportingText, marginBottom: postIntroContentGap, whiteSpace: "pre-line" }}>
          {isCreatorView ? "아래 링크를 참석자에게 공유해 주세요." : pollParticipationGuide(poll)}
        </div>

        <div style={{ ...card, alignItems: "center", gap: postIntroContentGap }}>
          {isCreatorView && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
              <div style={cardTitle}>{pollTitle(poll)}</div>
              <div style={{ ...metaText, whiteSpace: "pre-line" }}>{pollRangeLine(poll)}</div>
            </div>
          )}

          {isCreatorView && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: controlActionGap, width: "100%" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch", width: "100%" }}>
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
                <UtilityButton onClick={() => copyText(link, () => showToast("링크를 복사했어요"))}>
                  복사
                </UtilityButton>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <PrimaryButton onClick={() => navigate(`/vote/${poll.id}/join`)}>응답 추가하기</PrimaryButton>
                <SecondaryButton onClick={() => navigate(`/vote/${poll.id}/results`)}>결과 보기</SecondaryButton>
              </div>
            </div>
          )}

          {!isCreatorView && (
            <PrimaryButton onClick={() => navigate(`/vote/${poll.id}/join`)}>응답하기</PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

function NotFoundPanel() {
  return (
    <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ ...sectionTitle, marginBottom: 8 }}>투표를 찾을 수 없어요</div>
        <div style={supportingText}>링크가 정확한지 확인해 주세요.</div>
      </div>
    </div>
  );
}
