'use client';
import { useEffect, useState } from 'react';
import type { MediaPlanFact } from '@/lib/daily-report-parser';
import { mediaMixChanges, mediaMixGroups, type PlanChange } from '@/lib/media-mix-operations';
import { canonicalMedia } from '@/lib/media-normalization';
import { formatKrw } from '@/lib/reporting-data';
import styles from './media-mix-editor.module.css';
function valueText(value: unknown, label: string) {
  if (value == null || value === '') return '미입력';
  return typeof value === 'number' ? `${value.toLocaleString('ko-KR')}${label === '예산' ? '원' : ''}` : String(value);
}
export function PlanChanges({ changes }: { changes: PlanChange[] }) {
  return <div className={styles.changes} aria-label="운영안 변경 요약">
    <p><strong>추가 {changes.filter(item => item.kind === '추가').length}건 · 변경 {changes.filter(item => item.kind === '변경').length}건 · 삭제 {changes.filter(item => item.kind === '삭제').length}건</strong></p>
    {changes.length > 0 ? <ul>{changes.map((item, index) => <li key={index}><strong>{item.kind}</strong> {item.label}
      {item.fields.length > 0 && <span>{item.fields.map(field => `${field.label}: ${valueText(field.before, field.label)} → ${valueText(field.after, field.label)}`).join(' · ')}</span>}
    </li>)}</ul> : <p>운영안 내용의 변경이 없습니다.</p>}
  </div>;
}
export function MediaMixSummary({ rows }: { rows: MediaPlanFact[] }) {
  const groups = mediaMixGroups(rows);
  const budgetTotal = groups.reduce((s, g) => s + (g.budget || 0), 0);
  const metrics = (media: string, field: 'expectedImpressions' | 'expectedClicks' | 'expectedViews' | 'expectedGrp') => { const values = rows.filter(r => canonicalMedia(r.platform) === media).map(r => r[field]).filter((v): v is number => typeof v === 'number'); return values.length ? Math.round(values.reduce((a, b) => a + b, 0)).toLocaleString('ko-KR') : '—'; };
  return groups.length > 0 ? <div className={styles.summaryWrap}><table className={styles.summary} aria-label="매체별 운영안 정리"><thead><tr><th>매체</th><th>광고상품</th><th>운영안</th><th>계획 예산</th><th>예상 노출</th><th>예상 클릭</th><th>예상 조회</th><th>예상 GRP</th><th>일정 미입력</th></tr></thead><tbody>
    {groups.map(group => <tr key={group.media}><th scope="row">{group.media}</th><td>{[...group.products].join(' · ')}</td><td>{group.count}건</td><td>{formatKrw(group.budget)}<span aria-hidden="true" className={styles.budgetBar} style={{ width: `${budgetTotal ? (group.budget || 0) / budgetTotal * 100 : 0}%` }} /></td>{(['expectedImpressions', 'expectedClicks', 'expectedViews', 'expectedGrp'] as const).map(field => <td key={field}>{metrics(group.media, field)}</td>)}<td>{group.undated ? `${group.undated}건` : '—'}</td></tr>)}
  </tbody></table></div> : null;
}
type HistoryVersion = { id: string; capturedAt: string; actor: string; rows: MediaPlanFact[]; sourceFile: string; changeMemo: string };
export function MediaMixHistory({ advertiser, month }: { advertiser: string; month: string }) {
  const [open, setOpen] = useState(false), [history, setHistory] = useState<HistoryVersion[]>([]);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let request: AbortController | null = null;
    const load = async () => {
      request?.abort(); const controller = new AbortController(); request = controller;
      setLoading(true); setError('');
      try {
        const response = await fetch('/api/reporting/store', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, cache: 'no-store', body: JSON.stringify({ action: 'load_media_mix_history', advertiser, month }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '변경 이력을 불러오지 못했습니다.');
        if (alive && !controller.signal.aborted) setHistory(data.history || []);
      } catch (error) { if (alive && !controller.signal.aborted) setError(error instanceof Error ? error.message : '이력 조회 실패'); }
      finally { if (alive && !controller.signal.aborted) setLoading(false); }
    };
    void load(); window.addEventListener('media-report-daily-updated', load);
    return () => { alive = false; request?.abort(); window.removeEventListener('media-report-daily-updated', load); };
  }, [open, advertiser, month, retry]);
  return <div className={styles.history}>
    <button type="button" className="btn" aria-expanded={open} aria-controls="media-mix-history" onClick={() => setOpen(value => !value)}>운영안 변경 이력</button>
    {open && <div id="media-mix-history" aria-label="저장된 운영안 변경 이력">
      <p>최근 30회 저장 내역 · 저장 시점의 운영안을 이전 버전과 비교합니다.</p>
      {loading && <p role="status">변경 이력을 불러오고 있습니다…</p>}
      {error && <p role="alert">{error} <button type="button" className="btn" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></p>}
      {!loading && !error && !history.length && <p>아직 저장된 변경 이력이 없습니다.</p>}
      {!loading && !error && history.slice(0, 30).map((version, index) => <details className={styles.historyEntry} key={version.id}>
        <summary>{new Date(version.capturedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {version.actor || '팀 업데이트'} · {version.rows.length}개 운영안</summary>
        <p>원본: {version.sourceFile}</p>{version.changeMemo && <p className={styles.memo}>변경 메모: {version.changeMemo}</p>}
        <PlanChanges changes={mediaMixChanges(history[index + 1]?.rows || [], version.rows)} />
      </details>)}
    </div>}
  </div>;
}
