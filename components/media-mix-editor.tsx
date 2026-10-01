'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from './workspace-context';
import { hydratePublishedDailyState, publishedDatasetsFor, type PublishedDataset } from '@/lib/daily-report-store';
import { latestMediaMix, mediaPlansFromDatasets, formatKrw } from '@/lib/reporting-data';
import type { MediaPlanFact } from '@/lib/daily-report-parser';
import { normalizeMediaMix } from '@/supabase/functions/reporting-store/media-plan-input';
import { parseMediaMixFile } from '@/lib/media-mix-upload';
import { mediaMixChanges, mergeMediaMix, type MediaMixAnalysis } from '@/lib/media-mix-operations';
import { MediaMixHistory, MediaMixSummary, PlanChanges } from './media-mix-summary';
import styles from './media-mix-editor.module.css';
function emptyRow(month: string): MediaPlanFact {
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  return { rowId: crypto.randomUUID(), platform: '', product: '', placement: '', creativeName: '', creativeType: '', device: '', periodStart: month + '-01', periodEnd: end,
    budget: null, expectedImpressions: null, expectedClicks: null, target: '', sourceSheet: '직접 입력', operationStatus: '예정' };
}
const withIds = (rows: MediaPlanFact[]) => rows.map(row => ({ ...row, rowId: row.rowId || crypto.randomUUID() }));
const meaningful = (row: MediaPlanFact) => Boolean(row.platform || row.product || row.placement || row.creativeName || row.device || row.creativeType || row.target || row.budget != null || row.expectedImpressions != null || row.expectedClicks != null);
export function MediaMixEditor() {
  const { advertiser, month } = useWorkspace();
  return <Editor key={advertiser + month} />;
}
function Editor() {
  const { advertiser, month, canEdit, dataSyncState, refreshSession } = useWorkspace();
  const [datasets, setDatasets] = useState<PublishedDataset[]>([]);
  const [draft, setDraft] = useState<MediaPlanFact[] | null>(null), [baseline, setBaseline] = useState<MediaPlanFact[]>([]);
  const [version, setVersion] = useState<string | null>(null), [sourceFile, setSourceFile] = useState('직접 입력');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [appliedMode, setAppliedMode] = useState<'merge' | 'replace'>('merge');
  const [analysis, setAnalysis] = useState<MediaMixAnalysis | null>(null), [mergeWarnings, setMergeWarnings] = useState<string[]>([]);
  const [changeMemo, setChangeMemo] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const mounted = useRef(false), parsing = useRef<AbortController | null>(null), rowsRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    const load = () => setDatasets(publishedDatasetsFor(advertiser, month)); load();
    window.addEventListener('media-report-daily-updated', load);
    return () => { mounted.current = false; parsing.current?.abort(); window.removeEventListener('media-report-daily-updated', load); };
  }, [advertiser, month]);
  const saved = latestMediaMix(datasets), plans = mediaPlansFromDatasets(datasets);
  const changes = useMemo(() => draft ? mediaMixChanges(baseline, draft) : [], [baseline, draft]);
  function prepare() {
    const rows = withIds(plans);
    setBaseline(rows); setVersion(saved?.publishedAt || null);
    setSourceFile((saved?.bundle as { originalSourceFile?: string })?.originalSourceFile || '직접 입력');
    setError(''); setNotice(''); setAnalysis(null); setMergeWarnings([]); setChangeMemo('');
    return rows;
  }
  function focusNewRow() {
    requestAnimationFrame(() => { const region = rowsRegion.current; const row = region?.lastElementChild; if (region && row instanceof HTMLElement) { region.scrollTop = region.scrollHeight; row.querySelector<HTMLInputElement>('input')?.focus(); } });
  }
  function begin(add = false) {
    const rows = prepare(); setDraft(add || !rows.length ? [...rows, emptyRow(month)] : rows);
    if (add || !rows.length) focusNewRow();
  }
  function addRow() { setDraft(current => [...(current || []), emptyRow(month)]); focusNewRow(); }
  function patch(index: number, field: keyof MediaPlanFact, value: string) {
    const numeric = ['budget', 'expectedImpressions', 'expectedClicks'].includes(field);
    setDraft(current => current?.map((row, i) => i === index ? { ...row, [field]: numeric ? value === '' ? null : Number(value) : value } : row) ?? null);
  }
  async function importFile(file: File) {
    setBusy(true); setError(''); setNotice('미디어믹스 파일을 분석하고 있습니다…');
    parsing.current?.abort(); const controller = new AbortController(); parsing.current = controller;
    const initial = draft || withIds(plans);
    const expectedVersion = draft ? version : saved?.publishedAt || null;
    try {
      const result = await parseMediaMixFile(file, month, controller.signal);
      const merged = mergeMediaMix(initial.filter(meaningful), result, importMode);
      if (!mounted.current) return;
      if (!draft) { setBaseline(initial); setVersion(expectedVersion); setChangeMemo(''); }
      setDraft(merged.rows); setSourceFile(file.name); setAppliedMode(importMode); setAnalysis(result); setMergeWarnings(merged.warnings);
      setNotice(`${result.rows.length}행을 불러왔습니다. 광고주·월·기간·예산을 검수한 뒤 저장해주세요.`);
    } catch (error) { if (mounted.current) { setNotice(''); setError(error instanceof Error ? error.message : '파일 분석 실패'); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function save() {
    if (!draft || !canEdit || busy) return;
    setError(''); setNotice('');
    let input;
    try { input = normalizeMediaMix({ month, rows: draft, expectedUpdatedAt: version, sourceFile, changeMemo }); }
    catch (error) { setError(error instanceof Error ? error.message : '입력값을 확인해주세요.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/reporting/store', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save_media_mix', input: { ...input, advertiser } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === 'MEDIA_MIX_CHANGED' ? '다른 사용자가 미디어믹스를 변경했습니다. 입력 내용을 보관하고 취소 후 다시 불러와주세요.' : result.error || '미디어믹스 저장 실패');
      if (!mounted.current) return;
      setDraft(null); setAnalysis(null); setMergeWarnings([]); setChangeMemo(''); setNotice(`${month} 미디어믹스를 저장했습니다. 개요·일정·연결 대기 지면에 반영됩니다.`);
      try { await hydratePublishedDailyState(advertiser, month); await refreshSession(); }
      catch { if (mounted.current) setError('저장은 완료됐습니다. 새로고침해 반영 내용을 확인해주세요.'); }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : '저장 실패'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section className={`card card-pad ${styles.editor}`} aria-label="월 미디어믹스 업데이트">
    <div className={styles.head}><div><h2>{month} 미디어믹스</h2><p>{advertiser} · {plans.length}개 운영안 · 계획 예산 {formatKrw(plans.some(row => row.budget != null) ? plans.reduce((sum, row) => sum + (row.budget || 0), 0) : null)}</p></div>
      {!draft && canEdit && <div className={styles.actions}><button type="button" className="btn" disabled={dataSyncState !== 'ready' || busy} onClick={() => begin()}>미디어믹스 업데이트</button><button type="button" className="btn primary" disabled={dataSyncState !== 'ready' || busy || plans.length >= 500} onClick={() => begin(true)}>운영안 추가</button></div>}
    </div>
    <p>Excel·CSV를 최대 30MB까지 분석해 {Number(month.slice(5))}월 매체·상품·소재·기간·예산을 자동 정리합니다. 운영안 추가 또는 기존 행 편집으로 변경 내용을 이어서 관리하세요.</p>
    {saved && <small>마지막 반영: {new Date(saved.publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>}
    {canEdit && <div className={styles.importBox}>
      <div className={styles.actions}><label className="btn primary">Excel 자동 정리<input aria-label="미디어믹스 Excel" type="file" accept=".xlsx,.xls,.xlsb,.csv" disabled={busy || dataSyncState !== 'ready'} onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} /></label>
        <button type="button" className="btn" disabled={busy} onClick={async () => { try { (await import('@/lib/media-mix-workbook')).downloadMediaMixTemplate(); } catch { setError('양식을 불러오지 못했습니다.'); } }}>입력 양식 다운로드</button></div>
      <fieldset className={styles.importModes} disabled={busy}><legend>Excel 불러오기 시 반영 방식</legend><label><input type="radio" name="mix-mode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />기존 운영안에 추가·변경 병합</label><label><input type="radio" name="mix-mode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />월 운영안 전체 교체</label></fieldset>
      <p>병합은 같은 매체·상품·지면·소재·기기를 기준으로 일치하는 운영안의 제공된 값을 갱신합니다. 파일에 없는 기존 운영안과 값은 유지됩니다.</p>
    </div>}
    {analysis && <div className={styles.analysis} aria-label="Excel 자동 분석 결과"><h3>Excel 자동 분석 결과</h3>
      <p>{analysis.sheets.length}개 시트 · {analysis.rows.length}개 운영안 · 제외 {analysis.excludedRows}행 · 중복 {analysis.duplicateRows}행 · 적용 방식: {appliedMode === 'merge' ? '추가·변경 병합' : '전체 교체'}</p>
      <details><summary>인식한 시트·열 확인</summary>{analysis.sheets.map(sheet => <p key={sheet.name}><strong>{sheet.name} · {sheet.rowCount}행</strong><br />{sheet.mappings.join(' · ')}</p>)}{analysis.ignoredSheets.length > 0 && <p>제외 시트: {analysis.ignoredSheets.join(' · ')}</p>}</details>
      {[...analysis.warnings, ...mergeWarnings].length > 0 && <details open className={styles.warnings}><summary>확인이 필요한 항목 {[...analysis.warnings, ...mergeWarnings].length}건</summary><ul>{[...analysis.warnings, ...mergeWarnings].map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    </div>}
    <MediaMixSummary rows={draft || plans} />
    {draft && canEdit && <>
      <p className={styles.context}>저장 대상: <strong>{advertiser} / {month}</strong> · {sourceFile} · {draft.length}행. 아래 운영안과 변경 요약을 저장합니다.</p>
      <div className={styles.rows} ref={rowsRegion}>{draft.map((row, index) => <article key={row.rowId || index} className={styles.row}>
        <div className={styles.rowHead}><strong>운영안 {index + 1}</strong><button type="button" className="btn" disabled={busy} onClick={() => setDraft(current => current?.filter((_, i) => i !== index) ?? null)}>행 삭제</button></div>
        <div className={styles.fields}>{([
          ['platform', '매체 (대분류)', 'text'], ['product', '광고상품 (중분류)', 'text'], ['creativeName', '소재명 (소분류)', 'text'], ['placement', '게재지면', 'text'],
          ['periodStart', '시작일', 'date'], ['periodEnd', '종료일', 'date'], ['budget', '계획 예산 (원)', 'number'],
        ] as const).map(([field, label, type]) => <label key={field}>{label}<input aria-label={`${index + 1}행 ${label}`} type={type} min={type === 'number' ? 0 : undefined} value={row[field] ?? ''} disabled={busy} onChange={event => patch(index, field, event.target.value)} /></label>)}
          <label>집행상태<select aria-label={`${index + 1}행 집행상태`} value={row.operationStatus || '예정'} disabled={busy} onChange={event => patch(index, 'operationStatus', event.target.value)}>{['예정', '집행 중', '중단', '종료'].map(status => <option key={status}>{status}</option>)}</select></label>
        </div>
        <details><summary>기기·소재 유형·타겟팅·계획 KPI</summary><div className={styles.fields}>{([
          ['device', '기기', 'text'], ['creativeType', '소재 유형', 'text'], ['target', '타겟팅', 'text'], ['expectedImpressions', '예상 노출수', 'number'], ['expectedClicks', '예상 클릭수', 'number'],
        ] as const).map(([field, label, type]) => <label key={field}>{label}<input aria-label={`${index + 1}행 ${label}`} type={type} min={type === 'number' ? 0 : undefined} value={row[field] ?? ''} disabled={busy} onChange={event => patch(index, field, event.target.value)} /></label>)}</div></details>
      </article>)}</div>
      <label className={styles.memoInput}>변경 메모<textarea aria-label="운영안 변경 메모" maxLength={2000} rows={3} value={changeMemo} disabled={busy} onChange={event => setChangeMemo(event.target.value)} placeholder="예: GFA 예산 증액, 신규 소재 추가, 집행기간 변경" /></label>
      <PlanChanges changes={changes} />
      <div className={styles.actions}><button type="button" className="btn" disabled={busy || draft.length >= 500} onClick={addRow}>운영안 추가</button><button type="button" className="btn" disabled={busy} onClick={() => { setDraft(null); setAnalysis(null); setMergeWarnings([]); setError(''); setNotice(''); setSourceFile('직접 입력'); }}>취소</button><button type="button" className="btn primary" disabled={busy || dataSyncState !== 'ready'} onClick={save}>{busy ? '처리 중…' : '미디어믹스 저장'}</button></div>
    </>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    <MediaMixHistory advertiser={advertiser} month={month} />
  </section>;
}
