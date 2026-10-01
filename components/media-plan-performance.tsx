'use client';
import { useMemo, useState } from 'react';
import type { MediaPlanFact } from '@/lib/daily-report-parser';
import type { ReportingRow } from '@/lib/reporting-data';
import { canonicalMedia } from '@/lib/media-normalization';
import styles from './media-mix-editor.module.css';
const metrics = { spend: ['예산 / 집행액', 'budget'], impressions: ['노출', 'expectedImpressions'], clicks: ['클릭', 'expectedClicks'], views: ['조회', 'expectedViews'] } as const;
type Metric = keyof typeof metrics;
function sum(values: Array<number | null | undefined>) { const known = values.filter((v): v is number => typeof v === 'number'); return known.length ? known.reduce((a, b) => a + b, 0) : null; }
const count = (v: number | null) => v == null ? '—' : Math.round(v).toLocaleString('ko-KR');
export function MediaPlanPerformance({ plans, actual, period, selectedMedia }: { plans: MediaPlanFact[]; actual: ReportingRow[]; period: string; selectedMedia: string }) {
  const [metric, setMetric] = useState<Metric>('spend');
  const groups = useMemo(() => [...new Set(plans.map(r => canonicalMedia(r.platform)))].filter(media => selectedMedia === '전체 매체' || selectedMedia === media).map(media => {
    const planned = plans.filter(r => canonicalMedia(r.platform) === media), observed = actual.filter(r => canonicalMedia(r.platform) === media);
    return { media, planned: Object.fromEntries(Object.entries(metrics).map(([k, [, field]]) => [k, sum(planned.map(r => r[field]))])) as Record<Metric, number | null>, actual: Object.fromEntries(Object.keys(metrics).map(k => [k, sum(observed.map(r => r[k as Metric]))])) as Record<Metric, number | null>, grp: sum(planned.map(r => r.expectedGrp)) };
  }), [plans, actual, selectedMedia]);
  if (!groups.length) return null;
  const maximum = Math.max(1, ...groups.flatMap(g => [g.planned[metric] || 0, g.actual[metric] || 0]));
  return <section className="card card-pad" aria-label="미디어믹스 예상 및 실제 성과 비교"><div className={styles.rowHead}><h2>미디어믹스 · 예상 / 실제 비교</h2><label>비교 지표<select aria-label="예상 실제 비교 지표" value={metric} onChange={e => setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}</select></label></div>
    <p>월 운영안의 전체 예산·예상 성과와 {period} 실제 성과를 비교합니다. 예상치를 일별로 나누지 않으며, 보장 성과로 간주하지 않습니다.</p>
    <div className={styles.compareBars}>{groups.map(g => <div key={g.media}><strong>{g.media}</strong><div><span>계획 {count(g.planned[metric])}</span><i aria-hidden="true" style={{ width: `${(g.planned[metric] || 0) / maximum * 100}%` }} /></div><div><span>실제 {count(g.actual[metric])}</span><i aria-hidden="true" className={styles.actualBar} style={{ width: `${(g.actual[metric] || 0) / maximum * 100}%` }} /></div></div>)}</div>
    <div className={styles.summaryWrap}><table className={styles.summary}><thead><tr><th>매체</th><th>계획 예산 / 집행액 (원)</th><th>예상 / 실제 노출</th><th>예상 / 실제 클릭</th><th>예상 / 실제 조회</th><th>예상 GRP (TV)</th></tr></thead><tbody>{groups.map(g => <tr key={g.media}><th>{g.media}</th>{Object.keys(metrics).map(k => <td key={k}>{count(g.planned[k as Metric])} / {count(g.actual[k as Metric])}</td>)}<td>{count(g.grp)}</td></tr>)}</tbody></table></div>
  </section>;
}
