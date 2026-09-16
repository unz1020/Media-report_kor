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
  creativePerformanceFromDatasets,
  dailyPerformanceFromDatasets,
  periodRowsFromSnapshots,
  rowsFromDatasets,
  summarizeRows,
  type CreativeDailyRow,
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
function formatGuaranteed(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return value || "-";
  return Math.round(Number(normalized)).toLocaleString("ko-KR");
}
function guaranteedNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateForDay(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

type UiRow = ReportingRow & { media: string };
type UiCreativeRow = CreativeDailyRow & { media: string };
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
function normalizeCreativeRow(row: CreativeDailyRow): UiCreativeRow {
  return { ...row, media: canonicalMedia(row.platform) };
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

function creativeTotal(rows: UiCreativeRow[]) {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clickValues = rows.map((row) => row.clicks).filter((value): value is number => value !== null && value !== undefined);
  const clicks = clickValues.length ? clickValues.reduce((sum, value) => sum + value, 0) : null;
  return { impressions, clicks, ctr: impressions > 0 && clicks !== null ? clicks / impressions * 100 : null };
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

  const latestDataDate = useMemo(() => snapshots.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1)
    || datasets.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1)
    || monthEnd(month), [snapshots, datasets, month]);

  const period = useMemo(() => snapshots.length
    ? periodRowsFromSnapshots(snapshots, startDate, endDate)
    : { rows: rowsFromDatasets(datasets), baselineComplete: startDate.endsWith("-01") }, [snapshots, datasets, startDate, endDate]);

  const placementRows = useMemo(() => period.rows.map(normalizeRow), [period.rows]);
  const creativeRows = useMemo(() => creativePerformanceFromDatasets(datasets, endDate).map(normalizeCreativeRow), [datasets, endDate]);
  const dailyRows = useMemo(() => dailyPerformanceFromDatasets(datasets, startDate, endDate), [datasets, startDate, endDate]);
  const periodInsights = useMemo(() => insights.filter((item) => item.reportDate >= startDate && item.reportDate <= endDate), [insights, startDate, endDate]);

  const mediaNames = useMemo(() => {
    const rows = viewMode === "placement" ? placementRows : creativeRows;
    return Array.from(new Set(rows.map((row) => row.media))).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
  }, [viewMode, placementRows, creativeRows]);

  useEffect(() => {
    if (selectedMedia !== "전체 매체" && !mediaNames.includes(selectedMedia)) setSelectedMedia("전체 매체");
  }, [mediaNames, selectedMedia]);

  const placementGroups = useMemo(() => {
    const scoped = selectedMedia === "전체 매체" ? placementRows : placementRows.filter((row) => row.media === selectedMedia);
    const map = new Map<string, UiRow[]>();
    for (const row of scoped) {
      const list = map.get(row.media) ?? [];
      list.push(row);
      map.set(row.media, list);
    }
    return [...map.entries()].map(([media, rows]) => ({ media, rows }));
  }, [placementRows, selectedMedia]);

  const creativeGroups = useMemo(() => {
    const scoped = selectedMedia === "전체 매체" ? creativeRows : creativeRows.filter((row) => row.media === selectedMedia);
    const map = new Map<string, UiCreativeRow[]>();
    for (const row of scoped) {
      const list = map.get(row.media) ?? [];
      list.push(row);
      map.set(row.media, list);
    }
    return [...map.entries()].map(([media, rows]) => ({ media, rows }));
  }, [creativeRows, selectedMedia]);

  function relevantInsights(media: string) {
    return periodInsights.map((item) => {
      const scopedNotes = item.notes.filter((note) => inferMediaMentions(note).includes(media));
      return scopedNotes.length ? { ...item, notes: scopedNotes } : null;
    }).filter((item): item is PublishedInsight => item !== null).slice(-2);
  }

  function applyPreset(kind: "month" | "early" | "middle" | "late") {
    if (kind === "month") {
      setStartDate(monthStart(month));
      setEndDate(latestDataDate);
      return;
    }
    if (kind === "early") {
      setStartDate(dateForDay(month, 1));
      setEndDate(dateForDay(month, 10) <= latestDataDate ? dateForDay(month, 10) : latestDataDate);
      return;
    }
    if (kind === "middle") {
      setStartDate(dateForDay(month, 11));
      setEndDate(dateForDay(month, 20) <= latestDataDate ? dateForDay(month, 20) : latestDataDate);
      return;
    }
    setStartDate(dateForDay(month, 21));
    setEndDate(latestDataDate);
  }

  return (
    <>
      <div className="page-head refined-head">
        <div>
          <div className="eyebrow">성과 분석</div>
          <h1 className="page-title">{advertiser} 성과 보고</h1>
          <p className="page-desc">원하는 기간을 직접 선택해 지면 성과를 합산하고, 소재별 성과는 선택한 기준일의 하루 성과로 확인합니다.</p>
        </div>
        <div className="page-meta"><span className="view-pill">{month}</span></div>
      </div>

      <div className="report-toolbar performance-toolbar">
        <div className="toolbar-group">
          {viewMode === "placement" ? <>
            <label className="toolbar-label">조회 기간</label>
            <input className="toolbar-control" type="date" value={startDate} min={monthStart(month)} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
            <span className="toolbar-label">–</span>
            <input className="toolbar-control" type="date" value={endDate} min={startDate} max={latestDataDate} onChange={(event) => setEndDate(event.target.value)} />
            <button className="btn" onClick={() => applyPreset("month")}>월 누적</button>
            <button className="btn" onClick={() => applyPreset("early")}>1~10일</button>
            <button className="btn" onClick={() => applyPreset("middle")} disabled={latestDataDate < dateForDay(month, 11)}>11~20일</button>
            <button className="btn" onClick={() => applyPreset("late")} disabled={latestDataDate < dateForDay(month, 21)}>21일~최신</button>
          </> : <>
            <label className="toolbar-label">소재 기준일</label>
            <input className="toolbar-control" type="date" value={endDate} min={monthStart(month)} max={latestDataDate} onChange={(event) => setEndDate(event.target.value)} />
            <span className="view-pill">1일 성과</span>
          </>}
        </div>
        <div className="toolbar-group right"><span className="view-pill">데일리 업데이트 {datasets.length}건 · 최신 {latestDataDate}</span></div>
      </div>

      {viewMode === "placement" && !period.baselineComplete && <div className="source-warning">일별 데이터가 없는 일부 매체는 선택 시작일 직전 누적 스냅샷이 있어야 정확한 기간 차감이 가능합니다. 일별 데이터가 있는 매체는 선택 기간을 직접 합산합니다.</div>}

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 반영된 성과 데이터가 없습니다.</h2><p>{advertiser} 데일리 리포트를 데이터 업데이트에서 검수 후 반영하면 실제 엑셀 수치로 표가 생성됩니다.</p></section> : <>
        <div className={styles.primaryTabs} role="tablist" aria-label="성과 구분">
          <button className={viewMode === "placement" ? styles.primaryTabActive : styles.primaryTab} onClick={() => { setViewMode("placement"); setSelectedMedia("전체 매체"); }}>광고 지면</button>
          <button className={viewMode === "creative" ? styles.primaryTabActive : styles.primaryTab} onClick={() => { setViewMode("creative"); setSelectedMedia("전체 매체"); }}>소재별</button>
        </div>

        <div className={styles.mediaFilterBar} aria-label="매체 필터">
          <button className={selectedMedia === "전체 매체" ? styles.mediaFilterActive : styles.mediaFilter} onClick={() => setSelectedMedia("전체 매체")}>전체 매체</button>
          {mediaNames.map((media) => <button key={media} className={selectedMedia === media ? styles.mediaFilterActive : styles.mediaFilter} onClick={() => setSelectedMedia(media)}>{media}</button>)}
        </div>

        {viewMode === "placement" ? <section className={styles.summaryStack}>
          {placementGroups.map((group) => {
            const presence = metricPresence(group.media, group.rows);
            const total = renderTotal(group.media, group.rows, presence);
            const mediaDaily = dailyRows.filter((row) => canonicalMedia(row.platform) === group.media);
            const dailyMetrics = dailyPresence(group.media, mediaDaily);
            const mediaInsights = relevantInsights(group.media);

            return <article key={group.media} className={styles.summaryCard}>
              <header className={styles.summaryHeader}>
                <div><span>매체</span><h2>{group.media}</h2></div>
                <div className={styles.summaryMeta}><span>성과 기간 {startDate} ~ {endDate}</span><span>{group.rows.length}개 광고 지면</span></div>
              </header>

              <div className={styles.summaryTableWrap}>
                <table className={styles.summaryTable}>
                  <thead><tr>
                    <th>매체</th><th>광고 지면</th>
                    {presence.achievement && <th>달성률</th>}
                    {presence.guaranteed && <th>보장노출수</th>}
                    {presence.spend && <th>집행액</th>}
                    <th>노출</th>
                    {presence.clicks && <th>클릭</th>}
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
                      {presence.guaranteed && <td className={styles.numCell}>{formatGuaranteed(row.guaranteed)}</td>}
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
                      <td colSpan={2}>합계</td>
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

              {mediaInsights.length > 0 && <div className={styles.insightPanel}>
                <div className={styles.insightTitle}><strong>데일리 인사이트</strong><span>메일 성과 요약</span></div>
                <div className={styles.insightList}>{mediaInsights.map((item) => <div className={styles.insightItem} key={item.key}><strong>{item.reportDate}</strong><div>{item.notes.slice(0, 8).map((note, index) => <p key={index}>{normalizeInsightText(note)}</p>)}</div></div>)}</div>
              </div>}

              <div className={styles.detailBar}>
                <details className={styles.detailBlock}>
                  <summary>일별 성과 데이터 보기</summary>
                  {mediaDaily.length ? <div className={styles.dailyTableWrap}><table className={styles.dailyTable}><thead><tr><th>일자</th><th>광고 지면</th>{dailyMetrics.spend && <th>집행액</th>}<th>노출</th>{dailyMetrics.clicks && <th>클릭</th>}<th>CTR</th>{dailyMetrics.views && <th>조회</th>}{dailyMetrics.vtr && <th>VTR</th>}{dailyMetrics.cpm && <th>CPM</th>}{dailyMetrics.cpc && <th>CPC</th>}{dailyMetrics.cpv && <th>CPV</th>}</tr></thead><tbody>{mediaDaily.map((row, index) => <tr key={`${row.date}-${row.platform}-${row.placement}-${index}`}><td>{row.date}</td><td>{row.placement}</td>{dailyMetrics.spend && <td className={styles.numCell}>{formatWon(row.spend)}</td>}<td className={styles.numCell}>{formatBareCount(row.impressions)}</td>{dailyMetrics.clicks && <td className={styles.numCell}>{formatBareCount(row.clicks)}</td>}<td className={styles.numCell}>{formatRate(row.ctr)}</td>{dailyMetrics.views && <td className={styles.numCell}>{formatBareCount(row.views)}</td>}{dailyMetrics.vtr && <td className={styles.numCell}>{formatRate(row.vtr)}</td>}{dailyMetrics.cpm && <td className={styles.numCell}>{formatWon(row.cpm)}</td>}{dailyMetrics.cpc && <td className={styles.numCell}>{formatWon(row.cpc)}</td>}{dailyMetrics.cpv && <td className={styles.numCell}>{formatWon(row.cpv)}</td>}</tr>)}</tbody></table></div> : <div className={styles.detailEmpty}>이 매체의 일별 성과 데이터가 아직 연결되지 않았습니다. 현재는 누적 스냅샷이 쌓이는 구간부터 기간 차감 조회가 가능합니다.</div>}
                </details>
              </div>
            </article>;
          })}
        </section> : creativeGroups.length ? <section className={styles.summaryStack}>
          {creativeGroups.map((group) => {
            const total = creativeTotal(group.rows);
            const mediaInsights = relevantInsights(group.media);
            return <article key={group.media} className={styles.summaryCard}>
              <header className={styles.summaryHeader}>
                <div><span>매체</span><h2>{group.media}</h2></div>
                <div className={styles.summaryMeta}><span>전일 1일 성과 · {endDate}</span><span>{group.rows.length}개 소재</span></div>
              </header>
              <div className={styles.summaryTableWrap}>
                <table className={styles.summaryTable}>
                  <thead><tr><th>매체</th><th>광고 지면</th><th>소재</th><th>노출</th><th>클릭</th><th>CTR(%)</th></tr></thead>
                  <tbody>
                    {group.rows.map((row, index) => <tr key={`${row.sourceFile}-${row.sourceSheet}-${row.placement}-${row.creative}-${index}`}>
                      {index === 0 && <td rowSpan={group.rows.length} className={styles.mediaCell}>{group.media}</td>}
                      <td className={styles.placementCell}>{row.placement}</td><td className={styles.placementCell}>{row.creative}</td>
                      <td className={styles.numCell}>{formatBareCount(row.impressions)}</td><td className={styles.numCell}>{formatBareCount(row.clicks)}</td><td className={styles.numCell}>{formatRate(row.ctr)}</td>
                    </tr>)}
                    <tr className={styles.totalRow}><td colSpan={3}>합계 · {endDate}</td><td className={styles.numCell}>{formatBareCount(total.impressions)}</td><td className={styles.numCell}>{formatBareCount(total.clicks)}</td><td className={styles.numCell}>{formatRate(total.ctr)}</td></tr>
                  </tbody>
                </table>
              </div>
              {mediaInsights.length > 0 && <div className={styles.insightPanel}>
                <div className={styles.insightTitle}><strong>데일리 인사이트</strong><span>{endDate} 기준 · 메일 성과 요약</span></div>
                <div className={styles.insightList}>{mediaInsights.map((item) => <div className={styles.insightItem} key={item.key}><strong>{item.reportDate}</strong><div>{item.notes.slice(0, 8).map((note, index) => <p key={index}>{normalizeInsightText(note)}</p>)}</div></div>)}</div>
              </div>}
            </article>;
          })}
        </section> : <section className="card card-pad empty-state"><h2>{endDate} 소재별 성과가 없습니다.</h2><p>소재별 일별 성과가 포함된 데일리 파일을 다시 반영하면 해당 기준일 하루 성과만 표시됩니다.</p></section>}
      </>}
    </>
  );
}
