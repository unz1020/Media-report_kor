"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishPlacementProof } from "@/lib/daily-report-store";
import type { PlacementProof } from "@/lib/placement-proof";
import styles from "./placement-report-intake.module.css";

type GmailAttachment = { filename: string; attachmentId: string; mimeType?: string };
type GmailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  internalDate?: string;
  body: string;
  attachments: GmailAttachment[];
};
type ProofRecord = PlacementProof & { proofId?: string; creativeName?: string };
type ProofResult = { message: GmailMessage; proof: ProofRecord; warning?: string; pdfParsed?: boolean };

function kstTodayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatWon(value: number | null) {
  return value === null ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function cloneId(messageId: string, kind: "placement" | "creative") {
  return `${messageId}:${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
}

export function PlacementReportIntake() {
  const { advertiser, month } = useWorkspace();
  const [selectedDate, setSelectedDate] = useState(kstTodayString);
  const [results, setResults] = useState<ProofResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);

  const visibleResults = useMemo(() => results.filter((item) => item.proof.month === month), [results, month]);

  async function load() {
    setLoading(true);
    setError("");
    setResults([]);
    setPublished(false);
    try {
      const q = `${advertiser} {subject:"게첨 보고서" subject:"게재 보고서" subject:"게첨보고서" subject:"게재보고서"}`;
      const params = new URLSearchParams({ q, date: selectedDate, attachmentMode: "placement" });
      const response = await fetch(`/api/gmail/today?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail 조회에 실패했습니다.");
      const messages = ((payload.messages || []) as GmailMessage[]).filter((message) => /게첨|게재/i.test(`${message.subject}\n${message.body}`));
      if (!messages.length) throw new Error(`${selectedDate}에 ${advertiser} 게재 보고서 메일이 없습니다.`);

      const parsed: ProofResult[] = [];
      for (const message of messages) {
        const proofResponse = await fetch("/api/gmail/placement-proof", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            advertiser,
            messageId: message.id,
            subject: message.subject,
            body: message.body,
            mailDate: message.date,
            selectedDate,
            attachments: message.attachments,
          }),
        });
        const proofPayload = await proofResponse.json();
        if (!proofResponse.ok) throw new Error(proofPayload.error || `${message.subject} 분석 실패`);
        const proof = proofPayload.proof as ProofRecord;
        proof.proofId = proof.proofId || `${message.id}:base`;
        proof.key = proof.key || `${advertiser}::${month}::proof::${proof.proofId}`;
        parsed.push({ message, proof, warning: proofPayload.warning, pdfParsed: proofPayload.pdfParsed });
      }
      setResults(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "게재 보고서 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateProof(index: number, patch: Partial<ProofRecord>) {
    setResults((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextProof = { ...item.proof, ...patch };
      nextProof.status = nextProof.placement.trim() ? "게재 확인" : "확인 필요";
      return { ...item, proof: nextProof };
    }));
    setPublished(false);
  }

  function addDraft(index: number, kind: "placement" | "creative") {
    setResults((current) => {
      const source = current[index];
      if (!source) return current;
      const id = cloneId(source.message.id, kind);
      const samePlacementCreativeCount = current.filter((item) =>
        item.message.id === source.message.id && item.proof.placement === source.proof.placement && item.proof.creativeName
      ).length;
      const proof: ProofRecord = {
        ...source.proof,
        key: `${advertiser}::${month}::proof::${id}`,
        proofId: id,
        sourceFile: `${source.proof.sourceFile}__${id.split(":").slice(-2).join("-")}`,
        placement: kind === "placement" ? "" : source.proof.placement,
        creativeName: kind === "creative" ? `소재 ${samePlacementCreativeCount + 1}` : "",
        status: kind === "placement" ? "확인 필요" : source.proof.status,
      };
      const clone: ProofResult = { ...source, proof };
      return [...current.slice(0, index + 1), clone, ...current.slice(index + 1)];
    });
    setPublished(false);
  }

  function removeDraft(index: number) {
    setResults((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPublished(false);
  }

  function publish() {
    const invalid = visibleResults.find((item) => !item.proof.placement.trim());
    if (invalid) {
      setError("게재 지면명이 비어 있는 항목이 있습니다. 지면명을 입력한 뒤 반영해주세요.");
      return;
    }
    setError("");
    visibleResults.forEach((item) => publishPlacementProof(item.proof));
    setPublished(true);
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className="eyebrow">게재 확인 · Gmail</div>
          <h2>게재 보고서 자동 수집</h2>
          <p>메일과 보고서에서 기본 지면을 읽은 뒤, 한 보고서에 지면이 여러 개면 지면을 추가하고 디지털 매체에서 같은 지면에 여러 소재가 돌면 소재별 항목으로 분리해 저장합니다.</p>
        </div>
        <span className="view-pill">{advertiser} · {month}</span>
      </div>

      <div className={styles.controls}>
        <label>메일 수신일</label>
        <input type="date" value={selectedDate} max={kstTodayString()} onChange={(event) => setSelectedDate(event.target.value)} />
        <button type="button" className={styles.primary} onClick={load} disabled={loading}>{loading ? "게재 보고서 분석 중…" : "게재 보고서 불러오기"}</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {published && <div className={styles.notice}>게재 확인 자료를 지면·소재별로 소재 · 게재지면 화면에 반영했습니다.</div>}

      {visibleResults.length ? <>
        <div className={styles.grid}>
          {visibleResults.map(({ message, proof, warning, pdfParsed }, index) => <article key={proof.key || `${message.id}-${index}`} className={styles.card}>
            <div>
              <div className={styles.cardTitle}>
                <span className={styles.status}>{proof.status}</span>
                <strong>{proof.placement || "새 게재 지면"}</strong>
                {proof.creativeName && <span className={styles.variantBadge}>{proof.creativeName}</span>}
              </div>
              <div className={styles.source}>{message.subject}</div>
              <div className={styles.editor}>
                <label><span>매체</span><input value={proof.media} onChange={(event) => updateProof(index, { media: event.target.value })} /></label>
                <label><span>게재 지면</span><input value={proof.placement} placeholder="예: 네이버 메인 / 아이파크 싱크월" onChange={(event) => updateProof(index, { placement: event.target.value })} /></label>
                <label><span>소재명 · 선택</span><input value={proof.creativeName || ""} placeholder="예: 브랜딩 A / 정성편 15초" onChange={(event) => updateProof(index, { creativeName: event.target.value })} /></label>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={() => addDraft(index, "placement")}>+ 지면 추가</button>
                <button type="button" className={styles.secondary} onClick={() => addDraft(index, "creative")}>+ 같은 지면 소재 추가</button>
                {visibleResults.length > 1 && <button type="button" className={styles.remove} onClick={() => removeDraft(index)}>항목 삭제</button>}
              </div>
              <div className={styles.files}>{proof.attachments.map((file) => <span key={`${file.filename}-${file.attachmentId}`}>{file.filename}</span>)}</div>
              {warning && <div className={styles.warning}>PDF 상세 분석 일부 실패 · 메일 내용으로 우선 인식: {warning}</div>}
              {!warning && pdfParsed && <div className={styles.warning} style={{ color: "#027a48" }}>PDF 상세정보까지 확인됨</div>}
            </div>
            <div className={styles.meta}>
              <div><span>구분</span><strong>{proof.serviceType}</strong></div>
              <div><span>노출 기간</span><strong>{proof.periodStart || "-"} ~ {proof.periodEnd || "-"}</strong></div>
              <div><span>확인 기준일</span><strong>{proof.verificationDate || proof.reportDate}</strong></div>
              <div><span>매체 위치</span><strong>{proof.location || "-"}</strong></div>
              <div><span>방영 시간</span><strong>{proof.airingTime || "-"}</strong></div>
              <div><span>1일 편성</span><strong>{proof.dailyFrequency ? `${proof.dailyFrequency.toLocaleString("ko-KR")}회` : "-"}</strong></div>
              <div><span>소재 길이</span><strong>{proof.durationSec ? `${proof.durationSec}초` : "-"}</strong></div>
              <div><span>연계 집행 기준</span><strong>{formatWon(proof.budgetReference)}</strong></div>
            </div>
          </article>)}
        </div>
        <div className={styles.footer}><button type="button" className={styles.primary} onClick={publish}>검수 완료 후 게재지면 반영</button></div>
      </> : !loading && !error ? <div className={styles.empty}>날짜를 선택해 Gmail의 게재 보고서를 불러오면 여기에서 검수할 수 있습니다.</div> : null}
    </section>
  );
}
