import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getResults, seedDemo, updatePoll } from "../lib/api";
import type { Candidate, Marks, PollMeta } from "../lib/scheduling";
import {
  SLOT_MINUTES,
  aggregate,
  buildConfirmationMessage,
  candidates as computeCandidates,
  dateShort,
  evaluateSlot,
  fmtMin,
  pollLink,
  pollTitle,
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
  timetableGridColumns as buildTimetableGridColumns,
  timetableSlotHeight,
} from "../lib/timetable";
import { AccordionPanel } from "../components/AccordionPanel";
import { ScrollButton, TimetableScrollFrame } from "../components/TimetableScrollFrame";
import { useToast } from "../components/Toast";
import { PrimaryButton, UtilityButton } from "../components/ui";
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
const inactiveRecommendationHighlightColor = "#6a655f";
const inactiveRecommendationHighlightLabelBg = "#615d59";
const recommendationUpdateMinMs = 500;
type DetailPerson = { name: string; status: "available" | "unavailable" };

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [responses, setResponses] = useState<Record<string, Marks>>({});
  const [notFound, setNotFound] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgEdited, setMsgEdited] = useState(false);
  const [requiredOpen, setRequiredOpen] = useState(false);
  const [selectedRecommendationIdx, setSelectedRecommendationIdx] = useState<number | null>(null);
  const [displayedRecs, setDisplayedRecs] = useState<Candidate[]>([]);
  const [recommendationsUpdating, setRecommendationsUpdating] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const recommendationUpdateIdRef = useRef(0);
  const recommendationUpdateTimerRef = useRef<number | undefined>(undefined);

  const refetch = useCallback(() => {
    if (!id) return;
    getResults(id)
      .then(({ poll: p, responses: r }) => {
        setPoll(p);
        setResponses(r);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const total = Object.keys(responses).length;
  const recs = useMemo<Candidate[]>(() => (poll ? computeCandidates(poll, responses) : []), [poll, responses]);
  const visibleRecs = recommendationsUpdating ? displayedRecs : recs;

  const finalStats = useMemo(() => {
    if (!poll || !poll.final) return null;
    return evaluateSlot(poll, responses, poll.final.date, poll.final.startMin, poll.final.endMin);
  }, [poll, responses]);

  // Regenerate the confirmation message whenever the confirmed slot changes,
  // unless the user has started editing it by hand.
  useEffect(() => {
    if (!poll || !poll.final || !finalStats || msgEdited) return;
    setMsgText(
      buildConfirmationMessage(
        { ...poll.final, avail: finalStats.avail, okAny: finalStats.okAny, reqOk: finalStats.reqOk },
        poll,
        total
      )
    );
  }, [poll, finalStats, total, msgEdited]);

  useEffect(() => {
    if (!messageModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMessageModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messageModalOpen]);

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
        <div style={sectionTitle}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll) return null;

  const sl = slots(poll);
  const map = aggregate(responses);
  const names = Object.keys(responses);
  const req = poll.required || [];
  const durationHours = poll.dur % 60 === 0 ? `${poll.dur / 60}시간` : `${poll.dur}분`;

  async function toggleRequired(name: string) {
    if (!id || !poll) return;
    const next = req.includes(name) ? req.filter((n) => n !== name) : [...req, name];
    const updateId = recommendationUpdateIdRef.current + 1;
    recommendationUpdateIdRef.current = updateId;
    if (recommendationUpdateTimerRef.current !== undefined) window.clearTimeout(recommendationUpdateTimerRef.current);

    const previousPoll = poll;
    const startedAt = Date.now();
    setDisplayedRecs(visibleRecs);
    setRecommendationsUpdating(true);
    setSelectedRecommendationIdx(null);
    setPoll({ ...poll, required: next });

    try {
      const updated = await updatePoll(id, { required: next });
      setPoll(updated);
      const remainingMs = Math.max(0, recommendationUpdateMinMs - (Date.now() - startedAt));
      recommendationUpdateTimerRef.current = window.setTimeout(() => {
        if (recommendationUpdateIdRef.current !== updateId) return;
        setSelectedRecommendationIdx(0);
        setRecommendationsUpdating(false);
        recommendationUpdateTimerRef.current = undefined;
      }, remainingMs);
    } catch {
      if (recommendationUpdateIdRef.current === updateId) {
        setPoll(previousPoll);
        setRecommendationsUpdating(false);
        recommendationUpdateTimerRef.current = undefined;
        showToast("필수 참석자 변경에 실패했습니다");
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

  const dk = detailKey;
  const de = dk ? map[dk] || { best: [], ok: [] } : null;
  const detailTitle = dk ? detailSlotTitle(dk) : null;
  const detailPanelTime = detailTitle ? `${detailTitle.date} ${detailTitle.time}` : "시간표에 마우스를 올려 보세요";
  const detailOkCount = de ? de.ok.length : null;
  const detailPeople: DetailPerson[] = de
    ? names.map((name) => ({
        name,
        status: de.best.includes(name) || de.ok.includes(name) ? "available" : "unavailable",
      }))
    : [];

  const finalIdx = poll.final
    ? visibleRecs.findIndex((c) => c.date === poll.final!.date && c.startMin === poll.final!.startMin && c.endMin === poll.final!.endMin)
    : -1;
  const selectedRecommendationExists =
    selectedRecommendationIdx !== null && selectedRecommendationIdx >= 0 && selectedRecommendationIdx < visibleRecs.length;
  const activeRecommendationIdx = selectedRecommendationExists ? selectedRecommendationIdx : visibleRecs.length ? 0 : -1;
  const timetableGridColumns = buildTimetableGridColumns(poll.dates.length);
  const timetableWidth = timetableContentWidth(poll.dates.length);

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
    setMsgText(buildConfirmationMessage(candidate, poll, total));
    setMsgEdited(false);
    setSelectedRecommendationIdx(idx);
    setMessageModalOpen(true);
  }

  return (
    <div style={{ ...pagePadding, padding: "36px 20px 100px" }}>
      <div style={{ width: "100%", maxWidth: 1040 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ ...pageTitle, maxWidth: 820, minWidth: 0 }}>
              <span>{durationHours}</span>{" "}<span>{pollTitle(poll)}</span>
              <span style={{ color: "var(--color-ink-muted)" }}>,<br></br>언제 모일까요?</span>
            </div>
            <UtilityButton
              onClick={() => copyText(pollLink(poll.id), () => showToast("링크가 복사되었습니다"))}
              style={{ flex: "none", whiteSpace: "nowrap", padding: "10px 20px", fontSize: 16, fontWeight: 600, minHeight: 44 }}
            >
              응답 링크 복사
            </UtilityButton>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
            <div style={{ ...metaText, ...tabularNumberStyle }}>{responseCountText(total)}</div>
          </div>
        </div>

        {total > 0 ? (
          <>
          <div style={{ ...card, minWidth: 0, padding: 0, marginBottom: 20 }}>
            <RecommendationCarousel
              recommendations={visibleRecs}
              activeIdx={activeRecommendationIdx}
              total={total}
              requiredCount={req.length}
              updating={recommendationsUpdating}
              onSelect={selectRecommendation}
              onShare={onShareRecommendation}
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
                                onClick={() => setDetailKey(key)}
                                style={{
                                  ...timetableCellFrameStyle(m),
                                  position: "relative",
                                  cursor: "pointer",
                                  background: bg,
                                  outline: hovered ? "2px dashed rgba(31, 30, 28, 0.72)" : "none",
                                  outlineOffset: -1,
                                  zIndex: hovered ? 1 : 0,
                                }}
                              />
                            );
                          })}
                        </div>
                      ))}
                      {visibleRecs.map((c, i) => {
                        const dateIndex = poll.dates.indexOf(c.date);
                        const startIndex = sl.indexOf(c.startMin);
                        const slotCount = Math.max(1, Math.round((c.endMin - c.startMin) / SLOT_MINUTES));
                        if (dateIndex < 0 || startIndex < 0) return null;
                        const labelBelow = startIndex === 0;
                        const active = activeRecommendationIdx === i;
                        const labelBg = active ? recommendationHighlightLabelBg : inactiveRecommendationHighlightLabelBg;
                        return (
                          <div
                            key={`${c.date}_${c.startMin}_${i}`}
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              top: startIndex * timetableSlotHeight,
                              left: 0,
                              right: 0,
                              height: slotCount * timetableSlotHeight,
                              display: "grid",
                              gridTemplateColumns: timetableGridColumns,
                              pointerEvents: "none",
                              zIndex: active ? 3 : 2,
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
                                }}
                              />
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
                {detailTitle && <NameChips people={detailPeople} />}
                <div
                  aria-hidden={!detailOkCount}
                  style={{
                    ...captionText,
                    color: "var(--time-detail-warn-text)",
                    background: "var(--time-detail-warn-bg)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    visibility: detailOkCount ? "visible" : "hidden",
                    ...tabularNumberStyle,
                  }}
                >
                  {detailOkCount ?? 1}명에게는 이 시간이 부담스러울 수 있어요
                </div>
              </div>

              <div style={accordionCard}>
                <AccordionHeader
                  title="필수 참석자 지정"
                  summary={req.length ? `${req.length}명` : ""}
                  summaryPlacement="inline"
                  open={requiredOpen}
                  panelId={requiredPanelId}
                  onToggle={() => setRequiredOpen((open) => !open)}
                />
                <AccordionPanel id={requiredPanelId} open={requiredOpen}>
                  <div style={{ ...metaText, marginBottom: 12, textWrap: "pretty" }}>
                    필수 참석자가 모두 가능한 시간을 우선 추천합니다.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {names.map((n) => {
                      const checked = req.includes(n);
                      return (
                        <label
                          key={n}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 5, cursor: "pointer", fontSize: 16, lineHeight: 1.45, letterSpacing: 0 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
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
            <div style={{ ...supportingText, marginBottom: 16 }}>
              아직 응답이 없습니다. 링크를 공유하거나 데모 응답을 채워 보세요.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <PrimaryButton onClick={() => navigate(`/vote/${poll.id}/join`)}>참석자로 응답하기</PrimaryButton>
              <UtilityButton onClick={onSeed}>데모 응답 7명 채우기</UtilityButton>
            </div>
          </div>
        )}
      </div>
      {poll.final && messageModalOpen && (
        <ConfirmationMessageModal
          message={msgText}
          onChange={(value) => {
            setMsgText(value);
            setMsgEdited(true);
          }}
          onClose={() => setMessageModalOpen(false)}
          onCopy={() => copyText(msgText, () => showToast("클립보드에 복사되었습니다"))}
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
}: {
  recommendations: Candidate[];
  activeIdx: number;
  total: number;
  requiredCount: number;
  updating: boolean;
  onSelect: (idx: number) => void;
  onShare: (idx: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

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

  return (
    <section className="recommendation-panel-content" aria-busy={updating}>
      <div className="recommendation-carousel-heading">
        <div style={{ minWidth: 0 }}>
          <div style={{ ...cardTitle, color: "var(--color-ink)" }}>추천 시간</div>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 32,
                        minHeight: 24,
                        borderRadius: 9999,
                        background: selected ? "var(--color-primary)" : "var(--color-primary-soft)",
                        color: selected ? "#ffffff" : "var(--color-primary)",
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
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 15, height: 15, display: "block" }}>
                        <path d="M8 2.4V9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5.3 5L8 2.3L10.7 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 7.7H4.6A1.6 1.6 0 0 0 3 9.3V12A1.6 1.6 0 0 0 4.6 13.6H11.4A1.6 1.6 0 0 0 13 12V9.3A1.6 1.6 0 0 0 11.4 7.7H11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  <div style={{ minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2, fontSize: 18, fontWeight: 700, lineHeight: 1.35, letterSpacing: 0 }}>
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
        <div className="recommendation-empty" style={{ ...metaText, padding: "2px 0 0", textWrap: "pretty" }}>
          필수 참석자가 모두 가능한 연속 시간이 없습니다. 필수 지정을 조정해 보세요.
        </div>
      )}
    </section>
  );
}

function rankLabel(index: number): string {
  return `${index + 1}순위`;
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
                    ...captionText,
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 24,
                    borderRadius: 9999,
                    background: "var(--color-canvas-soft)",
                    color: "var(--color-ink-muted)",
                    padding: "2px 8px",
                    border: "1px solid var(--color-hairline)",
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
          maxHeight: "min(720px, calc(100vh - 40px))",
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
              width: 40,
              height: 40,
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
          <PrimaryButton onClick={onCopy}>메시지 + 링크 복사</PrimaryButton>
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

function recommendationHighlight(candidate: Candidate, candidates: Candidate[], total: number): string | null {
  const burdened = candidate.okAny.length;
  if (burdened === 0) {
    return total > 0 && candidate.avail.length === total
      ? "모두가 부담 없이 모일 수 있는 시간이에요"
      : "참석 가능한 모두가 편한 시간이에요";
  }
  const minBurdened = Math.min(...candidates.map((c) => c.okAny.length));
  if (candidates.length > 1 && burdened === minBurdened) {
    return "부담을 느끼는 참석자가 가장 적어요";
  }
  return null;
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
  const items: Array<{ label: string; checked: boolean }> = [];

  if (requiredCount > 0) {
    items.push({
      label: candidate.reqOk ? "필수 참석자 모두 가능" : "필수 참석자 일부 불가",
      checked: candidate.reqOk,
    });
  }
  items.push({
    label: total > 0 && candidate.avail.length === total ? "모든 참석자 가능" : `${total}명 중 ${candidate.avail.length}명 가능`,
    checked: candidate.avail.length > 0,
  });
  if (highlight) items.push({ label: highlight, checked: true });

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
            color: item.checked ? "var(--color-ink-muted)" : "var(--color-ink-faint)",
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
              color: item.checked ? "var(--color-best)" : "var(--color-ink-faint)",
            }}
          >
            {item.checked ? <CheckIcon /> : <span style={{ width: 4, height: 4, borderRadius: 9999, background: "currentColor" }} />}
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
      {people.map(({ name, status }) => (
        <span
          key={`${status}-${name}`}
          aria-label={`${name} ${status === "available" ? "가능" : "불가능"}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 28,
            borderRadius: 9999,
            background: status === "available" ? "var(--time-detail-chip-available-bg)" : "var(--time-detail-chip-bg)",
            color: status === "available" ? "var(--time-detail-chip-available-text)" : "var(--time-detail-chip-text)",
            border:
              status === "available"
                ? "1px solid var(--time-detail-chip-available-border)"
                : "1px solid var(--time-detail-chip-border)",
            padding: "3px 10px",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            letterSpacing: 0,
          }}
        >
          {name}
        </span>
      ))}
    </div>
  );
}
