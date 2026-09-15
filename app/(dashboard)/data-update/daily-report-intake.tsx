"use client";

import { useEffect, useMemo, useState } from "react";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import { publishDailyBundles } from "@/lib/daily-report-store";
import styles from "./daily-report-intake.module.css";

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

type BatchItem = {
  id: string;
  message: GmailMessage;
  attachment: GmailAttachment;
  bundle?: DailyBundlePreview;
  error?: string;
};

export function DailyReportIntake() {
  const [mode, setMode] = useState<"gmail" | "manual">("gmail");
  const [file, setFile] = useState<File | null>(null);
  const [mailBody, setMailBody] = useState("");
  const [manualResult, setManualResult] = useState<DailyBundlePreview | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailChecked, setGmailChecked] = useState(false);
  const [gmailQuery, setGmailQuery] = useState("자코모 has:attachment filename:xlsx");
  const [todayLabel, setTodayLabel] = useState("");
  const [publishedCount, setPublishedCount] = useState(0);

  useEffect(() => {
    fetch("/api/gmail/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGmailConnected(Boolean(data.connected)))
      .catch(() => setGmailConnected(false))
      .finally(() => setGmailChecked(true));
  }, []);

  const readyBatch = useMemo(() => batchItems.filter((item) => item.bundle), [batchItems]);
  const issueCount = useMemo(() => readyBatch.reduce((sum, item) => {
    const qa = item.bundle!.qa;
    return sum + qa.mismatchedMailMetrics + qa.unmatchedMailMetrics;
  }, 0), [readyBatch]);

  async function parseFile(selectedFile: File, selectedMailBody: string) {
    return parseDailyWorkbook(selectedFile, selectedMailBody);
  }

  async function downloadAttachment(message: GmailMessage, attachment: GmailAttachment) {
    const attachmentUrl = new URL("/api/gmail/attachment", window.location.origin);
    attachmentUrl.searchParams.set("messageId", message.id);
    attachmentUrl.searchParams.set("attachmentId", attachment.attachmentId);
    attachmentUrl.searchParams.set("filename", attachment.filename);
    const response = await fetch(attachmentUrl.toString(), { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "첨부파일 다운로드에 실패했습니다.");
    }
    const blob = await response.blob();
    return new File([blob], attachment.filename, {
      type: attachment.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function loadTodayFromGmail() {
    setLoading(true);
    setError("");
    setPublishedCount(0);
    setBatchItems([]);
    try {
      const response = await fetch(`/api/gmail/today?q=${encodeURIComponent(gmailQuery)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail 조회에 실패했습니다.");
      const messages = (payload.messages || []) as GmailMessage[];
      setTodayLabel(payload.date || "오늘");
      if (!messages.length) throw new Error("오늘 수신된 조건 일치 Daily Excel 메일이 없습니다.");

      const next: BatchItem[] = [];
      for (const message of messages) {
        for (const attachment of message.attachments) {
          const item: BatchItem = { id: `${message.id}:${attachment.attachmentId}`, message, attachment };
          try {
            const downloaded = await downloadAttachment(message, attachment);
            item.bundle = await parseFile(downloaded, message.body);
          } catch (itemError) {
            item.error = itemError instanceof Error ? itemError.message : "파싱 실패";
          }
          next.push(item);
          setBatchItems([...next]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gmail Daily Report 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function analyzeManual() {
    if (!file) {
      setError("Daily Monitoring Excel 파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setPublishedCount(0);
    try {
      setManualResult(await parseFile(file, mailBody));
    } catch {
      setError("Excel 분석 중 오류가 발생했습니다. 파일 구조를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  function publishBatch() {
    const targets = mode === "gmail"
      ? readyBatch.map((item) => ({
          bundle: item.bundle!,
          mailSubject: item.message.subject,
          mailDate: item.message.date,
        }))
      : manualResult
        ? [{ bundle: manualResult, mailSubject: "직접 업로드", mailDate: new Date().toISOString() }]
        : [];
    if (!targets.length) return;
    publishDailyBundles(targets);
    setPublishedCount(targets.length);
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailConnected(false);
    setBatchItems([]);
    setPublishedCount(0);
  }

  const singleResult = mode === "manual" ? manualResult : readyBatch.length === 1 ? readyBatch[0].bundle ?? null : null;

  return (
    <section className={styles.dailyIntake}>
      <div className={styles.dailyTabs}>
        <button className={mode === "gmail" ? styles.dailyTabActive : ""} onClick={() => setMode("gmail")}>Gmail에서 가져오기</button>
        <button className={mode === "manual" ? styles.dailyTabActive : ""} onClick={() => setMode("manual")}>직접 업로드</button>
      </div>

      <div className={styles.dailyGrid}>
        <article className={styles.dailyCard}>
          <div className="eyebrow">DAILY SOURCE</div>
          <h2>{mode === "gmail" ? "오늘 Daily Report 일괄 수집" : "직접 업로드"}</h2>

          {mode === "gmail" ? (
            <>
              <p>오늘 수신된 조건 일치 메일을 전부 가져옵니다. 각 Excel은 월간 누적 Fact, 각 메일 본문은 해당 기준일 Insight로 처리합니다.</p>
              <div className={styles.gmailRule}><span>연결 상태</span><strong>{gmailChecked ? (gmailConnected ? "Gmail 연결됨" : "연결 필요") : "확인 중…"}</strong></div>
              {gmailConnected ? (
                <>
                  <label className={styles.mailLabel}><span>기본 검색 규칙 · 오늘 날짜는 자동 추가</span><input className={styles.queryInput} value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} /></label>
                  <div className={styles.gmailActionRow}>
                    <button className={styles.connectButton} onClick={loadTodayFromGmail} disabled={loading}>{loading ? "오늘 메일 분석 중…" : "오늘 Daily 전체 불러오기"}</button>
                    <button className={styles.disconnectButton} onClick={disconnectGmail}>연결 해제</button>
                  </div>
                </>
              ) : (
                <a className={styles.connectButton} href="/api/gmail/connect">Google 계정으로 Gmail 연결</a>
              )}
            </>
          ) : (
            <>
              <p>Excel은 월간 누적 Fact, 메일 본문은 해당 기준일의 전일 성과 Insight로 처리합니다.</p>
              <label className={styles.uploadLabel}><span>Daily Monitoring Excel</span><input type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><b>{file ? file.name : "Excel 파일 선택"}</b></label>
              <label className={styles.mailLabel}><span>메일 본문</span><textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="받은 Daily Report 메일 본문을 그대로 붙여넣으세요." /></label>
              <button className={styles.analyzeButton} onClick={analyzeManual} disabled={loading}>{loading ? "분석 중…" : "Daily Bundle 분석"}</button>
            </>
          )}
          {error && <div className={styles.errorText}>{error}</div>}
        </article>

        <article className={styles.dailyCard}>
          <div className="eyebrow">UPDATE RULE</div>
          <h2>월간 누적 업데이트 규칙</h2>
          <div className={styles.ruleStack}>
            <div><span>01</span><strong>오늘 전체</strong><p>가장 최근 1건이 아니라 오늘 수신된 Daily Excel 메일 전체를 가져옵니다.</p></div>
            <div><span>02</span><strong>수정본 교체</strong><p>같은 월·같은 리포트 파일 계열은 최신 누적본으로 교체해 중복 합산하지 않습니다.</p></div>
            <div><span>03</span><strong>매체별 합산</strong><p>서로 다른 매체/리포트 파일은 모두 보존해 Performance의 월간 Fact에 합칩니다.</p></div>
            <div><span>04</span><strong>Daily Insight</strong><p>메일 본문은 실제 성과 기준일별 Insight 기록으로 계속 쌓습니다.</p></div>
          </div>
        </article>
      </div>

      {mode === "gmail" && batchItems.length > 0 && (
        <div className={styles.batchArea}>
          <div className={styles.bundleHead}>
            <div><div className="eyebrow">TODAY BATCH</div><h2>{todayLabel} · {batchItems.length}개 Excel</h2><p>메일 {new Set(batchItems.map((item) => item.message.id)).size}건에서 수집</p></div>
            <div className={styles.bundleStatus}>{issueCount ? `REVIEW ${issueCount}` : "QA PASS"}</div>
          </div>
          <div className={styles.batchList}>
            {batchItems.map((item) => (
              <article key={item.id} className={styles.batchRow}>
                <div><strong>{item.message.subject}</strong><span>{item.attachment.filename}</span></div>
                {item.error ? <b className={styles.batchError}>실패</b> : item.bundle ? <><div className={styles.batchMetrics}><span>{item.bundle.advertiser}</span><span>기준일 {item.bundle.reportDate}</span><span>지면 {item.bundle.placements.length}</span><span>QA {item.bundle.qa.mismatchedMailMetrics + item.bundle.qa.unmatchedMailMetrics}</span></div><b className={styles.batchReady}>준비</b></> : <b>분석 중</b>}
              </article>
            ))}
          </div>
        </div>
      )}

      {singleResult && (
        <div className={styles.previewArea}>
          <div className={styles.bundleHead}><div><div className="eyebrow">DAILY BUNDLE PREVIEW</div><h2>{singleResult.advertiser} · {singleResult.reportDate}</h2><p>{singleResult.sourceFile}</p></div><div className={styles.bundleStatus}>{singleResult.qa.mismatchedMailMetrics === 0 && singleResult.qa.unmatchedMailMetrics === 0 ? "QA PASS" : "REVIEW"}</div></div>
          <div className={styles.bundleStats}><div><span>Fact 지면</span><strong>{singleResult.placements.length}</strong></div><div><span>메일 수치 일치</span><strong>{singleResult.qa.matchedMailMetrics}</strong></div><div><span>수치 불일치</span><strong>{singleResult.qa.mismatchedMailMetrics}</strong></div><div><span>제외 시트</span><strong>{singleResult.qa.ignoredSheetCount}</strong></div></div>
          <div className={styles.previewGrid}>
            <article className={styles.previewCard}><div className={styles.previewCardHead}><div><strong>Excel Fact</strong><span>{singleResult.campaignStart} – {singleResult.campaignEnd}</span></div><b>{singleResult.parsedSheets.length} sheets</b></div><div className={styles.factTableWrap}><table className={styles.factTable}><thead><tr><th>매체</th><th>지면</th><th>IMP</th><th>Click</th><th>CTR</th></tr></thead><tbody>{singleResult.placements.slice(0, 12).map((item) => <tr key={`${item.sourceSheet}-${item.placement}`}><td>{item.platform}</td><td>{item.placement}</td><td>{item.impressions.toLocaleString()}</td><td>{item.clicks.toLocaleString()}</td><td>{item.ctr === null ? "-" : `${item.ctr.toFixed(2)}%`}</td></tr>)}</tbody></table></div></article>
            <article className={styles.previewCard}><div className={styles.previewCardHead}><div><strong>Mail Insight / 운영메모</strong><span>전일 성과 기준</span></div><b>{singleResult.operationNotes.length} notes</b></div><div className={styles.noteList}>{singleResult.operationNotes.length ? singleResult.operationNotes.map((note) => <div key={note}>{note}</div>) : <p>추출된 운영메모가 없습니다.</p>}</div></article>
          </div>
        </div>
      )}

      {((mode === "gmail" && readyBatch.length > 0) || (mode === "manual" && manualResult)) && (
        <div className={styles.publishBar}>
          <div><strong>{publishedCount ? `대시보드 반영 완료 · ${publishedCount}건` : `검수 완료 · ${mode === "gmail" ? readyBatch.length : 1}건 반영 준비`}</strong><span>같은 누적 리포트는 교체하고, 다른 리포트는 월간 성과에 함께 반영합니다.</span></div>
          <button onClick={publishBatch}>{publishedCount ? "다시 반영" : "검수 완료 후 Dashboard 반영"}</button>
        </div>
      )}
    </section>
  );
}
