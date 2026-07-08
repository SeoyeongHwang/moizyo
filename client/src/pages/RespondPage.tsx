import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getPoll, submitResponse } from "../lib/api";
import type { Category, Marks, PollMeta } from "../lib/scheduling";
import { dateShort, pollTitle, slots } from "../lib/scheduling";
import {
  timetableAxisLabelStyle,
  timetableAxisText,
  timetableCellFrameStyle,
  timetableContentWidth,
  timetableDateHeaderStyle,
  timetableGridColumns as buildTimetableGridColumns,
} from "../lib/timetable";
import { TimetableScrollFrame } from "../components/TimetableScrollFrame";
import { PrimaryButton } from "../components/ui";
import { captionText, card, metaText, pagePadding, pageTitle, sectionTitle, supportingText } from "../components/uiStyles";

interface LocationState {
  name?: string;
}

export function RespondPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const name = (location.state as LocationState | null)?.name;

  const [poll, setPoll] = useState<PollMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cat, setCat] = useState<Category>("best");
  const [marks, setMarks] = useState<Marks>({});
  const [submitting, setSubmitting] = useState(false);
  const dragRef = useRef<{ erase: boolean } | null>(null);
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
    if (!name && poll) {
      navigate(`/vote/${poll.id}/join`, { replace: true });
    }
  }, [name, poll, navigate]);

  function paint(key: string, erase: boolean) {
    setMarks((prev) => {
      if (erase) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === catRef.current) return prev;
      return { ...prev, [key]: catRef.current };
    });
  }

  function handleDown(key: string) {
    const erase = marksRef.current[key] === catRef.current;
    dragRef.current = { erase };
    paint(key, erase);
  }
  function handleEnter(key: string) {
    if (!dragRef.current) return;
    paint(key, dragRef.current.erase);
  }
  function handleTouch(e: React.TouchEvent, isStart: boolean) {
    const t = e.touches[0];
    if (!t) return;
    const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
    const key = el?.dataset.key;
    if (!key) return;
    if (isStart) {
      const erase = marksRef.current[key] === catRef.current;
      dragRef.current = { erase };
      paint(key, erase);
    } else if (dragRef.current) {
      paint(key, dragRef.current.erase);
    }
  }

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={sectionTitle}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll || !name) return null;

  const sl = slots(poll);
  const markedCount = Object.keys(marks).length;
  const durationLabel = poll.dur % 60 === 0 ? `${poll.dur / 60}시간` : `${poll.dur}분`;
  const timetableGridColumns = buildTimetableGridColumns(poll.dates.length);
  const timetableWidth = timetableContentWidth(poll.dates.length);

  async function onSubmit() {
    if (!markedCount || !id || !name || submitting) return;
    setSubmitting(true);
    try {
      await submitResponse(id, name, marks);
      navigate(`/vote/${id}/submitted`, { state: { name } });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
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
              <span>{durationLabel}</span>{" "}<span>{pollTitle(poll)}</span>
              <span style={{ color: "var(--color-ink-muted)" }}>,<br></br>{name}님은 언제가 좋으세요?</span>
            </div>
          </div>
          <div style={{ ...supportingText, marginBottom: 18 }}>
            드래그해서 가능한 시간을 표시해 주세요.<br></br>표시하지 않은 시간은 자동으로 <b>불가능</b>으로 처리됩니다.
          </div>

          <div style={{ ...card, padding: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", border: "1px solid var(--color-hairline)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <button
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
                {sl.map((m) => (
                  <div key={m} style={{ display: "grid", gridTemplateColumns: timetableGridColumns }}>
                    <div style={timetableAxisLabelStyle}>
                      {timetableAxisText(m)}
                    </div>
                    {poll.dates.map((d) => {
                      const key = d + "_" + m;
                      const mark = marks[key];
                      return (
                        <div
                          key={key}
                          data-key={key}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleDown(key);
                          }}
                          onMouseEnter={() => handleEnter(key)}
                          onTouchStart={(e) => handleTouch(e, true)}
                          onTouchMove={(e) => handleTouch(e, false)}
                          style={{
                            ...timetableCellFrameStyle(m),
                            cursor: "pointer",
                            background: mark === "best" ? "var(--color-best)" : mark === "ok" ? "var(--color-ok)" : "var(--color-canvas-soft)",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </TimetableScrollFrame>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, ...captionText, color: "var(--color-ink-faint)" }}>
            <div style={{ width: 8, height: 8, borderRadius: 9999, background: "#d6b6f6" }} />
            다른 참석자의 응답과 응답 현황은 제출 전까지 표시되지 않습니다.
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
