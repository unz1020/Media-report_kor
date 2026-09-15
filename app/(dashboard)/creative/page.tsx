"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, type PublishedDataset } from "@/lib/daily-report-store";
import { mediaPlansFromDatasets } from "@/lib/reporting-data";

export default function CreativePage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  useEffect(() => {
    const load = () => setDatasets(publishedDatasetsFor(advertiser, month));
    load(); window.addEventListener("media-report-daily-updated", load); window.addEventListener("storage", load);
    return () => { window.removeEventListener("media-report-daily-updated", load); window.removeEventListener("storage", load); };
  }, [advertiser, month]);
  const plans = useMemo(() => mediaPlansFromDatasets(datasets), [datasets]);

  return <>
    <div className="page-head"><div><div className="eyebrow">Creative & Placement · SOURCE ONLY</div><h1 className="page-title">{advertiser} 소재 · 게재지면</h1><p className="page-desc">실제 소재/게재 이미지가 연결되기 전에는 샘플 이미지를 표시하지 않습니다.</p></div><div className="page-meta"><span className="view-pill">{month}</span></div></div>
    <section className="card card-pad"><div className="report-panel-head"><div><h2>업데이트 방식</h2><p>Google Drive 폴더 또는 이미지/영상 일괄 업로드 → 파일/폴더/이미지 내용 자동 분석 → 운영안과 자동 매칭 → 애매한 항목만 AE 확인</p></div></div></section>
    <section className="card section-space report-panel"><div className="report-panel-head"><div><h2>운영안 기준 연결 대기 지면</h2><p>현재 문서에서 확인된 매체/상품만 보여줍니다.</p></div><span className="view-pill">{plans.length}개</span></div>{plans.length ? <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>매체</th><th>상품/지면</th><th>기간</th><th>소재 유형</th><th>게재 이미지</th><th>Landing URL</th><th>UTM</th></tr></thead><tbody>{plans.map((plan,index)=><tr key={`${plan.platform}-${plan.product}-${index}`}><td><strong>{plan.platform}</strong></td><td>{plan.product || plan.placement}</td><td>{plan.periodStart || "-"} – {plan.periodEnd || "-"}</td><td>{plan.creativeType || "-"}</td><td><span className="badge review">미연결</span></td><td>데이터 없음</td><td>데이터 없음</td></tr>)}</tbody></table></div> : <div className="card-pad empty-inline">운영안 및 소재 원본이 아직 연결되지 않았습니다.</div>}</section>
  </>;
}
