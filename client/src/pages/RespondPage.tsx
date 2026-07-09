import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getPoll, submitResponse, updateResponse } from "../lib/api";
import type { Category, Marks, PollMeta } from "../lib/scheduling";
import { dateShort, pollTitle, slots } from "../lib/scheduling";
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
} from "../lib/timetable";
import { TimetableScrollFrame } from "../components/TimetableScrollFrame";
import { PrimaryButton } from "../components/ui";
import { captionText, card, metaText, pagePadding, pageTitle, sectionTitle, supportingText } from "../components/uiStyles";

interface LocationState {
  name?: string;
  password?: string;
  mode?: "create" | "edit";
  responseId?: number;
  marks?: Marks;
}

interface DragState {
  startKey: string;
  erase: boolean;
  cat: Category;
  baseMarks: Marks;
}

const mutedOtherCategoryBackgroundImage =
  "repeating-linear-gradient(135deg, transparent 0 13px, rgba(52, 50, 48, 0.16) 13px 14px, transparent 14px 22px), linear-gradient(rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.45))";
const preferenceTooltipId = "respond-preference-tooltip";

function connectedHatchPosition(dateIndex: number, dateCount: number, slotIndex: number): string {
  const x = dateCount <= 1 ? 0 : (dateIndex / (dateCount - 1)) * 100;
  return `${x}% -${slotIndex * timetableSlotHeight}px, 0 0`;
}

function cellPosition(key: string, dates: string[], slotValues: number[]): { dateIndex: number; slotIndex: number } | null {
  const idx = key.lastIndexOf("_");
  if (idx < 0) return null;

  const dateIndex = dates.indexOf(key.slice(0, idx));
  const slotIndex = slotValues.indexOf(Number(key.slice(idx + 1)));
  if (dateIndex < 0 || slotIndex < 0) return null;

  return { dateIndex, slotIndex };
}

function keysInRectangle(startKey: string, endKey: string, dates: string[], slotValues: number[]): string[] {
  const start = cellPosition(startKey, dates, slotValues);
  const end = cellPosition(endKey, dates, slotValues);
  if (!start || !end) return [];

  const fromDate = Math.min(start.dateIndex, end.dateIndex);
  const toDate = Math.max(start.dateIndex, end.dateIndex);
  const fromSlot = Math.min(start.slotIndex, end.slotIndex);
  const toSlot = Math.max(start.slotIndex, end.slotIndex);
  const keys: string[] = [];

  for (let dateIndex = fromDate; dateIndex <= toDate; dateIndex += 1) {
    for (let slotIndex = fromSlot; slotIndex <= toSlot; slotIndex += 1) {
      keys.push(`${dates[dateIndex]}_${slotValues[slotIndex]}`);
    }
  }

  return keys;
}

export function RespondPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const name = state?.name;
  const password = state?.password;
  const mode = state?.mode ?? "create";
  const responseId = state?.responseId;

  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cat, setCat] = useState<Category>("best");
  const [marks, setMarks] = useState<Marks>(state?.marks ?? {});
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const catRef = useRef(cat);
  const marksRef = useRef(marks);
  catRef.current = cat;
  marksRef.current = marks;

  useEffect(() => {
    if (!id) return;
    getPoll(id)
      .then(setPoll)
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    const clear = () => {
      dragRef.current = null;
    };
    window.addEventListener("mouseup", clear);
    window.addEventListener("touchend", clear);
    return () => {
      window.removeEventListener("mouseup", clear);
      window.removeEventListener("touchend", clear);
    };
  }, []);

  useEffect(() => {
    if ((!name || !password) && poll) {
      navigate(`/vote/${poll.id}/join`, { replace: true });
    }
  }, [name, password, poll, navigate]);

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={sectionTitle}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll || !name || !password) return null;

  const sl = slots(poll);
  const markedCount = Object.keys(marks).length;
  const durationLabel = poll.dur % 60 === 0 ? `${poll.dur / 60}시간` : `${poll.dur}분`;
  const timetableGridColumns = buildTimetableGridColumns(poll.dates.length);
  const timetableWidth = timetableContentWidth(poll.dates.length);
  const mutedOtherCategoryBackgroundSize = `${poll.dates.length * 100}% ${sl.length * timetableSlotHeight}px, auto`;

  function paintRectangle(endKey: string, drag: DragState) {
    if (!poll) return;
    const rectangleKeys = keysInRectangle(drag.startKey, endKey, poll.dates, sl);
    if (!rectangleKeys.length) return;

    setMarks(() => {
      const next = { ...drag.baseMarks };
      rectangleKeys.forEach((key) => {
        const originalMark = drag.baseMarks[key];
        if (drag.erase) {
          if (originalMark === drag.cat) delete next[key];
        } else if (!originalMark || originalMark === drag.cat) {
          next[key] = drag.cat;
        }
      });
      return next;
    });
  }

  function handleDown(key: string) {
    const currentMark = marksRef.current[key];
    if (currentMark && currentMark !== catRef.current) {
      dragRef.current = null;
      return;
    }

    const drag = {
      startKey: key,
      erase: currentMark === catRef.current,
      cat: catRef.current,
      baseMarks: marksRef.current,
    };
    dragRef.current = drag;
    paintRectangle(key, drag);
  }

  function handleEnter(key: string) {
    const drag = dragRef.current;
    if (!drag) return;
    paintRectangle(key, drag);
  }

  function handleMouseEnter(key: string) {
    setHoveredKey(key);
    handleEnter(key);
  }

  function handleTouch(e: React.TouchEvent, isStart: boolean) {
    const t = e.touches[0];
    if (!t) return;

    const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
    const key = el?.dataset.key;
    if (!key) return;

    if (isStart) {
      handleDown(key);
    } else {
      handleEnter(key);
    }
  }

  async function onSubmit() {
    if (!markedCount || !id || !name || !password || submitting) return;
    if (mode === "edit" && responseId === undefined) return;
    setSubmitting(true);
    try {
      if (mode === "edit") {
        await updateResponse(id, responseId!, password, marks);
      } else {
        await submitResponse(id, name, password, marks);
      }
      navigate(`/vote/${id}/submitted`, { state: { name } });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 403 || err.status === 404) {
        navigate(`/vote/${id}/join`, { replace: true });
      } else {
        setSubmitting(false);
      }
    }
  }

  const segBase = {
    border: "none",
    padding: "8px 16px",
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: 0,
    cursor: "pointer" as const,
    background: "#ffffff",
  };

  return (
    <>
      <div style={{ ...pagePadding, padding: "36px 20px 156px" }}>
        <div style={{ width: "100%", maxWidth: 820 }}>
          <div style={{ marginBottom: 10 }}>
            <div style={pageTitle}>
              <span>{pollTitle(poll)}</span>{" "}<span>{durationLabel}</span>
              <span>,<br></br>언제가 좋으세요?</span>
            </div>
          </div>
          <div style={{ ...supportingText, marginBottom: 24 }}>
            드래그해서 가능한 시간을 표시해 주세요.<br></br>표시하지 않은 시간은 자동으로 <b>불가능</b>으로 처리됩니다.
          </div>

          <div style={{ ...card, padding: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ position: "relative", flex: "none" }}>
                <div style={{ display: "flex", border: "1px solid var(--color-hairline)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <button
                    type="button"
                    onClick={() => setCat("best")}
                    style={{
                      ...segBase,
                      background: cat === "best" ? "rgba(var(--color-best-rgb), 0.12)" : "#ffffff",
                      color: cat === "best" ? "var(--color-best-text)" : "var(--color-ink-muted)",
                      borderRight: "1px solid var(--color-hairline)",
                    }}
                  >
                    가장 좋은 시간
                  </button>
                  <button
                    type="button"
                    aria-describedby={cat === "ok" ? preferenceTooltipId : undefined}
                    onClick={() => setCat("ok")}
                    style={{
                      ...segBase,
                      background: cat === "ok" ? "rgba(var(--color-ok-rgb), 0.22)" : "#ffffff",
                      color: cat === "ok" ? "var(--color-ok-text)" : "var(--color-ink-muted)",
                    }}
                  >
                    가능하지만 비선호
                  </button>
                </div>
                {cat === "ok" ? <PreferenceTooltip id={preferenceTooltipId} name={name} /> : null}
              </div>
              <div style={{ display: "flex", gap: 14, ...captionText, alignItems: "center" }}>
                <Legend color="var(--color-best)" label="선호" />
                <Legend color="var(--color-ok)" label="비선호" />
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-canvas-soft)", border: "1px solid var(--color-hairline)" }} />
                  불가능
                </div>
              </div>
            </div>

            <TimetableScrollFrame>
              <div style={{ width: timetableWidth, userSelect: "none", touchAction: "none" }}>
                <div style={{ display: "grid", gridTemplateColumns: timetableGridColumns, marginBottom: 4 }}>
                  <div />
                  {poll.dates.map((d) => (
                    <div key={d} style={timetableDateHeaderStyle}>
                      {dateShort(d)}
                    </div>
                  ))}
                </div>
                {sl.map((m, slotIndex) => (
                  <div key={m} style={{ display: "grid", gridTemplateColumns: timetableGridColumns }}>
                    <div style={timetableAxisLabelStyle}>
                      {timetableAxisText(m)}
                    </div>
                    {poll.dates.map((d, dateIndex) => {
                      const key = d + "_" + m;
                      const mark = marks[key];
                      const isOtherCategoryMuted = Boolean(mark && mark !== cat);
                      const backgroundColor =
                        mark === "best" ? "var(--color-best)" : mark === "ok" ? "var(--color-ok)" : "var(--color-canvas-soft)";
                      return (
                        <div
                          key={key}
                          data-key={key}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setHoveredKey(key);
                            handleDown(key);
                          }}
                          onMouseEnter={() => handleMouseEnter(key)}
                          onMouseLeave={() => setHoveredKey((prev) => (prev === key ? null : prev))}
                          onTouchStart={(e) => handleTouch(e, true)}
                          onTouchMove={(e) => handleTouch(e, false)}
                          style={{
                            ...timetableCellFrameStyle(m),
                            position: "relative",
                            cursor: "pointer",
                            backgroundColor,
                            backgroundImage: isOtherCategoryMuted ? mutedOtherCategoryBackgroundImage : undefined,
                            backgroundSize: isOtherCategoryMuted ? mutedOtherCategoryBackgroundSize : undefined,
                            backgroundPosition: isOtherCategoryMuted ? connectedHatchPosition(dateIndex, poll.dates.length, slotIndex) : undefined,
                            backgroundRepeat: isOtherCategoryMuted ? "no-repeat, no-repeat" : undefined,
                            backgroundOrigin: isOtherCategoryMuted ? "border-box" : undefined,
                            outline: hoveredKey === key ? "2px dashed rgba(31, 30, 28, 0.72)" : "none",
                            outlineOffset: -1,
                            zIndex: hoveredKey === key ? timetableLayerZIndex.cellHover : 0,
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
              </div>
            </TimetableScrollFrame>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 20,
          display: "flex",
          justifyContent: "center",
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.06)",
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 820,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ flex: "1 1 180px", ...metaText }}>
            {markedCount ? `` : "아직 선택된 시간이 없습니다"}
          </div>
          <PrimaryButton onClick={onSubmit} disabled={!markedCount || submitting}>
            응답 제출하기
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      {label}
    </div>
  );
}

function PreferenceTooltip({ id, name }: { id: string; name: string }) {
  return (
    <div
      id={id}
      role="tooltip"
      aria-live="polite"
      style={{
        position: "absolute",
        bottom: "calc(100% + 10px)",
        left: 0,
        zIndex: 30,
        width: "max-content",
        maxWidth: "min(320px, calc(100vw - 40px))",
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        background: "rgba(31, 30, 28, 0.96)",
        color: "#ffffff",
        boxShadow: "0 14px 34px rgba(0, 0, 0, 0.22), 0 3px 10px rgba(0, 0, 0, 0.18)",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
        letterSpacing: 0,
        textWrap: "pretty",
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -5,
          left: "72%",
          width: 10,
          height: 10,
          borderBottomRightRadius: 2,
          background: "rgba(31, 30, 28, 0.96)",
          transform: "translateX(-50%) rotate(45deg)",
        }}
      />
      {name}님의 표시 여부는 공개되지 않아요.<br></br>이 시간은 가능한 한 피해서 추천해요.
    </div>
  );
}
