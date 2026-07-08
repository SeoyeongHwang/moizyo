import { useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { createPoll } from "../lib/api";
import { PrimaryButton } from "../components/ui";
import { captionText, card, fieldLabel, pagePadding, pageTitle, textInput } from "../components/uiStyles";

const DURATION_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DURATION_MINUTES = [0, 30];
const START_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const END_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_OPTIONS = WEEKDAYS.map((short, index) => ({
  key: `weekday-${index}`,
  short,
  label: `${short}요일`,
}));

type DateMode = "date" | "weekday";

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
      purpose: !fPurpose.trim() ? "이벤트 이름을 입력해 주세요" : "",
      dates: !selDates.length
        ? dateMode === "date"
          ? "조사할 날짜를 1개 이상 선택해 주세요"
          : "조사할 요일을 1개 이상 선택해 주세요"
        : "",
      timeRange: fEnd <= fStart ? "끝나는 시간은 시작 시간보다 늦어야 해요" : "",
      duration: fEnd > fStart && fDur > (fEnd - fStart) * 60 ? "소요 시간이 조사 시간대보다 길어요" : "",
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
      navigate(`/vote/${poll.id}`);
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
            <label style={fieldLabel}>이벤트 이름</label>
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
                      minHeight: 40,
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
                      width: 40,
                      height: 40,
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
                      width: 40,
                      height: 40,
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
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
                        onClick={() => toggleSelection(key)}
                        disabled={isPast}
                        aria-pressed={selected}
                        style={{
                          minWidth: 0,
                          minHeight: 40,
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
              borderTop: "1px solid var(--color-hairline)",
              paddingTop: 20,
            }}
          >
            <PrimaryButton onClick={onCreate} disabled={!canCreate || submitting} style={{ width: "100%", minHeight: 48 }}>
              투표 생성하기
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
