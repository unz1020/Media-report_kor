'use client';
import { useMemo, useState } from 'react';
import type { MediaMixAnalysis } from '@/lib/media-mix-operations';
import { resolveWorkbookReview } from '@/lib/media-mix-operations';
import { formatKrw } from '@/lib/reporting-data';
import type { MediaPlanFact } from '@/lib/daily-report-parser';
import styles from './media-mix-editor.module.css';
function total(rows: MediaPlanFact[], field: 'budget' | 'expectedImpressions' | 'expectedClicks' | 'expectedViews' | 'expectedGrp') {
  const values = rows.map(row => row[field]).filter((v): v is number => typeof v === 'number');
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0)).toLocaleString('ko-KR') : '—';
}
export function MediaMixSourceReview({ analysis, onApply, onCancel }: { analysis: MediaMixAnalysis; onApply: (value: MediaMixAnalysis) => void; onCancel: () => void }) {
  const review = analysis.review!;
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(review.groups.map(g => [g.id, g.selected])));
  const [included, setIncluded] = useState<Record<string, boolean>>(() => Object.fromEntries(review.groups.map(g => [g.id, g.included])));
  const [acknowledged, setAcknowledged] = useState(false);
  const unresolved = review.groups.filter(g => included[g.id] && !choices[g.id]);
  const preview = useMemo(() => {
    try { return resolveWorkbookReview(analysis, Object.fromEntries(review.groups.map(g => [g.id, choices[g.id] || 'summary'])), included); }
    catch { return null; }
  }, [analysis, choices, included, review]);
  function apply() {
    const result = resolveWorkbookReview(analysis, choices, included);
    const updatedReview = { ...review, groups: review.groups.map(g => ({ ...g, selected: choices[g.id], included: included[g.id] })) };
    onApply({ ...result, review: updatedReview });
  }
  return <div className={styles.analysis} aria-label="미디어 제안 선택 및 검증">
    <h3>Summary · 상세 운영안 분석 결과</h3>
    <p>Summary 예산 {formatKrw(review.summaryTotal)} · 반영 예정 {formatKrw(preview?.rows.reduce((s, r) => s + (r.budget || 0), 0) ?? null)} · VAT 별도</p>
    <p>복수 제안과 수치가 다른 항목은 반영할 안을 선택해주세요. 예상 성과는 실제 집행 성과와 구분해 저장합니다.</p>
    <details><summary>시트 분류 확인 · {review.inventory.length}개</summary><ul>{review.inventory.map(item => <li key={item.name}>{item.kind} · {item.name}</li>)}</ul></details>
    <div className={styles.reviewGroups}>{review.groups.map(group => <article className={styles.reviewGroup} key={group.id}>
      <div className={styles.rowHead}><strong>{group.label}</strong><label><input type="checkbox" aria-label={`${group.label} 반영`} checked={included[group.id]} onChange={e => { setIncluded(current => ({ ...current, [group.id]: e.target.checked })); setAcknowledged(false); }} />반영</label></div>
      <p>{group.summaryRows[0]?.proposalStatus || '제안'} · {group.summaryRows[0]?.category} · Summary 예산 {formatKrw(group.summaryRows.reduce((s, r) => s + (r.budget || 0), 0))}{!group.included && ' · 기본 제외 후보'}</p>
      <label className={styles.reviewSelect}>반영할 제안<select aria-label={`${group.label} 제안 선택`} disabled={!included[group.id]} value={choices[group.id] || ''} onChange={e => { setChoices(current => ({ ...current, [group.id]: e.target.value })); setAcknowledged(false); }}><option value="">선택 필요</option>{group.options.map(o => <option value={o.id} key={o.id}>{o.label}</option>)}</select></label>
      <details open={group.options.length > 1 && included[group.id]}><summary>제안별 예산·예상 성과 비교</summary><div className={styles.summaryWrap}><table className={styles.summary}><thead><tr><th>제안</th><th>예산 (원)</th><th>예상 노출</th><th>예상 클릭</th><th>예상 조회</th><th>예상 GRP</th></tr></thead><tbody>{group.options.map(o => <tr key={o.id}><th>{o.label}</th>{(['budget', 'expectedImpressions', 'expectedClicks', 'expectedViews', 'expectedGrp'] as const).map(field => <td key={field}>{total(o.rows, field)}</td>)}</tr>)}</tbody></table></div>
        {group.options.map(o => <details key={o.id}><summary>{o.label} · 상품 {o.rows.length}개 · 확인 {o.warnings.length}건</summary>{o.warnings.length > 0 && <ul>{o.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}<ul>{o.rows.map((r, i) => <li key={i}>{r.platform} › {r.product} › {r.placement}{r.creativeName ? ` › ${r.creativeName}` : ''} · {formatKrw(r.budget)} · {r.periodStart || '일정 미정'} ~ {r.periodEnd || '미정'} · {r.sourceSheet} {r.sourceCell}{r.sourceNotes && <p>{r.sourceNotes}</p>}</li>)}</ul></details>)}
      </details>
    </article>)}</div>
    {preview && preview.warnings.length > 0 && <details open className={styles.warnings}><summary>선택한 안의 확인 항목 · {preview.warnings.length}건</summary><ul>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
    {unresolved.length > 0 && <p role="status">제안 선택이 필요한 항목 {unresolved.length}개. 선택 전 미리보기는 Summary 기준입니다.</p>}
    <label className={styles.reviewAck}><input type="checkbox" aria-label="예산 및 예상 성과 검증 결과 확인" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />제안 선택과 예산·예상 성과의 차이를 확인했습니다.</label>
    <div className={styles.actions}><button className="btn" type="button" onClick={onCancel}>분석 취소</button><button className="btn primary" type="button" disabled={!preview || unresolved.length > 0 || !acknowledged} onClick={apply}>선택한 운영안 반영</button></div>
  </div>;
}
