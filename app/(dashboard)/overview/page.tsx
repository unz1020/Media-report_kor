"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, mediaPlansFromDatasets, rowsFromDatasets, summarizeRows } from "@/lib/reporting-data";

export default function OverviewPage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [insights, setInsights] = useState<PublishedInsight[]>([]);

  useEffect(() => {
    const load = () => {
      setDatasets(publishedDatasetsFor(advertiser, month));
      setInsights(publishedInsightsFor(advertiser, month));
    };
    load();
    window.addEventListener("media-report-daily-updated", load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener("media-report-daily-updated", load); window.removeEventListener("storage", load); };
  }, [advertiser, month]);

  const rows = useMemo(() => rowsFromDatasets(datasets), [datasets]);
  const plans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);
  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const totalBudget = useMemo(() => {
    const values = plans.map((item) => item.budget).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }, [plans]);
  const mediaRows = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.platform) ?? [];
      list.push(row);
      grouped.set(row.platform, list);
    }
    return [...grouped.entries()].map(([platform, items]) => ({ platform, summary: summarizeRows(items), items }));
  }, [rows]);
  const latestInsight = insights.at(-1);
  const latestDate = datasets.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1) || "";

  return (
    <>
      <div className="page-head refined-head">
        <div><div className="eyebrow">Overview · SOURCE ONLY</div><h1 className="page-title">{advertiser} {Number(month.slice(5,7))}월 광고 운영 현황</h1><p className="page-desc">실제 반영된 Daily Monitoring과 문서 내 Media Mix만 사용합니다.</p></div>
        <div className="page-meta"><span className="real-data-note">임의 수치 사용 안 함</span></div>
      </div>

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 {advertiser} 실데이터가 없습니다.</h2><p>Data Update에서 해당 광고주의 Daily Monitoring을 반영하면 Overview가 자동으로 채워집니다.</p></section> : <>
        <section className="metric-strip">
          <article className="metric-card primary-metric"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong><div><span>원본 보고서 합계</span></div></article>
          <article className="metric-card"><span className="metric-kicker">월 예산</span><strong>{formatKrw(totalBudget)}</strong><div><span>Media Mix 기준</span></div></article>
          <article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong><div><span>기준일 {latestDate || "미확인"}</span></div></article>
        </section>

        <section className="grid two-col section-space">
          <article className="card report-panel">
            <div className="report-panel-head"><div><h2>매체 운영 현황</h2><p>반영된 원본 파일에서 확인된 매체만 표시합니다.</p></div><span className="view-pill">{mediaRows.length} 매체</span></div>
            <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th><th>Source</th></tr></thead><tbody>{mediaRows.map((item) => <tr key={item.platform}><td><strong>{item.platform}</strong></td><td className="num-cell">{formatKrw(item.summary.spend)}</td><td className="num-cell">{formatCount(item.summary.impressions)}</td><td className="num-cell">{formatCount(item.summary.clicks)}</td><td className="num-cell">{formatRate(item.summary.ctr)}</td><td>{new Set(item.items.map((row) => row.sourceFile)).size} file</td></tr>)}</tbody></table></div>
          </article>

          <aside className="card report-panel">
            <div className="report-panel-head"><div><h2>최근 Daily Insight</h2><p>메일 본문 기반 · Fact와 분리</p></div></div>
            <div className="notice-list">{latestInsight ? <><div className="notice"><span className="notice-dot good"/><div><strong>{latestInsight.reportDate}</strong><p>{latestInsight.mailSubject}</p></div></div>{latestInsight.notes.slice(0,5).map((note, index) => <div className="notice" key={index}><span className="notice-dot"/><div><p>{note}</p></div></div>)}</> : <div className="empty-inline">반영된 Daily Insight가 없습니다.</div>}</div>
          </aside>
        </section>

        <section className="card section-space report-panel">
          <div className="report-panel-head table-title-row"><div><h2>문서에서 확인된 미디어 운영안</h2><p>Excel의 Media Mix / 광고 상품 / 일정 / 예산 필드를 그대로 정규화합니다.</p></div><span className="view-pill">{plans.length}개 항목</span></div>
          {plans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>상품/지면</th><th>기간</th><th>예산</th><th>예상 노출</th><th>예상 클릭</th><th>타겟팅</th><th>Source Sheet</th></tr></thead><tbody>{plans.map((plan,index)=><tr key={`${plan.platform}-${plan.product}-${index}`}><td><strong>{plan.platform}</strong></td><td>{plan.product || plan.placement}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td className="num-cell">{formatKrw(plan.budget)}</td><td className="num-cell">{formatCount(plan.expectedImpressions)}</td><td className="num-cell">{formatCount(plan.expectedClicks)}</td><td>{plan.target || "-"}</td><td>{plan.sourceSheet}</td></tr>)}</tbody></table></div> : <div className="card-pad empty-inline">현재 반영 파일에서 Media Mix 운영안을 찾지 못했습니다. 운영안 문서를 추가하면 이 영역에 자동 반영됩니다.</div>}
        </section>
      </>}
    </>
  );
}
