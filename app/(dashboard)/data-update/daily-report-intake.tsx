"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import { publishDailyBundles, publishMailOnlyInsight } from "@/lib/daily-report-store";
import styles from "./daily-report-intake.module.css";

type GmailAttachment = { filename: string; attachmentId: string; mimeType?: string };
type GmailMessage = { id: string; subject: string; from: string; date: string; internalDate?: string; body: string; attachments: GmailAttachment[] };
type AttachmentResult = { attachment: GmailAttachment; bundle?: DailyBundlePreview; error?: string };
type MailBatch = { message: GmailMessage; results: AttachmentResult[] };

function mailMeta(message: GmailMessage, fallbackDate: string, selectedAdvertiser: string) {
  const year = Number(fallbackDate.slice(0, 4)) || new Date().getFullYear();
  const dateMatch = message.body.match(/(?:\*\s*)?(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?자/) || message.body.match(/(?:기준|업데이트)[^\n]{0,24}?(\d{1,2})\/(\d{1,2})/);
  const reportDate = dateMatch ? `${year}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}` : fallbackDate;
  const combined = `${message.subject}\n${message.body}`;
  const advertiser = /교원웰스|웰스/i.test(combined) ? "교원웰스" : /자코모/i.test(combined) ? "자코모" : selectedAdvertiser;
  const notes = Array.from(new Set(message.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => /전일|성과|효율|상승|하락|예산|노출|클릭|CTR|전환|라이브|집행|매체/i.test(line)))).slice(0, 30);
  return { advertiser, reportDate, notes };
}

export function DailyReportIntake() {
  const { advertiser, month } = useWorkspace();
  const [mode, setMode] = useState<"gmail" | "manual">("gmail");
  const [file, setFile] = useState<File | null>(null);
  const [mailBody, setMailBody] = useState("");
  const [manualResult, setManualResult] = useState<DailyBundlePreview | null>(null);
  const [batches, setBatches] = useState<MailBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailChecked, setGmailChecked] = useState(false);
  const [todayLabel, setTodayLabel] = useState("");
  const [publishedCount, setPublishedCount] = useState(0);
  const [toast, setToast] = useState("");

  const gmailQuery = `${advertiser} {subject:"데일리 리포트" subject:"Daily Report"}`;

  useEffect(() => {
    fetch("/api/gmail/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGmailConnected(Boolean(data.connected)))
      .catch(() => setGmailConnected(false))
      .finally(() => setGmailChecked(true));
  }, []);

  useEffect(() => {
    setBatches([]);
    setManualResult(null);
    setPublishedCount(0);
    setError("");
  }, [advertiser, month]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const allResults = useMemo(() => batches.flatMap((batch) => batch.results.map((result) => ({ ...result, message: batch.message }))), [batches]);
  const ready = useMemo(() => allResults.filter((item) => item.bundle && item.bundle.placements.length > 0 && item.bundle.advertiser === advertiser), [allResults, advertiser]);
  const structureIssues = useMemo(() => allResults.filter((item) => item.bundle && item.bundle.placements.length === 0), [allResults]);
  const advertiserMismatch = useMemo(() => allResults.filter((item) => item.bundle && item.bundle.advertiser !== "미확인" && item.bundle.advertiser !== advertiser), [allResults, advertiser]);
  const failed = useMemo(() => allResults.filter((item) => item.error), [allResults]);
  const mailOnly = useMemo(() => batches.filter((batch) => batch.message.attachments.length === 0), [batches]);
  const issueCount = structureIssues.length + advertiserMismatch.length + failed.length + ready.reduce((sum, item) => sum + (item.bundle?.qa.mismatchedMailMetrics ?? 0) + (item.bundle?.qa.unmatchedMailMetrics ?? 0), 0);
  const factAttachmentCount = allResults.length;

  async function parseGmailAttachment(message: GmailMessage, attachment: GmailAttachment) {
    const response = await fetch("/api/gmail/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: message.id, attachmentId: attachment.attachmentId, filename: attachment.filename, mailBody: message.body }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "첨부파일 분석에 실패했습니다.");
    return payload.bundle as DailyBundlePreview;
  }

  async function loadTodayFromGmail() {
    setLoading(true); setError(""); setPublishedCount(0); setBatches([]);
    try {
      const response = await fetch(`/api/gmail/today?q=${encodeURIComponent(gmailQuery)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail 조회에 실패했습니다.");
      const messages = (payload.messages || []) as GmailMessage[];
      setTodayLabel(payload.date || "오늘");
      if (!messages.length) throw new Error(`오늘 수신된 ${advertiser} Daily Report 메일이 없습니다.`);

      const next: MailBatch[] = [];
      for (const message of messages) {
        const results: AttachmentResult[] = [];
        for (const attachment of message.attachments) {
          const result: AttachmentResult = { attachment };
          try { result.bundle = await parseGmailAttachment(message, attachment); }
          catch (itemError) { result.error = itemError instanceof Error ? itemError.message : "파싱 실패"; }
          results.push(result);
        }
        next.push({ message, results });
        setBatches([...next]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gmail Daily Report 처리 중 오류가 발생했습니다.");
    } finally { setLoading(false); }
  }

  async function analyzeManual() {
    if (!file) { setError("Daily Monitoring Excel 파일을 선택해주세요."); return; }
    setLoading(true); setError(""); setPublishedCount(0);
    try { setManualResult(await parseDailyWorkbook(file, mailBody)); }
    catch { setError("Excel 분석 중 오류가 발생했습니다. 파일 구조를 확인해주세요."); }
    finally { setLoading(false); }
  }

  function publishBatch() {
    if (mode === "manual") {
      if (!manualResult?.placements.length) return;
      if (manualResult.advertiser !== advertiser && manualResult.advertiser !== "미확인") { setError(`현재 광고주는 ${advertiser}인데 파일은 ${manualResult.advertiser}로 인식되었습니다.`); return; }
      publishDailyBundles([{ bundle: { ...manualResult, advertiser }, mailSubject: "직접 업로드", mailDate: new Date().toISOString() }]);
      setPublishedCount(1); setToast(`업데이트 완료 · ${advertiser} Daily Fact 1건이 대시보드에 반영되었습니다.`); return;
    }

    const targets = ready.map((item) => ({ bundle: item.bundle!, mailSubject: item.message.subject, mailDate: item.message.date }));
    if (targets.length) publishDailyBundles(targets);
    mailOnly.forEach((batch) => {
      const meta = mailMeta(batch.message, todayLabel, advertiser);
      if (meta.advertiser !== advertiser) return;
      publishMailOnlyInsight({ advertiser, reportDate: meta.reportDate, mailSubject: batch.message.subject, mailDate: batch.message.date, notes: meta.notes });
    });
    const total = targets.length + mailOnly.length;
    setPublishedCount(total);
    setToast(`업데이트 완료 · ${advertiser} Fact ${targets.length}개 / Insight ${batches.length}개를 반영했습니다.`);
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailConnected(false); setBatches([]); setPublishedCount(0);
  }

  const canPublish = mode === "manual" ? Boolean(manualResult?.placements.length) : ready.length + mailOnly.length > 0;

  return (
    <section className={styles.dailyIntake}>
      {toast && <div className={styles.successToast} role="status"><b>✓</b><div><strong>Dashboard 반영 완료</strong><span>{toast}</span></div><button onClick={() => setToast("")} aria-label="알림 닫기">×</button></div>}

      <div className={styles.dailyTabs}><button className={mode === "gmail" ? styles.dailyTabActive : ""} onClick={() => setMode("gmail")}>Gmail에서 가져오기</button><button className={mode === "manual" ? styles.dailyTabActive : ""} onClick={() => setMode("manual")}>직접 업로드</button></div>

      <div className={styles.dailyGrid}>
        <article className={styles.dailyCard}>
          <div className="eyebrow">DAILY SOURCE · {advertiser}</div><h2>{mode === "gmail" ? "오늘 Daily Report 일괄 수집" : "직접 업로드"}</h2>
          {mode === "gmail" ? <>
            <p>현재 선택 광고주의 Daily Report만 수집합니다. 다른 광고주 데이터는 이 배치에 섞이지 않습니다.</p>
            <div className={styles.gmailRule}><span>연결 상태</span><strong>{gmailChecked ? (gmailConnected ? "Gmail 연결됨" : "연결 필요") : "확인 중…"}</strong></div>
            <div className={styles.gmailRule}><span>검색 규칙</span><strong>{advertiser} + Daily Report + 오늘 수신</strong></div>
            {gmailConnected ? <div className={styles.gmailActionRow}><button className={styles.connectButton} onClick={loadTodayFromGmail} disabled={loading}>{loading ? "오늘 메일 분석 중…" : `${advertiser} 오늘 Daily 불러오기`}</button><button className={styles.disconnectButton} onClick={disconnectGmail}>연결 해제</button></div> : <a className={styles.connectButton} href="/api/gmail/connect">Google 계정으로 Gmail 연결</a>}
          </> : <>
            <p>Excel은 누적 Fact, 메일 본문은 해당 기준일의 전일 성과 Insight로 처리합니다.</p>
            <label className={styles.uploadLabel}><span>Daily Monitoring Excel</span><input type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><b>{file ? file.name : "Excel 파일 선택"}</b></label>
            <label className={styles.mailLabel}><span>메일 본문</span><textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="받은 Daily Report 메일 본문을 그대로 붙여넣으세요."/></label>
            <button className={styles.analyzeButton} onClick={analyzeManual} disabled={loading}>{loading ? "분석 중…" : "Daily Bundle 분석"}</button>
          </>}
          {error && <div className={styles.errorText}>{error}</div>}
        </article>

        <article className={styles.dailyCard}><div className="eyebrow">TENANT RULE</div><h2>광고주 분리 원칙</h2><div className={styles.ruleStack}><div><span>01</span><strong>자코모</strong><p>자코모 메일·Excel·Insight만 자코모 namespace에 저장합니다.</p></div><div><span>02</span><strong>교원웰스</strong><p>교원웰스는 별도 namespace로 저장해 자코모 데이터와 합산하지 않습니다.</p></div><div><span>03</span><strong>Client View</strong><p>현재는 AE 테스트용 분리이며 실제 외부 광고주 접근은 인증 + DB RLS 적용 후 공개합니다.</p></div><div><span>04</span><strong>Source only</strong><p>수치가 없는 항목은 추정하지 않고 데이터 없음으로 표시합니다.</p></div></div></article>
      </div>

      {mode === "gmail" && batches.length > 0 && <div className={styles.batchArea}>
        <div className={styles.bundleHead}><div><div className="eyebrow">TODAY BATCH</div><h2>{todayLabel} · {advertiser} 메일 {batches.length}건</h2><p>Fact 첨부 {factAttachmentCount}개 · 정상 Fact {ready.length}개 · 검토 {issueCount}건</p></div><div className={styles.bundleStatus}>{issueCount ? `REVIEW ${issueCount}` : "QA PASS"}</div></div>
        <div className={styles.batchList}>{batches.map((batch) => {
          const meta = mailMeta(batch.message, todayLabel, advertiser);
          const readyCount = batch.results.filter((r) => r.bundle?.placements.length && r.bundle.advertiser === advertiser).length;
          const errors = batch.results.filter((r) => r.error || (r.bundle && r.bundle.advertiser !== advertiser && r.bundle.advertiser !== "미확인")).length;
          return <article key={batch.message.id} className={styles.batchRow}>
            <div><strong>{batch.message.subject}</strong><div className={styles.fileChips}>{batch.results.length ? batch.results.map((result) => <span key={result.attachment.attachmentId}>{result.attachment.filename}{result.bundle ? ` · 지면 ${result.bundle.placements.length}` : ""}</span>) : <span>Excel 첨부 없음 · Insight만</span>}</div></div>
            <div className={styles.batchMetrics}><span>기준일 {meta.reportDate}</span><span>Fact {readyCount}개</span><span>QA {errors}</span></div>
            <b className={errors ? styles.batchWarn : readyCount || !batch.results.length ? styles.batchReady : styles.batchError}>{errors ? "확인 필요" : readyCount ? "준비" : "메일만"}</b>
          </article>;
        })}</div>
      </div>}

      {mode === "manual" && manualResult && <div className={styles.previewArea}><div className={styles.bundleHead}><div><div className="eyebrow">DAILY BUNDLE PREVIEW</div><h2>{manualResult.advertiser} · {manualResult.reportDate || "기준일 미확인"}</h2><p>{manualResult.sourceFile}</p></div><div className={styles.bundleStatus}>{manualResult.placements.length ? `FACT ${manualResult.placements.length}` : "구조 확인"}</div></div></div>}

      {(canPublish || publishedCount > 0) && <div className={styles.publishBar}><div><strong>검수 완료 · {advertiser}</strong><span>Fact와 Insight는 현재 선택된 광고주에만 반영됩니다.</span></div><button onClick={publishBatch} disabled={!canPublish}>{publishedCount ? `반영 완료 ${publishedCount}건` : "검수 완료 후 Dashboard 반영"}</button></div>}
    </section>
  );
}
