"use client";

import { useState } from "react";
import { parseDailyWorkbook, type DailyBundlePreview } from "@/lib/daily-report-parser";
import styles from "./daily-report-intake.module.css";

export function DailyReportIntake() {
  const [mode, setMode] = useState<"gmail" | "manual">("gmail");
  const [file, setFile] = useState<File | null>(null);
  const [mailBody, setMailBody] = useState("");
  const [result, setResult] = useState<DailyBundlePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    if (!file) {
      setError("Daily Monitoring Excel 파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const preview = await parseDailyWorkbook(file, mailBody);
      setResult(preview);
    } catch (e) {
      console.error(e);
      setError("Excel 분석 중 오류가 발생했습니다. 파일 구조를 확인해주세요.");
    } finally {
      setLoading(false);
    }
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
              <p>실서비스에서는 Google OAuth로 새 메일의 본문과 Excel 첨부를 한 번에 불러옵니다. 현재 Preview에서는 동일 Parser를 직접 업로드로 검증합니다.</p>
              <div className={styles.gmailRule}><span>검색 규칙</span><strong>광고주 + Daily Report + Excel 첨부</strong></div>
              <button className={styles.connectButton} disabled>Gmail OAuth 연결 예정</button>
            </>
          ) : (
            <p>Excel은 Fact, 메일 본문은 Insight/운영메모로 처리합니다. 파일명 규칙은 강제하지 않습니다.</p>
          )}

          <label className={styles.uploadLabel}>
            <span>Daily Monitoring Excel</span>
            <input type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <b>{file ? file.name : "Excel 파일 선택"}</b>
          </label>

          <label className={styles.mailLabel}>
            <span>메일 본문</span>
            <textarea value={mailBody} onChange={(event) => setMailBody(event.target.value)} placeholder="받은 Daily Report 메일 본문을 그대로 붙여넣으세요. 인사말/서명/전달문이 있어도 됩니다." />
          </label>
          {error && <div className={styles.errorText}>{error}</div>}
          <button className={styles.analyzeButton} onClick={analyze} disabled={loading}>{loading ? "분석 중…" : "Daily Bundle 분석"}</button>
        </article>

        <article className={styles.dailyCard}>
          <div className="eyebrow">NORMALIZATION RULE</div>
          <h2>자동 처리 원칙</h2>
          <div className={styles.ruleStack}>
            <div><span>01</span><strong>기준일</strong><p>메일 발송일/파일명이 아니라 본문의 “9/14자”와 실제 최신 성과일을 우선합니다.</p></div>
            <div><span>02</span><strong>Fact Sheet</strong><p>현재월 Total 요약 시트만 읽고 Raw·보조·과거 템플릿 시트는 제외합니다.</p></div>
            <div><span>03</span><strong>Mail QA</strong><p>메일에 적힌 Impression / Click / CTR을 Excel 값과 자동 대조합니다.</p></div>
            <div><span>04</span><strong>Publish</strong><p>불일치·미매칭이 없거나 AE가 승인한 경우에만 Dashboard에 반영합니다.</p></div>
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
              <div className={styles.previewCardHead}><div><strong>Mail Insight / 운영메모</strong><span>본문 자동 정제</span></div><b>{result.operationNotes.length} notes</b></div>
              <div className={styles.noteList}>{result.operationNotes.length ? result.operationNotes.map((note) => <div key={note}>{note}</div>) : <p>추출된 운영메모가 없습니다.</p>}</div>
              <div className={styles.qaList}>{result.mailChecks.map((item, index) => <div key={`${item.placement}-${index}`}><span className={item.status === "match" ? styles.qaGood : item.status === "mismatch" ? styles.qaBad : styles.qaWarn}>{item.status === "match" ? "✓" : "!"}</span><div><strong>{item.placement}</strong><p>IMP {item.impressions.toLocaleString()} · Click {item.clicks.toLocaleString()} · CTR {item.ctr.toFixed(2)}%</p></div><b>{item.status === "match" ? "일치" : item.status === "mismatch" ? "불일치" : "미매칭"}</b></div>)}</div>
            </article>
          </div>

          <div className={styles.publishBar}><div><strong>반영 준비</strong><span>Excel Fact + Mail Context가 하나의 Daily Bundle로 저장됩니다.</span></div><button disabled={result.qa.mismatchedMailMetrics > 0 || result.qa.unmatchedMailMetrics > 0}>검수 완료 후 Dashboard 반영</button></div>
        </div>
      )}
    </section>
  );
}
