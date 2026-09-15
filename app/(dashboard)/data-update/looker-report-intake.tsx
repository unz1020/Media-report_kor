"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import type { DailyBundlePreview } from "@/lib/daily-report-parser";
import { publishDailyBundles } from "@/lib/daily-report-store";
import styles from "./looker-report-intake.module.css";

type LookerBundle = DailyBundlePreview & {
  sourceId: string;
  sourceUrl?: string;
  sourceKind: string;
  dailyPerformance?: Array<{ date: string }>;
};

type ParseResult = {
  bundles: LookerBundle[];
  warnings: string[];
  pageCount?: number;
  mails?: Array<{ id: string; subject: string; date: string; pdfCount: number }>;
};

function metric(bundle: LookerBundle) {
  return bundle.placements[0];
}
function won(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}
function count(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value).toLocaleString("ko-KR")}회`;
}
function rate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value.toFixed(2)}%`;
}

export function LookerReportIntake() {
  const { advertiser, advertiserKey, month } = useWorkspace();
  const [reportUrl, setReportUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const storageKey = `media-report-looker-url-${advertiserKey}`;
  useEffect(() => {
    setReportUrl(window.localStorage.getItem(storageKey) || "");
    setResult(null);
    setFile(null);
    setError("");
  }, [storageKey]);

  function saveUrl(value: string) {
    setReportUrl(value);
    if (value.trim()) window.localStorage.setItem(storageKey, value.trim());
    else window.localStorage.removeItem(storageKey);
  }

  async function analyze() {
    if (!file) {
      setError("Data Studio PDF를 선택해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("advertiser", advertiser);
      form.set("month", month);
      if (reportUrl.trim()) form.set("reportUrl", reportUrl.trim());
      const response = await fetch("/api/looker/parse", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "PDF 분석에 실패했습니다.");
      setResult(payload as ParseResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayFromGmail() {
    setGmailLoading(true);
    setError("");
    setResult(null);
    try {
      const params = new URLSearchParams({ advertiser, month });
      if (reportUrl.trim()) params.set("reportUrl", reportUrl.trim());
      const response = await fetch(`/api/looker/gmail-today?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Gmail에서 오늘 PDF를 불러오지 못했습니다.");
      if (!payload.bundles?.length) {
        throw new Error("오늘 Gmail에서 해당 광고주의 DV360 / Netflix Looker Studio PDF를 찾지 못했습니다. Looker Studio 예약 PDF 전송을 먼저 설정해주세요.");
      }
      setResult(payload as ParseResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gmail PDF 자동수집 중 오류가 발생했습니다.");
    } finally {
      setGmailLoading(false);
    }
  }

  function publish() {
    if (!result?.bundles.length) return;
    publishDailyBundles(result.bundles.map((bundle) => ({
      bundle,
      mailSubject: result.mails?.[0]?.subject || `${bundle.sourceKind} · ${bundle.placements[0]?.platform || "Report"}`,
      mailDate: result.mails?.[0]?.date || new Date().toISOString(),
    })));
    setToast(`${advertiser} · ${result.bundles.length}개 캠페인 Dashboard 반영 완료`);
    window.setTimeout(() => setToast(""), 3600);
  }

  return (
    <section className={styles.wrap}>
      {toast && <div className={styles.toast}><strong>업데이트 완료</strong><span>{toast}</span></div>}
      <div className={styles.head}>
        <div><span className="eyebrow">DV360 / NETFLIX · LOOKER STUDIO</span><h2>공식 리포트 자동 업데이트</h2><p>공유받은 Looker Studio 링크를 원본으로 고정하고, 예약 전송된 오늘자 PDF를 Gmail에서 자동으로 읽어 Fact를 갱신합니다.</p></div>
        <span className="view-pill">{advertiser} · {month}</span>
      </div>

      <div className={styles.grid}>
        <article className={styles.sourceCard}>
          <label><span>원본 Looker Studio 링크</span><div className={styles.urlRow}><input value={reportUrl} onChange={(event) => saveUrl(event.target.value)} placeholder="https://datastudio.google.com/reporting/..." />{reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer">원본 열기 ↗</a>}</div></label>
          <button type="button" className={styles.primary} onClick={loadTodayFromGmail} disabled={gmailLoading}>{gmailLoading ? "Gmail PDF 확인 중…" : "오늘 Gmail PDF 자동 불러오기"}</button>
          <div style={{ marginTop: 12, borderTop: "1px solid #e7eaf0", paddingTop: 12 }}>
            <label className={styles.filePick}><span>수동 백업 · 오늘자 PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><b>{file?.name || "PDF 파일 선택"}</b></label>
            <button type="button" className={styles.primary} onClick={analyze} disabled={loading}>{loading ? "PDF 분석 중…" : "수동 PDF 분석"}</button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <small>자동 업데이트는 Looker Studio 예약 이메일의 PDF 첨부를 사용합니다. 링크는 원본 확인·Source ID로 유지하며, 보호된 보고서 화면을 스크래핑하지 않습니다.</small>
        </article>

        <article className={styles.ruleCard}>
          <strong>업데이트 흐름</strong>
          <div><b>01 원본</b><span>공유받은 Looker Studio URL을 광고주별 기준 소스로 저장</span></div>
          <div><b>02 자동수신</b><span>Looker Studio가 매일 PDF를 Gmail로 예약 전송</span></div>
          <div><b>03 Fact</b><span>월 누적 + 일간 성과를 자동 파싱하고 Raw Data 일부 페이지는 제외</span></div>
          <div><b>04 검수</b><span>월 누적과 일간 합계 차이를 QA 경고로 표시한 뒤 Dashboard 반영</span></div>
        </article>
      </div>

      {result && <div className={styles.result}>
        <div className={styles.resultHead}><div><strong>{result.bundles.length}개 캠페인 인식</strong><span>{result.mails?.length ? `Gmail ${result.mails.length}건 · ` : result.pageCount ? `PDF ${result.pageCount}페이지 · ` : ""}선택 월 {month}</span></div><button type="button" onClick={publish}>검수 완료 후 Dashboard 반영</button></div>
        {result.warnings.length > 0 && <div className={styles.warnings}>{result.warnings.map((item) => <p key={item}>⚠ {item}</p>)}</div>}
        <div className={styles.bundleGrid}>{result.bundles.map((bundle) => {
          const row = metric(bundle);
          return <article key={bundle.sourceId} className={styles.bundleCard}>
            <div><span>{row.platform}</span><strong>{row.placement}</strong><small>기준일 {bundle.reportDate} · 일간 {bundle.dailyPerformance?.length || 0}행</small></div>
            <dl>
              <div><dt>집행액</dt><dd>{won(row.spend)}</dd></div>
              <div><dt>노출</dt><dd>{count(row.impressions)}</dd></div>
              {row.views !== null && row.views !== undefined && <div><dt>시청 완료</dt><dd>{count(row.views)}</dd></div>}
              {row.clicks !== null && row.clicks !== undefined && <div><dt>클릭</dt><dd>{count(row.clicks)}</dd></div>}
              {row.ctr !== null && row.ctr !== undefined && <div><dt>CTR</dt><dd>{rate(row.ctr)}</dd></div>}
              {row.vtr !== null && row.vtr !== undefined && <div><dt>VTR</dt><dd>{rate(row.vtr)}</dd></div>}
              {row.cpm !== null && row.cpm !== undefined && <div><dt>CPM</dt><dd>{won(row.cpm)}</dd></div>}
              {row.cpc !== null && row.cpc !== undefined && <div><dt>CPC</dt><dd>{won(row.cpc)}</dd></div>}
              {row.cpv !== null && row.cpv !== undefined && <div><dt>CPV</dt><dd>{won(row.cpv)}</dd></div>}
            </dl>
          </article>;
        })}</div>
      </div>}
    </section>
  );
}
