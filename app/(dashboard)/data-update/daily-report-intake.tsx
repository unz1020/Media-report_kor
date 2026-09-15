"use client";

import { useEffect, useMemo, useState } from "react";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import { publishDailyBundles, publishMailOnlyInsight } from "@/lib/daily-report-store";
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
  attachment?: GmailAttachment;
  bundle?: DailyBundlePreview;
  error?: string;
};

function mailMeta(message: GmailMessage, fallbackDate: string) {
  const year = Number(fallbackDate.slice(0, 4)) || new Date().getFullYear();
  const dateMatch = message.body.match(/(?:\*\s*)?(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?자/) ||
    message.body.match(/(?:기준|업데이트)[^\n]{0,24}?(\d{1,2})\/(\d{1,2})/);
  const reportDate = dateMatch
    ? `${year}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
    : fallbackDate;
  const advertiser = /자코모/i.test(`${message.subject}\n${message.body}`) ? "자코모" : "미확인";
  const notes = Array.from(new Set(
    message.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => /전일|성과|효율|상승|하락|예산|노출|클릭|CTR|전환|라이브|집행|매체/i.test(line)),
  )).slice(0, 20);
  return { advertiser, reportDate, notes };
}

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
  const [gmailQuery, setGmailQuery] = useState("자코모");
  const [todayLabel, setTodayLabel] = useState("");
  const [publishedCount, setPublishedCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    fetch("/api/gmail/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGmailConnected(Boolean(data.connected)))
      .catch(() => setGmailConnected(false))
      .finally(() => setGmailChecked(true));
  }, []);

  const readyBatch = useMemo(
    () => batchItems.filter((item) => item.bundle && item.bundle.placements.length > 0),
    [batchItems],
  );
  const mailOnlyItems = useMemo(() => batchItems.filter((item) => !item.attachment), [batchItems]);
  const structureIssues = useMemo(
    () => batchItems.filter((item) => item.attachment && item.bundle && item.bundle.placements.length === 0),
    [batchItems],
  );
  const failedItems = useMemo(() => batchItems.filter((item) => item.error), [batchItems]);
  const issueCount = useMemo(() => readyBatch.reduce((sum, item) => {
    const qa = item.bundle!.qa;
    return sum + qa.mismatchedMailMetrics + qa.unmatchedMailMetrics;
  }, 0) + structureIssues.length + failedItems.length, [readyBatch, structureIssues, failedItems]);

  async function parseFile(selectedFile: File, selectedMailBody: string) {
    return parseDailyWorkbook(selectedFile, selectedMailBody);
  }

  async function parseGmailAttachment(message: GmailMessage, attachment: GmailAttachment) {
    const response = await fetch("/api/gmail/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mailBody: message.body,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "첨부파일 분석에 실패했습니다.");
    return payload.bundle as DailyBundlePreview;
  }

  async function loadTodayFromGmail() {
    setLoading(true);
    setError("");
    setPublishedCount(0);
    setBatchItems([]);
    setMessageCount(0);
    try {
      const response = await fetch(`/api/gmail/today?q=${encodeURIComponent(gmailQuery)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail 조회에 실패했습니다.");
      const messages = (payload.messages || []) as GmailMessage[];
      setTodayLabel(payload.date || "오늘");
      setMessageCount(messages.length);
      if (!messages.length) throw new Error("오늘 수신된 조건 일치 Daily 메일이 없습니다.");

      const next: BatchItem[] = [];
      for (const message of messages) {
        if (!message.attachments.length) {
          next.push({ id: `${message.id}:mail-only`, message });
          setBatchItems([...next]);
          continue;
        }
        for (const attachment of message.attachments) {
          const item: BatchItem = { id: `${message.id}:${attachment.attachmentId}`, message, attachment };
          try {
            item.bundle = await parseGmailAttachment(message, attachment);
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
    if (mode === "manual") {
      if (!manualResult || !manualResult.placements.length) return;
      publishDailyBundles([{ bundle: manualResult, mailSubject: "직접 업로드", mailDate: new Date().toISOString() }]);
      setPublishedCount(1);
      return;
    }

    const targets = readyBatch.map((item) => ({
      bundle: item.bundle!,
      mailSubject: item.message.subject,
      mailDate: item.message.date,
    }));
    if (targets.length) publishDailyBundles(targets);
    mailOnlyItems.forEach((item) => {
      const meta = mailMeta(item.message, todayLabel);
      publishMailOnlyInsight({
        advertiser: meta.advertiser,
        reportDate: meta.reportDate,
        mailSubject: item.message.subject,
        mailDate: item.message.date,
        notes: meta.notes,
      });
    });
    setPublishedCount(targets.length + mailOnlyItems.length);
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailConnected(false);
    setBatchItems([]);
    setPublishedCount(0);
    setMessageCount(0);
  }

  const singleResult = mode === "manual" ? manualResult : readyBatch.length === 1 ? readyBatch[0].bundle ?? null : null;
  const factAttachmentCount = batchItems.filter((item) => item.attachment).length;
  const canPublish = mode === "manual"
    ? Boolean(manualResult?.placements.length)
    : readyBatch.length + mailOnlyItems.length > 0;

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
              <p>오늘 수신된 조건 일치 메일을 전부 가져옵니다. Excel/XLSB는 월간 누적 Fact, 메일 본문은 해당 기준일 Insight로 처리합니다.</p>
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
            <div><span>01</span><strong>메일 전체</strong><p>첨부 유무와 관계없이 오늘의 Daily 메일 전체를 먼저 잡습니다.</p></div>
            <div><span>02</span><strong>대용량 처리</strong><p>Excel/XLSB는 서버에서 파싱해 10MB 이상 파일도 브라우저 다운로드 없이 처리합니다.</p></div>
            <div><span>03</span><strong>정상 Fact만</strong><p>지면이 0건이면 준비가 아니라 구조 확인 필요로 표시하고 Fact 반영에서 제외합니다.</p></div>
            <div><span>04</span><strong>메일만 있어도</strong><p>첨부가 없는 Daily는 숨기지 않고 Insight만 저장하며 Fact 없음 상태를 표시합니다.</p></div>
          </div>
        </article>
      </div>

      {mode === "gmail" && batchItems.length > 0 && (
        <div className={styles.batchArea}>
          <div className={styles.bundleHead}>
            <div><div className="eyebrow">TODAY BATCH</div><h2>{todayLabel} · 메일 {messageCount}건</h2><p>Fact 첨부 {factAttachmentCount}개 · 메일만 {mailOnlyItems.length}건 · 준비 {readyBatch.length}개</p></div>
            <div className={styles.bundleStatus}>{issueCount ? `REVIEW ${issueCount}` : "QA PASS"}</div>
          </div>
          <div className={styles.batchList}>
            {batchItems.map((item) => {
              const isStructureIssue = Boolean(item.bundle && item.bundle.placements.length === 0);
              return (
                <article key={item.id} className={styles.batchRow}>
                  <div><strong>{item.message.subject}</strong><span>{item.attachment?.filename || "Excel 첨부 없음 · 메일 Insight만 수집"}</span>{item.error && <small className={styles.errorDetail}>{item.error}</small>}</div>
                  {!item.attachment ? (
                    <><div className={styles.batchMetrics}><span>메일 {mailMeta(item.message, todayLabel).reportDate}</span><span>Fact 미반영</span></div><b className={styles.batchMailOnly}>메일만</b></>
                  ) : item.error ? (
                    <b className={styles.batchError}>실패</b>
                  ) : isStructureIssue ? (
                    <><div className={styles.batchMetrics}><span>{item.bundle?.advertiser || "미확인"}</span><span>지면 0</span></div><b className={styles.batchWarn}>구조 확인</b></>
                  ) : item.bundle ? (
                    <><div className={styles.batchMetrics}><span>{item.bundle.advertiser}</span><span>기준일 {item.bundle.reportDate}</span><span>지면 {item.bundle.placements.length}</span><span>QA {item.bundle.qa.mismatchedMailMetrics + item.bundle.qa.unmatchedMailMetrics}</span></div><b className={styles.batchReady}>준비</b></>
                  ) : <b>분석 중</b>}
                </article>
              );
            })}
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

      {canPublish && (
        <div className={styles.publishBar}>
          <div><strong>{publishedCount ? `대시보드 반영 완료 · ${publishedCount}건` : `검수 완료 · Fact ${readyBatch.length || (manualResult?.placements.length ? 1 : 0)}건 + Insight ${mode === "gmail" ? mailOnlyItems.length : 0}건`}</strong><span>{structureIssues.length + failedItems.length ? `구조/실패 ${structureIssues.length + failedItems.length}건은 Fact 반영에서 제외됩니다.` : "정상 Fact와 Daily Insight를 반영합니다."}</span></div>
          <button onClick={publishBatch}>{publishedCount ? "다시 반영" : "검수 완료 후 Dashboard 반영"}</button>
        </div>
      )}
    </section>
  );
}
