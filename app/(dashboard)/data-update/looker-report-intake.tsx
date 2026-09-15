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
  pageCount: number;
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

  function publish() {
    if (!result?.bundles.length) return;
    publishDailyBundles(result.bundles.map((bundle) => ({
      bundle,
      mailSubject: `${bundle.sourceKind} · ${bundle.placements[0]?.platform || "Report"}`,
      mailDate: new Date().toISOString(),
    })));
    setToast(`${advertiser} · ${result.bundles.length}개 캠페인 Dashboard 반영 완료`);
    window.setTimeout(() => setToast(""), 3600);
  }

  return (
    <section className={styles.wrap}>
      {toast && <div className={styles.toast}><strong>업데이트 완료</strong><span>{toast}</span></div>}
      <div className={styles.head}>
        <div><span className="eyebrow">DV360 / NETFLIX · DATA STUDIO</span><h2>공식 리포트 PDF 가져오기</h2><p>원본 링크는 바로가기용으로 저장하고, PDF에 명시된 월 누적·일간 수치만 Fact로 반영합니다.</p></div>
        <span className="view-pill">{advertiser} · {month}</span>
      </div>

      <div className={styles.grid}>
        <article className={styles.sourceCard}>
          <label><span>원본 Data Studio 링크</span><div className={styles.urlRow}><input value={reportUrl} onChange={(event) => saveUrl(event.target.value)} placeholder="https://datastudio.google.com/reporting/..." />{reportUrl && <a href={reportUrl} target="_blank" rel="noreferrer">원본 열기 ↗</a>}</div></label>
          <label className={styles.filePick}><span>오늘자 PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><b>{file?.name || "PDF 파일 선택"}</b></label>
          <button type="button" className={styles.primary} onClick={analyze} disabled={loading}>{loading ? "PDF 분석 중…" : "PDF 분석"}</button>
          {error && <p className={styles.error}>{error}</p>}
          <small>현재 리포트의 Raw Data 표는 PDF 페이지네이션으로 전체 행이 아닐 수 있어 합산에 사용하지 않습니다.</small>
        </article>

        <article className={styles.ruleCard}>
          <strong>반영 기준</strong>
          <div><b>월 누적</b><span>집행액 · 노출 · 클릭/시청완료 · CPM/CPC/CPV · CTR/VTR</span></div>
          <div><b>기간 리포트</b><span>PDF의 일간 성과를 저장해 선택 날짜 구간을 정확히 합산</span></div>
          <div><b>QA</b><span>월 누적값과 일간 합계가 다르면 자동 경고</span></div>
          <div><b>원본 확인</b><span>Performance에서 Data Studio 원본 링크로 바로 이동</span></div>
        </article>
      </div>

      {result && <div className={styles.result}>
        <div className={styles.resultHead}><div><strong>{result.bundles.length}개 캠페인 인식</strong><span>PDF {result.pageCount}페이지 · 선택 월 {month}</span></div><button type="button" onClick={publish}>검수 완료 후 Dashboard 반영</button></div>
        {result.warnings.length > 0 && <div className={styles.warnings}>{result.warnings.map((item) => <p key={item}>⚠ {item}</p>)}</div>}
        <div className={styles.bundleGrid}>{result.bundles.map((bundle) => {
          const row = metric(bundle);
          return <article key={bundle.sourceId} className={styles.bundleCard}>
            <div><span>{row.platform}</span><strong>{row.placement}</strong><small>기준일 {bundle.reportDate} · 일간 {bundle.dailyPerformance?.length || 0}행</small></div>
            <dl>
              <div><dt>집행액</dt><dd>{won(row.spend)}</dd></div>
              <div><dt>노출</dt><dd>{count(row.impressions)}</dd></div>
              {row.views !== null && row.views !== undefined && <div><dt>시청 완료</dt><dd>{count(row.views)}</dd></div>}
              <div><dt>클릭</dt><dd>{count(row.clicks)}</dd></div>
              <div><dt>CTR</dt><dd>{rate(row.ctr)}</dd></div>
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
