import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getResults, seedDemo, updatePoll } from "../lib/api";
import type { Candidate, Marks, PollMeta } from "../lib/scheduling";
import {
  aggregate,
  buildConfirmationMessage,
  candidates as computeCandidates,
  dateShort,
  evaluateSlot,
  fmtMin,
  keyTitle,
  pollTitle,
  responseCountText,
  slots,
} from "../lib/scheduling";
import { copyText } from "../lib/clipboard";
import { useToast } from "../components/Toast";
import { card, pagePadding, PrimaryButton, UtilityButton } from "../components/ui";

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

  if (notFound) {
    return (
      <div style={{ ...pagePadding, padding: "80px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>투표를 찾을 수 없습니다</div>
      </div>
    );
  }
  if (!poll) return null;

  const sl = slots(poll);
  const map = aggregate(responses);
  const names = Object.keys(responses);
  const req = poll.required || [];

  const recCellRank: Record<string, number> = {};
  const recBadge: Record<string, number> = {};
  recs.forEach((c, i) => {
    c.keys.forEach((k) => {
      if (recCellRank[k] == null) recCellRank[k] = i + 1;
    });
    if (recBadge[c.keys[0]] == null) recBadge[c.keys[0]] = i + 1;
  });

  async function toggleRequired(name: string) {
    if (!id || !poll) return;
    const next = req.includes(name) ? req.filter((n) => n !== name) : [...req, name];
    const updated = await updatePoll(id, { required: next });
    setPoll(updated);
  }

  async function onPick(idx: number) {
    if (!id || !poll) return;
    const c = recs[idx];
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
  const detailTitle = dk ? keyTitle(dk) : "블록에 마우스를 올려 보세요";
  const detailBest = de && de.best.length ? de.best.join(", ") : "—";
  const detailOk = de && de.ok.length ? de.ok.join(", ") : "—";
  const noNames = de ? names.filter((n) => !de.best.includes(n) && !de.ok.includes(n)) : [];
  const detailNo = de ? (noNames.length ? noNames.join(", ") : "—") : "—";
  const detailWarn = de && de.ok.length ? `${de.ok.length}명의 참가자에게 이 시간이 최선이 아닐 수 있어요` : "";

  const finalIdx = poll.final
    ? recs.findIndex((c) => c.date === poll.final!.date && c.startMin === poll.final!.startMin && c.endMin === poll.final!.endMin)
    : -1;

  return (
    <div style={{ ...pagePadding, padding: "36px 20px 100px" }}>
      <div style={{ width: "100%", maxWidth: 1060 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.625px" }}>응답 결과</div>
          <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>
            {pollTitle(poll)} · {responseCountText(total)}
          </div>
        </div>
        <div style={{ fontSize: 14, color: "var(--color-ink-muted)", marginBottom: 20 }}>
          색이 진할수록 가능한 사람이 많은 시간입니다. 블록에 마우스를 올리거나 탭하면 상세 명단이 보입니다.
        </div>

        {total > 0 ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
              <div style={{ ...card, flex: "2 1 480px", padding: 20 }}>
                <div style={{ userSelect: "none" }}>
                  <div style={{ display: "flex", marginBottom: 4 }}>
                    <div style={{ width: 52, flex: "none" }} />
                    {poll.dates.map((d) => (
                      <div key={d} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: "0.125px", color: "var(--color-ink-muted)" }}>
                        {dateShort(d)}
                      </div>
                    ))}
                  </div>
                  {sl.map((m) => (
                    <div key={m} style={{ display: "flex" }}>
                      <div style={{ width: 52, flex: "none", fontSize: 11, color: "var(--color-ink-faint)", textAlign: "right", paddingRight: 8, transform: "translateY(-6px)" }}>
                        {m % 60 === 0 ? fmtMin(m) : ""}
                      </div>
                      {poll.dates.map((d) => {
                        const key = d + "_" + m;
                        const e = map[key] || { best: [], ok: [] };
                        const a = e.best.length + e.ok.length;
                        const ratio = total ? a / total : 0;
                        const bg = a === 0 ? "var(--color-canvas-soft)" : `rgba(0,117,222,${(0.12 + ratio * 0.82).toFixed(2)})`;
                        const rank = recCellRank[key];
                        const badge = recBadge[key];
                        const hovered = detailKey === key;
                        return (
                          <div
                            key={key}
                            onMouseEnter={() => setDetailKey(key)}
                            onClick={() => setDetailKey(key)}
                            style={{
                              flex: 1,
                              height: 26,
                              position: "relative",
                              cursor: "pointer",
                              borderRight: "1px solid rgba(255,255,255,0.6)",
                              borderTop: m % 60 === 0 ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.35)",
                              background: bg,
                              boxShadow: rank === 1 ? "inset 0 0 0 2px var(--color-primary)" : hovered ? "inset 0 0 0 2px rgba(0,0,0,0.55)" : "none",
                            }}
                          >
                            {e.ok.length > 0 && (
                              <div style={{ position: "absolute", top: 3, right: 4, width: 6, height: 6, borderRadius: 9999, background: "var(--color-danger)", pointerEvents: "none" }} />
                            )}
                            {badge != null && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: -1,
                                  left: 2,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: rank === 1 ? "var(--color-primary)" : "var(--color-ink-secondary)",
                                  background: "#ffffff",
                                  borderRadius: 4,
                                  padding: "0 4px",
                                  pointerEvents: "none",
                                  border: "1px solid var(--color-hairline)",
                                }}
                              >
                                {badge}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--color-ink-muted)", alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 44, height: 10, borderRadius: 3, background: "linear-gradient(90deg,#f6f5f4,#0075de)" }} />
                    가능 인원 비율
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--color-danger)" }} />
                    비선호 응답 있음
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: "#fff", border: "2px solid var(--color-primary)" }} />
                    추천 1순위 구간
                  </div>
                </div>
              </div>

              <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 20, minWidth: 280 }}>
                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.125px", color: "var(--color-ink-muted)", marginBottom: 10 }}>
                    시간 상세
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.125px", marginBottom: 12 }}>{detailTitle}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.43 }}>
                    <DetailRow color="var(--color-best)" label="선호" value={detailBest} />
                    <DetailRow color="var(--color-ok)" label="가능(비선호)" value={detailOk} />
                    <DetailRow color="var(--color-hairline)" label="불가능" value={detailNo} />
                  </div>
                  {detailWarn && (
                    <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.45, color: "var(--color-warn-text)", background: "var(--color-warn-bg)", borderRadius: 8, padding: "8px 10px" }}>
                      {detailWarn}
                    </div>
                  )}
                </div>

                <div style={card}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.125px", color: "var(--color-ink-muted)", marginBottom: 4 }}>
                    참가자 · 필수 지정
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-ink-faint)", marginBottom: 12 }}>
                    필수 참가자가 모두 가능한 시간을 우선 추천합니다.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {names.map((n) => {
                      const checked = req.includes(n);
                      return (
                        <label
                          key={n}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 5, cursor: "pointer", fontSize: 15 }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-canvas-soft)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRequired(n)}
                            style={{ accentColor: "#0075de", width: 16, height: 16 }}
                          />
                          <span style={{ flex: 1 }}>{n}</span>
                          {checked && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: "0.125px",
                                color: "var(--color-primary)",
                                border: "1px solid rgba(0,117,222,0.35)",
                                borderRadius: 9999,
                                padding: "1px 8px",
                              }}
                            >
                              필수
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...card, marginTop: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.125px", marginBottom: 2 }}>추천 시간</div>
              <div style={{ fontSize: 14, color: "var(--color-ink-muted)", marginBottom: 16 }}>
                소요 시간 {poll.dur}분 기준{req.length ? ` · 필수 참가자 ${req.length}명 우선 반영` : ""} · 상위 {recs.length}개 후보
              </div>
              {recs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recs.map((c, i) => {
                    const selected = finalIdx === i;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          flexWrap: "wrap",
                          border: "1px solid " + (selected ? "var(--color-primary)" : "var(--color-hairline)"),
                          background: selected ? "rgba(0,117,222,0.04)" : "#ffffff",
                          borderRadius: 8,
                          padding: "14px 16px",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9999,
                            background: "rgba(0,117,222,0.08)",
                            color: "var(--color-primary)",
                            fontWeight: 700,
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flex: "none",
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.125px" }}>
                            {dateShort(c.date)} {fmtMin(c.startMin)} ~ {fmtMin(c.endMin)}
                          </div>
                          <div style={{ fontSize: 14, color: "var(--color-ink-muted)" }}>
                            {total}명 중 {c.avail.length}명 가능 · {c.bestAll.length}명 최선호
                            {req.length ? (c.reqOk ? " · 필수 참가자 모두 가능" : " · 필수 참가자 일부 불가") : ""}
                          </div>
                          {c.okAny.length > 0 && (
                            <div style={{ fontSize: 13, color: "var(--color-warn-text)", marginTop: 2 }}>
                              {c.okAny.length}명에게 이 시간이 최선이 아닐 수 있어요
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => onPick(i)}
                          disabled={selected}
                          style={
                            selected
                              ? { background: "var(--color-primary)", color: "#ffffff", border: "1px solid var(--color-primary)", borderRadius: 8, padding: "5px 14px", fontSize: 14, fontWeight: 600, cursor: "default", flex: "none" }
                              : { background: "#ffffff", color: "rgba(0,0,0,0.85)", border: "1px solid var(--color-hairline)", borderRadius: 8, padding: "5px 14px", fontSize: 14, fontWeight: 500, cursor: "pointer", flex: "none" }
                          }
                        >
                          {selected ? "확정됨 ✓" : "이 시간으로 확정"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 14, color: "var(--color-ink-muted)", background: "var(--color-canvas-soft)", borderRadius: 8, padding: "14px 16px" }}>
                  필수 참가자가 모두 가능한 연속 시간이 없습니다. 필수 지정을 조정해 보세요.
                </div>
              )}
            </div>

            {poll.final && (
              <div style={{ ...card, marginTop: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.125px", marginBottom: 2 }}>확정 안내 메시지</div>
                <div style={{ fontSize: 14, color: "var(--color-ink-muted)", marginBottom: 14 }}>
                  자동 생성된 근거 요약입니다. 자유롭게 수정한 뒤 복사해 공유하세요.
                </div>
                <textarea
                  value={msgText}
                  onChange={(e) => {
                    setMsgText(e.target.value);
                    setMsgEdited(true);
                  }}
                  rows={11}
                  style={{ width: "100%", border: "1px solid var(--color-input-border)", borderRadius: 4, padding: 12, fontSize: 14, lineHeight: 1.55, color: "rgba(0,0,0,0.9)", resize: "vertical" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <PrimaryButton onClick={() => copyText(msgText, () => showToast("확정 메시지가 복사되었습니다"))}>
                    메시지 + 링크 복사
                  </PrimaryButton>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ background: "var(--color-canvas-soft)", border: "1px dashed #d9d5d1", borderRadius: 16, padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 16, color: "var(--color-ink-muted)", marginBottom: 16 }}>
              아직 응답이 없습니다. 링크를 공유하거나 데모 응답을 채워 보세요.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <PrimaryButton onClick={() => navigate(`/vote/${poll.id}/join`)}>참가자로 응답하기</PrimaryButton>
              <UtilityButton onClick={onSeed}>데모 응답 7명 채우기</UtilityButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flex: "none", marginTop: 4 }} />
      <div>
        <b>{label}</b> · {value}
      </div>
    </div>
  );
}
