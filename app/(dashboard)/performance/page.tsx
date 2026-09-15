"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, publishedSnapshotsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, periodRowsFromSnapshots, rowsFromDatasets, summarizeRows, type ReportingRow } from "@/lib/reporting-data";
import { canonicalMedia, canonicalProduct, inferMediaMentions, normalizeInsightText } from "@/lib/media-normalization";
import styles from "./performance.module.css";

function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}
function formatWonMetric(value: number | null | undefined) {
  return value === null || value === undefined ? "데이터 없음" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;
}
function renderInsightNote(note: string) {
  const normalized = normalizeInsightText(note);
  const match = normalized.match(/^원본 리포트:\s*(https?:\/\/\S+)/i);
  if (!match) return <p>{normalized}</p>;
  return <p><a href={match[1]} target="_blank" rel="noreferrer" className="source-link">원본 리포트 열기 ↗</a></p>;
}

type UiRow = ReportingRow & { media: string; product: string };

function normalizeRow(row: ReportingRow): UiRow {
  return {
    ...row,
    media: canonicalMedia(row.platform),
    product: canonicalProduct(row.platform, row.placement, row.sourceSheet),
  };
}

function metricPresence(rows: UiRow[]) {
  return {
    spend: rows.some((row) => row.spend !== null && row.spend !== undefined),
    clicks: rows.some((row) => row.clicks !== null && row.clicks !== undefined),
    views: rows.some((row) => row.views !== null && row.views !== undefined),
    vtr: rows.some((row) => row.vtr !== null && row.vtr !== undefined),
    conversions: rows.some((row) => row.conversions !== null && row.conversions !== undefined),
    cpc: rows.some((row) => row.cpc !== null && row.cpc !== undefined),
    cpm: rows.some((row) => row.cpm !== null && row.cpm !== undefined),
    cpv: rows.some((row) => row.cpv !== null && row.cpv !== undefined),
  };
}

export default function PerformancePage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedDataset[]>([]);
  const [insights, setInsights] = useState<PublishedInsight[]>([]);
  const [startDate, setStartDate] = useState(monthStart(month));
  const [endDate, setEndDate] = useState(monthEnd(month));
  const [selectedMedia, setSelectedMedia] = useState("전체 매체");
  const [selectedProduct, setSelectedProduct] = useState("전체 상품");

  useEffect(() => {
    setStartDate(monthStart(month));
    setEndDate(monthEnd(month));
    setSelectedMedia("전체 매체");
    setSelectedProduct("전체 상품");
  }, [month, advertiser]);

  useEffect(() => {
    const load = () => {
      const nextDatasets = publishedDatasetsFor(advertiser, month);
      const nextSnapshots = publishedSnapshotsFor(advertiser, month);
      const nextInsights = publishedInsightsFor(advertiser, month);
      setDatasets(nextDatasets);
      setSnapshots(nextSnapshots);
      setInsights(nextInsights);
      const latestDate = nextSnapshots.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1)
        || nextDatasets.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1);
      if (latestDate) setEndDate(latestDate);
    };
    load();
    window.addEventListener("media-report-daily-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("media-report-daily-updated", load);
      window.removeEventListener("storage", load);
    };
  }, [advertiser, month]);

  const period = useMemo(() => snapshots.length
    ? periodRowsFromSnapshots(snapshots, startDate, endDate)
    : { rows: rowsFromDatasets(datasets), baselineComplete: startDate.endsWith("-01") }, [snapshots, datasets, startDate, endDate]);

  const normalizedRows = useMemo(() => period.rows.map(normalizeRow), [period.rows]);
  const periodInsights = useMemo(() => insights.filter((item) => item.reportDate >= startDate && item.reportDate <= endDate), [insights, startDate, endDate]);

  const mediaGroups = useMemo(() => {
    const map = new Map<string, UiRow[]>();
    for (const row of normalizedRows) {
      const list = map.get(row.media) ?? [];
      list.push(row);
      map.set(row.media, list);
    }
    return [...map.entries()]
      .map(([media, rows]) => ({ media, rows, summary: summarizeRows(rows) }))
      .sort((a, b) => a.media.localeCompare(b.media, "ko"));
  }, [normalizedRows]);

  const availableProducts = useMemo(() => {
    const scoped = selectedMedia === "전체 매체" ? normalizedRows : normalizedRows.filter((row) => row.media === selectedMedia);
    return ["전체 상품", ...Array.from(new Set(scoped.map((row) => row.product).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [normalizedRows, selectedMedia]);

  useEffect(() => {
    if (!availableProducts.includes(selectedProduct)) setSelectedProduct("전체 상품");
  }, [availableProducts, selectedProduct]);

  const filteredRows = useMemo(() => normalizedRows.filter((row) => {
    const mediaMatch = selectedMedia === "전체 매체" || row.media === selectedMedia;
    const productMatch = selectedProduct === "전체 상품" || row.product === selectedProduct;
    return mediaMatch && productMatch;
  }), [normalizedRows, selectedMedia, selectedProduct]);

  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);

  const visibleMediaGroups = useMemo(() => {
    const map = new Map<string, UiRow[]>();
    for (const row of filteredRows) {
      const list = map.get(row.media) ?? [];
      list.push(row);
      map.set(row.media, list);
    }
    return [...map.entries()].map(([media, rows]) => ({ media, rows, summary: summarizeRows(rows) }));
  }, [filteredRows]);

  const sourceTrace = useMemo(() => {
    const map = new Map<string, { sourceFile: string; sourceSheet: string; media: Set<string>; rows: number; reportDate: string; sourceUrl?: string }>();
    for (const row of filteredRows) {
      const key = `${row.sourceFile}::${row.sourceSheet}`;
      const current = map.get(key) ?? { sourceFile: row.sourceFile, sourceSheet: row.sourceSheet, media: new Set<string>(), rows: 0, reportDate: row.reportDate, sourceUrl: row.sourceUrl };
      current.rows += 1;
      current.media.add(row.media);
      if (row.reportDate > current.reportDate) current.reportDate = row.reportDate;
      map.set(key, current);
    }
    return [...map.values()];
  }, [filteredRows]);

  function relevantInsights(media: string) {
    return periodInsights.filter((item) => {
      const text = `${item.mailSubject}\n${item.notes.join("\n")}`;
      const mentions = inferMediaMentions(text);
      return mentions.includes(media);
    }).slice(-3);
  }

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">Performance · MEDIA → PRODUCT</div>
          <h1 className="page-title">{advertiser} 성과 보고</h1>
          <p className="page-desc">실제 리포트를 매체 → 광고상품 → 세부 지면/소재 순으로 정리합니다. 원본 파일/시트는 검산용 상세정보로만 남깁니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">{month}</span></div>
      </div>

      <div className="report-toolbar performance-toolbar">
        <div className="toolbar-group">
          <label className="toolbar-label">기간</label>
          <input className="toolbar-control" type="date" value={startDate} min={monthStart(month)} max={monthEnd(month)} onChange={(event) => setStartDate(event.target.value)} />
          <span className="toolbar-label">–</span>
          <input className="toolbar-control" type="date" value={endDate} min={startDate} max={monthEnd(month)} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <div className="toolbar-group right"><span className="view-pill">매체 {mediaGroups.length} · 원본 {datasets.length} · Snapshot {snapshots.length}</span></div>
      </div>

      {!period.baselineComplete && <div className="source-warning">선택한 시작일 직전 Snapshot이 없어 시작일 이전 누적분을 완전히 제외할 수 없습니다. 해당 날짜의 Daily 파일이 쌓이면 자동으로 정확한 기간 차감이 가능합니다.</div>}

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 반영된 성과 데이터가 없습니다.</h2><p>{advertiser}의 Daily Monitoring을 Data Update에서 검수 후 반영하면 이 화면이 실제 수치로 채워집니다.</p></section> : <>
        <section className={styles.mediaTabs} aria-label="매체 선택">
          <button className={`${styles.mediaTab} ${selectedMedia === "전체 매체" ? styles.mediaTabActive : ""}`} onClick={() => { setSelectedMedia("전체 매체"); setSelectedProduct("전체 상품"); }}>
            <span>ALL MEDIA</span><strong>전체 매체</strong><small>{normalizedRows.length}개 성과 항목</small>
          </button>
          {mediaGroups.map((item) => <button key={item.media} className={`${styles.mediaTab} ${selectedMedia === item.media ? styles.mediaTabActive : ""}`} onClick={() => { setSelectedMedia(item.media); setSelectedProduct("전체 상품"); }}>
            <span>MEDIA</span><strong>{item.media}</strong><small>{new Set(item.rows.map((row) => row.product)).size}개 광고상품</small>
          </button>)}
        </section>

        <div className={styles.productChips} aria-label="광고 상품 선택">
          {availableProducts.map((product) => <button key={product} className={`${styles.productChip} ${selectedProduct === product ? styles.productChipActive : ""}`} onClick={() => setSelectedProduct(product)}>{product}</button>)}
        </div>

        <section className="metric-strip performance-metrics">
          <article className="metric-card selected-metric"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong><div><span>원 단위 · 선택 범위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong><div><span>원본에 있을 때만 합산</span></div></article>
          <article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong><div><span>선택 기간 기준</span></div></article>
          <article className="metric-card"><span className="metric-kicker">조회 / 전환</span><strong>{summary.views !== null ? formatCount(summary.views) : summary.conversions !== null ? formatCount(summary.conversions, "건") : "데이터 없음"}</strong><div><span>상품별 원본 지표</span></div></article>
        </section>

        <section className={`${styles.mediaStack} section-space`}>
          {visibleMediaGroups.map((mediaGroup) => {
            const productMap = new Map<string, UiRow[]>();
            mediaGroup.rows.forEach((row) => {
              const list = productMap.get(row.product) ?? [];
              list.push(row);
              productMap.set(row.product, list);
            });
            const insightsForMedia = relevantInsights(mediaGroup.media);
            return <article key={mediaGroup.media} className={styles.mediaSection}>
              <header className={styles.mediaHeader}>
                <div className={styles.mediaTitleWrap}><span>MEDIA</span><h2>{mediaGroup.media}</h2></div>
                <div className={styles.mediaStats}>
                  <div className={styles.mediaStat}><span>광고상품</span><strong>{productMap.size}개</strong></div>
                  <div className={styles.mediaStat}><span>집행액</span><strong>{formatKrw(mediaGroup.summary.spend)}</strong></div>
                  <div className={styles.mediaStat}><span>노출</span><strong>{formatCount(mediaGroup.summary.impressions)}</strong></div>
                  <div className={styles.mediaStat}><span>CTR</span><strong>{formatRate(mediaGroup.summary.ctr)}</strong></div>
                </div>
              </header>

              <div className={styles.productGrid}>
                {[...productMap.entries()].map(([product, productRows]) => {
                  const productSummary = summarizeRows(productRows);
                  const presence = metricPresence(productRows);
                  return <section key={product} className={styles.productCard}>
                    <div className={styles.productHead}><strong>{product}</strong><span>{productRows.length}개 세부항목</span></div>
                    <div className={styles.productMetrics}>
                      {presence.spend && <div className={styles.productMetric}><span>집행액</span><strong>{formatKrw(productSummary.spend)}</strong></div>}
                      <div className={styles.productMetric}><span>노출</span><strong>{formatCount(productSummary.impressions)}</strong></div>
                      {presence.clicks && <div className={styles.productMetric}><span>클릭</span><strong>{formatCount(productSummary.clicks)}</strong></div>}
                      <div className={styles.productMetric}><span>CTR</span><strong>{formatRate(productSummary.ctr)}</strong></div>
                      {productSummary.views !== null && <div className={styles.productMetric}><span>조회</span><strong>{formatCount(productSummary.views)}</strong></div>}
                      {productSummary.conversions !== null && <div className={styles.productMetric}><span>전환</span><strong>{formatCount(productSummary.conversions, "건")}</strong></div>}
                    </div>
                    <div className={styles.productTableWrap}>
                      <table className={styles.productTable}><thead><tr><th>세부 지면/항목</th>{presence.spend && <th>집행액</th>}<th>노출</th>{presence.clicks && <th>클릭</th>}<th>CTR</th>{presence.views && <th>조회</th>}{presence.vtr && <th>VTR</th>}{presence.conversions && <th>전환</th>}{presence.cpm && <th>CPM</th>}{presence.cpc && <th>CPC</th>}{presence.cpv && <th>CPV</th>}</tr></thead>
                        <tbody>{productRows.map((row, index) => <tr key={`${row.sourceFile}-${row.sourceSheet}-${row.placement}-${index}`}><td><strong>{row.placement}</strong></td>{presence.spend && <td className={styles.num}>{formatKrw(row.spend)}</td>}<td className={styles.num}>{formatCount(row.impressions)}</td>{presence.clicks && <td className={styles.num}>{formatCount(row.clicks)}</td>}<td className={styles.num}>{formatRate(row.ctr)}</td>{presence.views && <td className={styles.num}>{formatCount(row.views)}</td>}{presence.vtr && <td className={styles.num}>{formatRate(row.vtr)}</td>}{presence.conversions && <td className={styles.num}>{formatCount(row.conversions, "건")}</td>}{presence.cpm && <td className={styles.num}>{formatWonMetric(row.cpm)}</td>}{presence.cpc && <td className={styles.num}>{formatWonMetric(row.cpc)}</td>}{presence.cpv && <td className={styles.num}>{formatWonMetric(row.cpv)}</td>}</tr>)}</tbody>
                      </table>
                    </div>
                    <div className={styles.sourceMeta}><span>기준일 {productRows.map((row) => row.reportDate).sort().at(-1) || "미확인"}</span><span>원본 {new Set(productRows.map((row) => row.sourceFile)).size}개</span></div>
                  </section>;
                })}
              </div>

              {insightsForMedia.length > 0 && <div className={styles.insightPanel}>
                <h3>{mediaGroup.media} Daily Insight</h3>
                <div className={styles.insightList}>{insightsForMedia.map((item) => <div key={item.key} className={styles.insightItem}><span className={styles.insightDate}>{item.reportDate.slice(5).replace("-", "/")}</span><div className={styles.insightText}>{item.notes.slice(0, 6).map((note, index) => <span key={index}>{renderInsightNote(note)}</span>)}</div></div>)}</div>
              </div>}
            </article>;
          })}
        </section>

        <details className={styles.traceDetails}>
          <summary>원본 파일 / 시트 추적 정보 보기 ({sourceTrace.length})</summary>
          <div className={styles.traceBody}><div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>원본 파일</th><th>시트/요약</th><th>매체</th><th>기준일</th><th>행</th><th>링크</th></tr></thead><tbody>{sourceTrace.map((item) => <tr key={`${item.sourceFile}-${item.sourceSheet}`}><td>{item.sourceFile}</td><td>{item.sourceSheet}</td><td>{[...item.media].join(", ")}</td><td>{item.reportDate || "-"}</td><td>{item.rows}</td><td>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="source-link">원본 ↗</a> : "-"}</td></tr>)}</tbody></table></div></div>
        </details>

        <section className="card section-space report-panel">
          <div className="report-panel-head"><div><h2>전체 Daily Insight</h2><p>메일 본문의 운영 현황과 전일 성과 해석입니다. Fact 수치를 덮어쓰지 않습니다.</p></div><span className="view-pill">{periodInsights.length}건</span></div>
          <div className="insight-timeline">{periodInsights.length ? periodInsights.map((item) => <div key={item.key}><strong>{item.reportDate}</strong><div><b>{normalizeInsightText(item.mailSubject)}</b>{item.notes.length ? item.notes.map((note, index) => <span key={index}>{renderInsightNote(note)}</span>) : <p>추출된 운영 메모 없음</p>}</div></div>) : <div className="empty-inline">선택 기간에 Daily Insight가 없습니다.</div>}</div>
        </section>
      </>}
    </>
  );
}
