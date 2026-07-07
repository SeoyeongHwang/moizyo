import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPoll } from "../lib/api";
import { dateShort, nextDays } from "../lib/scheduling";
import { card, fieldLabel, pagePadding, PrimaryButton, stepBadge, textInput } from "../components/ui";

const TYPE_OPTIONS = ["프로젝트 킥오프", "팀 회의", "1:1 미팅", "워크숍", "회식 / 모임"];
const DUR_OPTIONS = [
  { value: 30, label: "30분" },
  { value: 60, label: "1시간" },
  { value: 90, label: "1시간 30분" },
  { value: 120, label: "2시간" },
];
const START_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const END_HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

export function CreatePollPage() {
  const navigate = useNavigate();
  const [fType, setFType] = useState(TYPE_OPTIONS[1]);
  const [fPurpose, setFPurpose] = useState("");
  const [selDates, setSelDates] = useState<string[]>([]);
  const [fStart, setFStart] = useState(9);
  const [fEnd, setFEnd] = useState(18);
  const [fDur, setFDur] = useState(60);
  const [dateWarning, setDateWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dateChips = useMemo(() => nextDays(14), []);

  const error = useMemo(() => {
    if (!fPurpose.trim()) return "회의 목적을 입력해 주세요";
    if (!selDates.length) return "조사할 날짜를 1개 이상 선택해 주세요";
    if (fEnd <= fStart) return "종료 시간은 시작 시간보다 늦어야 해요";
    if (fDur > (fEnd - fStart) * 60) return "소요 시간이 조사 시간대보다 길어요";
    return "";
  }, [fPurpose, selDates, fStart, fEnd, fDur]);

  const canCreate = !error;

  function toggleDate(key: string) {
    setDateWarning("");
    setSelDates((prev) => {
      if (prev.includes(key)) return prev.filter((d) => d !== key);
      if (prev.length >= 7) {
        setDateWarning("날짜는 최대 7개까지 선택할 수 있어요");
        return prev;
      }
      return [...prev, key].sort();
    });
  }

  async function onCreate() {
    if (!canCreate || submitting) return;
    setSubmitting(true);
    try {
      const poll = await createPoll({
        type: fType,
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

  return (
    <div style={{ ...pagePadding, padding: "48px 20px 80px" }}>
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={stepBadge}>STEP 1 · 투표 생성</div>
        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-1px", marginBottom: 10 }}>
          모두가 만족하는
          <br />
          회의 시간을 찾아보세요
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "var(--color-ink-muted)", marginBottom: 28 }}>
          참가자의 솔직한 선호를 모아 히트맵으로 보여주고, 최적의 시간을 추천해 드립니다.
        </div>

        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabel}>이벤트 종류</label>
              <select value={fType} onChange={(e) => setFType(e.target.value)} style={textInput}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabel}>소요 시간</label>
              <select value={fDur} onChange={(e) => setFDur(Number(e.target.value))} style={textInput}>
                {DUR_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={fieldLabel}>회의 목적</label>
            <input
              value={fPurpose}
              onChange={(e) => setFPurpose(e.target.value)}
              placeholder="예: 새 프로젝트의 전체 계획 및 일정 수립"
              style={textInput}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={fieldLabel}>
              조사 날짜 <span style={{ fontWeight: 400, color: "var(--color-ink-faint)" }}>— 여러 날짜 선택 가능</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dateChips.map((key) => {
                const sel = selDates.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleDate(key)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 9999,
                      fontSize: 14,
                      cursor: "pointer",
                      border: "1px solid " + (sel ? "var(--color-primary)" : "var(--color-hairline)"),
                      background: sel ? "rgba(0,117,222,0.08)" : "#ffffff",
                      color: sel ? "var(--color-primary)" : "var(--color-ink-secondary)",
                      fontWeight: sel ? 600 : 400,
                    }}
                  >
                    {dateShort(key)}
                  </button>
                );
              })}
            </div>
            {dateWarning && (
              <div style={{ fontSize: 13, color: "var(--color-danger)" }}>{dateWarning}</div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabel}>조사 시작 시간</label>
              <select value={fStart} onChange={(e) => setFStart(Number(e.target.value))} style={textInput}>
                {START_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={fieldLabel}>조사 종료 시간</label>
              <select value={fEnd} onChange={(e) => setFEnd(Number(e.target.value))} style={textInput}>
                {END_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              borderTop: "1px solid var(--color-hairline)",
              paddingTop: 20,
            }}
          >
            <div style={{ fontSize: 14, color: "var(--color-danger)", minHeight: 20 }}>{error}</div>
            <PrimaryButton onClick={onCreate} disabled={!canCreate || submitting}>
              투표 생성하기
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
