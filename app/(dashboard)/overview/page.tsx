"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, publishedInsightsFor, type PublishedDataset, type PublishedInsight } from "@/lib/daily-report-store";
import { formatCount, formatKrw, formatRate, mediaPlansFromDatasets, rowsFromDatasets, summarizeRows } from "@/lib/reporting-data";
import { canonicalMedia, canonicalProduct, normalizeInsightText } from "@/lib/media-normalization";

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

  const rows = useMemo(() => rowsFromDatasets(datasets).map((row) => ({
    ...row,
    media: canonicalMedia(row.platform),
    product: canonicalProduct(row.platform, row.placement, row.sourceSheet),
  })), [datasets]);

  const rawPlans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);
  const plans = useMemo(() => rawPlans.map((plan) => ({
    ...plan,
    media: canonicalMedia(plan.platform),
    canonicalProduct: canonicalProduct(plan.platform, plan.product || plan.placement, plan.sourceSheet),
  })), [rawPlans]);

  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const totalBudget = useMemo(() => {
    const values = plans.map((item) => item.budget).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }, [plans]);

  const mediaRows = useMemo(() => {
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = grouped.get(row.media) ?? [];
      list.push(row);
      grouped.set(row.media, list);
    }
    return [...grouped.entries()].map(([media, items]) => ({
      media,
      summary: summarizeRows(items),
      products: Array.from(new Set(items.map((row) => row.product).filter(Boolean))),
      sourceCount: new Set(items.map((row) => row.sourceFile)).size,
    })).sort((a, b) => a.media.localeCompare(b.media, "ko"));
  }, [rows]);

  const latestInsight = insights.at(-1);
  const latestDate = datasets.map((item) => item.bundle.reportDate).filter(Boolean).sort().at(-1) || "";

  return (
    <>
      <div className="page-head refined-head">
        <div><div className="eyebrow">광고 운영 개요</div><h1 className="page-title">{advertiser} {Number(month.slice(5,7))}월 광고 운영 현황</h1><p className="page-desc">데일리 리포트와 미디어 운영안을 매체 → 광고상품 기준으로 통합해 보여줍니다.</p></div>
        <div className="page-meta"><span className="real-data-note">실데이터 기준</span></div>
      </div>

      {!datasets.length ? <section className="card card-pad empty-state"><h2>아직 {advertiser} 실데이터가 없습니다.</h2><p>데이터 업데이트에서 해당 광고주의 데일리 리포트를 반영하면 개요가 자동으로 채워집니다.</p></section> : <>
        <section className="metric-strip">
          <article className="metric-card primary-metric"><span className="metric-kicker">집행액</span><strong>{formatKrw(summary.spend)}</strong><div><span>원본 보고서 합계</span></div></article>
          <article className="metric-card"><span className="metric-kicker">월 예산</span><strong>{formatKrw(totalBudget)}</strong><div><span>미디어 운영안 기준</span></div></article>
          <article className="metric-card"><span className="metric-kicker">노출</span><strong>{formatCount(summary.impressions)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">클릭</span><strong>{formatCount(summary.clicks)}</strong><div><span>회 단위</span></div></article>
          <article className="metric-card"><span className="metric-kicker">CTR</span><strong>{formatRate(summary.ctr)}</strong><div><span>기준일 {latestDate || "미확인"}</span></div></article>
        </section>

        <section className="grid two-col section-space">
          <article className="card report-panel">
            <div className="report-panel-head"><div><h2>매체별 운영 현황</h2><p>동일 매체의 표기 차이는 통합하고 광고상품 수를 함께 표시합니다.</p></div><span className="view-pill">{mediaRows.length}개 매체</span></div>
            <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>광고상품</th><th>집행액</th><th>노출</th><th>클릭</th><th>CTR</th></tr></thead><tbody>{mediaRows.map((item) => <tr key={item.media}><td><strong>{item.media}</strong></td><td>{item.products.length ? `${item.products.slice(0,3).join(" · ")}${item.products.length > 3 ? ` 외 ${item.products.length - 3}` : ""}` : "-"}</td><td className="num-cell">{formatKrw(item.summary.spend)}</td><td className="num-cell">{formatCount(item.summary.impressions)}</td><td className="num-cell">{formatCount(item.summary.clicks)}</td><td className="num-cell">{formatRate(item.summary.ctr)}</td></tr>)}</tbody></table></div>
          </article>

          <aside className="card report-panel">
            <div className="report-panel-head"><div><h2>최근 데일리 인사이트</h2><p>메일 내용을 운영 현황과 성과 핵심만 읽기 쉽게 정리합니다.</p></div></div>
            <div className="notice-list">{latestInsight ? <><div className="notice"><span className="notice-dot good"/><div><strong>{latestInsight.reportDate}</strong><p>{normalizeInsightText(latestInsight.mailSubject)}</p></div></div>{latestInsight.notes.slice(0,6).map((note, index) => <div className="notice" key={index}><span className="notice-dot"/><div><p>{normalizeInsightText(note)}</p></div></div>)}</> : <div className="empty-inline">반영된 데일리 인사이트가 없습니다.</div>}</div>
          </aside>
        </section>

        <section className="card section-space report-panel">
          <div className="report-panel-head table-title-row"><div><h2>미디어 운영안</h2><p>미디어 운영안을 매체 → 광고상품 기준으로 정리합니다. 원본 시트명은 검산용으로만 유지합니다.</p></div><span className="view-pill">{plans.length}개 항목</span></div>
          {plans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>광고상품</th><th>기기/소재</th><th>기간</th><th>예산</th><th>예상 노출</th><th>예상 클릭</th><th>타겟팅</th></tr></thead><tbody>{plans.map((plan,index)=><tr key={`${plan.media}-${plan.canonicalProduct}-${index}`}><td><strong>{plan.media}</strong></td><td>{plan.canonicalProduct}</td><td>{[plan.device, plan.creativeType].filter(Boolean).join(" · ") || "-"}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td className="num-cell">{formatKrw(plan.budget)}</td><td className="num-cell">{formatCount(plan.expectedImpressions)}</td><td className="num-cell">{formatCount(plan.expectedClicks)}</td><td>{plan.target || "-"}</td></tr>)}</tbody></table></div> : <div className="card-pad empty-inline">현재 반영 파일에서 미디어 운영안을 찾지 못했습니다. 운영안 문서를 추가하면 이 영역에 자동 반영됩니다.</div>}
        </section>

        <details className="section-space">
          <summary style={{cursor:"pointer",fontSize:12,color:"#667085",fontWeight:600}}>원본 데이터 추적 정보</summary>
          <div className="card card-pad" style={{marginTop:10}}><p className="page-desc">현재 반영 원본 {datasets.length}개 · 원본 파일/시트명은 성과 상세의 추적 정보에서 확인할 수 있습니다.</p></div>
        </details>
      </>}
    </>
  );
}
