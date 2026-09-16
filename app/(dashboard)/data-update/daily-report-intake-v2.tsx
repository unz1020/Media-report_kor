"use client";

import { useEffect, useMemo, useState } from "react";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import { publishDailyBundles, publishMailOnlyInsight } from "@/lib/daily-report-store";
import styles from "./daily-report-intake-v2.module.css";

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

type MessageGroup = { message: GmailMessage; items: BatchItem[] };

const DAILY_QUERY = '자코모 {subject:"데일리 리포트" subject:"Daily Report"}';

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

export function DailyReportIntakeV2() {
  const [mode, setMode] = useState<"gmail" | "manual">("gmail");
  const [file, setFile] = useState<File | null>(null);
  const [mailBody, setMailBody] = useState("");
  const [manualResult, setManualResult] = useState<DailyBundlePreview | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailChecked, setGmailChecked] = useState(false);
  const [selectedMailDate, setSelectedMailDate] = useState(kstTodayString);
  const [batchDateLabel, setBatchDateLabel] = useState("");
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

  const groupedMessages = useMemo<MessageGroup[]>(() => {
    const groups = new Map<string, MessageGroup>();
    batchItems.forEach((item) => {
      const current = groups.get(item.message.id) ?? { message: item.message, items: [] };
      current.items.push(item);
      groups.set(item.message.id, current);
    });
    return Array.from(groups.values());
  }, [batchItems]);

  const issueCount = useMemo(() => readyBatch.reduce((sum, item) => {
    const qa = item.bundle!.qa;
    return sum + qa.mismatchedMailMetrics + qa.unmatchedMailMetrics;
  }, 0) + structureIssues.length + failedItems.length, [readyBatch, structureIssues, failedItems]);

  const factAttachmentCount = batchItems.filter((item) => item.attachment).length;
  const canPublish = mode === "manual"
    ? Boolean(manualResult?.placements.length)
    : readyBatch.length + mailOnlyItems.length > 0;

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

  function changeMailDate(value: string) {
    setSelectedMailDate(value);
    setBatchItems([]);
    setBatchDateLabel("");
    setPublishedCount(0);
    setMessageCount(0);
    setError("");
  }

  async function loadSelectedDateFromGmail() {
    if (!selectedMailDate) {
      setError("가져올 메일 수신일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setPublishedCount(0);
    setBatchItems([]);
    setMessageCount(0);
    try {
      const params = new URLSearchParams({ q: DAILY_QUERY, date: selectedMailDate });
      const response = await fetch(`/api/gmail/today?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail 조회에 실패했습니다.");
      const messages = (payload.messages || []) as GmailMessage[];
      setBatchDateLabel(payload.date || selectedMailDate);
      setMessageCount(messages.length);
      if (!messages.length) throw new Error(`${selectedMailDate}에 수신된 자코모 Daily Report 메일이 없습니다.`);

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
      setManualResult(await parseDailyWorkbook(file, mailBody));
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
      const meta = mailMeta(item.message, batchDateLabel || selectedMailDate);
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

  return (
    <section className={styles.dailyIntake}>
      <div className={styles.dailyTabs}>
        <button className={mode === "gmail" ? styles.dailyTabActive : ""} onClick={() => setMode("gmail")}>Gmail에서 가져오기</button>
        <button className={mode === "manual" ? styles.dailyTabActive : ""} onClick={() => setMode("manual")}>직접 업로드</button>
      </div>

      <div className={styles.dailyGrid}>
        <article className={styles.dailyCard}>
          <div className="eyebrow">DAILY SOURCE</div>
          <h2>{mode === "gmail" ? "날짜별 Daily Report 수집" : "직접 업로드"}</h2>
          {mode === "gmail" ? (
            <>
              <p>메일 수신일을 선택해 해당 날짜의 자코모 Daily Report를 가져옵니다. 성과 기준일은 Excel과 메일 본문에서 별도로 판별합니다.</p>
              <div className={styles.gmailRule}><span>연결 상태</span><strong>{gmailChecked ? (gmailConnected ? "Gmail 연결됨" : "연결 필요") : "확인 중…"}</strong></div>
              <div className={styles.filterRule}>
                <span>메일 수신일</span>
                <input
                  type="date"
                  value={selectedMailDate}
                  max={kstTodayString()}
                  onChange={(event) => changeMailDate(event.target.value)}
                  aria-label="Daily Report 메일 수신일"
                  style={{ height: 36, border: "1px solid #d8deea", borderRadius: 8, padding: "0 10px", color: "#344054", background: "#fff", fontWeight: 700 }}
                />
              </div>
              <div className={styles.filterRule}><span>수집 기준</span><strong>선택일 + 자코모 + 제목에 데일리 리포트 / Daily Report</strong></div>
              {gmailConnected ? (
                <div className={styles.gmailActionRow}>
                  <button className={styles.connectButton} onClick={loadSelectedDateFromGmail} disabled={loading || !selectedMailDate}>{loading ? `${selectedMailDate} 메일 분석 중…` : `${selectedMailDate} Daily 불러오기`}</button>
                  <button className={styles.disconnectButton} onClick={disconnectGmail}>연결 해제</button>
                </div>
              ) : (
                <a className={styles.connectButton} href="/api/gmail/connect">Google 계정으로 Gmail 연결</a>
              )}
            </>
          ) : (
            <>
              <p>Excel/XLSB는 월간 누적 Fact, 메일 본문은 해당 기준일의 전일 성과 Insight로 처리합니다.</p>
              <label className={styles.uploadLabel}><span>Daily Monitoring 파일</span><input type="file" accept=".xlsx,.xls,.xlsb" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><b>{file ? file.name : "Excel 파일 선택"}</b></label>
              <label className={styles.mailLabel}><span>메일 본문</span><textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="받은 Daily Report 메일 본문을 그대로 붙여넣으세요." /></label>
              <button className={styles.analyzeButton} onClick={analyzeManual} disabled={loading}>{loading ? "분석 중…" : "Daily Bundle 분석"}</button>
            </>
          )}
          {error && <div className={styles.errorText}>{error}</div>}
        </article>

        <article className={styles.dailyCard}>
          <div className="eyebrow">UPDATE RULE</div>
          <h2>Daily 업데이트 기준</h2>
          <div className={styles.ruleStack}>
            <div><span>01</span><strong>메일 수신일</strong><p>오늘뿐 아니라 원하는 날짜를 선택해 그날 수신한 리포트를 다시 불러올 수 있습니다.</p></div>
            <div><span>02</span><strong>Fact 파일</strong><p>한 메일의 XLSX/XLSB 여러 개는 내부 Fact 파일로 각각 파싱합니다.</p></div>
            <div><span>03</span><strong>성과 기준일</strong><p>메일을 받은 날짜와 성과 기준일은 분리하고, Excel·메일 본문 기준일을 우선합니다.</p></div>
            <div><span>04</span><strong>메일 본문</strong><p>메일 본문은 해당 기준일의 운영 Insight로 한 번만 저장합니다.</p></div>
          </div>
        </article>
      </div>

      {mode === "gmail" && groupedMessages.length > 0 && (
        <div className={styles.batchArea}>
          <div className={styles.bundleHead}>
            <div>
              <div className="eyebrow">SELECTED BATCH</div>
              <h2>{batchDateLabel || selectedMailDate} · Daily 메일 {messageCount}건</h2>
              <p>Fact 파일 {factAttachmentCount}개 · Fact 준비 {readyBatch.length}개 · 메일만 {mailOnlyItems.length}건</p>
            </div>
            <div className={issueCount ? styles.bundleReview : styles.bundleStatus}>{issueCount ? `REVIEW ${issueCount}` : "QA PASS"}</div>
          </div>

          <div className={styles.batchList}>
            {groupedMessages.map((group) => {
              const attachmentItems = group.items.filter((item) => item.attachment);
              const validItems = attachmentItems.filter((item) => item.bundle && item.bundle.placements.length > 0);
              const failed = attachmentItems.some((item) => item.error);
              const structureIssue = attachmentItems.some((item) => item.bundle && item.bundle.placements.length === 0);
              const mailOnly = attachmentItems.length === 0;
              const totalPlacements = validItems.reduce((sum, item) => sum + (item.bundle?.placements.length ?? 0), 0);
              const totalQa = validItems.reduce((sum, item) => sum + (item.bundle ? item.bundle.qa.mismatchedMailMetrics + item.bundle.qa.unmatchedMailMetrics : 0), 0);
              const reportDate = validItems[0]?.bundle?.reportDate || mailMeta(group.message, batchDateLabel || selectedMailDate).reportDate;
              return (
                <article key={group.message.id} className={styles.mailRow}>
                  <div className={styles.mailMain}>
                    <strong>{group.message.subject}</strong>
                    <div className={styles.fileChips}>
                      {attachmentItems.length ? attachmentItems.map((item) => (
                        <span key={item.id} className={item.error || (item.bundle && !item.bundle.placements.length) ? styles.fileChipIssue : styles.fileChip}>
                          {item.attachment?.filename}
                        </span>
                      )) : <span className={styles.fileChipMuted}>Excel 첨부 없음</span>}
                    </div>
                  </div>
                  <div className={styles.mailMetrics}>
                    <span>기준일 <b>{reportDate}</b></span>
                    <span>Fact <b>{attachmentItems.length}</b></span>
                    <span>지면 <b>{totalPlacements}</b></span>
                    <span>QA <b>{totalQa}</b></span>
                  </div>
                  {mailOnly ? <b className={styles.batchMailOnly}>메일만</b>
                    : failed ? <b className={styles.batchError}>실패</b>
                    : structureIssue ? <b className={styles.batchWarn}>구조 확인</b>
                    : <b className={styles.batchReady}>준비 {validItems.length}/{attachmentItems.length}</b>}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {singleResult && (
        <div className={styles.previewArea}>
          <div className={styles.bundleHead}><div><div className="eyebrow">DAILY BUNDLE PREVIEW</div><h2>{singleResult.advertiser} · {singleResult.reportDate}</h2><p>{singleResult.sourceFile}</p></div><div className={styles.bundleStatus}>QA PREVIEW</div></div>
          <div className={styles.previewGrid}>
            <article className={styles.previewCard}>
              <div className={styles.previewCardHead}><strong>Excel Fact</strong><span>{singleResult.placements.length}개 지면</span></div>
              <div className={styles.factTableWrap}><table className={styles.factTable}><thead><tr><th>매체</th><th>지면</th><th>IMP</th><th>Click</th><th>CTR</th></tr></thead><tbody>{singleResult.placements.slice(0, 12).map((item) => <tr key={`${item.sourceSheet}-${item.placement}`}><td>{item.platform}</td><td>{item.placement}</td><td>{item.impressions.toLocaleString()}</td><td>{item.clicks.toLocaleString()}</td><td>{item.ctr === null ? "-" : `${item.ctr.toFixed(2)}%`}</td></tr>)}</tbody></table></div>
            </article>
            <article className={styles.previewCard}>
              <div className={styles.previewCardHead}><strong>Mail Insight</strong><span>{singleResult.operationNotes.length}개 메모</span></div>
              <div className={styles.noteList}>{singleResult.operationNotes.length ? singleResult.operationNotes.map((note) => <div key={note}>{note}</div>) : <p>추출된 운영메모가 없습니다.</p>}</div>
            </article>
          </div>
        </div>
      )}

      {((mode === "gmail" && groupedMessages.length > 0) || (mode === "manual" && manualResult)) && (
        <div className={styles.publishBar}>
          <div><strong>{publishedCount ? `대시보드 반영 완료 · ${publishedCount}개 데이터` : `검수 완료 · Fact ${mode === "gmail" ? readyBatch.length : 1}개 + Insight ${mode === "gmail" ? messageCount : 1}건`}</strong><span>정상 Fact만 반영하고, Daily 메일 본문은 기준일별 Insight로 저장합니다.</span></div>
          <button disabled={!canPublish} onClick={publishBatch}>{publishedCount ? "다시 반영" : "검수 완료 후 Dashboard 반영"}</button>
        </div>
      )}
    </section>
  );
}
