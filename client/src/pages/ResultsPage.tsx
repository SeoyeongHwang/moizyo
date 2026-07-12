import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteResponse, getResults, updatePoll } from "../lib/api";
import type { ResponseEntry } from "../lib/api";
import type { Candidate, LabeledResponseEntry, Marks, PollMeta } from "../lib/scheduling";
import {
  SLOT_MINUTES,
  aggregate,
  buildConfirmationMessage,
  candidates as computeCandidates,
  dateShort,
  dedupeResponseNames,
  durationLabel,
  evaluateSlot,
  fmtMin,
  labelResponseEntries,
  pollJoinLink,
  pollTitle,
  recommendationHighlight,
  responseCountText,
  slots,
} from "../lib/scheduling";
import { copyText } from "../lib/clipboard";
import {
  timetableAxisLabelStyle,
  timetableAxisText,
  timetableCellFrameStyle,
  timetableContentWidth,
  timetableDateHeaderStyle,
  timetableEndAxisLabelStyle,
  timetableGridColumns as buildTimetableGridColumns,
  timetableLayerZIndex,
  timetableSlotHeight,
  timetableTouchSlotHeight,
  useIsCoarsePointer,
} from "../lib/timetable";
import { AccordionPanel } from "../components/AccordionPanel";
import { ScrollButton, TimetableScrollFrame } from "../components/TimetableScrollFrame";
import { useToast } from "../components/Toast";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import {
  captionText,
  card,
  cardTitle,
  metaText,
  pagePadding,
  pageTitle,
  sectionTitle,
  supportingText,
  textInput,
} from "../components/uiStyles";

const tabularNumberStyle = { fontVariantNumeric: "tabular-nums" as const };
const requiredPanelId = "required-participants-panel";
const accordionCard = { ...card, gap: 0, padding: 0 };
const heatmapMinAlpha = 0.08;
const heatmapMaxAlpha = 0.92;
const heatmapContrastPower = 1.25;
const recommendationHighlightColor = "rgba(31, 30, 28, 0.88)";
const recommendationHighlightLabelBg = "rgba(31, 30, 28, 0.96)";
const recommendationHighlightShadow = "0 0 0 4px rgba(31, 30, 28, 0.08), 0 6px 14px rgba(31, 30, 28, 0.12)";
const inactiveRecommendationHighlightColor = "#7f7972";
const inactiveRecommendationHighlightLabelBg = "#615d59";
const recommendationUpdateMinMs = 500;
const durationMinuteOptions = [0, 15, 30, 45];
type DetailPerson = { name: string; status: "available" | "unavailable" | "neutral" };
type RecommendationSnapshot = {
  recommendations: Candidate[];
  total: number;
  requiredCount: number;
  poll: PollMeta;
};
type RecommendationOverlay = {
  c: Candidate;
  i: number;
  dateIndex: number;
  startIndex: number;
  slotCount: number;
  labelBelow: boolean;
  active: boolean;
  labelBg: string;
};

function placeRecommendationLabels(overlays: RecommendationOverlay[]): RecommendationOverlay[] {
  const placed = overlays.map((overlay) => ({ ...overlay }));
  const movedBelow = new Set<number>();

  for (let pass = 0; pass < placed.length; pass += 1) {
    const groups = new Map<string, number[]>();
    let changed = false;

    placed.forEach((overlay, index) => {
      const anchorIndex = overlay.labelBelow ? overlay.startIndex + overlay.slotCount : overlay.startIndex;
      const key = `${overlay.dateIndex}_${anchorIndex}`;
      groups.set(key, [...(groups.get(key) || []), index]);
    });

    groups.forEach((indices) => {
      if (indices.length < 2) return;

      const endingAtBoundary = indices.filter((index) => placed[index].labelBelow);
      const startingAtBoundary = indices.filter((index) => !placed[index].labelBelow);
      if (endingAtBoundary.length === 0 || startingAtBoundary.length === 0) return;

      startingAtBoundary.forEach((overlayIndex) => {
        if (movedBelow.has(overlayIndex)) return;
        placed[overlayIndex].labelBelow = true;
        movedBelow.add(overlayIndex);
        changed = true;
      });
    });

    if (!changed) break;
  }

  return placed;
}

function activeRequiredParticipants(required: string[] | undefined, participantNames: string[]): string[] {
  const participantSet = new Set(participantNames);
  const seen = new Set<string>();
  return (required || []).filter((name) => {
    if (!participantSet.has(name) || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [responses, setResponses] = useState<Record<string, Marks>>({});
  const [responseEntries, setResponseEntries] = useState<ResponseEntry[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgEdited, setMsgEdited] = useState(false);
  const [requiredOpen, setRequiredOpen] = useState(false);
  const [selectedRecommendationIdx, setSelectedRecommendationIdx] = useState<number | null>(null);
  const [displayedRecommendationSnapshot, setDisplayedRecommendationSnapshot] = useState<RecommendationSnapshot | null>(null);
  const [recommendationsUpdating, setRecommendationsUpdating] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [durationEditorOpen, setDurationEditorOpen] = useState(false);
  const [savingDuration, setSavingDuration] = useState(false);
  const [responseEditorOpen, setResponseEditorOpen] = useState(false);
  const [selectedResponseIds, setSelectedResponseIds] = useState<number[]>([]);
  const [deletingResponses, setDeletingResponses] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const recommendationUpdateIdRef = useRef(0);
  const recommendationUpdateTimerRef = useRef<number | undefined>(undefined);
  const detailSheetRef = useRef<HTMLDivElement | null>(null);
  const pendingCellRevealRef = useRef<DOMRect | null>(null);
  const isCoarsePointer = useIsCoarsePointer();

  const refetch = useCallback(async () => {
    if (!id) return;
    try {
      const { poll: p, responses: r } = await getResults(id);
      setPoll(p);
      setResponseEntries(r);
      setResponses(dedupeResponseNames(r));
    } catch {
      setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const responseParticipants = useMemo(() => labelResponseEntries(responseEntries), [responseEntries]);
  const participantNames = useMemo(() => Object.keys(responses), [responses]);
  const activeRequiredNames = useMemo(
    () => activeRequiredParticipants(poll?.required, participantNames),
    [poll?.required, participantNames]
  );
  const pollForRecommendations = useMemo<PollMeta | null>(
    () => (poll ? { ...poll, required: activeRequiredNames } : null),
    [poll, activeRequiredNames]
  );
  const total = participantNames.length;
  const requiredCount = activeRequiredNames.length;
  const recs = useMemo<Candidate[]>(
    () => (pollForRecommendations ? computeCandidates(pollForRecommendations, responses) : []),
    [pollForRecommendations, responses]
  );
  const currentRecommendationSnapshot = useMemo<RecommendationSnapshot | null>(
    () =>
      pollForRecommendations
        ? {
            recommendations: recs,
            total,
            requiredCount,
            poll: pollForRecommendations,
          }
        : null,
    [pollForRecommendations, recs, total, requiredCount]
  );
  const visibleRecommendationSnapshot =
    recommendationsUpdating && displayedRecommendationSnapshot ? displayedRecommendationSnapshot : currentRecommendationSnapshot;
  const visibleRecs = visibleRecommendationSnapshot?.recommendations ?? [];
  const visibleTotal = visibleRecommendationSnapshot?.total ?? total;
  const visibleRequiredCount = visibleRecommendationSnapshot?.requiredCount ?? requiredCount;

  const finalStats = useMemo(() => {
    if (!pollForRecommendations || !pollForRecommendations.final) return null;
    return evaluateSlot(
      pollForRecommendations,
      responses,
      pollForRecommendations.final.date,
      pollForRecommendations.final.startMin,
      pollForRecommendations.final.endMin
    );
  }, [pollForRecommendations, responses]);

  // Regenerate the confirmation message whenever the confirmed slot changes,
  // unless the user has started editing it by hand.
  useEffect(() => {
    if (!pollForRecommendations || !pollForRecommendations.final || !finalStats || msgEdited) return;
    setMsgText(
      buildConfirmationMessage(
        { ...pollForRecommendations.final, avail: finalStats.avail, okAny: finalStats.okAny, reqOk: finalStats.reqOk },
        pollForRecommendations,
        total,
        recs
      )
    );
  }, [pollForRecommendations, finalStats, total, msgEdited, recs]);

  useEffect(() => {
    if (!messageModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMessageModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messageModalOpen]);

  useEffect(() => {
    if (!durationEditorOpen || savingDuration) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDurationEditorOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [durationEditorOpen, savingDuration]);

  useEffect(() => {
    if (!responseEditorOpen || deletingResponses) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setResponseEditorOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [responseEditorOpen, deletingResponses]);

  useEffect(() => {
    if (!detailSheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDetailSheetOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailSheetOpen]);

  // 탭한 셀이 시트에 가려지면 셀이 시트 위로 오도록 페이지를 스크롤한다.
  useEffect(() => {
    if (!detailSheetOpen) return;
    const cellRect = pendingCellRevealRef.current;
    pendingCellRevealRef.current = null;
    if (!cellRect) return;
    const frame = requestAnimationFrame(() => {
      const sheet = detailSheetRef.current;
      if (!sheet) return;
      // 등장 애니메이션(transform) 중에도 어긋나지 않도록 시트의 최종 위치 기준으로 계산한다.
      const sheetTop = window.innerHeight - sheet.offsetHeight;
      const overlap = cellRect.bottom - (sheetTop - 8);
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailSheetOpen, detailKey]);

  useEffect(() => {
    return () => {
      if (recommendationUpdateTimerRef.current !== undefined) {
        window.clearTimeout(recommendationUpdateTimerRef.current);
      }
    };
  }, []);

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={sectionTitle}>투표를 찾을 수 없어요</div>
      </div>
    );
  }
  if (!poll) return null;

  const sl = slots(poll);
  const slotHeight = isCoarsePointer ? timetableTouchSlotHeight : timetableSlotHeight;
  const map = aggregate(responses);
  const names = participantNames;
  const req = activeRequiredNames;
  const pollForResults = visibleRecommendationSnapshot?.poll ?? pollForRecommendations ?? poll;
  const durationText = durationLabel(poll.dur);

  function beginRecommendationUpdate(): { updateId: number; startedAt: number } {
    const updateId = recommendationUpdateIdRef.current + 1;
    recommendationUpdateIdRef.current = updateId;
    if (recommendationUpdateTimerRef.current !== undefined) window.clearTimeout(recommendationUpdateTimerRef.current);

    setDisplayedRecommendationSnapshot(visibleRecommendationSnapshot ?? currentRecommendationSnapshot);
    setRecommendationsUpdating(true);
    return { updateId, startedAt: Date.now() };
  }

  function finishRecommendationUpdate(updateId: number, startedAt: number) {
    if (recommendationUpdateIdRef.current !== updateId) return;
    if (recommendationUpdateTimerRef.current !== undefined) window.clearTimeout(recommendationUpdateTimerRef.current);
    const remainingMs = Math.max(0, recommendationUpdateMinMs - (Date.now() - startedAt));
    recommendationUpdateTimerRef.current = window.setTimeout(() => {
      if (recommendationUpdateIdRef.current !== updateId) return;
      setSelectedRecommendationIdx(0);
      setRecommendationsUpdating(false);
      setDisplayedRecommendationSnapshot(null);
      recommendationUpdateTimerRef.current = undefined;
    }, remainingMs);
  }

  function cancelRecommendationUpdate(updateId: number) {
    if (recommendationUpdateIdRef.current !== updateId) return;
    if (recommendationUpdateTimerRef.current !== undefined) window.clearTimeout(recommendationUpdateTimerRef.current);
    setRecommendationsUpdating(false);
    setDisplayedRecommendationSnapshot(null);
    recommendationUpdateTimerRef.current = undefined;
  }

  async function toggleRequired(name: string) {
    if (!id || !poll) return;
    const next = req.includes(name) ? req.filter((n) => n !== name) : [...req, name];
    const previousPoll = poll;
    const { updateId, startedAt } = beginRecommendationUpdate();
    setPoll({ ...poll, required: next });

    try {
      const updated = await updatePoll(id, { required: next });
      setPoll(updated);
      finishRecommendationUpdate(updateId, startedAt);
    } catch {
      if (recommendationUpdateIdRef.current === updateId) {
        setPoll(previousPoll);
        cancelRecommendationUpdate(updateId);
        showToast("필수 참석자를 변경하지 못했어요. 다시 시도해 주세요");
      }
    }
  }

  async function onPick(idx: number) {
    if (!id || !poll) return;
    const c = visibleRecs[idx];
    if (!c) return;
    const updated = await updatePoll(id, { final: { date: c.date, startMin: c.startMin, endMin: c.endMin } });
    setPoll(updated);
    setMsgEdited(false);
  }

  function openResponseEditor() {
    setSelectedResponseIds([]);
    setResponseEditorOpen(true);
  }

  async function saveMeetingDuration(duration: number) {
    if (!id || !poll || savingDuration) return;
    const { updateId, startedAt } = beginRecommendationUpdate();
    setSavingDuration(true);
    try {
      const updated = await updatePoll(id, { dur: duration });
      setPoll(updated);
      setMsgEdited(false);
      setDurationEditorOpen(false);
      showToast("예상 소요 시간을 수정했어요");
      finishRecommendationUpdate(updateId, startedAt);
    } catch {
      cancelRecommendationUpdate(updateId);
      showToast("예상 소요 시간을 수정하지 못했어요. 다시 시도해 주세요");
    } finally {
      setSavingDuration(false);
    }
  }

  function toggleResponseSelection(responseId: number) {
    setSelectedResponseIds((ids) =>
      ids.includes(responseId) ? ids.filter((id) => id !== responseId) : [...ids, responseId]
    );
  }

  async function deleteSelectedResponses() {
    if (!id || deletingResponses || selectedResponseIds.length === 0) return;

    const { updateId, startedAt } = beginRecommendationUpdate();
    setDeletingResponses(true);
    let deletedCount = 0;
    try {
      for (const responseId of selectedResponseIds) {
        await deleteResponse(id, responseId);
        deletedCount += 1;
      }
      showToast(`${deletedCount}명의 응답을 삭제했어요`);
      setSelectedResponseIds([]);
      setResponseEditorOpen(false);
    } catch {
      if (deletedCount > 0) {
        setSelectedResponseIds([]);
        showToast(`${deletedCount}명의 응답을 삭제했어요. 일부는 삭제하지 못했으니 다시 시도해 주세요`);
      } else {
        showToast("응답을 삭제하지 못했어요. 다시 시도해 주세요");
      }
    } finally {
      setDeletingResponses(false);
      await refetch();
      finishRecommendationUpdate(updateId, startedAt);
    }
  }

  const dk = detailKey;
  const de = dk ? map[dk] || { best: [], ok: [] } : null;
  const detailTitle = dk ? detailSlotTitle(dk) : null;
  const detailPanelTime = detailTitle ? `${detailTitle.date} ${detailTitle.time}` : "시간표에서 시간을 선택해 보세요";
  const detailPeople: DetailPerson[] = names.map((name) => ({
    name,
    status: de ? (de.best.includes(name) || de.ok.includes(name) ? "available" : "unavailable") : "neutral",
  }));
  const detailAvailableCount = detailPeople.filter((person) => person.status === "available").length;
  // 터치 기기에서는 선택 시간 상세를 바텀시트가 맡으므로, 카드는 중립 상태의 응답자 명단만 보여준다.
  const rosterPeople: DetailPerson[] = names.map((name) => ({ name, status: "neutral" }));

  const finalIdx = poll.final
    ? visibleRecs.findIndex((c) => c.date === poll.final!.date && c.startMin === poll.final!.startMin && c.endMin === poll.final!.endMin)
    : -1;
  const selectedRecommendationExists =
    selectedRecommendationIdx !== null && selectedRecommendationIdx >= 0 && selectedRecommendationIdx < visibleRecs.length;
  const activeRecommendationIdx = selectedRecommendationExists ? selectedRecommendationIdx : visibleRecs.length ? 0 : -1;
  const timetableGridColumns = buildTimetableGridColumns(poll.dates.length);
  const timetableWidth = timetableContentWidth(poll.dates.length);
  const recommendationOverlays = placeRecommendationLabels(
    visibleRecs.reduce<RecommendationOverlay[]>((items, c, i) => {
      const dateIndex = poll.dates.indexOf(c.date);
      const startIndex = sl.indexOf(c.startMin);
      const slotCount = Math.max(1, Math.round((c.endMin - c.startMin) / SLOT_MINUTES));
      if (dateIndex < 0 || startIndex < 0) return items;
      const active = activeRecommendationIdx === i;
      items.push({
        c,
        i,
        dateIndex,
        startIndex,
        slotCount,
        labelBelow: startIndex === 0,
        active,
        labelBg: active ? recommendationHighlightLabelBg : inactiveRecommendationHighlightLabelBg,
      });
      return items;
    }, [])
  );

  function showSlotDetail(key: string, cell: HTMLElement) {
    setDetailKey(key);
    // 터치 기기에서는 상세 카드가 시간표 아래(폴드 밖)에 있으므로, 바텀시트로 즉시 보여준다.
    if (!isCoarsePointer) return;
    pendingCellRevealRef.current = cell.getBoundingClientRect();
    setDetailSheetOpen(true);
  }

  function selectRecommendation(idx: number) {
    if (recommendationsUpdating) return;
    const candidate = visibleRecs[idx];
    setSelectedRecommendationIdx(idx);
    if (candidate) setDetailKey(`${candidate.date}_${candidate.startMin}`);
  }

  async function onShareRecommendation(idx: number) {
    if (!poll || recommendationsUpdating) return;
    const candidate = visibleRecs[idx];
    if (!candidate) return;
    if (idx !== finalIdx) await onPick(idx);
    setMsgText(buildConfirmationMessage(candidate, pollForResults, visibleTotal, visibleRecs));
    setMsgEdited(false);
    setSelectedRecommendationIdx(idx);
    setMessageModalOpen(true);
  }

  const detailSheetVisible = isCoarsePointer && detailSheetOpen && detailTitle !== null;

  return (
    // 시트가 떠 있는 동안에도 페이지 하단 콘텐츠가 스크롤로 닿을 수 있도록 하단 패딩을 늘린다.
    <div style={{ ...pagePadding, padding: detailSheetVisible ? "36px 20px 320px" : "36px 20px 100px" }}>
      <div style={{ width: "100%", maxWidth: 1040 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ ...pageTitle, maxWidth: 820, minWidth: 0 }}>
              <span>{durationText}</span>{" "}<span>{pollTitle(poll)}</span>
              <span>,<br></br>언제 모일까요?</span>
            </div>
            <div className="results-header-actions">
              <SecondaryButton
                onClick={() => copyText(pollJoinLink(poll.id), () => showToast("링크를 복사했어요"))}
                style={{ flex: "none", whiteSpace: "nowrap", padding: "10px 20px", fontSize: 16, fontWeight: 600, minHeight: 44 }}
              >
                응답 링크 복사
              </SecondaryButton>
              <PrimaryButton
                onClick={() => navigate(`/vote/${poll.id}/join`)}
                style={{ flex: "none", whiteSpace: "nowrap", padding: "10px 20px", fontSize: 16, fontWeight: 600, minHeight: 44 }}
              >
                응답 추가하기
              </PrimaryButton>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ ...metaText, ...tabularNumberStyle }}>{responseCountText(total)}</div>
            {visibleTotal === 0 && (
              <button type="button" onClick={() => setDurationEditorOpen(true)} className="chip-button">
                소요 시간 수정
              </button>
            )}
          </div>
        </div>

        {visibleTotal > 0 ? (
          <>
          <div style={{ ...card, minWidth: 0, padding: 0, marginBottom: 20 }}>
            <RecommendationCarousel
              recommendations={visibleRecs}
              activeIdx={activeRecommendationIdx}
              total={visibleTotal}
              requiredCount={visibleRequiredCount}
              updating={recommendationsUpdating}
              onSelect={selectRecommendation}
              onShare={onShareRecommendation}
              headingAction={
                <button type="button" onClick={() => setDurationEditorOpen(true)} className="chip-button">
                  소요 시간 수정
                </button>
              }
            />
          </div>

          <div className="results-layout">
            <div className="results-main-panel">
              <div style={{ ...card, minWidth: 0, padding: 0 }}>
                <TimetableScrollFrame>
                  <div style={{ width: timetableWidth, userSelect: "none" }}>
                    <div style={{ display: "grid", gridTemplateColumns: timetableGridColumns, marginBottom: 4 }}>
                      <div />
                      {poll.dates.map((d) => (
                        <div key={d} style={timetableDateHeaderStyle}>
                          {dateShort(d)}
                        </div>
                      ))}
                    </div>
                    <div style={{ position: "relative" }}>
                      {sl.map((m) => (
                        <div key={m} style={{ display: "grid", gridTemplateColumns: timetableGridColumns }}>
                          <div style={timetableAxisLabelStyle}>
                            {timetableAxisText(m)}
                          </div>
                          {poll.dates.map((d) => {
                            const key = d + "_" + m;
                            const e = map[key] || { best: [], ok: [] };
                            const a = e.best.length + e.ok.length;
                            const ratio = total ? a / total : 0;
                            const alpha = heatmapMinAlpha + Math.pow(ratio, heatmapContrastPower) * (heatmapMaxAlpha - heatmapMinAlpha);
                            const bg = a === 0 ? "var(--color-canvas-soft)" : `rgba(var(--color-best-rgb), ${alpha.toFixed(2)})`;
                            const hovered = detailKey === key;
                            return (
                              <div
                                key={key}
                                onMouseEnter={() => setDetailKey(key)}
                                onClick={(e) => showSlotDetail(key, e.currentTarget)}
                                style={{
                                  ...timetableCellFrameStyle(m, slotHeight),
                                  position: "relative",
                                  cursor: "pointer",
                                  background: bg,
                                  outline: hovered ? "2px dashed rgba(31, 30, 28, 0.72)" : "none",
                                  outlineOffset: -1,
                                  zIndex: hovered ? timetableLayerZIndex.cellHover : 0,
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                      <div style={{ display: "grid", gridTemplateColumns: timetableGridColumns }}>
                        <div style={timetableEndAxisLabelStyle}>
                          {timetableAxisText(poll.endHour * 60)}
                        </div>
                      </div>
                      {recommendationOverlays.map(({ c, i, dateIndex, startIndex, slotCount, active }) => {
                        return (
                          <div
                            key={`${c.date}_${c.startMin}_${i}`}
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: startIndex * slotHeight,
                              left: 0,
                              right: 0,
                              height: slotCount * slotHeight,
                              display: "grid",
                              gridTemplateColumns: timetableGridColumns,
                              pointerEvents: "none",
                              zIndex: active
                                ? timetableLayerZIndex.activeRecommendationHighlight
                                : timetableLayerZIndex.recommendationHighlight,
                              opacity: recommendationsUpdating ? 0.34 : 1,
                              filter: recommendationsUpdating ? "saturate(0.55)" : "saturate(1)",
                              transitionProperty: "opacity, filter",
                              transitionDuration: "180ms",
                              transitionTimingFunction: "ease-out",
                            }}
                          >
                            <div
                              style={{
                                gridColumn: `${dateIndex + 2} / ${dateIndex + 3}`,
                                position: "relative",
                                height: "100%",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  inset: -2,
                                  border: `4px solid ${active ? recommendationHighlightColor : inactiveRecommendationHighlightColor}`,
                                  borderRadius: 9,
                                  boxSizing: "border-box",
                                  background: active ? "rgba(31, 30, 28, 0.04)" : "transparent",
                                  boxShadow: active ? recommendationHighlightShadow : "none",
                                  transitionProperty: "box-shadow, background",
                                  transitionDuration: "180ms",
                                  transitionTimingFunction: "ease-out",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {recommendationOverlays.map(({ c, i, dateIndex, startIndex, slotCount, labelBelow, active, labelBg }) => {
                        return (
                          <div
                            key={`${c.date}_${c.startMin}_${i}_label`}
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: startIndex * slotHeight,
                              left: 0,
                              right: 0,
                              height: slotCount * slotHeight,
                              display: "grid",
                              gridTemplateColumns: timetableGridColumns,
                              pointerEvents: "none",
                              zIndex: timetableLayerZIndex.recommendationLabel,
                              opacity: recommendationsUpdating ? 0.34 : 1,
                              filter: recommendationsUpdating ? "saturate(0.55)" : "saturate(1)",
                              transitionProperty: "opacity, filter",
                              transitionDuration: "180ms",
                              transitionTimingFunction: "ease-out",
                            }}
                          >
                            <div
                              style={{
                                gridColumn: `${dateIndex + 2} / ${dateIndex + 3}`,
                                position: "relative",
                                height: "100%",
                              }}
                            >
                              <span
                                style={{
                                  position: "absolute",
                                  top: labelBelow ? undefined : -18,
                                  bottom: labelBelow ? -18 : undefined,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minHeight: 24,
                                  borderRadius: 9999,
                                  background: labelBg,
                                  color: "#ffffff",
                                  boxShadow: active ? "0 2px 8px rgba(0, 0, 0, 0.18)" : "none",
                                  padding: "3px 9px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  lineHeight: 1.2,
                                  letterSpacing: 0,
                                  whiteSpace: "nowrap",
                                  ...tabularNumberStyle,
                                }}
                              >
                                <span
                                  aria-hidden="true"
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: labelBelow ? -3 : undefined,
                                    bottom: labelBelow ? undefined : -3,
                                    width: 8,
                                    height: 8,
                                    borderRadius: 2,
                                    background: labelBg,
                                    transform: "translateX(-50%) rotate(45deg)",
                                  }}
                                />
                                <span style={{ position: "relative" }}>{rankLabel(i)}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TimetableScrollFrame>
              </div>
            </div>

            <div className="results-side-panel">
              <div
                className="time-detail-card"
                style={{
                  ...card,
                  color: "var(--time-detail-ink)",
                  gap: 12,
                  background: "transparent",
                  padding: "0 0 4px",
                }}
              >
                {!isCoarsePointer && (
                  <div
                    style={
                      detailTitle
                        ? { fontSize: 19, fontWeight: 700, lineHeight: 1.35, letterSpacing: 0, color: "var(--time-detail-ink)", textWrap: "balance" as const }
                        : { ...metaText, color: "var(--time-detail-muted)", fontWeight: 500 }
                    }
                  >
                    {detailTitle ? (
                      <>
                        <span>{detailTitle.date}</span>{" "}
                        <span style={tabularNumberStyle}>{detailTitle.time}</span>
                      </>
                    ) : (
                      detailPanelTime
                    )}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ ...captionText, color: "var(--time-detail-ink)", fontWeight: 700 }}>
                    응답자
                  </div>
                  <button type="button" onClick={openResponseEditor} className="chip-button">
                    관리
                  </button>
                </div>
                <NameChips people={isCoarsePointer ? rosterPeople : detailPeople} />
              </div>

              <div style={accordionCard}>
                <AccordionHeader
                  title="필수 참석자"
                  summary={req.length ? `${req.length}명` : ""}
                  summaryPlacement="inline"
                  open={requiredOpen}
                  panelId={requiredPanelId}
                  onToggle={() => setRequiredOpen((open) => !open)}
                />
                <AccordionPanel id={requiredPanelId} open={requiredOpen}>
                  <div style={{ ...metaText, marginBottom: 12, textWrap: "pretty" }}>
                    필수 참석자가 가능한 시간을 우선 추천해요.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {names.map((n) => {
                      const checked = req.includes(n);
                      return (
                        <label key={n} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRequired(n)}
                            style={{ accentColor: "var(--color-primary)", width: 16, height: 16 }}
                          />
                          <span style={{ flex: 1 }}>{n}</span>
                        </label>
                      );
                    })}
                  </div>
                </AccordionPanel>
              </div>
            </div>
          </div>
          </>
        ) : (
          <div style={{ padding: "24px 0 0", textAlign: "center" }}>
            <div style={supportingText}>
              아직 응답이 없어요.<br></br>참석자에게 응답 링크를 공유해 보세요.
            </div>
          </div>
        )}
      </div>
      {detailSheetVisible && (
        <div ref={detailSheetRef} className="time-detail-sheet" role="region" aria-label="선택한 시간의 응답 상세">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35, letterSpacing: 0 }}>
                <span>{detailTitle.date}</span>{" "}
                <span style={tabularNumberStyle}>{detailTitle.time}</span>
              </div>
              <div style={{ ...captionText, marginTop: 2, ...tabularNumberStyle }}>
                {names.length ? `${names.length}명 중 ${detailAvailableCount}명 가능` : "아직 응답이 없어요"}
              </div>
            </div>
            <button
              type="button"
              aria-label="시간 상세 닫기"
              onClick={() => setDetailSheetOpen(false)}
              style={{
                width: 44,
                height: 44,
                margin: "-8px -12px 0 0",
                border: "none",
                borderRadius: "var(--radius-full)",
                background: "transparent",
                color: "var(--color-ink-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
                cursor: "pointer",
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="time-detail-sheet__chips">
            <NameChips people={detailPeople} />
          </div>
        </div>
      )}
      {poll.final && messageModalOpen && (
        <ConfirmationMessageModal
          message={msgText}
          onChange={(value) => {
            setMsgText(value);
            setMsgEdited(true);
          }}
          onClose={() => setMessageModalOpen(false)}
          onCopy={() => copyText(msgText, () => showToast("메시지를 복사했어요"))}
        />
      )}
      {durationEditorOpen && (
        <MeetingDurationEditorModal
          poll={poll}
          saving={savingDuration}
          onClose={() => {
            if (!savingDuration) setDurationEditorOpen(false);
          }}
          onSave={saveMeetingDuration}
        />
      )}
      {responseEditorOpen && (
        <ResponseEditorModal
          participants={responseParticipants}
          selectedIds={selectedResponseIds}
          deleting={deletingResponses}
          onToggle={toggleResponseSelection}
          onClose={() => {
            if (!deletingResponses) setResponseEditorOpen(false);
          }}
          onDelete={deleteSelectedResponses}
        />
      )}
    </div>
  );
}

function RecommendationCarousel({
  recommendations,
  activeIdx,
  total,
  requiredCount,
  updating,
  onSelect,
  onShare,
  headingAction,
}: {
  recommendations: Candidate[];
  activeIdx: number;
  total: number;
  requiredCount: number;
  updating: boolean;
  onSelect: (idx: number) => void;
  onShare: (idx: number) => void;
  headingAction?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const helpRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [helpOpen, setHelpOpen] = useState(false);

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const next = {
      left: el.scrollLeft > 1,
      right: maxScrollLeft - el.scrollLeft > 1,
    };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  const scrollByDirection = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: el.clientWidth * 0.7 * (direction === "left" ? -1 : 1),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    updateEdges();
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);

    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(el);
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);

    updateEdges();

    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
      resizeObserver.disconnect();
    };
  }, [recommendations.length, updateEdges]);

  useEffect(() => {
    if (!helpOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (!helpRef.current?.contains(e.target as Node)) setHelpOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setHelpOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [helpOpen]);

  return (
    <section className="recommendation-panel-content" aria-busy={updating}>
      <div className="recommendation-carousel-heading">
        <div className="recommendation-heading-title-row">
          <div style={{ ...cardTitle, color: "var(--color-ink)" }}>추천 시간</div>
          <div ref={helpRef} className="recommendation-help">
            <button
              type="button"
              className="recommendation-help-button"
              aria-label="추천 기준 보기"
              aria-expanded={helpOpen}
              aria-controls="recommendation-help-tooltip"
              onClick={() => setHelpOpen((open) => !open)}
            >
              <QuestionMarkIcon />
            </button>
            {helpOpen && (
              <div id="recommendation-help-tooltip" className="recommendation-help-tooltip" role="tooltip">
                <button
                  type="button"
                  className="recommendation-help-close"
                  aria-label="추천 기준 도움말 닫기"
                  onClick={() => setHelpOpen(false)}
                >
                  <CloseIcon />
                </button>
                <div className="recommendation-help-copy">
                  필수 참석자가 모두 가능한 시간을 먼저 보여드리고, 가능한 사람이 많은 순으로 추천해요.
                  같은 날짜에서 시간이 겹치는 후보는 빼고 보여드려요.
                </div>
              </div>
            )}
          </div>
          {headingAction ? <div style={{ marginLeft: "auto", flex: "none" }}>{headingAction}</div> : null}
        </div>
      </div>

      {recommendations.length > 0 ? (
        <div className="recommendation-carousel-frame" data-left-edge={edges.left ? "true" : "false"} data-right-edge={edges.right ? "true" : "false"}>
          <div ref={scrollRef} className="recommendation-carousel" data-updating={updating ? "true" : "false"} role="listbox" aria-label="추천 시간">
            {recommendations.map((candidate, i) => {
              const selected = activeIdx === i;
              return (
                <div
                  key={`${candidate.date}_${candidate.startMin}_${i}`}
                  className="recommendation-carousel-card"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={updating}
                  tabIndex={updating ? -1 : 0}
                  onClick={() => {
                    if (!updating) onSelect(i);
                  }}
                  onKeyDown={(e) => {
                    if (updating) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(i);
                    }
                  }}
                  style={{
                    border: selected ? "1px solid transparent" : "1px solid rgba(52, 50, 48, 0.08)",
                    outline: selected ? "3px solid rgba(var(--color-best-rgb), 0.72)" : undefined,
                    outlineOffset: selected ? "-3px" : undefined,
                    background: selected ? "rgba(var(--color-best-rgb), 0.06)" : "rgba(52, 50, 48, 0.025)",
                    boxShadow: "none",
                    cursor: updating ? "default" : "pointer",
                  }}
                >
                  <div className="recommendation-carousel-card-inner">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 32,
                          minHeight: 24,
                          borderRadius: 9999,
                          background: selected ? "var(--color-primary)" : "rgba(0, 0, 0, 0.055)",
                          color: selected ? "#ffffff" : "rgba(0, 0, 0, 0.68)",
                          fontSize: 13,
                          fontWeight: 700,
                          lineHeight: 1,
                          letterSpacing: 0,
                          padding: "4px 8px",
                          ...tabularNumberStyle,
                        }}
                      >
                        {rankLabel(i)}
                      </span>
                      <button
                        type="button"
                        className="recommendation-card-share"
                        aria-label={`${rankLabel(i)} 시간으로 공유하기`}
                        disabled={updating}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShare(i);
                        }}
                      >
                        <ShareIcon />
                      </button>
                    </div>

                    <div className="recommendation-card-time">
                      <span>{dateShort(candidate.date)}</span>
                      <span style={tabularNumberStyle}>{fmtMin(candidate.startMin)} ~ {fmtMin(candidate.endMin)}</span>
                    </div>

                    <RecommendationCriteria
                      candidate={candidate}
                      total={total}
                      requiredCount={requiredCount}
                      highlight={recommendationHighlight(candidate, recommendations, total)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="recommendation-carousel-edge recommendation-carousel-edge--left" aria-hidden={!edges.left}>
            <ScrollButton direction="left" disabled={!edges.left || updating} onClick={() => scrollByDirection("left")} />
          </div>
          <div className="recommendation-carousel-edge recommendation-carousel-edge--right" aria-hidden={!edges.right}>
            <ScrollButton direction="right" disabled={!edges.right || updating} onClick={() => scrollByDirection("right")} />
          </div>
        </div>
      ) : (
        <div
          className="recommendation-empty"
          data-updating={updating ? "true" : "false"}
          style={{ ...metaText, padding: "2px 0 0", textWrap: "pretty" }}
        >
          {requiredCount > 0
            ? "필수 참석자가 모두 가능한 연속 시간이 없어요. 필수 참석자 설정을 바꿔 보세요."
            : "추천할 수 있는 연속 시간이 없어요. 참석자 응답을 확인해 주세요."}
        </div>
      )}
    </section>
  );
}

function rankLabel(index: number): string {
  return `${index + 1}순위`;
}

function durationParts(minutes: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  };
}

function maxDurationMinutes(poll: Pick<PollMeta, "startHour" | "endHour">): number {
  return Math.max(SLOT_MINUTES, (poll.endHour - poll.startHour) * 60);
}

function durationHourOptions(poll: Pick<PollMeta, "startHour" | "endHour">): number[] {
  const maxHours = Math.floor(maxDurationMinutes(poll) / 60);
  return Array.from({ length: maxHours + 1 }, (_, hour) => hour);
}

function durationValidationMessage(poll: Pick<PollMeta, "startHour" | "endHour">, duration: number): string {
  if (duration <= 0) return "소요 시간을 선택해 주세요";
  if (duration % SLOT_MINUTES !== 0) return `${SLOT_MINUTES}분 단위로 선택해 주세요`;
  if (duration > maxDurationMinutes(poll)) return "소요 시간이 투표 시간대보다 길어요";
  return "";
}

function clampDurationParts(
  poll: Pick<PollMeta, "startHour" | "endHour">,
  hours: number,
  minutes: number
): { hours: number; minutes: number } {
  const maxDuration = maxDurationMinutes(poll);
  let total = hours * 60 + minutes;
  if (total <= 0) total = SLOT_MINUTES;
  if (total > maxDuration) total = Math.floor(maxDuration / SLOT_MINUTES) * SLOT_MINUTES;
  return durationParts(total);
}

function AccordionHeader({
  title,
  summary,
  summaryPlacement = "below",
  open,
  panelId,
  onToggle,
}: {
  title: string;
  summary: string;
  summaryPlacement?: "below" | "inline";
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  const hasSummary = summary.trim().length > 0;

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onToggle}
      style={{
        width: "100%",
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: 0,
        border: 0,
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={
          summaryPlacement === "inline"
            ? { display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }
            : { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }
        }
      >
        <span style={{ ...cardTitle, color: "var(--color-ink)" }}>{title}</span>
        {hasSummary && (
          <span
            style={
              summaryPlacement === "inline"
                ? {
                    ...cardTitle,
                    display: "inline-flex",
                    alignItems: "baseline",
                    minHeight: 0,
                    color: "var(--color-best)",
                    ...tabularNumberStyle,
                  }
                : { ...captionText, ...tabularNumberStyle }
            }
          >
            {summary}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          color: "var(--color-ink-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        <ChevronDownIcon open={open} />
      </span>
    </button>
  );
}

function ConfirmationMessageModal({
  message,
  onChange,
  onClose,
  onCopy,
}: {
  message: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className="confirmation-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.28)",
      }}
    >
      <div
        className="confirmation-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-message-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, 560px)",
          maxHeight: "min(720px, calc(100dvh - 40px))",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.18)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <div id="confirmation-message-title" style={sectionTitle}>
              확정 안내 메시지
            </div>
            <div style={{ ...supportingText, marginTop: 4 }}>
              필요한 만큼 수정한 뒤 복사해 공유하세요.
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              border: 0,
              borderRadius: "var(--radius-full)",
              background: "transparent",
              color: "var(--color-ink-muted)",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
              flex: "none",
            }}
          >
            ×
          </button>
        </div>
        <textarea
          value={message}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          style={{
            ...textInput,
            width: "100%",
            minHeight: 260,
            borderRadius: 8,
            padding: 12,
            lineHeight: 1.55,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <PrimaryButton onClick={onCopy}>메시지와 링크 복사</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function MeetingDurationEditorModal({
  poll,
  saving,
  onClose,
  onSave,
}: {
  poll: PollMeta;
  saving: boolean;
  onClose: () => void;
  onSave: (duration: number) => void;
}) {
  const initialDuration = durationParts(poll.dur);
  const [draft, setDraft] = useState(initialDuration);
  const hourOptions = useMemo(() => durationHourOptions(poll), [poll]);
  const draftDuration = draft.hours * 60 + draft.minutes;
  const validationMessage = durationValidationMessage(poll, draftDuration);
  const saveDisabled = saving || Boolean(validationMessage) || draftDuration === poll.dur;

  function setDurationHours(hours: number) {
    setDraft((current) => clampDurationParts(poll, hours, current.minutes));
  }

  function setDurationMinutes(minutes: number) {
    setDraft((current) => clampDurationParts(poll, current.hours, minutes));
  }

  return (
    <div
      className="confirmation-modal-overlay"
      role="presentation"
      onMouseDown={() => {
        if (!saving) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.28)",
      }}
    >
      <div
        className="confirmation-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-duration-editor-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, 420px)",
          maxHeight: "min(640px, calc(100dvh - 40px))",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.18)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <div id="meeting-duration-editor-title" style={sectionTitle}>
              소요 시간 수정
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <select
                aria-label="소요 시간"
                value={draft.hours}
                disabled={saving}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                style={{ ...textInput, minWidth: 0, fontVariantNumeric: "tabular-nums" }}
              >
                {hourOptions.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
              <span style={{ ...captionText, flex: "none", fontWeight: 700 }}>시간</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <select
                aria-label="소요 분"
                value={draft.minutes}
                disabled={saving}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                style={{ ...textInput, minWidth: 0, fontVariantNumeric: "tabular-nums" }}
              >
                {durationMinuteOptions.map((minutes) => {
                  const optionDuration = draft.hours * 60 + minutes;
                  return (
                    <option
                      key={minutes}
                      value={minutes}
                      disabled={optionDuration <= 0 || optionDuration > maxDurationMinutes(poll)}
                    >
                      {minutes}
                    </option>
                  );
                })}
              </select>
              <span style={{ ...captionText, flex: "none", fontWeight: 700 }}>분</span>
            </div>
          </div>

          {validationMessage ? (
            <div style={{ ...captionText, color: "var(--color-danger)" }}>{validationMessage}</div>
          ) : (
            <div style={{ ...captionText }}>
              저장하면 추천 시간을 새 기준으로 다시 계산해요.
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            style={{
              minHeight: 40,
              border: "1px solid var(--color-hairline)",
              borderRadius: "var(--radius-full)",
              background: "#fff",
              color: "var(--color-ink)",
              padding: "8px 18px",
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: 0,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.45 : 1,
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "var(--color-canvas-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={() => onSave(draftDuration)}
            style={{
              minHeight: 40,
              border: "none",
              borderRadius: "var(--radius-full)",
              background: saveDisabled ? "rgba(0, 0, 0, 0.08)" : "var(--color-primary)",
              color: saveDisabled ? "var(--color-ink-muted)" : "#fff",
              padding: "8px 18px",
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: 0,
              cursor: saveDisabled ? "default" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!saveDisabled) e.currentTarget.style.background = "var(--color-primary-active)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = saveDisabled ? "rgba(0, 0, 0, 0.08)" : "var(--color-primary)";
            }}
          >
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResponseEditorModal({
  participants,
  selectedIds,
  deleting,
  onToggle,
  onClose,
  onDelete,
}: {
  participants: LabeledResponseEntry[];
  selectedIds: number[];
  deleting: boolean;
  onToggle: (responseId: number) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const selectedCount = selectedIds.length;
  const deleteDisabled = deleting || selectedCount === 0;

  return (
    <div
      className="confirmation-modal-overlay"
      role="presentation"
      onMouseDown={() => {
        if (!deleting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.28)",
      }}
    >
      <div
        className="confirmation-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-editor-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, 420px)",
          maxHeight: "min(640px, calc(100dvh - 40px))",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.18)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <div id="response-editor-title" style={sectionTitle}>
              응답 관리
            </div>
            <div style={{ ...supportingText, marginTop: 4, ...tabularNumberStyle }}>
              {participants.length}명 응답
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", paddingRight: 2 }}>
          {participants.map((participant) => {
            const checked = selectedIds.includes(participant.id);
            return (
              <label
                key={participant.id}
                style={{
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: checked ? "rgba(var(--color-best-rgb), 0.08)" : "transparent",
                  color: "var(--color-ink)",
                  cursor: deleting ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!deleting && !checked) e.currentTarget.style.background = "var(--color-canvas-soft)";
                }}
                onMouseLeave={(e) => {
                  if (!checked) e.currentTarget.style.background = "transparent";
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={deleting}
                  onChange={() => onToggle(participant.id)}
                  style={{ accentColor: "var(--color-primary)", width: 16, height: 16, flex: "none" }}
                />
                <span style={{ minWidth: 0, flex: 1, fontSize: 16, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0 }}>
                  {participant.label}
                </span>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            style={{
              minHeight: 40,
              border: "1px solid var(--color-hairline)",
              borderRadius: "var(--radius-full)",
              background: "#fff",
              color: "var(--color-ink)",
              padding: "8px 18px",
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: 0,
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.45 : 1,
            }}
            onMouseEnter={(e) => {
              if (!deleting) e.currentTarget.style.background = "var(--color-canvas-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={deleteDisabled}
            onClick={onDelete}
            style={{
              minHeight: 40,
              border: "none",
              borderRadius: "var(--radius-full)",
              background: deleteDisabled ? "rgba(0, 0, 0, 0.08)" : "#d92d20",
              color: deleteDisabled ? "var(--color-ink-muted)" : "#fff",
              padding: "8px 18px",
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: 0,
              cursor: deleteDisabled ? "default" : "pointer",
              ...tabularNumberStyle,
            }}
            onMouseEnter={(e) => {
              if (!deleteDisabled) e.currentTarget.style.background = "#b42318";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = deleteDisabled ? "rgba(0, 0, 0, 0.08)" : "#d92d20";
            }}
          >
            {deleting ? "삭제 중" : selectedCount ? `${selectedCount}명 삭제` : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        display: "block",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 160ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function RecommendationCriteria({
  candidate,
  total,
  requiredCount,
  highlight,
}: {
  candidate: Candidate;
  total: number;
  requiredCount: number;
  highlight: string | null;
}) {
  const items: Array<{ label: string; tone: "success" | "warning" }> = [];

  if (requiredCount > 0) {
    items.push({
      label: candidate.reqOk ? "필수 참석자 모두 가능" : "필수 참석자 일부 불가",
      tone: candidate.reqOk ? "success" : "warning",
    });
  }
  items.push({
    label: total > 0 && candidate.avail.length === total ? "모든 참석자 가능" : `${total}명 중 ${candidate.avail.length}명 가능`,
    tone: total > 0 && candidate.avail.length === total ? "success" : "warning",
  });
  if (highlight) items.push({ label: highlight, tone: "success" });

  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none", padding: 0, margin: "4px 0 0" }}>
      {items.map((item) => (
        <li
          key={item.label}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            ...metaText,
            color: "var(--color-ink-muted)",
            ...tabularNumberStyle,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
              marginTop: 1,
              color: item.tone === "success" ? "var(--color-best)" : "var(--color-danger)",
            }}
          >
            {item.tone === "success" ? <CheckIcon /> : <WarningIcon />}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function CheckIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: size, height: size, display: "block" }}>
      <path d="M13.3 4.4 6.6 11.1 2.9 7.4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon({ size = 16, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: size, height: size, display: "block" }}>
      <path d="M8 3.2v6.4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M8 12.7h.01" stroke="currentColor" strokeWidth={strokeWidth + 0.2} strokeLinecap="round" />
    </svg>
  );
}

function QuestionMarkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: size, height: size, display: "block" }}>
      <path
        d="M5.8 5.5a2.3 2.3 0 0 1 4.5.5c0 1.7-1.8 1.9-1.8 3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 12.1h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: size, height: size, display: "block" }}>
      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: size, height: size, display: "block" }}>
      <path d="M6.4 7 9.7 5M6.4 9 9.7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.6" cy="8" r="1.9" fill="currentColor" />
      <circle cx="11.4" cy="4" r="1.9" fill="currentColor" />
      <circle cx="11.4" cy="12" r="1.9" fill="currentColor" />
    </svg>
  );
}

function detailSlotTitle(key: string): { date: string; time: string } {
  const idx = key.lastIndexOf("_");
  const date = key.slice(0, idx);
  const startMin = Number(key.slice(idx + 1));
  return {
    date: dateShort(date),
    time: `${fmtMin(startMin)} ~ ${fmtMin(startMin + SLOT_MINUTES)}`,
  };
}

function NameChips({ people }: { people: DetailPerson[] }) {
  if (people.length === 0) return <span style={{ color: "var(--time-detail-muted)" }}>—</span>;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {people.map(({ name, status }) => {
        const available = status === "available";
        const unavailable = status === "unavailable";
        let background = "var(--time-detail-chip-bg)";
        let color = "var(--time-detail-chip-text)";
        let border = "1px solid var(--time-detail-chip-border)";

        if (available) {
          background = "var(--time-detail-chip-available-bg)";
          color = "var(--time-detail-chip-available-text)";
          border = "1px solid var(--time-detail-chip-available-border)";
        } else if (unavailable) {
          background = "var(--time-detail-chip-unavailable-bg)";
          color = "var(--time-detail-chip-unavailable-text)";
          border = "1px solid var(--time-detail-chip-unavailable-border)";
        }

        return (
          <span
            key={name}
            aria-label={status === "neutral" ? name : `${name} ${available ? "가능" : "불가능"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 28,
              borderRadius: 9999,
              background,
              color,
              border,
              padding: "3px 10px",
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.4,
              letterSpacing: 0,
            }}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}
