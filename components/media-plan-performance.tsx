'use client';
import { useMemo, useState } from 'react';
import { MediaLabel } from './media-label';
import type { MediaPlanFact } from '@/lib/daily-report-parser';
import type { ReportingRow } from '@/lib/reporting-data';
import type { PublishedDataset } from '@/lib/daily-report-store';
import { canonicalMedia } from '@/lib/media-normalization';
import styles from './media-mix-editor.module.css';
const metrics = { spend: ['예산 / 집행액', 'budget'], impressions: ['노출', 'expectedImpressions'], clicks: ['클릭', 'expectedClicks'], views: ['조회', 'expectedViews'] } as const;
type Metric = keyof typeof metrics;
function sum(values: Array<number | null | undefined>) { const known = values.filter((v): v is number => typeof v === 'number'); return known.length ? known.reduce((a, b) => a + b, 0) : null; }
const count = (v: number | null) => v == null ? '—' : Math.round(v).toLocaleString('ko-KR');
/** Explicitly source-audited links. Values are guards, not substitutes for the stored plan.
 * Any plan edit, source family change or differing target withholds comparison until re-audited. */
const VERIFIED_GOALS = [{
  rowId: 'e7d49ccd-73aa-4031-9dbb-50d0e1839184', advertiser: '자코모', month: '2026-10',
  sourceId: '자코모 26년 10월 당근,키즈노트,틱톡,마미톡 데일리 리포트',
  media: '틱톡', placement: '틱톡', sourceFile: '자코모_26년 10월 당근,키즈노트,틱톡,마미톡,애드부스트스크린_데일리 리포트_261030.xlsx', reportDate: '2026-10-29', impressions: 5836018.6179735055, clicks: 170748.29931972787,
}] as const;
const closeNumber = (a: unknown, b: number) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a-b) <= Math.max(1e-6, Math.abs(b)*1e-9);
export function sourceVerifiedProgress(plans: MediaPlanFact[], datasets: PublishedDataset[], startDate: string, endDate: string) {
  return VERIFIED_GOALS.flatMap(link => {
    const matches=plans.filter(p=>p.rowId===link.rowId);
    if(matches.length!==1) return [];
    const plan=matches[0];
    if(canonicalMedia(plan.platform)!==link.media || plan.placement!==link.placement || startDate!==plan.periodStart || !plan.periodEnd || endDate>plan.periodEnd) return [];
    const candidates=datasets.filter(d=>d.advertiser===link.advertiser && d.month===link.month && d.sourceFile===link.sourceFile && d.bundle.reportDate===link.reportDate && d.bundle.advertiser===link.advertiser && (d.bundle as typeof d.bundle & {sourceId?:string}).sourceId===link.sourceId && d.bundle.campaignStart===startDate && d.bundle.reportDate>=startDate && d.bundle.reportDate<=endDate && d.bundle.reportDate<=plan.periodEnd);
    if(!candidates.length) return [];
    const last=candidates.map(d=>d.bundle.reportDate).sort().at(-1)!;
    const latest=candidates.filter(d=>d.bundle.reportDate===last).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    if(latest.length>1 && latest[0].publishedAt===latest[1].publishedAt) return [];
    const d=latest[0], rows=d.bundle.placements.filter(r=>canonicalMedia(r.platform)===link.media && r.placement===link.placement);
    if(rows.length!==1) return [];
    // This audited report's Overall row is month-to-date. Both actual metrics come from that same row; clicks has no separate target field in the imported fact.
    const row=rows[0], sameMedia=d.bundle.placements.filter(r=>canonicalMedia(r.platform)===link.media);
    if(sameMedia.length!==1) return [];
    const sourceTarget=typeof row.guaranteed==='string' && /^\d+(?:\.\d+)?$/.test(row.guaranteed.replace(/,/g,''))?Number(row.guaranteed.replace(/,/g,'')):NaN;
    if(!closeNumber(sourceTarget,link.impressions)) return [];
    return ([['impressions','노출',link.impressions],['clicks','클릭',link.clicks]] as const).flatMap(([key,label,auditedTarget])=>{
      const target=key==='impressions'?plan.expectedImpressions:plan.expectedClicks, value=row[key];
      if(!closeNumber(target,auditedTarget)||typeof value!=='number'||!Number.isFinite(value)||value<0) return [];
      const ratio=value/auditedTarget*100;
      return Number.isFinite(ratio)?[{plan,label,target:target as number,value,sourceFile:d.sourceFile,reportDate:d.bundle.reportDate,ratio}]:[];
    });
  });
}
export function MediaPlanPerformance({ plans, actual, period, selectedMedia, datasets = [], startDate = '', endDate = '', baselineComplete = false }: { plans: MediaPlanFact[]; actual: ReportingRow[]; period: string; selectedMedia: string; datasets?: PublishedDataset[]; startDate?: string; endDate?: string; baselineComplete?: boolean }) {
  const [metric, setMetric] = useState<Metric>('spend');
  const groups = useMemo(() => [...new Set(plans.map(r => canonicalMedia(r.platform)))].filter(media => selectedMedia === '전체 매체' || selectedMedia === media).map(media => {
    const planned = plans.filter(r => canonicalMedia(r.platform) === media), observed = actual.filter(r => canonicalMedia(r.platform) === media);
    return { media, planned: Object.fromEntries(Object.entries(metrics).map(([k, [, field]]) => [k, sum(planned.map(r => r[field]))])) as Record<Metric, number | null>, actual: Object.fromEntries(Object.keys(metrics).map(k => [k, sum(observed.map(r => r[k as Metric]))])) as Record<Metric, number | null>, grp: sum(planned.map(r => r.expectedGrp)) };
  }), [plans, actual, selectedMedia]);
  const progress = baselineComplete ? sourceVerifiedProgress(plans, datasets, startDate, endDate).filter(p => selectedMedia === '전체 매체' || canonicalMedia(p.plan.platform) === selectedMedia) : [];
  if (!groups.length) return null;
  const maximum = Math.max(1, ...groups.flatMap(g => [g.planned[metric] || 0, g.actual[metric] || 0]));
  return <section className="card card-pad" aria-label="미디어믹스 예상 및 실제 성과 비교"><div className={styles.rowHead}><h2>미디어믹스 · 예상 / 실제 비교</h2><label>비교 지표<select aria-label="예상 실제 비교 지표" value={metric} onChange={e => setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}</select></label></div>
    <p>월 운영안의 전체 예산·예상 성과와 {period} 실제 성과를 비교합니다. 예상치를 일별로 나누지 않으며, 보장 성과로 간주하지 않습니다.</p>
    <section className={styles.goalPanel} aria-label="원본 대조된 예상 성과 진행"><h3>예상 성과 대비 진행</h3><p>월 예상치와 대조된 원본의 누적 수치만 표시합니다. 보장이나 최종 운영안 확정을 뜻하지 않습니다. 선택 기간은 계획 시작일부터 보고 기준일까지여야 합니다.</p>{progress.length ? <ul>{progress.map(({plan,label,target,value,sourceFile,reportDate,ratio}) => <li key={`${plan.rowId}:${label}`}><strong><MediaLabel media={plan.platform}/> · 예상 {label}</strong><span>{count(value)} / {count(target)} · {ratio.toFixed(1)}%{ratio>100?" · 예상 초과":""}</span><div className={`${styles.goalTrack} ${ratio>100?styles.goalOver:""}`} aria-hidden="true"><i style={{width:`${Math.min(100, Math.max(0,ratio))}%`}} /></div><small>보고 기준 {reportDate} · 계획 {plan.periodStart} ~ {plan.periodEnd} · 출처 {sourceFile}</small>{plan.sourceNotes && <small>{plan.sourceNotes}</small>}</li>)}</ul> : <p>원본과 지면·기간을 확인한 비교가 아직 없습니다. 미제공은 0이 아닙니다.</p>}<small>다른 매체·보고서는 원본 연결과 누적 범위가 확인되기 전 진행률을 계산하지 않습니다.</small></section>
    <p>아래 표와 막대는 매체 단위 합산 참고치이며, 위 진행률과 달리 지면별 원본 연결을 검증한 값이 아닙니다.</p>
    <div className={styles.compareBars}>{groups.map(g => <div key={g.media}><strong><MediaLabel media={g.media} size="md"/></strong><div><span>계획 {count(g.planned[metric])}</span><i aria-hidden="true" style={{ width: `${(g.planned[metric] || 0) / maximum * 100}%` }} /></div><div><span>실제 {count(g.actual[metric])}</span><i aria-hidden="true" className={styles.actualBar} style={{ width: `${(g.actual[metric] || 0) / maximum * 100}%` }} /></div></div>)}</div>
    <div className={styles.summaryWrap}><table className={styles.summary}><thead><tr><th>매체</th><th>계획 예산 / 집행액 (원)</th><th>예상 / 실제 노출</th><th>예상 / 실제 클릭</th><th>예상 / 실제 조회</th><th>예상 GRP (TV)</th></tr></thead><tbody>{groups.map(g => <tr key={g.media}><th><MediaLabel media={g.media}/></th>{Object.keys(metrics).map(k => <td key={k}>{count(g.planned[k as Metric])} / {count(g.actual[k as Metric])}</td>)}<td>{count(g.grp)}</td></tr>)}</tbody></table></div>
  </section>;
}
