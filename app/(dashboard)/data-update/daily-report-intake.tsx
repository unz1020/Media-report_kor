"use client";

import { useEffect, useState } from "react";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import styles from "./daily-report-intake.module.css";

type GmailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  attachment: { filename: string; attachmentId: string; mimeType?: string } | null;
};

export function DailyReportIntake() {
  const [mode, setMode] = useState<"gmail" | "manual">("gmail");
  const [file, setFile] = useState<File | null>(null);
  const [mailBody, setMailBody] = useState("");
  const [result, setResult] = useState<DailyBundlePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailChecked, setGmailChecked] = useState(false);
  const [gmailQuery, setGmailQuery] = useState("자코모 has:attachment filename:xlsx newer_than:30d");
  const [gmailMessage, setGmailMessage] = useState<GmailMessage | null>(null);

  useEffect(() => {
    fetch("/api/gmail/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGmailConnected(Boolean(data.connected)))
      .catch(() => setGmailConnected(false))
      .finally(() => setGmailChecked(true));
  }, []);

  async function analyze(selectedFile = file, selectedMailBody = mailBody) {
    if (!selectedFile) {
      setError("Daily Monitoring Excel 파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const preview = await parseDailyWorkbook(selectedFile, selectedMailBody);
      setResult(preview);
    } catch (e) {
      console.error(e);
      setError("Excel 분석 중 오류가 발생했습니다. 파일 구조를 확인해주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLatestFromGmail() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const latestResponse = await fetch(`/api/gmail/latest?q=${encodeURIComponent(gmailQuery)}`, { cache: "no-store" });
      const latest = await latestResponse.json();
      if (!latestResponse.ok) throw new Error(latest.error || "Gmail 조회에 실패했습니다.");
      if (!latest.message) throw new Error("검색 조건에 맞는 Excel 첨부 Daily 메일을 찾지 못했습니다.");
      const message = latest.message as GmailMessage;
      if (!message.attachment?.attachmentId) throw new Error("Daily Excel 첨부파일을 찾지 못했습니다.");

      const attachmentUrl = new URL("/api/gmail/attachment", window.location.origin);
      attachmentUrl.searchParams.set("messageId", message.id);
      attachmentUrl.searchParams.set("attachmentId", message.attachment.attachmentId);
      attachmentUrl.searchParams.set("filename", message.attachment.filename);
      const attachmentResponse = await fetch(attachmentUrl.toString(), { cache: "no-store" });
      if (!attachmentResponse.ok) {
        const attachmentError = await attachmentResponse.json().catch(() => ({}));
        throw new Error(attachmentError.error || "첨부파일 다운로드에 실패했습니다.");
      }
      const blob = await attachmentResponse.blob();
      const downloadedFile = new File([blob], message.attachment.filename, {
        type: message.attachment.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      setGmailMessage(message);
      setFile(downloadedFile);
      setMailBody(message.body);
      await analyze(downloadedFile, message.body);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Gmail Daily Report 처리 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  async function disconnectGmail() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setGmailConnected(false);
    setGmailMessage(null);
    setResult(null);
  }

  return (
    <section className={styles.dailyIntake}>
      <div className={styles.dailyTabs}>
        <button className={mode === "gmail" ? styles.dailyTabActive : ""} onClick={() => setMode("gmail")}>Gmail에서 가져오기</button>
        <button className={mode === "manual" ? styles.dailyTabActive : ""} onClick={() => setMode("manual")}>직접 업로드</button>
      </div>

      <div className={styles.dailyGrid}>
        <article className={styles.dailyCard}>
          <div className="eyebrow">DAILY SOURCE</div>
          <h2>{mode === "gmail" ? "Gmail Daily Report" : "직접 업로드"}</h2>

          {mode === "gmail" ? (
            <>
              <p>메일 본문은 전일 성과 Insight, Excel 첨부는 월간 누적 Fact로 가져와 하나의 Daily Bundle로 검수합니다.</p>
              <div className={styles.gmailRule}><span>연결 상태</span><strong>{gmailChecked ? (gmailConnected ? "Gmail 연결됨" : "연결 필요") : "확인 중…"}</strong></div>
              {gmailConnected ? (
                <>
                  <label className={styles.mailLabel}><span>Gmail 검색 규칙</span><input className={styles.queryInput} value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} /></label>
                  <div className={styles.gmailActionRow}>
                    <button className={styles.connectButton} onClick={loadLatestFromGmail} disabled={loading}>{loading ? "불러오는 중…" : "최신 리포트 불러오기"}</button>
                    <button className={styles.disconnectButton} onClick={disconnectGmail}>연결 해제</button>
                  </div>
                  {gmailMessage && <div className={styles.gmailMessage}><span>가져온 메일</span><strong>{gmailMessage.subject}</strong><small>{gmailMessage.attachment?.filename}</small></div>}
                </>
              ) : (
                <a className={styles.connectButton} href="/api/gmail/connect">Google 계정으로 Gmail 연결</a>
              )}
            </>
          ) : (
            <>
              <p>Excel은 월간 누적 Fact, 메일 본문은 해당 기준일의 전일 성과 Insight로 처리합니다. 파일명 규칙은 강제하지 않습니다.</p>
              <label className={styles.uploadLabel}>
                <span>Daily Monitoring Excel</span>
                <input type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                <b>{file ? file.name : "Excel 파일 선택"}</b>
              </label>
              <label className={styles.mailLabel}>
                <span>메일 본문</span>
                <textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="받은 Daily Report 메일 본문을 그대로 붙여넣으세요. 인사말/서명/전달문이 있어도 됩니다." />
              </label>
              <button className={styles.analyzeButton} onClick={() => analyze()} disabled={loading}>{loading ? "분석 중…" : "Daily Bundle 분석"}</button>
            </>
          )}
          {error && <div className={styles.errorText}>{error}</div>}
        </article>

        <article className={styles.dailyCard}>
          <div className="eyebrow">NORMALIZATION RULE</div>
          <h2>자동 처리 원칙</h2>
          <div className={styles.ruleStack}>
            <div><span>01</span><strong>월간 Fact 누적</strong><p>매일 새 Excel을 더하는 게 아니라 최신 누적본을 읽어 기존 월간 데이터를 갱신합니다.</p></div>
            <div><span>02</span><strong>전일 Insight</strong><p>메일 본문은 “9/14자”처럼 실제 성과 기준일에 귀속해 해당 날짜 브리핑으로 저장합니다.</p></div>
            <div><span>03</span><strong>Fact Sheet</strong><p>현재월 Total/소재별 성과 시트만 읽고 Raw·보조·과거 템플릿 시트는 제외합니다.</p></div>
            <div><span>04</span><strong>Mail QA</strong><p>메일에 적힌 Impression / Click / CTR을 Excel 값과 자동 대조하고 불일치는 승인 전에 막습니다.</p></div>
          </div>
        </article>
      </div>

      {result && (
        <div className={styles.previewArea}>
          <div className={styles.bundleHead}>
            <div><div className="eyebrow">DAILY BUNDLE PREVIEW</div><h2>{result.advertiser} · {result.reportDate}</h2><p>{result.sourceFile}</p></div>
            <div className={styles.bundleStatus}>{result.qa.mismatchedMailMetrics === 0 && result.qa.unmatchedMailMetrics === 0 ? "QA PASS" : "REVIEW"}</div>
          </div>

          <div className={styles.bundleStats}>
            <div><span>Fact 지면</span><strong>{result.placements.length}</strong></div>
            <div><span>메일 수치 일치</span><strong>{result.qa.matchedMailMetrics}</strong></div>
            <div><span>수치 불일치</span><strong>{result.qa.mismatchedMailMetrics}</strong></div>
            <div><span>제외 시트</span><strong>{result.qa.ignoredSheetCount}</strong></div>
          </div>

          <div className={styles.previewGrid}>
            <article className={styles.previewCard}>
              <div className={styles.previewCardHead}><div><strong>Excel Fact</strong><span>{result.campaignStart} – {result.campaignEnd}</span></div><b>{result.parsedSheets.length} sheets</b></div>
              <div className={styles.factTableWrap}><table className={styles.factTable}><thead><tr><th>매체</th><th>지면</th><th>IMP</th><th>Click</th><th>CTR</th></tr></thead><tbody>{result.placements.slice(0, 12).map((item) => <tr key={`${item.sourceSheet}-${item.placement}`}><td>{item.platform}</td><td>{item.placement}</td><td>{item.impressions.toLocaleString()}</td><td>{item.clicks.toLocaleString()}</td><td>{item.ctr === null ? "-" : `${item.ctr.toFixed(2)}%`}</td></tr>)}</tbody></table></div>
            </article>

            <article className={styles.previewCard}>
              <div className={styles.previewCardHead}><div><strong>Mail Insight / 운영메모</strong><span>전일 성과 기준</span></div><b>{result.operationNotes.length} notes</b></div>
              <div className={styles.noteList}>{result.operationNotes.length ? result.operationNotes.map((note) => <div key={note}>{note}</div>) : <p>추출된 운영메모가 없습니다.</p>}</div>
              <div className={styles.qaList}>{result.mailChecks.map((item, index) => <div key={`${item.placement}-${index}`}><span className={item.status === "match" ? styles.qaGood : item.status === "mismatch" ? styles.qaBad : styles.qaWarn}>{item.status === "match" ? "✓" : "!"}</span><div><strong>{item.placement}</strong><p>IMP {item.impressions.toLocaleString()} · Click {item.clicks.toLocaleString()} · CTR {item.ctr.toFixed(2)}%</p></div><b>{item.status === "match" ? "일치" : item.status === "mismatch" ? "불일치" : "미매칭"}</b></div>)}</div>
            </article>
          </div>

          <div className={styles.publishBar}><div><strong>반영 준비</strong><span>최신 Excel로 월간 Fact를 갱신하고, 메일 본문은 {result.reportDate} Insight로 저장합니다.</span></div><button disabled={result.qa.mismatchedMailMetrics > 0 || result.qa.unmatchedMailMetrics > 0}>검수 완료 후 Dashboard 반영</button></div>
        </div>
      )}
    </section>
  );
}
