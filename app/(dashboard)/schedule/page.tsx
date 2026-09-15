"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { publishedDatasetsFor, type PublishedDataset } from "@/lib/daily-report-store";
import { formatKrw, mediaPlansFromDatasets } from "@/lib/reporting-data";
import { canonicalMedia, canonicalProduct } from "@/lib/media-normalization";
import styles from "./schedule.module.css";

export default function SchedulePage() {
  const { advertiser, month } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const load = () => setDatasets(publishedDatasetsFor(advertiser, month));
    load(); window.addEventListener("media-report-daily-updated", load); window.addEventListener("storage", load);
    return () => { window.removeEventListener("media-report-daily-updated", load); window.removeEventListener("storage", load); };
  }, [advertiser, month]);

  const plans = useMemo(() => mediaPlansFromDatasets(datasets)
    .filter((item) => !item.periodStart || item.periodStart.startsWith(month))
    .map((item) => ({
      ...item,
      media: canonicalMedia(item.platform),
      canonicalProduct: canonicalProduct(item.platform, item.product || item.placement, item.sourceSheet),
    })), [datasets, month]);

  useEffect(() => setSelectedIndex(0), [advertiser, month, plans.length]);

  const selected = plans[selectedIndex] ?? plans[0];
  const monthNumber = Number(month.slice(5,7));
  const daysInMonth = new Date(Number(month.slice(0,4)), monthNumber, 0).getDate();
  const canonicalMediaCount = new Set(plans.map((item) => item.media)).size;

  const timeline = useMemo(() => plans.map((plan, index) => {
    const start = Number((plan.periodStart || `${month}-01`).slice(-2)) || 1;
    const end = Number((plan.periodEnd || `${month}-${daysInMonth}`).slice(-2)) || daysInMonth;
    return { plan, index, start: Math.max(1,start), end: Math.min(daysInMonth,end) };
  }), [plans, month, daysInMonth]);

  return <>
    <div className="page-head refined-head"><div><div className="eyebrow">Schedule · MEDIA → PRODUCT</div><h1 className="page-title">{advertiser} 광고 온에어</h1><p className="page-desc">Media Mix를 매체 → 광고상품 기준으로 통합해 일정과 운영 조건을 보여줍니다. 동일 매체의 표기 차이는 자동 정규화합니다.</p></div><div className="page-meta"><span className="view-pill">{month}</span></div></div>

    {!plans.length ? <section className="card card-pad empty-state"><h2>운영안 일정 데이터가 없습니다.</h2><p>Media Mix 또는 운영안 문서를 반영하면 매체별 온에어 기간이 자동 생성됩니다. 임의 일정은 표시하지 않습니다.</p></section> : <>
      <section className={styles.monthSummary}>
        <div className={styles.summaryLead}><span>{month}</span><strong>{monthNumber}월 운영 요약</strong><p>운영안 {plans.length}개 · 매체 {canonicalMediaCount}개</p></div>
        <div className={styles.promoSummary}><div className={styles.promoCard}><span>프로모션</span><strong>원본 데이터 대기</strong><small>프로모션 일정 문서/메일이 연결되면 자동 반영</small></div></div>
        <div className={styles.summaryStats}><div><span>운영안</span><strong>{plans.length}</strong></div><div><span>매체</span><strong>{canonicalMediaCount}</strong></div><div><span>Source</span><strong>{new Set(plans.map(item=>item.sourceSheet)).size}</strong></div></div>
      </section>

      <section className={styles.timelineSection}>
        <div className={styles.sectionHead}><div><h2>매체별 온에어 타임라인</h2><p>매체 아래 광고상품 단위로 일정이 정리됩니다.</p></div><span>{month}</span></div>
        <div className={styles.gantt}>
          <div className={styles.ganttHeader}><span>매체 / 광고상품</span><div className={styles.ganttDays}>{[1,5,10,15,20,25,daysInMonth].filter((v,i,a)=>a.indexOf(v)===i).map(day=><i key={day}>{day}</i>)}</div></div>
          {timeline.map(({plan,index,start,end}) => {
            const left=((start-1)/daysInMonth)*100; const width=((end-start+1)/daysInMonth)*100;
            return <button key={`${plan.media}-${plan.canonicalProduct}-${index}`} type="button" className={`${styles.ganttRow} ${selectedIndex===index?styles.ganttRowActive:""}`} onClick={()=>setSelectedIndex(index)}><div className={styles.ganttName}><span className={`${styles.categoryDot} ${styles.digital}`}/><div><strong>{plan.media}</strong><small>{plan.canonicalProduct}</small></div></div><div className={styles.ganttTrack}><span className={`${styles.ganttBar} ${styles.digital}`} style={{left:`${left}%`,width:`${width}%`}}>{start}–{end}</span></div><span className={styles.viewPlacement}>운영안 보기 →</span></button>;
          })}
        </div>
      </section>

      {selected && <section className="card section-space report-panel"><div className="report-panel-head"><div><h2>{selected.media} · {selected.canonicalProduct}</h2><p>운영 조건 · 원본 {selected.sourceSheet}</p></div><span className="view-pill">Source plan</span></div><div className="table-wrap report-table-wrap"><table className="report-table"><tbody><tr><th>집행기간</th><td>{selected.periodStart || "-"} – {selected.periodEnd || "-"}</td><th>예산</th><td>{formatKrw(selected.budget)}</td></tr><tr><th>기기</th><td>{selected.device || "-"}</td><th>소재</th><td>{selected.creativeType || "-"}</td></tr><tr><th>타겟팅</th><td colSpan={3}>{selected.target || "-"}</td></tr></tbody></table></div><div className="card-pad empty-inline">게재지면 이미지/랜딩 URL은 Creative & Placement 원본이 연결되면 이 광고상품과 자동 매칭합니다.</div></section>}
    </>}
  </>;
}
