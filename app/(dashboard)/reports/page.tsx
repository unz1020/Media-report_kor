"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutCanvas, LayoutPanel, LayoutGroup } from "@/components/layout-canvas";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, publishedSnapshotsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, rowsFromDatasets, summarizeRows } from "@/lib/reporting-data";
import { DailyInsightHistory } from "@/components/daily-insight-history";

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
<LayoutCanvas page="reports">
    <LayoutPanel id="reports:조회 기간 · 필터:1" title="조회 기간 · 필터"><div className="report-toolbar"><div className="toolbar-group"><span className="toolbar-label">기간</span><input className="toolbar-control" type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/><span>–</span><input className="toolbar-control" type="date" value={to} min={from} onChange={(e)=>setTo(e.target.value)}/></div></div></LayoutPanel>

    <LayoutPanel id="reports:데일리 인사이트:2" title="데일리 인사이트"><section className="card section-space report-panel">
      <div className="report-panel-head"><div><h2>데일리 인사이트</h2><p>기간을 선택하고 날짜를 눌러 상세 내용을 확인하세요.</p></div><span className="view-pill">{filteredInsights.length}건</span></div>
      <DailyInsightHistory key={advertiser + month} insights={filteredInsights} />
    </section></LayoutPanel>

    {!datasets.length ? <LayoutPanel id="reports:반영된 성과 데이터가 없습니다.:3" title="반영된 성과 데이터가 없습니다."><section className="card card-pad empty-state"><h2>반영된 성과 데이터가 없습니다.</h2><p>성과 리포트를 반영하면 성과 요약과 원본 이력이 추가됩니다.</p></section></LayoutPanel> : <>
      <LayoutGroup>
<LayoutPanel id="reports:집행액:4" title="집행액" width={12}><article className="metric-card"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong></article></LayoutPanel>
<LayoutPanel id="reports:노출:5" title="노출" width={12}><article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong></article></LayoutPanel>
<LayoutPanel id="reports:클릭:6" title="클릭" width={12}><article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong></article></LayoutPanel>
<LayoutPanel id="reports:CTR:7" title="CTR" width={12}><article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong></article></LayoutPanel>
<LayoutPanel id="reports:원본 파일:8" title="원본 파일" width={12}><article className="metric-card"><span className="metric-kicker">원본 파일</span><strong>{datasets.length}</strong></article></LayoutPanel>
</LayoutGroup>

      <LayoutPanel id="reports:Snapshot 이력:9" title="Snapshot 이력"><section className="section-space">

        <article className="card report-panel"><div className="report-panel-head"><div><h2>Snapshot 이력</h2><p>더블체크 가능한 일자별 Fact 보관</p></div><span className="view-pill">{filteredSnapshots.length}건</span></div><div className="progress-list">{filteredSnapshots.length ? filteredSnapshots.map(item=><div className="notice" key={item.key}><span className="notice-dot good"/><div><strong>{item.bundle.reportDate} · {item.sourceFile}</strong><p>{item.bundle.parsedSheets.join(", ") || "파싱 시트 없음"}</p></div></div>) : <div className="empty-inline">선택 기간 Snapshot 없음</div>}</div></article>
      </section></LayoutPanel>

      <LayoutPanel id="reports:현재 월 최신 원본:10" title="현재 월 최신 원본"><section className="card section-space report-panel"><div className="report-panel-head"><div><h2>현재 월 최신 원본</h2><p>각 리포트 소스의 최신 누적 Excel · 이 영역은 검산/추적용입니다.</p></div></div><div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>파일</th><th>기준일</th><th>성과 시트</th><th>운영안 시트</th><th>지면</th><th>QA</th></tr></thead><tbody>{datasets.map(item=><tr key={item.key}><td><strong>{item.sourceFile}</strong></td><td>{item.bundle.reportDate || "미확인"}</td><td>{item.bundle.parsedSheets.join(", ") || "-"}</td><td>{item.bundle.planSourceSheets?.join(", ") || "-"}</td><td className="num-cell">{item.bundle.placements.length}개</td><td className="num-cell">{item.bundle.qa.mismatchedMailMetrics + item.bundle.qa.unmatchedMailMetrics}</td></tr>)}</tbody></table></div></section></LayoutPanel>
    </>}
  </LayoutCanvas>
</>;
}
