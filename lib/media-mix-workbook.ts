import * as XLSX from 'xlsx';
import type { MediaPlanFact } from './daily-report-parser';
import { PLAN_LABELS, type MediaMixAnalysis, type PlanField } from './media-mix-operations';
import { canonicalMedia } from './media-normalization';
const key = (value: unknown) => String(value ?? '').toLowerCase().replace(/[\s_()（）·%\-.:/]/g, '');
const text = (value: unknown) => String(value ?? '').trim();
const patterns: Partial<Record<PlanField, RegExp>> = {
  platform: /^(매체|매체명|광고매체|매체구분|플랫폼|대분류|media|channel|구분)$/,
  product: /^(광고상품|광고상품명|매체상품|상품|상품명|상품유형|광고유형|중분류|product|adproduct)$/,
  placement: /^(지면|광고지면|게재지면|게재위치|placement)$/,
  creativeName: /^(소재명|소재|크리에이티브명|소분류|creativename|creative)$/,
  creativeType: /^(소재유형|소재형태|광고형태|규격|creativetype|format)$/,
  device: /^(기기|디바이스|device)$/,
  periodStart: /^(시작일|집행시작|집행시작일|운영시작일|start|startdate)$/,
  periodEnd: /^(종료일|집행종료|집행종료일|운영종료일|end|enddate)$/,
  budget: /^(?:예산|집행예산|광고비|집행금액|집행비|금액|cost|budget|net)(?:.*)$/,
  expectedImpressions: /^(예상노출(?:수)?|보장노출(?:수)?|노출수|impression|impressions|expectimps)$/,
  expectedClicks: /^(예상클릭(?:수)?|클릭수|clicks|expectclicks)$/,
  target: /^(타겟팅|타겟|타깃|타깃팅|target|targeting)$/,
  operationStatus: /^(집행상태|운영상태|상태|status)$/,
};
const periodPattern = /^(일정|기간|집행기간|운영기간|캠페인기간|period|flight)$/;
const fields = Object.keys(patterns) as PlanField[];
const total = (value: unknown) => /^(?:sub\s*total|grand\s*total|total|합계|소계|총계|총\s*(?:예산|금액|광고비)|.*\s*(?:소계|합계|총계))(?:\s*[:：].*)?$/i.test(text(value));
function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : '';
}
function date(value: unknown, month: string, inheritedMonth?: string): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 1 && value <= 31) return validDate(Number((inheritedMonth || month).slice(0, 4)), Number((inheritedMonth || month).slice(5, 7)), value);
    const decoded = XLSX.SSF.parse_date_code(value);
    return decoded ? validDate(decoded.y, decoded.m, decoded.d) : '';
  }
  const input = text(value);
  const full = input.match(/^(20\d{2})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})(?:일|[T\s]|$|\()/);
  if (full) return validDate(Number(full[1]), Number(full[2]), Number(full[3]));
  const short = input.match(/^(\d{1,2})[-/.월\s]+(\d{1,2})(?:일|[T\s]|$|\()/);
  if (short) return validDate(Number(month.slice(0, 4)), Number(short[1]), Number(short[2]));
  if (/^\d{1,2}일?$/.test(input)) return validDate(Number((inheritedMonth || month).slice(0, 4)), Number((inheritedMonth || month).slice(5, 7)), Number(input.replace('일', '')));
  return '';
}
function period(value: unknown, month: string): [string, string] {
  const input = text(value);
  const monthly = input.match(/^(?:(20\d{2})[년.\-/\s]+)?(\d{1,2})월(?:\s*(?:전체|전월|상시))?$/);
  if (monthly) {
    const year = Number(monthly[1] || month.slice(0, 4)), m = Number(monthly[2]);
    return [validDate(year, m, 1), validDate(year, m, new Date(Date.UTC(year, m, 0)).getUTCDate())];
  }
  const parts = input.split(/\s*[~～–—]\s*|\s+-\s+|(?<=\d\/\d{1,2})-(?=\d)/);
  if (parts.length !== 2) return ['', ''];
  const start = date(parts[0], month), end = date(parts[1], month, start);
  return [start, end];
}
function numeric(value: unknown, heading = '') {
  const headingUnit = /백만\s*원/.test(heading) ? 1000000 : /만\s*원/.test(heading) ? 10000 : /천\s*원/.test(heading) ? 1000 : 1;
  if (value == null || /^(?:|[-—]|미정|협의|tbd|n\/a)$/i.test(text(value))) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value * headingUnit : null;
  const stripped = text(value).replace(/[,₩\s]/g, '').replace(/\((?:VAT|부가세).*?\)/gi, '');
  const matched = stripped.match(/^(\d+(?:\.\d+)?)(백만|만|천)?원?$/);
  if (!matched) return null;
  return Number(matched[1]) * (matched[2] === '백만' ? 1000000 : matched[2] === '만' ? 10000 : matched[2] === '천' ? 1000 : headingUnit);
}
type Header = { columns: Partial<Record<PlanField, number>>; period: number; labels: string[]; consumed: number };
function headerAt(matrix: unknown[][], index: number, sheetMedia: string): Header | null {
  const find = (labels: string[], pattern: RegExp) => labels.findIndex(label => pattern.test(key(label)));
  for (const depth of [1, 2]) {
    if (!matrix[index + depth - 1]) continue;
    if (depth === 2 && !matrix[index].some(value => patterns.platform!.test(key(value)) || patterns.product!.test(key(value)) || patterns.placement!.test(key(value)))) continue;
    const labels = Array.from({ length: Math.max(...matrix.slice(index, index + depth).map(row => row.length)) }, (_, c) => {
      const values = matrix.slice(index, index + depth).map(row => text(row[c])).filter(Boolean);
      const leaf = values.at(-1) || '';
      return /^(net|gross|vat별도|vat포함|백만원|만원|원)$/i.test(key(leaf)) ? values.join(' ') : leaf;
    });
    const columns: Header['columns'] = {};
    for (const field of fields) { const at = find(labels, patterns[field]!); if (at >= 0) columns[field] = at; }
    if (columns.platform == null && !sheetMedia) continue;
    if (columns.product == null && columns.placement == null) continue;
    // Prefer explicitly labelled Net budget; never add Net and Gross columns together.
    const budgets = labels.map((label, at) => ({ label, at })).filter(item => patterns.budget!.test(key(item.label)));
    if (budgets.length) columns.budget = (budgets.find(item => /net|vat별도/i.test(key(item.label))) || budgets[0]).at;
    return { columns, period: find(labels, periodPattern), labels, consumed: depth };
  }
  return null;
}
export function analyzeMediaMixWorkbook(bytes: ArrayBuffer, month: string): MediaMixAnalysis {
  const book = XLSX.read(bytes, { type: 'array', cellDates: true });
  const result: MediaMixAnalysis = { rows: [], providedFields: [], warnings: [], sheets: [], ignoredSheets: [], excludedRows: 0, duplicateRows: 0 };
  const seen = new Set<string>();
  const monthStart = `${month}-01`, monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const knownMedia = new Set(['네이버', '카카오', '당근', '애드부스트스크린', '틱톡', '키즈노트', '호갱노노', '직방', '넷플릭스', 'DV360', '어드레서블TV']);
  for (const name of book.SheetNames) {
    const namedMonth = name.match(/(?:^|[^\d])(\d{1,2})월/);
    if (book.Workbook?.Sheets?.[book.SheetNames.indexOf(name)]?.Hidden || namedMonth && Number(namedMonth[1]) !== Number(month.slice(5))) { result.ignoredSheets.push(name); continue; }
    const sheet = book.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
    const sheetMedia = knownMedia.has(canonicalMedia(name)) ? canonicalMedia(name) : '';
    // Expand text/header merges only. Monetary and KPI merges remain on their original cell.
    const original = matrix.map(row => [...row]);
    for (const merge of sheet['!merges'] || []) {
      const value = original[merge.s.r]?.[merge.s.c];
      if (typeof value === 'number' || value instanceof Date) continue;
      for (let r = merge.s.r; r <= merge.e.r; r++) for (let c = merge.s.c; c <= merge.e.c; c++) if (matrix[r]) matrix[r][c] = value ?? '';
    }
    const first = matrix.findIndex((_, index) => Boolean(headerAt(matrix, index, sheetMedia)));
    if (first < 0) { result.ignoredSheets.push(name); continue; }
    const preamble = matrix.slice(0, first);
    const contextPeriod = preamble.flatMap(row => row.some(v => periodPattern.test(key(v))) ? row.map(value => period(value, month)).filter(([start, end]) => start && end) : []).at(-1);
    const mappings = new Set<string>();
    let active = headerAt(matrix, first, sheetMedia)!;
    let lastMedia = sheetMedia, lastProduct = '', count = 0;
    for (let at = first; at < matrix.length; at++) {
      const detected = headerAt(matrix, at, sheetMedia);
      if (detected) {
        active = detected; lastMedia = sheetMedia; lastProduct = '';
        for (const [field, col] of Object.entries(active.columns)) mappings.add(`${active.labels[col!]} → ${PLAN_LABELS[field as PlanField] || field}`);
        if (active.period >= 0) mappings.add(`${active.labels[active.period]} → 집행기간`);
        at += active.consumed - 1; continue;
      }
      const source = matrix[at];
      if (!source.some(value => text(value))) { lastMedia = sheetMedia; lastProduct = ''; continue; }
      const get = (field: PlanField) => source[active.columns[field] ?? -1];
      const raw = original[at];
      const primaryCells = [get('platform'), get('product'), get('placement'), get('creativeName')];
      if (primaryCells.some(total)) { result.excludedRows++; lastProduct = ''; continue; }
      if (!primaryCells.some(value => text(value))) continue;
      let platform = text(get('platform')), product = text(get('product')) || text(get('placement'));
      if (!platform && (product || text(get('creativeName')))) platform = lastMedia;
      if (!product && text(get('creativeName'))) product = lastProduct;
      if (!platform || !product) { result.warnings.push(`${name} ${at + 1}행: 매체·광고상품을 확인할 수 없어 제외했습니다.`); result.excludedRows++; continue; }
      if (patterns.platform!.test(key(platform)) || patterns.product!.test(key(product))) continue;
      lastMedia = platform; lastProduct = product;
      const provided: PlanField[] = ['platform', 'product', 'sourceSheet'];
      const plan: MediaPlanFact = { platform, product, placement: product, creativeName: '', creativeType: '', device: '', periodStart: '', periodEnd: '', budget: null, expectedImpressions: null, expectedClicks: null, target: '', sourceSheet: name, operationStatus: '예정' };
      for (const field of ['placement', 'creativeName', 'creativeType', 'device', 'target'] as const) {
        if (text(get(field))) { plan[field] = text(get(field)); provided.push(field); }
      }
      for (const field of ['budget', 'expectedImpressions', 'expectedClicks'] as const) {
        const col = active.columns[field];
        // Even formatted numeric strings in merged cells must not duplicate budgets.
        const merged = col == null ? undefined : sheet['!merges']?.find(merge => merge.s.r < at && merge.e.r >= at && merge.s.c <= col && merge.e.c >= col);
        const value = merged ? raw[col!] : get(field);
        plan[field] = numeric(value, field === 'budget' ? active.labels[col!] : '');
        if (plan[field] != null) provided.push(field);
        else if (text(value) && !/^(?:[-—]|미정|협의|tbd|n\/a)$/i.test(text(value))) result.warnings.push(`${name} ${at + 1}행: ${active.labels[col!]} 값 '${text(value)}'은 숫자로 확정할 수 없어 비워뒀습니다.`);
      }
      let start = date(get('periodStart'), month), end = date(get('periodEnd'), month);
      if (!start && !end) [start, end] = active.period >= 0 && text(source[active.period]) ? period(source[active.period], month) : contextPeriod || ['', ''];
      if (start && end && start <= end) {
        if (start > monthEnd || end < monthStart) { result.excludedRows++; continue; }
        plan.periodStart = start; plan.periodEnd = end; provided.push('periodStart', 'periodEnd');
      } else result.warnings.push(`${name} ${at + 1}행: 집행기간이 없거나 불명확합니다. 일정 반영 전에 시작일·종료일을 입력해주세요.`);
      const status = key(get('operationStatus'));
      const states: Record<string, MediaPlanFact['operationStatus']> = { 예정: '예정', 대기: '예정', planned: '예정', 집행중: '집행 중', 운영중: '집행 중', 진행중: '집행 중', on: '집행 중', active: '집행 중', 중단: '중단', off: '중단', paused: '중단', 종료: '종료', 완료: '종료', ended: '종료' };
      if (states[status]) { plan.operationStatus = states[status]; provided.push('operationStatus'); }
      else if (status) result.warnings.push(`${name} ${at + 1}행: 집행상태 '${text(get('operationStatus'))}'를 확인해주세요.`);
      const semantic = JSON.stringify({ ...plan, sourceSheet: '' });
      if (seen.has(semantic)) { result.duplicateRows++; continue; }
      seen.add(semantic); result.rows.push(plan); result.providedFields.push(provided); count++;
      if (result.rows.length > 500) throw new Error('미디어믹스는 최대 500행까지 지원합니다.');
    }
    if (count) result.sheets.push({ name, rowCount: count, mappings: [...mappings] });
    else result.ignoredSheets.push(name);
  }
  if (!result.rows.length) throw new Error('선택한 월에 해당하는 매체·광고상품을 분석하지 못했습니다. 미디어믹스 시트 또는 입력 양식을 확인해주세요.');
  if (result.duplicateRows) result.warnings.push(`동일한 운영안 ${result.duplicateRows}행은 중복으로 제외했습니다.`);
  return result;
}
export function parseMediaMixWorkbook(bytes: ArrayBuffer, month: string) { return analyzeMediaMixWorkbook(bytes, month).rows; }
export function downloadMediaMixTemplate() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['매체', '광고상품', '소재명', '지면', '시작일', '종료일', '예산', '예상 노출수', '예상 클릭수', '기기', '소재유형', '타겟팅', '집행상태']]), '미디어믹스');
  XLSX.writeFile(book, '미디어믹스_입력양식.xlsx');
}
