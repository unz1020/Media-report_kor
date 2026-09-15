"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, publishedSnapshotsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, rowsFromDatasets, summarizeRows } from "@/lib/reporting-data";

export default function ReportsPage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [snapshots, setSnapshots] = useState<PublishedDataset[]>([]);
  const [insights, setInsights] = useState<PublishedInsight[]>([]);
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(`${month}-${String(new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate()).padStart(2,"0")}`);

  useEffect(() => { setFrom(`${month}-01`); setTo(`${month}-${String(new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate()).padStart(2,"0")}`); }, [month]);
  useEffect(() => {
    const load = () => { setDatasets(publishedDatasetsFor(advertiser, month)); setSnapshots(publishedSnapshotsFor(advertiser, month)); setInsights(publishedInsightsFor(advertiser, month)); };
    load(); window.addEventListener("media-report-daily-updated", load); window.addEventListener("storage", load);
    return () => { window.removeEventListener("media-report-daily-updated", load); window.removeEventListener("storage", load); };
  }, [advertiser, month]);

  const filteredInsights = useMemo(() => insights.filter((item) => item.reportDate >= from && item.reportDate <= to), [insights, from, to]);
  const filteredSnapshots = useMemo(() => snapshots.filter((item) => item.bundle.reportDate >= from && item.bundle.reportDate <= to), [snapshots, from, to]);
  const summary = useMemo(() => summarizeRows(rowsFromDatasets(datasets)), [datasets]);

  return <>
    <div className="page-head"><div><div className="eyebrow">Reports · SOURCE HISTORY</div><h1 className="page-title">{advertiser} 리포트</h1><p className="page-desc">Daily Fact 원본, 전일 Insight, Snapshot 이력을 기간별로 확인합니다.</p></div></div>
    <div className="report-toolbar"><div className="toolbar-group"><span className="toolbar-label">기간</span><input className="toolbar-control" type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/><span>–</span><input className="toolbar-control" type="date" value={to} min={from} onChange={(e)=>setTo(e.target.value)}/></div></div>

    {!datasets.length ? <section className="card card-pad empty-state"><h2>반영된 리포트 데이터가 없습니다.</h2><p>Daily Monitoring을 반영한 뒤 이 화면에서 Fact와 Insight 이력을 확인할 수 있습니다.</p></section> : <>
      <section className="metric-strip"><article className="metric-card"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong></article><article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong></article><article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong></article><article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong></article><article className="metric-card"><span className="metric-kicker">원본 파일</span><strong>{datasets.length}</strong></article></section>

      <section className="grid two-col section-space">
        <article className="card report-panel"><div className="report-panel-head"><div><h2>Daily Insight</h2><p>메일 본문에서 가져온 전일 성과 정리</p></div><span className="view-pill">{filteredInsights.length}건</span></div><div className="insight-timeline">{filteredInsights.length ? filteredInsights.map(item=><div key={item.key}><strong>{item.reportDate}</strong><div><b>{item.mailSubject}</b>{item.notes.map((note,index)=><p key={index}>{note}</p>)}</div></div>) : <div className="empty-inline">선택 기간 Insight 없음</div>}</div></article>
        <article className="card report-panel"><div className="report-panel-head"><div><h2>Snapshot 이력</h2><p>더블체크 가능한 일자별 Fact 보관</p></div><span className="view-pill">{filteredSnapshots.length}건</span></div><div className="progress-list">{filteredSnapshots.length ? filteredSnapshots.map(item=><div className="notice" key={item.key}><span className="notice-dot good"/><div><strong>{item.bundle.reportDate} · {item.sourceFile}</strong><p>{item.bundle.parsedSheets.join(", ") || "파싱 시트 없음"}</p></div></div>) : <div className="empty-inline">선택 기간 Snapshot 없음</div>}</div></article>
      </section>

      <section className="card section-space report-panel"><div className="report-panel-head"><div><h2>현재 월 최신 원본</h2><p>각 리포트 소스의 최신 누적 Excel</p></div></div><div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>파일</th><th>기준일</th><th>성과 시트</th><th>운영안 시트</th><th>지면</th><th>QA</th></tr></thead><tbody>{datasets.map(item=><tr key={item.key}><td><strong>{item.sourceFile}</strong></td><td>{item.bundle.reportDate || "미확인"}</td><td>{item.bundle.parsedSheets.join(", ") || "-"}</td><td>{item.bundle.planSourceSheets?.join(", ") || "-"}</td><td className="num-cell">{item.bundle.placements.length}개</td><td className="num-cell">{item.bundle.qa.mismatchedMailMetrics + item.bundle.qa.unmatchedMailMetrics}</td></tr>)}</tbody></table></div></section>
    </>}
  </>;
}
