import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { createPoll } from "../lib/api";
import { PrimaryButton } from "../components/ui";
import { captionText, card, fieldLabel, pagePadding, pageTitle, textInput } from "../components/uiStyles";

const DURATION_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DURATION_MINUTES = [0, 15, 30, 45];
const START_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const END_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_OPTIONS = WEEKDAYS.map((short, index) => ({
  key: `weekday-${index}`,
  short,
  label: `${short}요일`,
}));

type DateMode = "date" | "weekday";

interface CalendarTouchState {
  x: number;
  y: number;
  key: string;
  timer: ReturnType<typeof setTimeout>;
  active: boolean;
}

const longPressMs = 350;
const touchScrollThreshold = 10;

function calendarKeyAt(t: Touch): string | undefined {
  const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
  return el?.closest<HTMLElement>("[data-date-key]")?.dataset.dateKey;
}

const fieldErrorText: CSSProperties = {
  ...captionText,
  color: "var(--color-danger)",
};

function dateKey(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthTitle(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function validDuration(hours: number, minutes: number): number {
  const total = hours * 60 + minutes;
  return total > 0 ? total : 30;
}

export function CreatePollPage() {
  const navigate = useNavigate();
  const todayKey = useMemo(() => dateKey(new Date()), []);
  const [monthCursor, setMonthCursor] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [fPurpose, setFPurpose] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("date");
  const [selDates, setSelDates] = useState<string[]>([]);
  const [fStart, setFStart] = useState(9);
  const [fEnd, setFEnd] = useState(18);
  const [fDur, setFDur] = useState(60);
  const [dateWarning, setDateWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selDatesRef = useRef(selDates);
  const calendarDragRef = useRef<{ erase: boolean } | null>(null);
  const touchRef = useRef<CalendarTouchState | null>(null);
  const touchTapRef = useRef<(key: string) => void>(() => {});
  const touchBeginRef = useRef<(key: string) => void>(() => {});
  const touchDragRef = useRef<(key: string) => void>(() => {});
  selDatesRef.current = selDates;

  useEffect(() => {
    // React의 touchmove는 passive로 등록되므로, 스크롤 차단을 위해 native 리스너를 사용한다.
    const onTouchMove = (e: TouchEvent) => {
      const touch = touchRef.current;
      const t = e.touches[0];
      if (!touch || !t) return;

      if (touch.active) {
        e.preventDefault();
        const key = calendarKeyAt(t);
        if (key) touchDragRef.current(key);
        return;
      }

      if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > touchScrollThreshold) {
        clearTimeout(touch.timer);
        touchRef.current = null;
      }
    };

    const cancelTouch = () => {
      calendarDragRef.current = null;
      const touch = touchRef.current;
      if (!touch) return;
      clearTimeout(touch.timer);
      touchRef.current = null;
    };

    const onTouchEnd = () => {
      const touch = touchRef.current;
      if (!touch) return;
      if (!touch.active) touchTapRef.current(touch.key);
      cancelTouch();
    };

    const onPointerUp = () => {
      calendarDragRef.current = null;
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", cancelTouch);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", cancelTouch);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const calendarDates = useMemo(() => {
    const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthCursor]);

  const canGoPrevMonth = dateKey(monthCursor) > todayKey.slice(0, 7) + "-01";
  const durationHours = Math.floor(fDur / 60);
  const durationMinutes = fDur % 60;

  const errors = useMemo(
    () => ({
      purpose: !fPurpose.trim() ? "모임 이름을 입력해 주세요" : "",
      dates: !selDates.length
        ? dateMode === "date"
          ? "투표할 날짜를 1개 이상 선택해 주세요"
          : "투표할 요일을 1개 이상 선택해 주세요"
        : "",
      timeRange: fEnd <= fStart ? "끝나는 시간은 시작 시간보다 늦어야 해요" : "",
      duration: fEnd > fStart && fDur > (fEnd - fStart) * 60 ? "소요 시간이 투표 시간대보다 길어요" : "",
    }),
    [fPurpose, selDates, dateMode, fStart, fEnd, fDur]
  );

  const canCreate = !errors.purpose && !errors.dates && !errors.timeRange && !errors.duration;

  function switchDateMode(nextMode: DateMode) {
    if (dateMode === nextMode) return;
    setDateMode(nextMode);
    setDateWarning("");
    setSelDates([]);
  }

  function toggleSelection(key: string) {
    setDateWarning("");
    if (dateMode === "date" && key < todayKey) {
      setDateWarning("오늘 이후 날짜만 선택할 수 있어요");
      return;
    }
    setSelDates((prev) => {
      if (prev.includes(key)) return prev.filter((d) => d !== key);
      if (prev.length >= 7) {
        setDateWarning(dateMode === "date" ? "날짜는 최대 7개까지 선택할 수 있어요" : "요일은 최대 7개까지 선택할 수 있어요");
        return prev;
      }
      return [...prev, key].sort();
    });
  }

  // 드래그 선택: 시작 날짜가 이미 선택돼 있으면 지우기 모드, 아니면 선택 모드로 지나간 날짜에 적용한다.
  function dragSelectDate(key: string) {
    const drag = calendarDragRef.current;
    if (!drag || key < todayKey) return;
    const current = selDatesRef.current;
    const has = current.includes(key);
    if (drag.erase) {
      if (has) setSelDates(current.filter((d) => d !== key));
      return;
    }
    if (has) return;
    if (current.length >= 7) {
      setDateWarning("날짜는 최대 7개까지 선택할 수 있어요");
      return;
    }
    setSelDates([...current, key].sort());
  }

  function beginCalendarDrag(key: string) {
    setDateWarning("");
    calendarDragRef.current = { erase: selDatesRef.current.includes(key) };
    dragSelectDate(key);
  }

  function handleCalendarTouchStart(e: React.TouchEvent, key: string) {
    if (touchRef.current) {
      clearTimeout(touchRef.current.timer);
      touchRef.current = null;
    }
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;

    const timer = setTimeout(() => {
      const touch = touchRef.current;
      if (!touch || touch.key !== key) return;
      touch.active = true;
      navigator.vibrate?.(10);
      touchBeginRef.current(key);
    }, longPressMs);
    touchRef.current = { x: t.clientX, y: t.clientY, key, timer, active: false };
  }

  touchTapRef.current = toggleSelection;
  touchBeginRef.current = beginCalendarDrag;
  touchDragRef.current = dragSelectDate;

  function setDurationHours(hours: number) {
    setFDur(validDuration(hours, durationMinutes));
  }

  function setDurationMinutes(minutes: number) {
    setFDur(validDuration(durationHours, minutes));
  }

  async function onCreate() {
    if (!canCreate || submitting) return;
    setSubmitting(true);
    try {
      const poll = await createPoll({
        purpose: fPurpose.trim(),
        dates: selDates,
        startHour: fStart,
        endHour: fEnd,
        dur: fDur,
      });
      navigate(`/vote/${poll.id}`, { state: { created: true } });
    } catch {
      setSubmitting(false);
    }
  }

  const dateError = dateWarning || errors.dates;

  return (
    <div style={{ ...pagePadding, padding: "48px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div
          style={{
            ...pageTitle,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          모일 시간 정해요
        </div>

        <div style={card}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={fieldLabel}>모임 이름</label>
            <input
              value={fPurpose}
              onChange={(e) => setFPurpose(e.target.value)}
              placeholder="예: 프로젝트 킥오프"
              style={textInput}
            />
            {errors.purpose && <div style={fieldErrorText}>{errors.purpose}</div>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={fieldLabel}>예상 소요 시간</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  style={{ ...textInput, fontVariantNumeric: "tabular-nums" }}
                >
                  {DURATION_HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0, color: "var(--color-ink-muted)", flex: "none" }}>시간</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  style={{ ...textInput, fontVariantNumeric: "tabular-nums" }}
                >
                  {DURATION_MINUTES.map((m) => (
                    <option key={m} value={m} disabled={durationHours === 0 && m === 0}>
                      {m}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0, color: "var(--color-ink-muted)", flex: "none" }}>분</span>
              </div>
            </div>
            {errors.duration && <div style={fieldErrorText}>{errors.duration}</div>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={fieldLabel}>
              날짜/시간대 선택
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(["date", "weekday"] as DateMode[]).map((mode) => {
                const selected = dateMode === mode;
                return (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => switchDateMode(mode)}
                    aria-pressed={selected}
                    style={{
                      minHeight: 44,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid " + (selected ? "var(--color-primary-ring)" : "var(--color-hairline)"),
                      background: selected ? "var(--color-primary-soft)" : "#ffffff",
                      color: selected ? "var(--color-primary-active)" : "var(--color-ink-secondary)",
                      cursor: "pointer",
                      fontSize: 15,
                      fontWeight: selected ? 700 : 600,
                      lineHeight: 1.35,
                      letterSpacing: 0,
                    }}
                  >
                    {mode === "date" ? "특정 날짜 선택" : "특정 요일 선택"}
                  </button>
                );
              })}
            </div>

            {dateMode === "date" ? (
              <div
                style={{
                  border: "1px solid var(--color-hairline)",
                  borderRadius: "var(--radius-md)",
                  padding: 12,
                  background: "#ffffff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => canGoPrevMonth && setMonthCursor((prev) => addMonths(prev, -1))}
                    disabled={!canGoPrevMonth}
                    aria-label="이전 달"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--color-hairline)",
                      background: "#ffffff",
                      color: "var(--color-ink-secondary)",
                      cursor: canGoPrevMonth ? "pointer" : "default",
                      opacity: canGoPrevMonth ? 1 : 0.35,
                      fontSize: 18,
                    }}
                  >
                    ‹
                  </button>
                  <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, letterSpacing: 0 }}>
                    {monthTitle(monthCursor)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMonthCursor((prev) => addMonths(prev, 1))}
                    aria-label="다음 달"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "var(--radius-full)",
                      border: "1px solid var(--color-hairline)",
                      background: "#ffffff",
                      color: "var(--color-ink-secondary)",
                      cursor: "pointer",
                      fontSize: 18,
                    }}
                  >
                    ›
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 4 }}>
                  {WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      style={{
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        letterSpacing: 0,
                        color: "var(--color-ink-faint)",
                      }}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: 4,
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                    touchAction: "manipulation",
                  }}
                >
                  {calendarDates.map((d) => {
                    const key = dateKey(d);
                    const selected = selDates.includes(key);
                    const isToday = key === todayKey;
                    const isPast = key < todayKey;
                    const inMonth = d.getMonth() === monthCursor.getMonth();
                    return (
                      <button
                        type="button"
                        key={key}
                        data-date-key={key}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse" && e.button === 0) {
                            e.preventDefault();
                            beginCalendarDrag(key);
                          }
                        }}
                        onPointerEnter={(e) => {
                          if (e.pointerType === "mouse") dragSelectDate(key);
                        }}
                        onTouchStart={(e) => handleCalendarTouchStart(e, key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelection(key);
                          }
                        }}
                        disabled={isPast}
                        aria-pressed={selected}
                        style={{
                          minWidth: 0,
                          minHeight: 44,
                          border: "none",
                          borderRadius: "var(--radius-md)",
                          background: selected ? "var(--color-primary-soft)" : "transparent",
                          color: selected
                            ? "var(--color-primary-active)"
                            : isPast
                              ? "var(--color-ink-faint)"
                              : inMonth
                                ? "var(--color-ink-secondary)"
                                : "var(--color-ink-faint)",
                          boxShadow: selected || isToday ? "inset 0 0 0 1px var(--color-primary-ring)" : "none",
                          cursor: isPast ? "default" : "pointer",
                          opacity: inMonth || selected ? 1 : 0.55,
                          fontSize: 15,
                          fontWeight: selected || isToday ? 700 : 500,
                          lineHeight: 1.35,
                          letterSpacing: 0,
                        }}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
                {WEEKDAY_OPTIONS.map((day) => {
                  const selected = selDates.includes(day.key);
                  return (
                    <button
                      type="button"
                      key={day.key}
                      onClick={() => toggleSelection(day.key)}
                      aria-pressed={selected}
                      style={{
                        minHeight: 48,
                        borderRadius: "var(--radius-md)",
                        border: "1px solid " + (selected ? "var(--color-primary-ring)" : "var(--color-hairline)"),
                        background: selected ? "var(--color-primary-soft)" : "#ffffff",
                        color: selected ? "var(--color-primary-active)" : "var(--color-ink-secondary)",
                        cursor: "pointer",
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        letterSpacing: 0,
                      }}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            )}

            {dateError && <div style={fieldErrorText}>{dateError}</div>}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr) auto",
                alignItems: "center",
                columnGap: 8,
                rowGap: 6,
                marginTop: 4,
              }}
            >
              <select
                aria-label="시작 시간"
                value={fStart}
                onChange={(e) => setFStart(Number(e.target.value))}
                style={{ ...textInput, minWidth: 0, fontVariantNumeric: "tabular-nums" }}
              >
                {START_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: 0, color: "var(--color-ink-muted)", whiteSpace: "nowrap" }}>부터</span>
              <select
                aria-label="종료 시간"
                value={fEnd}
                onChange={(e) => setFEnd(Number(e.target.value))}
                style={{ ...textInput, minWidth: 0, fontVariantNumeric: "tabular-nums" }}
              >
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, letterSpacing: 0, color: "var(--color-ink-muted)", whiteSpace: "nowrap" }}>까지</span>
            </div>
            {errors.timeRange && <div style={fieldErrorText}>{errors.timeRange}</div>}
          </div>

          <div
            style={{
              paddingTop: 4,
            }}
          >
            <PrimaryButton onClick={onCreate} disabled={!canCreate || submitting} style={{ width: "100%", minHeight: 48 }}>
              투표 만들기
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
