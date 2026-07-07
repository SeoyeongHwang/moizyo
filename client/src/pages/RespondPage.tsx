import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getPoll, submitResponse } from "../lib/api";
import type { Category, Marks, PollMeta } from "../lib/scheduling";
import { dateShort, fmtMin, pollRangeLine, slots } from "../lib/scheduling";
import { card, pagePadding, PrimaryButton } from "../components/ui";

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
        <div style={{ fontSize: 20, fontWeight: 600 }}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll || !name) return null;

  const sl = slots(poll);
  const markedCount = Object.keys(marks).length;

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
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer" as const,
    background: "#ffffff",
  };

  return (
    <div style={{ ...pagePadding, padding: "36px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 820 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.625px" }}>{name}님의 가능 시간</div>
          <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>{pollRangeLine(poll)}</div>
        </div>
        <div style={{ fontSize: 14, color: "var(--color-ink-muted)", marginBottom: 18 }}>
          드래그해서 시간을 칠해 주세요. 표시하지 않은 시간은 자동으로 <b>불가능</b>으로 처리됩니다.
        </div>

        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", border: "1px solid var(--color-hairline)", borderRadius: 8, overflow: "hidden" }}>
              <button
                onClick={() => setCat("best")}
                style={{
                  ...segBase,
                  background: cat === "best" ? "rgba(26,174,57,0.12)" : "#ffffff",
                  color: cat === "best" ? "#157a2e" : "var(--color-ink-muted)",
                  borderRight: "1px solid var(--color-hairline)",
                }}
              >
                가장 좋은 시간
              </button>
              <button
                onClick={() => setCat("ok")}
                style={{
                  ...segBase,
                  background: cat === "ok" ? "rgba(240,180,41,0.18)" : "#ffffff",
                  color: cat === "ok" ? "#8a5a00" : "var(--color-ink-muted)",
                }}
              >
                가능하지만 비선호
              </button>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--color-ink-muted)", alignItems: "center" }}>
              <Legend color="var(--color-best)" label="선호" />
              <Legend color="var(--color-ok)" label="비선호" />
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-canvas-soft)", border: "1px solid var(--color-hairline)" }} />
                불가능
              </div>
            </div>
          </div>

          <div style={{ userSelect: "none", touchAction: "none" }}>
            <div style={{ display: "flex", marginBottom: 4 }}>
              <div style={{ width: 52, flex: "none" }} />
              {poll.dates.map((d) => (
                <div key={d} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: "0.125px", color: "var(--color-ink-muted)" }}>
                  {dateShort(d)}
                </div>
              ))}
            </div>
            {sl.map((m, mi) => (
              <div key={m} style={{ display: "flex" }}>
                <div style={{ width: 52, flex: "none", fontSize: 11, color: "var(--color-ink-faint)", textAlign: "right", paddingRight: 8, transform: "translateY(-6px)" }}>
                  {m % 60 === 0 ? fmtMin(m) : ""}
                </div>
                {poll.dates.map((d, di) => {
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
                        flex: 1,
                        height: 24,
                        cursor: "pointer",
                        borderRight: "1px solid #eeecea",
                        borderLeft: di === 0 ? "1px solid #eeecea" : "none",
                        borderTop: m % 60 === 0 ? "1px solid #d9d5d1" : "1px solid #f1efed",
                        borderBottom: mi === sl.length - 1 ? "1px solid #d9d5d1" : "none",
                        background: mark === "best" ? "var(--color-best)" : mark === "ok" ? "var(--color-ok)" : "#ffffff",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderTop: "1px solid var(--color-hairline)",
              paddingTop: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>
              {markedCount ? `${markedCount}개 블록 선택됨` : "아직 선택된 시간이 없습니다"}
            </div>
            <PrimaryButton onClick={onSubmit} disabled={!markedCount || submitting}>
              응답 제출하기
            </PrimaryButton>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-ink-faint)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 9999, background: "#d6b6f6" }} />
          다른 참가자의 응답과 응답 현황은 제출 전까지 표시되지 않습니다.
        </div>
      </div>
    </div>
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
