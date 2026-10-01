"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { hydratePublishedDailyState, type PublishedInsight } from "@/lib/daily-report-store";
import { normalizeInsightText } from "@/lib/media-normalization";
import styles from "./daily-insight-history.module.css";

export function InsightEntry({ item, displayNotes }: { item: PublishedInsight; displayNotes?: string[] }) {
  const { advertiser, month, canEdit, dataSyncState } = useWorkspace();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState<{ text: string; updatedAt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !canEdit || saving || dataSyncState === "loading") return;
    const notes = draft.text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean);
    if (!notes.length) { setError("인사이트 문구를 입력해주세요."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/reporting/store", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_insight", input: {
          advertiser, insightId: item.insightId, expectedUpdatedAt: draft.updatedAt, notes,
        } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error === "INSIGHT_CHANGED"
        ? "다른 사용자가 수정했거나 리포트가 갱신됐습니다. 입력 내용을 복사한 뒤 취소하고 다시 수정해주세요."
        : payload.error === "INSIGHT_NOT_FOUND" ? "리포트가 갱신됐습니다. 새로고침한 뒤 다시 수정해주세요."
        : payload.error === "INVALID_INSIGHT_NOTES" ? "문구는 80개 항목, 항목당 4,000자 이내로 입력해주세요."
        : "인사이트 저장에 실패했습니다. 다시 시도해주세요.");
      if (!mounted.current) return;
      setDraft(null);
      setNotice("인사이트 문구를 저장했습니다.");
      try { await hydratePublishedDailyState(advertiser, month); }
      catch { if (mounted.current) setError("문구는 저장됐습니다. 새로고침해 내용을 확인해주세요."); }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally { if (mounted.current) setSaving(false); }
  }
  return <details className={styles.entry} open>
    <summary>{item.reportDate} · {normalizeInsightText(item.mailSubject) || "데일리 운영 인사이트"}</summary>
    {item.mailDate && <p className={styles.meta}>메일 수신: {new Date(item.mailDate).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
    {draft && canEdit ? <form onSubmit={save} className={styles.editor}>
      <label>인사이트 문구<textarea aria-label="인사이트 문구" required maxLength={80000} rows={8} value={draft.text} disabled={saving} onChange={event => setDraft({ ...draft, text: event.target.value })} /></label>
      <small>빈 줄로 항목을 구분합니다. 메일의 전체 인사이트를 편집하며 개요·성과·동료 계정에 함께 반영됩니다.</small>
      <div className={styles.actions}><button type="button" className="btn" disabled={saving} onClick={() => { setDraft(null); setError(""); }}>취소</button><button type="submit" className="btn primary" disabled={saving || dataSyncState === "loading"}>{saving ? "저장 중…" : "인사이트 저장"}</button></div>
    </form> : <>
      {(displayNotes ?? item.notes).length ? (displayNotes ?? item.notes).map((note, index) => <p key={index}>{normalizeInsightText(note)}</p>) : <p>등록된 상세 내용이 없습니다.</p>}
      {canEdit && item.insightId && item.importUpdatedAt && <div className={styles.actions}><button type="button" className="btn" disabled={dataSyncState === "loading" || saving} onClick={() => { setDraft({ text: item.notes.join("\n\n"), updatedAt: item.importUpdatedAt! }); setError(""); setNotice(""); }}>문구 수정</button></div>}
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </details>;
}

export function DailyInsightHistory({ insights }: { insights: PublishedInsight[] }) {
  const { advertiser, month } = useWorkspace();
  const [selectedDate, setSelectedDate] = useState("");
  const dates = [...new Set(insights.map(item => item.reportDate))].sort().reverse();
  const activeDate = dates.includes(selectedDate) ? selectedDate : dates[0];
  const selected = insights.filter(item => item.reportDate === activeDate)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return <div className={styles.history}>
    {!dates.length ? <p className="empty-inline">반영된 데일리 인사이트가 없습니다.</p> : <>
      <div className={styles.dates} role="group" aria-label="인사이트 날짜 선택">
        {dates.map(date => <button type="button" key={date} aria-pressed={date === activeDate}
          className={date === activeDate ? styles.active : styles.date}
          onClick={() => setSelectedDate(date)}>{date}</button>)}
      </div>
      <div className={styles.detail} aria-live="polite">
        <h3>{activeDate} 인사이트</h3>
        {selected.map(item => <InsightEntry key={advertiser + month + item.key} item={item} />)}
      </div>
    </>}
  </div>;
}
