import * as XLSX from 'xlsx';
import type { ReportingRow } from './reporting-data';
import type { PublishedDataset } from './daily-report-store';
import { canonicalMedia } from './media-normalization';

export type ShowroomBreakdownRow = ReportingRow & { footTraffic: number | null; metricLabel: string; spendLabel?: string };
export type ShowroomBreakdown = {
  version: 1; reportDate: string; sourceFile: string; sourceSheet: string;
  rows: ShowroomBreakdownRow[]; paidSpend: number; reportedCount: number; notes: string[];
};
type Context = { month: string; reportDate: string; expectedSpend: number; expectedImpressions: number };
type Group = { label: string; start: number; end: number; service: boolean; total: boolean; columns?: [number, number, number] };
const MEDIA = '애드부스트스크린';
const MAX_BYTES = 15 * 1024 * 1024;
const label = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const token = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_().\-]/g, '');
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
function inventory(value: string): { service: boolean; total: boolean } | undefined {
  const name = token(value);
  if (/^totaldooh커스텀패키지(?:서비스제외)?$/.test(name)) return { service: false, total: true };
  if (/^cgvscreengold$/.test(name) || /^대형전광판(?:mnme|gv|j)live$/.test(name)) return { service: false, total: false };
  if (/^(?:서비스지면)?미디어믿아파트엘리베이터$/.test(name)) return { service: true, total: false };
  return undefined;
}
function numeric(cell: XLSX.CellObject | undefined): number | null {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return null;
  if (cell.t === 'e') throw new Error('원본 셀에 Excel 오류가 있습니다.');
  let value: unknown = cell.v;
  if (typeof value === 'string') {
    const source = value.trim();
    if (!source || source === '-' || source === '–') return null;
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(source)) throw new Error('원본 수치 셀에 숫자가 아닌 값이 있습니다.');
    value = Number(source.replace(/,/g, ''));
  }
  if (!finite(value)) throw new Error('원본 수치는 유한한 0 이상 숫자여야 합니다.');
  return value;
}
function rawDate(cell: XLSX.CellObject | undefined, date1904: boolean): string | undefined {
  if (!cell) return undefined;
  if (typeof cell.v === 'string') return validDate(cell.v.trim()) ? cell.v.trim() : undefined;
  if (typeof cell.v !== 'number' || !Number.isFinite(cell.v) || cell.v <= 0) return undefined;
  const parsed = XLSX.SSF.parse_date_code(cell.v, { date1904 });
  if (!parsed) return undefined;
  const result = `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  return validDate(result) ? result : undefined;
}

/** Synchronous browser-only projection. Does not create/publish a bundle or modify base facts.
 * The caller must publish this metadata in a NEW augmentation bundle, after approval, with
 * placements/dailyPerformance/mediaPlan empty. Never replace the source report bundle.
 */
export function parseShowroomBreakdown(buffer: ArrayBuffer, filename: string, context: Context): ShowroomBreakdown {
  if (!buffer || !Number.isFinite(buffer.byteLength) || buffer.byteLength <= 0 || buffer.byteLength > MAX_BYTES) throw new Error('Excel 파일 크기는 15MB 이하여야 합니다.');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(context.month) || !validDate(context.reportDate) || !context.reportDate.startsWith(`${context.month}-`) || !finite(context.expectedSpend) || !finite(context.expectedImpressions)) throw new Error('캠페인 월, 보고 기준일 또는 검증 합계가 올바르지 않습니다.');
  if (!label(filename)) throw new Error('원본 파일명이 필요합니다.');
  const book = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false });
  const candidates: Array<{ sheet: XLSX.WorkSheet; name: string; groupRow: number; groups: Group[]; dateCol: number; metricRow: number; lastRow: number }> = [];
  for (const name of book.SheetNames) {
    if (canonicalMedia(name) !== MEDIA) continue;
    const sheet = book.Sheets[name];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    if (range.e.r > 25000 || range.e.c > 255) throw new Error('지원 범위를 넘는 원본 시트 크기입니다.');
    const cell = (r: number, c: number): XLSX.CellObject | undefined => sheet[XLSX.utils.encode_cell({ r, c })];
    for (let r = range.s.r; r <= Math.min(range.e.r, 100); r++) {
      const groups: Group[] = [];
      const starts: number[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const header = label(cell(r, c)?.v), kind = inventory(header);
        if (header) starts.push(c);
        if (kind) groups.push({ label: header, start: c, end: range.e.c + 1, ...kind });
      }
      // Isolated inventory names also occur in later summary tables. A supported
      // header band must advertise both the package total and component inventory.
      if (!groups.some(g => !g.total) || !groups.some(g => g.total)) continue;
      // Group bounds come from actual headers, not fixed four-column offsets.
      for (const group of groups) group.end = starts.find(c => c > group.start) ?? range.e.c + 1;
      const dateCols: number[] = [];
      for (let hr = Math.max(range.s.r, r - 1); hr <= Math.min(range.e.r, r + 5); hr++) {
        for (let c = range.s.c; c <= range.e.c; c++) if (/^(date|날짜|일자)$/.test(token(label(cell(hr, c)?.v)))) dateCols.push(c);
      }
      const uniqueDates = [...new Set(dateCols)];
      // A summary without a Date header is not a second data table. Multiple
      // Date columns in a genuine header band remain an error, not a guessed choice.
      if (uniqueDates.length === 0) continue;
      if (uniqueDates.length !== 1) throw new Error('원본 날짜 열을 하나로 확인할 수 없습니다.');
      let metricRow = -1;
      for (let mr = r + 1; mr <= Math.min(range.e.r, r + 5); mr++) {
        const columns = groups.map(group => {
          const found: Record<string, number[]> = { spend: [], count: [], traffic: [] };
          for (let c = group.start; c < group.end; c++) {
            const header = token(label(cell(mr, c)?.v));
            if (/^(spent|spend)$/.test(header)) found.spend.push(c);
            if (/^impressions?$/.test(header)) found.count.push(c);
            if (header === '유동인구') found.traffic.push(c);
          }
          return found.spend.length === 1 && found.count.length === 1 && found.traffic.length === 1 ? [found.spend[0], found.count[0], found.traffic[0]] as [number, number, number] : undefined;
        });
        if (columns.every(Boolean)) {
          if (metricRow !== -1) throw new Error('중복 수치 헤더가 있어 원본 구조가 모호합니다.');
          metricRow = mr; groups.forEach((group, i) => { group.columns = columns[i]; });
        }
      }
      if (metricRow === -1) throw new Error('Spent, Impression, 유동인구 열을 확인할 수 없습니다.');
      if (new Set(groups.map(g => token(g.label))).size !== groups.length) throw new Error('중복 지면 헤더가 있습니다.');
      candidates.push({ sheet, name, groupRow: r, groups, dateCol: uniqueDates[0], metricRow, lastRow: range.e.r });
    }
  }
  if (candidates.length !== 1) throw new Error('애드부스트 지면 원본 시트를 하나로 확인할 수 없습니다.');
  const selected = candidates[0];
  const sums = selected.groups.map(() => [null, null, null] as Array<number | null>);
  let latest = '';
  const seenDates = new Set<string>();
  for (let r = selected.metricRow + 1; r <= selected.lastRow; r++) {
    const cell = (c: number): XLSX.CellObject | undefined => selected.sheet[XLSX.utils.encode_cell({ r, c })];
    const date = rawDate(cell(selected.dateCol), Boolean(book.Workbook?.WBProps?.date1904));
    if (!date || !date.startsWith(`${context.month}-`)) continue; // Wrong-year helpers and other months are not this campaign.
    const values = selected.groups.map(group => group.columns!.map(c => numeric(cell(c))));
    // Aggregate formulas often cache zero on future template dates even when
    // every component cell is blank. Only component data establishes availability.
    if (!values.some((group, i) => !selected.groups[i].total && group.some(value => value !== null))) continue;
    if (seenDates.has(date)) throw new Error('동일 날짜의 원본 데이터가 중복됩니다.');
    seenDates.add(date); if (date > latest) latest = date;
    if (date > context.reportDate) continue;
    values.forEach((group, i) => group.forEach((value, j) => {
      if (value !== null) {
        const sum = (sums[i][j] ?? 0) + value;
        if (!Number.isFinite(sum)) throw new Error('원본 수치 합계가 지원 범위를 넘습니다.');
        sums[i][j] = sum;
      }
    }));
  }
  if (latest !== context.reportDate) throw new Error('원본의 최신 실제 데이터 날짜가 선택한 보고 기준일과 다릅니다.');
  const rows: ShowroomBreakdownRow[] = [];
  selected.groups.forEach((group, i) => {
    if (group.total || sums[i].every(value => value === null)) return;
    const [spend, impressions, footTraffic] = sums[i];
    if (impressions === null) throw new Error('데이터가 있는 지면의 원본 Impression이 누락되었습니다.');
    rows.push({ platform: MEDIA, placement: group.label, achievement: null, guaranteed: '', spend, impressions, clicks: null, ctr: null,
      sourceFile: filename, sourceSheet: selected.name, reportDate: latest, footTraffic, metricLabel: '원본 Impression',
      ...(group.service ? { spendLabel: '원본 서비스 비용 참고값' } : {}) });
  });
  if (!rows.length) throw new Error('사용 가능한 지면별 실제 데이터가 없습니다.');
  const paidSpend = rows.reduce((sum, row) => sum + (inventory(row.placement)!.service ? 0 : row.spend ?? 0), 0);
  const reportedCount = rows.reduce((sum, row) => sum + row.impressions, 0);
  if (!Number.isFinite(paidSpend) || !Number.isFinite(reportedCount) || Math.abs(paidSpend - context.expectedSpend) > 1 || Math.abs(reportedCount - context.expectedImpressions) > 1) throw new Error('지면별 유료 비용 또는 서비스 포함 원본 Impression 합계가 기존 합계와 일치하지 않습니다.');
  selected.groups.forEach((group, i) => {
    if (group.total && sums[i][0] !== null && Math.abs(sums[i][0]! - paidSpend) > 1) throw new Error('원본 패키지 비용 합계와 지면별 유료 비용 합계가 일치하지 않습니다.');
  });
  return { version: 1, reportDate: latest, sourceFile: filename, sourceSheet: selected.name, rows, paidSpend, reportedCount,
    notes: ['지면별 원본 수치는 쇼룸 표시 전용이며 전체 성과 합계에 더하지 않습니다.', '원본 Impression 명칭을 유지하며 유동인구는 별도 항목입니다. 클릭수는 제공되지 않아 null입니다.', '유료 비용 합계는 명시적 서비스 지면을 제외하고 원본 Impression 합계는 서비스를 포함합니다.', '서비스 비용 참고값은 유료 집행비에 합산하지 않습니다. 빈 수치 셀은 0으로 바꾸지 않습니다.'] };
}

/** Read only optional augmentation metadata. No writes and no changes to base reporting rows. */
export function breakdownRowsFromDatasets(datasets: PublishedDataset[]): ShowroomBreakdownRow[] {
  const latest = new Map<string, { row: ShowroomBreakdownRow; order: string }>();
  for (const dataset of datasets) {
    const payload = record((dataset.bundle as typeof dataset.bundle & { showroomBreakdown?: unknown }).showroomBreakdown);
    if (!payload || payload.version !== 1 || !validDate(payload.reportDate) || !payload.reportDate.startsWith(`${dataset.month}-`) || !Array.isArray(payload.rows)) continue;
    for (const value of payload.rows) {
      const row = record(value);
      if (!row || canonicalMedia(label(row.platform)) !== MEDIA || !inventory(label(row.placement)) || inventory(label(row.placement))!.total
        || row.reportDate !== payload.reportDate || !label(row.sourceFile) || !label(row.sourceSheet)
        || !finite(row.impressions) || !(row.spend === null || row.spend === undefined || finite(row.spend))
        || !(row.footTraffic === null || finite(row.footTraffic)) || row.clicks !== null || row.ctr !== null || row.metricLabel !== '원본 Impression') continue;
      const id = JSON.stringify([dataset.advertiser, dataset.month, canonicalMedia(label(row.platform)), label(row.placement)]);
      const order = `${row.reportDate}::${dataset.publishedAt || ''}`;
      if (!latest.has(id) || latest.get(id)!.order < order) latest.set(id, { row: value as ShowroomBreakdownRow, order });
    }
  }
  return [...latest.values()].map(value => value.row);
}
