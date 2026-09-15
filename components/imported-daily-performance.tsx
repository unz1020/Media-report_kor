"use client";

import { useEffect, useMemo, useState } from "react";
import { publishedDatasetsFor, publishedInsightsFor, type PublishedDataset } from "@/lib/daily-report-store";
import styles from "./imported-daily-performance.module.css";

export function ImportedDailyPerformance({ advertiser = "자코모", month = "2026-09" }: { advertiser?: string; month?: string }) {
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [insightCount, setInsightCount] = useState(0);

  useEffect(() => {
    const load = () => {
      setDatasets(publishedDatasetsFor(advertiser, month));
      setInsightCount(publishedInsightsFor(advertiser, month).length);
    };
    load();
    window.addEventListener("media-report-daily-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("media-report-daily-updated", load);
      window.removeEventListener("storage", load);
    };
  }, [advertiser, month]);

  const summary = useMemo(() => {
    const rows = datasets.flatMap((dataset) => dataset.bundle.placements.map((placement) => ({ ...placement, sourceFile: dataset.sourceFile })));
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    const ctr = impressions ? clicks / impressions * 100 : 0;
    const platforms = new Set(rows.map((row) => row.platform));
    const latest = datasets.map((item) => item.publishedAt).sort().at(-1) || "";
    return { rows, impressions, clicks, ctr, platformCount: platforms.size, latest };
  }, [datasets]);

  if (!datasets.length) return null;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <div><span>LIVE DAILY DATA</span><h2>실제 Daily Monitoring 반영</h2><p>검수 완료한 누적 Excel 기준입니다. 동일 리포트 수정본은 최신본으로 교체됩니다.</p></div>
        <b>{datasets.length} DATASETS</b>
      </div>
      <div className={styles.stats}>
        <div><span>누적 노출</span><strong>{summary.impressions.toLocaleString()}</strong></div>
        <div><span>누적 클릭</span><strong>{summary.clicks.toLocaleString()}</strong></div>
        <div><span>CTR</span><strong>{summary.ctr.toFixed(2)}%</strong></div>
        <div><span>매체</span><strong>{summary.platformCount}</strong></div>
        <div><span>Daily Insight</span><strong>{insightCount}</strong></div>
      </div>
      <div className={styles.sources}>{datasets.map((dataset) => <span key={dataset.key}>{dataset.sourceFile}</span>)}</div>
      <div className={styles.tableWrap}>
        <table><thead><tr><th>매체</th><th>지면</th><th>IMP</th><th>Click</th><th>CTR</th><th>Source</th></tr></thead><tbody>
          {summary.rows.slice(0, 30).map((row, index) => <tr key={`${row.sourceFile}-${row.sourceSheet}-${row.placement}-${index}`}><td>{row.platform}</td><td>{row.placement}</td><td>{row.impressions.toLocaleString()}</td><td>{row.clicks.toLocaleString()}</td><td>{row.ctr === null ? "-" : `${row.ctr.toFixed(2)}%`}</td><td>{row.sourceFile}</td></tr>)}
        </tbody></table>
      </div>
      <div className={styles.foot}>마지막 반영 {summary.latest ? new Date(summary.latest).toLocaleString("ko-KR") : "-"}</div>
    </section>
  );
}
