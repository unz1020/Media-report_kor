import type { MediaPlanFact } from './daily-report-parser';
import { canonicalMedia } from './media-normalization';
export type PlanField = keyof MediaPlanFact;
export type MediaMixAnalysis = {
  rows: MediaPlanFact[];
  providedFields: PlanField[][];
  warnings: string[];
  sheets: Array<{ name: string; rowCount: number; mappings: string[] }>;
  ignoredSheets: string[];
  excludedRows: number;
  duplicateRows: number;
};
export const PLAN_LABELS: Partial<Record<PlanField, string>> = {
  platform: '매체', product: '광고상품', placement: '게재지면', creativeName: '소재명',
  periodStart: '시작일', periodEnd: '종료일', budget: '예산', operationStatus: '집행상태',
  device: '기기', creativeType: '소재 유형', target: '타겟팅', expectedImpressions: '예상 노출', expectedClicks: '예상 클릭',
};
const normalized = (value: string | undefined) => (value || '').trim().toLowerCase().replace(/\s+/g, '');
export function planIdentity(row: MediaPlanFact) {
  return [canonicalMedia(row.platform), row.product, row.placement || row.product, row.creativeName, row.device].map(normalized).join('::');
}
export function planLabel(row: MediaPlanFact) {
  return `${canonicalMedia(row.platform)} › ${row.product}${row.creativeName ? ` › ${row.creativeName}` : ''}`;
}
export function mergeMediaMix(existing: MediaPlanFact[], analysis: MediaMixAnalysis, mode: 'merge' | 'replace') {
  const warnings: string[] = [];
  const rows = mode === 'replace' ? [] : existing.map(row => ({ ...row }));
  // Match against the original draft, so ambiguous incoming rows cannot overwrite each other.
  const original = [...rows];
  const incomingCounts = new Map<string, number>();
  for (const row of analysis.rows) incomingCounts.set(planIdentity(row), (incomingCounts.get(planIdentity(row)) || 0) + 1);
  const assignments = new Set<number>();
  analysis.rows.forEach((incoming, index) => {
    const provided = analysis.providedFields[index] || [];
    const matches = original.map((row, at) => ({ row, at })).filter(({ row }) =>
      canonicalMedia(row.platform) === canonicalMedia(incoming.platform) && normalized(row.product) === normalized(incoming.product) &&
      (['placement', 'creativeName', 'device'] as const).every(field => !provided.includes(field) || normalized(row[field]) === normalized(incoming[field])));
    const dated = matches.filter(({ row }) => row.periodStart === incoming.periodStart && row.periodEnd === incoming.periodEnd);
    const candidate = matches.length === 1 && incomingCounts.get(planIdentity(incoming)) === 1 ? matches[0] : dated.length === 1 ? dated[0] : undefined;
    if (mode === 'merge' && matches.length && (!candidate || assignments.has(candidate.at))) {
      warnings.push(`${planLabel(incoming)}: 동일한 운영안이 여러 개여서 자동 변경하지 않았습니다. 해당 행을 직접 확인해주세요.`);
      return;
    }
    if (candidate && mode === 'merge') {
      const changed = { ...candidate.row };
      for (const field of analysis.providedFields[index] || []) {
        if (field !== 'rowId') Object.assign(changed, { [field]: incoming[field] });
      }
      changed.sourceSheet = incoming.sourceSheet;
      rows[candidate.at] = changed;
      assignments.add(candidate.at);
    } else rows.push({ ...incoming, rowId: crypto.randomUUID() });
  });
  if (rows.length > 500) throw new Error('미디어믹스는 최대 500행까지 지원합니다.');
  return { rows, warnings };
}
export type PlanChange = { kind: '추가' | '변경' | '삭제'; label: string; fields: Array<{ label: string; before: unknown; after: unknown }> };
export function mediaMixChanges(before: MediaPlanFact[], after: MediaPlanFact[]): PlanChange[] {
  const used = new Set<number>();
  const changes: PlanChange[] = [];
  for (const row of after) {
    let index = row.rowId ? before.findIndex((old, at) => !used.has(at) && old.rowId === row.rowId) : -1;
    if (index < 0) index = before.findIndex((old, at) => !used.has(at) && planIdentity(old) === planIdentity(row));
    if (index < 0) { changes.push({ kind: '추가', label: planLabel(row), fields: (['periodStart', 'periodEnd', 'budget', 'operationStatus'] as PlanField[]).filter(field => row[field] != null && row[field] !== '').map(field => ({ label: PLAN_LABELS[field]!, before: null, after: row[field] })) }); continue; }
    used.add(index);
    const fields = (Object.keys(PLAN_LABELS) as PlanField[]).filter(field => (before[index][field] ?? '') !== (row[field] ?? '')).map(field => ({ label: PLAN_LABELS[field]!, before: before[index][field], after: row[field] }));
    if (fields.length) changes.push({ kind: '변경', label: planLabel(row), fields });
  }
  before.forEach((row, index) => { if (!used.has(index)) changes.push({ kind: '삭제', label: planLabel(row), fields: [] }); });
  return changes;
}
export function mediaMixGroups(rows: MediaPlanFact[]) {
  const groups = new Map<string, { media: string; products: Set<string>; count: number; budget: number | null; undated: number }>();
  for (const row of rows) {
    const media = canonicalMedia(row.platform);
    const group = groups.get(media) || { media, products: new Set<string>(), count: 0, budget: null, undated: 0 };
    group.products.add(row.product); group.count++;
    if (row.budget != null) group.budget = (group.budget || 0) + row.budget;
    if (!row.periodStart || !row.periodEnd) group.undated++;
    groups.set(media, group);
  }
  return [...groups.values()];
}
