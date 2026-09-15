"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import {
  publishedDatasetsFor,
  publishedInsightsFor,
  publishedSnapshotsFor,
  type PublishedDataset,
  type PublishedInsight,
} from "@/lib/daily-report-store";
import {
  dailyPerformanceFromDatasets,
  periodRowsFromSnapshots,
  rowsFromDatasets,
  summarizeRows,
  type DailyPerformanceRow,
  type ReportingRow,
} from "@/lib/reporting-data";
import { canonicalMedia, inferMediaMentions, normalizeInsightText } from "@/lib/media-normalization";
import styles from "./performance.module.css";

function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}
function formatBareCount(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : Math.round(value).toLocaleString("ko-KR");
}
function formatWon(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}
function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value.toFixed(2)}%`;
}
function formatAchievement(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${Math.round(value)}%`;
}
function guaranteedNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type UiRow = ReportingRow & { media: string };
type ViewMode = "placement" | "creative";

type MetricPresence = {
  achievement: boolean;
  guaranteed: boolean;
  spend: boolean;
  clicks: boolean;
  views: boolean;
  vtr: boolean;
  conversions: boolean;
  cpc: boolean;
  cpm: boolean;
  cpv: boolean;
};

function normalizeRow(row: ReportingRow): UiRow {
  return { ...row, media: canonicalMedia(row.platform) };
}

function isCreativeRow(row: UiRow) {
  return /소재|creative/i.test(`${row.sourceSheet} ${row.placement}`);
}

function metricPresence(media: string, rows: UiRow[]): MetricPresence {
  const isDooh = media === "애드부스트스크린";
  return {
    achievement: rows.some((row) => row.achievement !== null && row.achievement !== undefined),
    guaranteed: rows.some((row) => Boolean(row.guaranteed && row.guaranteed !== "-")),
    spend: rows.some((row) => row.spend !== null && row.spend !== undefined),
    clicks: !isDooh && rows.some((row) => row.clicks !== null && row.clicks !== undefined),
    views: rows.some((row) => row.views !== null && row.views !== undefined),
    vtr: rows.some((row) => row.vtr !== null && row.vtr !== undefined),
    conversions: rows.some((row) => row.conversions !== null && row.conversions !== undefined),
    cpc: rows.some((row) => row.cpc !== null && row.cpc !== undefined),
    cpm: rows.some((row) => row.cpm !== null && row.cpm !== undefined),
    cpv: rows.some((row) => row.cpv !== null && row.cpv !== undefined),
  };
}

function dailyPresence(media: string, rows: DailyPerformanceRow[]) {
  const isDooh = media === "애드부스트스크린";
  return {
    spend: rows.some((row) => row.spend !== null && row.spend !== undefined),
    clicks: !isDooh && rows.some((row) => row.clicks !== null && row.clicks !== undefined),
    views: rows.some((row) => row.views !== null && row.views !== undefined),
    vtr: rows.some((row) => row.vtr !== null && row.vtr !== undefined),
    cpc: rows.some((row) => row.cpc !== null && row.cpc !== undefined),
    cpm: rows.some((row) => row.cpm !== null && row.cpm !== undefined),
    cpv: rows.some((row) => row.cpv !== null && row.cpv !== undefined),
  };
}

function sourceUsesAgencyLabels(rows: UiRow[]) {
  return rows.some((row) => /total/i.test(row.sourceSheet) && !/^summary$/i.test(row.sourceSheet));
}

function renderTotal(media: string, rows: UiRow[], presence: MetricPresence) {
  const summary = summarizeRows(rows);
  const guaranteedValues = rows.map((row) => guaranteedNumber(row.guaranteed)).filter((value): value is number => value !== null);
  const guaranteed = guaranteedValues.length ? guaranteedValues.reduce((sum, value) => sum + value, 0) : null;
  const achievement = guaranteed && guaranteed > 0 ? summary.impressions / guaranteed * 100 : null;
  const cpm = presence.cpm && summary.spend !== null && summary.impressions > 0 ? summary.spend / summary.impressions * 1000 : null;
  const cpc = presence.cpc && summary.spend !== null && summary.clicks !== null && summary.clicks > 0 ? summary.spend / summary.clicks : null;
  const cpv = presence.cpv && summary.spend !== null && summary.views !== null && summary.views > 0 ? summary.spend / summary.views : null;
  const vtr = presence.vtr && summary.views !== null && summary.impressions > 0 ? summary.views / summary.impressions * 100 : null;
  return { media, summary, guaranteed, achievement, cpm, cpc, cpv, vtr };
}

export default function PerformancePage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedDataset[]>([]);
  const [insights, setInsights] = useState<PublishedInsight[]>([]);
  const [startDate, setStartDate] = useState(monthStart(month));
  const [endDate, setEndDate] = useState(monthEnd(month));
  const [selectedMedia, setSelectedMedia] = useState("전체 매체");
  const [viewMode, setViewMode] = useState<ViewMode>("placement");

  useEffect(() => {
    setStartDate(monthStart(month));
    setEndDate(monthEnd(month));
    setSelectedMedia("전체 매체");
    setViewMode("placement");
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
  const placementRows = useMemo(() => normalizedRows.filter((row) => !isCreativeRow(row)), [normalizedRows]);
  const creativeRows = useMemo(() => normalizedRows.filter(isCreativeRow), [normalizedRows]);
  const activeRows = viewMode === "placement" ? placementRows : creativeRows;

  const mediaGroups = useMemo(() => {
    const map = new Map<string, UiRow[]>();
    for (const row of activeRows) {
      const list = map.get(row.media) ?? [];
      list.push(row);
      map.set(row.media, list);
    }
    return [...map.entries()]
      .map(([media, rows]) => ({ media, rows }))
      .sort((a, b) => a.media.localeCompare(b.media, "ko"));
  }, [activeRows]);

  useEffect(() => {
    if (selectedMedia !== "전체 매체" && !mediaGroups.some((item) => item.media === selectedMedia)) setSelectedMedia("전체 매체");
  }, [mediaGroups, selectedMedia]);

  const visibleGroups = useMemo(() => selectedMedia === "전체 매체"
    ? mediaGroups
    : mediaGroups.filter((item) => item.media === selectedMedia), [mediaGroups, selectedMedia]);

  const dailyRows = useMemo(() => dailyPerformanceFromDatasets(datasets, startDate, endDate), [datasets, startDate, endDate]);
  const periodInsights = useMemo(() => insights.filter((item) => item.reportDate >= startDate && item.reportDate <= endDate), [insights, startDate, endDate]);

  function relevantInsights(media: string) {
    return periodInsights.filter((item) => {
      const text = `${item.mailSubject}\n${item.notes.join("\n")}`;
      return inferMediaMentions(text).includes(media);
    }).slice(-2);
  }

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">Performance · SUMMARY FIRST</div>
          <h1 className="page-title">{advertiser} 성과 보고</h1>
          <p className="page-desc">엑셀 Summary/요약 표를 기준으로 매체별 광고 지면 성과를 먼저 보여주고, 일별 성과와 소재별 성과는 상세에서 확인합니다.</p>
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
        <div className="toolbar-group right"><span className="view-pill">원본 {datasets.length}개 · Snapshot {snapshots.length}개</span></div>
      </div>

      {!period.baselineComplete && <div className="source-warning">선택한 시작일 직전 Snapshot이 없어 시작일 이전 누적분을 완전히 제외할 수 없습니다. Daily 데이터가 쌓이면 자동으로 정확한 기간 성과로 전환됩니다.</div>}

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 반영된 성과 데이터가 없습니다.</h2><p>{advertiser} Daily Monitoring을 Data Update에서 검수 후 반영하면 실제 엑셀 수치로 표가 생성됩니다.</p></section> : <>
        <div className={styles.primaryTabs} role="tablist" aria-label="성과 구분">
          <button className={viewMode === "placement" ? styles.primaryTabActive : styles.primaryTab} onClick={() => { setViewMode("placement"); setSelectedMedia("전체 매체"); }}>광고 지면</button>
          <button className={viewMode === "creative" ? styles.primaryTabActive : styles.primaryTab} onClick={() => { setViewMode("creative"); setSelectedMedia("전체 매체"); }}>소재별</button>
        </div>

        <div className={styles.mediaFilterBar} aria-label="매체 필터">
          <button className={selectedMedia === "전체 매체" ? styles.mediaFilterActive : styles.mediaFilter} onClick={() => setSelectedMedia("전체 매체")}>전체 매체</button>
          {mediaGroups.map((group) => <button key={group.media} className={selectedMedia === group.media ? styles.mediaFilterActive : styles.mediaFilter} onClick={() => setSelectedMedia(group.media)}>{group.media}</button>)}
        </div>

        {viewMode === "creative" && !creativeRows.length ? <section className="card card-pad empty-state"><h2>소재별 성과 데이터는 아직 분리되지 않았습니다.</h2><p>1차 시안은 광고 지면 요약표를 우선 확정합니다. 이후 각 매체 Excel의 소재별 성과 영역을 별도 Fact로 연결합니다.</p></section> : <section className={styles.summaryStack}>
          {visibleGroups.map((group) => {
            const presence = metricPresence(group.media, group.rows);
            const total = renderTotal(group.media, group.rows, presence);
            const agencyLabels = sourceUsesAgencyLabels(group.rows);
            const mediaDaily = dailyRows.filter((row) => canonicalMedia(row.platform) === group.media);
            const dailyMetrics = dailyPresence(group.media, mediaDaily);
            const mediaInsights = relevantInsights(group.media);

            return <article key={group.media} className={styles.summaryCard}>
              <header className={styles.summaryHeader}>
                <div><span>매체</span><h2>{group.media}</h2></div>
                <div className={styles.summaryMeta}><span>{group.rows.length}개 {viewMode === "placement" ? "광고 지면" : "소재"}</span><span>기준일 {group.rows.map((row) => row.reportDate).filter(Boolean).sort().at(-1) || "미확인"}</span></div>
              </header>

              <div className={styles.summaryTableWrap}>
                <table className={styles.summaryTable}>
                  <thead><tr>
                    <th>매체</th>
                    <th>{viewMode === "placement" ? "광고 지면" : "소재"}</th>
                    {presence.achievement && <th>달성률</th>}
                    {presence.guaranteed && <th>보장노출수</th>}
                    {presence.spend && <th>집행액</th>}
                    <th>{agencyLabels ? "A.Imps" : "노출"}</th>
                    {presence.clicks && <th>{agencyLabels ? "A.Clicks" : "클릭"}</th>}
                    <th>CTR(%)</th>
                    {presence.views && <th>조회수</th>}
                    {presence.vtr && <th>VTR(%)</th>}
                    {presence.conversions && <th>전환</th>}
                    {presence.cpm && <th>CPM</th>}
                    {presence.cpc && <th>CPC</th>}
                    {presence.cpv && <th>CPV</th>}
                  </tr></thead>
                  <tbody>
                    {group.rows.map((row, index) => <tr key={`${row.sourceFile}-${row.sourceSheet}-${row.placement}-${index}`}>
                      {index === 0 && <td rowSpan={group.rows.length} className={styles.mediaCell}>{group.media}</td>}
                      <td className={styles.placementCell}>{row.placement}</td>
                      {presence.achievement && <td className={styles.numCell}>{formatAchievement(row.achievement)}</td>}
                      {presence.guaranteed && <td className={styles.numCell}>{row.guaranteed || "-"}</td>}
                      {presence.spend && <td className={styles.numCell}>{formatWon(row.spend)}</td>}
                      <td className={styles.numCell}>{formatBareCount(row.impressions)}</td>
                      {presence.clicks && <td className={styles.numCell}>{formatBareCount(row.clicks)}</td>}
                      <td className={styles.numCell}>{formatRate(row.ctr)}</td>
                      {presence.views && <td className={styles.numCell}>{formatBareCount(row.views)}</td>}
                      {presence.vtr && <td className={styles.numCell}>{formatRate(row.vtr)}</td>}
                      {presence.conversions && <td className={styles.numCell}>{formatBareCount(row.conversions)}</td>}
                      {presence.cpm && <td className={styles.numCell}>{formatWon(row.cpm)}</td>}
                      {presence.cpc && <td className={styles.numCell}>{formatWon(row.cpc)}</td>}
                      {presence.cpv && <td className={styles.numCell}>{formatWon(row.cpv)}</td>}
                    </tr>)}
                    <tr className={styles.totalRow}>
                      <td colSpan={2}>Total</td>
                      {presence.achievement && <td className={styles.numCell}>{formatAchievement(total.achievement)}</td>}
                      {presence.guaranteed && <td className={styles.numCell}>{total.guaranteed === null ? "-" : formatBareCount(total.guaranteed)}</td>}
                      {presence.spend && <td className={styles.numCell}>{formatWon(total.summary.spend)}</td>}
                      <td className={styles.numCell}>{formatBareCount(total.summary.impressions)}</td>
                      {presence.clicks && <td className={styles.numCell}>{formatBareCount(total.summary.clicks)}</td>}
                      <td className={styles.numCell}>{formatRate(total.summary.ctr)}</td>
                      {presence.views && <td className={styles.numCell}>{formatBareCount(total.summary.views)}</td>}
                      {presence.vtr && <td className={styles.numCell}>{formatRate(total.vtr)}</td>}
                      {presence.conversions && <td className={styles.numCell}>{formatBareCount(total.summary.conversions)}</td>}
                      {presence.cpm && <td className={styles.numCell}>{formatWon(total.cpm)}</td>}
                      {presence.cpc && <td className={styles.numCell}>{formatWon(total.cpc)}</td>}
                      {presence.cpv && <td className={styles.numCell}>{formatWon(total.cpv)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={styles.detailBar}>
                <details className={styles.detailBlock}>
                  <summary>일별 성과 데이터 보기</summary>
                  {mediaDaily.length ? <div className={styles.dailyTableWrap}><table className={styles.dailyTable}><thead><tr><th>일자</th><th>광고 지면</th>{dailyMetrics.spend && <th>집행액</th>}<th>노출</th>{dailyMetrics.clicks && <th>클릭</th>}<th>CTR</th>{dailyMetrics.views && <th>조회</th>}{dailyMetrics.vtr && <th>VTR</th>}{dailyMetrics.cpm && <th>CPM</th>}{dailyMetrics.cpc && <th>CPC</th>}{dailyMetrics.cpv && <th>CPV</th>}</tr></thead><tbody>{mediaDaily.map((row, index) => <tr key={`${row.date}-${row.platform}-${row.placement}-${index}`}><td>{row.date}</td><td>{row.placement}</td>{dailyMetrics.spend && <td className={styles.numCell}>{formatWon(row.spend)}</td>}<td className={styles.numCell}>{formatBareCount(row.impressions)}</td>{dailyMetrics.clicks && <td className={styles.numCell}>{formatBareCount(row.clicks)}</td>}<td className={styles.numCell}>{formatRate(row.ctr)}</td>{dailyMetrics.views && <td className={styles.numCell}>{formatBareCount(row.views)}</td>}{dailyMetrics.vtr && <td className={styles.numCell}>{formatRate(row.vtr)}</td>}{dailyMetrics.cpm && <td className={styles.numCell}>{formatWon(row.cpm)}</td>}{dailyMetrics.cpc && <td className={styles.numCell}>{formatWon(row.cpc)}</td>}{dailyMetrics.cpv && <td className={styles.numCell}>{formatWon(row.cpv)}</td>}</tr>)}</tbody></table></div> : <div className={styles.detailEmpty}>현재 반영 데이터에는 일별 상세 행이 아직 저장되지 않았습니다. 원본 Daily의 일별 영역을 연결하면 이 위치에 바로 표시됩니다.</div>}
                </details>

                {mediaInsights.length > 0 && <details className={styles.detailBlock}>
                  <summary>메일 운영 코멘트 보기</summary>
                  <div className={styles.insightList}>{mediaInsights.map((item) => <div className={styles.insightItem} key={item.key}><strong>{item.reportDate}</strong><div>{item.notes.slice(0, 8).map((note, index) => <p key={index}>{normalizeInsightText(note)}</p>)}</div></div>)}</div>
                </details>}
              </div>
            </article>;
          })}
        </section>}
      </>}
    </>
  );
}
