import * as XLSX from 'xlsx';
import type { MediaPlanFact } from './daily-report-parser';
import type { MediaMixAnalysis, ProposalGroup, ProposalOption, WorkbookReview } from './media-mix-operations';
import { canonicalMedia } from './media-normalization';
const text = (value: unknown) => String(value ?? '').trim();
const key = (value: unknown) => text(value).toLowerCase().replace(/[\s_()（）·%\-.:/]/g, '');
const empty = (sheet: string): MediaPlanFact => ({ platform: '', product: '', placement: '', creativeName: '', creativeType: '', device: '', periodStart: '', periodEnd: '', budget: null, expectedImpressions: null, expectedClicks: null, expectedViews: null, expectedGrp: null, expectedCprp: null, target: '', sourceSheet: sheet, operationStatus: '예정' });
const metricFields = ['expectedImpressions', 'expectedClicks', 'expectedViews', 'expectedGrp'] as const;
const labels = { expectedImpressions: '예상 노출', expectedClicks: '예상 클릭', expectedViews: '예상 조회', expectedGrp: '예상 GRP' };
function number(value: unknown, unit = 1): number | null {
  if (value == null || /^(?:|[-—]|tbd|미정|협의|n\/a)$/i.test(text(value))) return null;
  const v = typeof value === 'number' ? value : Number(text(value).replace(/[,₩원\s]/g, ''));
  return Number.isFinite(v) && v >= 0 ? v * unit : null;
}
function matrix(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const rows = Array.from({ length: range.e.r + 1 }, (_, r) => Array.from({ length: range.e.c + 1 }, (_, c) => sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? ''));
  // Propagate labels only down a merge, never money/KPIs or across columns.
  for (const merge of sheet['!merges'] || []) {
    const v = rows[merge.s.r]?.[merge.s.c];
    if (typeof v !== 'string') continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) rows[r][merge.s.c] = v;
  }
  return rows;
}
function date(value: unknown, month: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') { const d = XLSX.SSF.parse_date_code(value); return d ? date(`${d.y}.${d.m}.${d.d}`, month) : ''; }
  const v = text(value).replace(/\([^)]*\)/g, '').replace(/\/[^\d~～]+/g, '').trim();
  const m = v.match(/^(?:(20\d{2})[년.\-/\s]+)?(\d{1,2})[월.\-/\s]+(\d{1,2})/);
  if (!m) return '';
  const y = Number(m[1] || month.slice(0, 4)), mo = Number(m[2]), d = Number(m[3]);
  const result = new Date(Date.UTC(y, mo - 1, d));
  return result.getUTCFullYear() === y && result.getUTCMonth() === mo - 1 && result.getUTCDate() === d ? result.toISOString().slice(0, 10) : '';
}
function period(value: unknown, month: string): [string, string] {
  const v = text(value);
  if (/미정|협의|tbd/i.test(v)) return ['', ''];
  if (/^(?:20\d{2}년\s*)?\d{1,2}월$/.test(v)) {
    const m = v.match(/(?:(20\d{2})년\s*)?(\d{1,2})월/)!, y = m[1] || month.slice(0, 4), mo = m[2].padStart(2, '0');
    return [`${y}-${mo}-01`, `${y}-${mo}-${new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate()}`];
  }
  const parts = v.replace(/집행\s*기간\s*[:：]/g, '').split(/[~～–—]/);
  return parts.length === 2 ? [date(parts[0], month), date(parts[1], month)] : ['', ''];
}
function sum(rows: MediaPlanFact[], field: 'budget' | typeof metricFields[number]) {
  const values = rows.map(row => row[field]).filter((v): v is number => typeof v === 'number');
  return values.length ? values.reduce((s, v) => s + v, 0) : null;
}
function compare(summary: MediaPlanFact[], rows: MediaPlanFact[], label: string) {
  const warnings: string[] = [];
  for (const field of ['budget', ...metricFields] as const) {
    const a = sum(summary, field), b = sum(rows, field);
    if (a != null && b != null && Math.abs(a - b) > Math.max(1, rows.length)) warnings.push(`${label}: ${field === 'budget' ? '예산' : labels[field]} 불일치 — Summary ${Math.round(a).toLocaleString('ko-KR')} / 상세안 ${Math.round(b).toLocaleString('ko-KR')}${field === 'budget' ? '원' : ''}`);
  }
  return warnings;
}
function groupId(platform: string, product: string) { return key(`${canonicalMedia(platform)}::${product}`); }
function stamp(rows: MediaPlanFact[], group: ProposalGroup, scenario: string) {
  return rows.map(row => ({ ...row, category: row.category || group.summaryRows[0]?.category || '', proposalStatus: row.proposalStatus || group.summaryRows[0]?.proposalStatus || '제안', scenario, sourceGroup: group.id,
    sourceKey: [group.id, scenario, row.platform, row.product, row.placement.replace(/\([^)]*~[^)]*\)/g, '').trim(), row.creativeName, row.creativeType, row.device, row.target].map(key).join('|') }));
}
const detailHeaders = {
  platform: /^(매체|매체명|media)$/,
  product: /^(광고상품|광고상품명|상품명|상품유형)$/,
  placement: /^(광고지면|지면|노출지면)$/,
  budget: /^(budget.*|광고비.*|총광고비.*|집행금액.*)$/,
  expectedImpressions: /^(expectimps|예상노출수|보장노출수예상노출수)$/,
  expectedClicks: /^(expectclicks|예상클릭수)$/,
  expectedViews: /^(expectviews|보장조회수view|예상조회수)$/,
  device: /^(기기|디바이스)$/,
  creativeType: /^(소재|소재유형|소재형태)$/,
  creativeName: /^(소재명)$/,
  target: /^(타겟팅|targeting)$/,
  start: /^(시작일|시작일자)$/,
  end: /^(종료일|종료일자)$/,
  period: /^(일정|집행기간|기간)$/,
  package: /^(패키지)$/,
  notes: /^(notice|비고)$/,
};
function detailOptions(sheet: XLSX.WorkSheet, name: string, month: string, groups: ProposalGroup[]): Array<{ group: ProposalGroup; option: ProposalOption }> {
  const m = matrix(sheet), options: Array<{ group: ProposalGroup; option: ProposalOption }> = [];
  let common: [string, string] = ['', ''];
  for (const row of m.slice(0, 12)) {
    const at = row.findIndex(v => /^(period|캠페인기간|집행기간)$/.test(key(v)));
    if (at >= 0) for (const v of row.slice(at + 1)) { const dates = period(v, month); if (dates[0] && dates[1]) { common = dates; break; } }
  }
  for (let r = 0; r < m.length; r++) {
    const h = m[r].map(key), columns = Object.fromEntries(Object.entries(detailHeaders).map(([field, re]) => [field, h.findIndex(v => re.test(v))])) as Record<keyof typeof detailHeaders, number>;
    if (columns.budget < 0 || columns.product < 0) continue;
    const scenario = m.slice(Math.max(0, r - 2), r).flat().map(text).find(v => /^\(?[ABC]안/.test(v)) || '상세 운영안';
    const rows: MediaPlanFact[] = [];
    let inheritedPlatform = '', inheritedProduct = '', inheritedPackage = '';
    for (let rr = r + 1; rr < m.length; rr++) {
      const raw = m[rr], get = (field: keyof typeof detailHeaders) => raw[columns[field]];
      if (raw.some(v => /^(sub\s*total|total|합계|소계)$/i.test(text(v)))) { r = rr; break; }
      if (!raw.some(v => text(v))) { r = rr; break; }
      const platform = text(get('platform')) || inheritedPlatform || canonicalMedia(name);
      const product = text(get('product')) || inheritedProduct;
      const placement = text(get('placement'));
      if (!product && !placement) continue;
      inheritedPlatform = platform; inheritedProduct = product;
      const packageName = text(get('package')) || inheritedPackage; inheritedPackage = packageName;
      const value = number(get('budget'));
      const service = /서비스/.test(packageName) || /\(\*?서비스\)|\*서비스\s*$/.test(product);
      // Paid rows require a budget; service rows may be unpriced. Marketing/reference text is not a campaign row.
      if (value == null && !service) continue;
      const row = empty(name);
      const canonical = canonicalMedia(/Addressable/i.test(name) ? 'Addressable TV' : /네이버GFA/i.test(name) ? '네이버' : platform);
      row.platform = canonical; row.product = /네이버GFA/i.test(name) ? 'GFA' : placement || product; row.placement = placement || product;
      row.creativeType = text(get('creativeType'));
      if (/^(이미지|영상|동영상|image|video|배너)$/i.test(row.creativeType)) row.creativeName = text(get('creativeName'));
      else { row.creativeName = text(get('creativeName')) || row.creativeType; row.creativeType = ''; }
      row.device = text(get('device')); row.target = text(get('target'));
      if (/Addressable/i.test(name)) { row.product = product; row.placement = `${platform} ${row.target}`; row.creativeType = `${raw[h.indexOf('운영초수')]}초`; }
      row.budget = service ? 0 : value;
      row.expectedImpressions = number(get('expectedImpressions')); row.expectedClicks = number(get('expectedClicks')); row.expectedViews = number(get('expectedViews'));
      const explicit = text(get('period'));
      const dates = columns.start >= 0 ? [date(get('start'), month), date(get('end'), month)] : explicit ? period(explicit, month) : common;
      [row.periodStart, row.periodEnd] = dates;
      const group = groups.find(g => g.id !== 'tv' && g.summaryRows.some(s => canonicalMedia(s.platform) === canonical && (canonical !== '카카오' || /키워드/.test(name) === /키워드/.test(s.product))));
      if (!group) continue;
      row.sourceCell = `${XLSX.utils.encode_col(Math.max(0, columns.product))}${rr + 1}`;
      row.sourceNotes = [service ? `서비스 지면 · 표시 금액 ${value == null ? '미기재' : value.toLocaleString('ko-KR') + '원'}은 집행 예산에서 제외` : '', explicit && !dates[0] ? `일정: ${explicit}` : '', text(get('notes'))].filter(Boolean).join('\n').slice(0, 2000);
      row.proposalStatus = group.summaryRows[0]?.proposalStatus || '제안'; rows.push(row);
    }
    if (!rows.length) continue;
    const group = groups.find(g => g.id !== 'tv' && g.summaryRows.some(s => canonicalMedia(s.platform) === canonicalMedia(rows[0].platform) && (rows[0].platform !== '카카오' || /키워드/.test(name) === /키워드/.test(s.product))));
    if (!group) continue;
    const option: ProposalOption = { id: `${name}:${scenario}`, label: `${name} · ${scenario}`, rows: stamp(rows, group, scenario), warnings: compare(group.summaryRows, rows, name + ' ' + scenario) };
    for (const row of rows) if (!row.periodStart || !row.periodEnd) option.warnings.push(`${name} ${row.sourceCell}: 집행일 미정 — 날짜 입력 전 캘린더에서 제외됩니다.`);
    options.push({ group, option });
  }
  return options;
}
function tvOptions(sheet: XLSX.WorkSheet, name: string, month: string, group: ProposalGroup) {
  const m = matrix(sheet); let dates: [string, string] = ['', ''];
  for (const value of m.slice(0, 12).flat()) if (/집행기간/.test(text(value))) dates = period(text(value).replace(/^.*?집행기간\s*[:：]\s*/, ''), month);
  const options: ProposalOption[] = [];
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length - 2; c++) {
    if (key(m[r][c]) !== '채널' || key(m[r][c + 1]) !== '예산') continue;
    const scenario = m.slice(0, r).map(row => text(row[c - 1])).reverse().find(v => /^[ABC]안\)/.test(v)) || `${c + 1}열 운영안`;
    const rows: MediaPlanFact[] = [];
    for (let rr = r + 1; rr < Math.min(m.length, r + 18); rr++) {
      const channel = text(m[rr][c]), budget = number(m[rr][c + 1]);
      if (/계|합계|total/i.test(channel) || /total/i.test(text(m[rr][c - 1]))) break;
      if (!channel || budget == null || !budget) continue;
      const row = empty(name); row.platform = channel.replace(/^\*+/, '').split(/\s*[*（(]/)[0].trim(); row.product = 'TV 광고'; row.placement = channel; row.budget = budget;
      row.expectedGrp = number(m[rr][c + 3]); row.expectedCprp = number(m[rr][c + 5]); row.category = 'TV'; row.sourceCell = `${XLSX.utils.encode_col(c)}${rr + 1}`;
      [row.periodStart, row.periodEnd] = dates; row.creativeName = m.slice(0, 12).flat().map(text).find(v => /집행소재/.test(v))?.replace(/^.*?집행소재\s*[:：]\s*/, '') || '';  rows.push(row);
    }
    if (rows.length) options.push({ id: `${name}:${c}`, label: scenario, rows: stamp(rows, group, scenario), warnings: compare(group.summaryRows, rows, scenario) });
  }
  return options;
}
function gsOption(sheet: XLSX.WorkSheet, name: string, month: string, group: ProposalGroup): ProposalOption | null {
  const m = matrix(sheet), at = m.findIndex(r => r.some(v => key(v) === '최종제안가'));
  if (at < 0) return null;
  const h = m[at].map(key), priceCol = h.indexOf('최종제안가'), mediaCol = h.indexOf('매체'), contentCol = h.indexOf('내용');
  const unit = m.slice(0, at).flat().some(v => /단위\s*[:：]\s*천원/.test(text(v))) ? 1000 : 1;
  let dates: [string, string] = ['', ''];
  for (const row of m.slice(0, at)) if (row.some(v => key(v) === '기간')) for (const v of row) { const p = period(v, month); if (p[0] && p[1]) dates = p; }
  const rows: MediaPlanFact[] = [];
  for (let r = at + 1; r < m.length; r++) {
    if (/통합|합계/.test(text(m[r][1]))) break;
    const placement = text(m[r][mediaCol]); if (!placement) break;
    const plan = empty(name); plan.platform = group.summaryRows[0].platform; plan.product = 'GS넷비전 패키지'; plan.placement = placement;
    plan.budget = number(m[r][priceCol], unit) ?? 0; plan.target = text(m[r][contentCol]); plan.proposalStatus = 'TBD'; plan.category = 'OOH';
    [plan.periodStart, plan.periodEnd] = dates; plan.sourceCell = `${XLSX.utils.encode_col(priceCol)}${r + 1}`; plan.sourceNotes = '최종 제안가 · 패키지 내 공동 제공 지면은 예산 중복 합산 제외 · 집행 여부 별도 협의'; rows.push(plan);
  }
  return rows.length ? { id: name, label: name, rows: stamp(rows, group, name), warnings: compare(group.summaryRows, rows, name) } : null;
}
export function analyzeProposalWorkbook(book: XLSX.WorkBook, month: string): MediaMixAnalysis | null {
  const summaryName = book.SheetNames.find((name, i) => !book.Workbook?.Sheets?.[i]?.Hidden && /summary/i.test(name) && (!name.match(/(\d{1,2})월/) || Number(name.match(/(\d{1,2})월/)![1]) === Number(month.slice(5))));
  if (!summaryName) return null;
  const sourceYear = summaryName.match(/(?:^|[^\d])(\d{2,4})년/)?.[1];
  if (sourceYear && Number(sourceYear.length === 2 ? '20' + sourceYear : sourceYear) !== Number(month.slice(0, 4))) throw new Error('선택한 연도와 Summary의 연도가 다릅니다. 조회 월을 확인해주세요.');
  const sheet = book.Sheets[summaryName], m = matrix(sheet);
  const header = m.findIndex(row => row.some(v => key(v) === '채널플랫폼') && row.some(v => key(v) === '예산'));
  if (header < 0) return null;
  const h = m[header].map(key), col = (name: string) => h.indexOf(name);
  const groups: ProposalGroup[] = [], checks: string[] = [];
  let common: [string, string] = ['', ''], category = '', summaryTotal: number | null = null, totalAt = -1;
  for (const row of m.slice(0, header)) for (const value of row) { const dates = period(value, month); if (dates[0] && dates[1]) common = dates; }
  for (let r = header + 1; r < m.length; r++) {
    const raw = m[r], budget = number(raw[col('예산')]), channel = text(raw[col('채널플랫폼')]), media = text(raw[col('mpp')]);
    if (/전체/.test(text(raw[0])) && budget != null) { summaryTotal = budget; totalAt = r; break; }
    if (text(raw[0]) && !/(?:계|합계|소계)$/.test(text(raw[0]))) category = text(raw[0]);
    const tvReference = /^(TV|케이블TV)$/.test(category) && (Number(raw[col('예상grp')]) > 0 || /보너스|서비스/.test(channel));
    if (!channel || !budget && !tvReference || /(?:계|합계|소계)$/.test(media)) continue;
    const row = empty(summaryName); row.category = category;
    const channelMedia = canonicalMedia(channel), mppMedia = canonicalMedia(media);
    row.platform = ['네이버', '카카오', '당근', '틱톡', '키즈노트', '호갱노노', '직방', '넷플릭스', '티빙', 'DV360', '어드레서블TV'].includes(channelMedia) ? channelMedia : mppMedia;
    if (category === 'TV' || category === '케이블TV') { row.platform = channel.replace(/^\*+/, '').split(/\s*[*（(]/)[0].trim(); row.product = 'TV 광고'; row.category = 'TV'; }
    else row.product = row.platform === '네이버' ? 'GFA' : channel.replace(/\([^)]*~[^)]*\)/g, '').trim();
    row.placement = channel; row.budget = budget; row.proposalStatus = /tbd/i.test(channel) ? 'TBD' : text(raw[col('업무현황')]) || '제안';
    row.expectedImpressions = number(raw[col('노출량')]); row.expectedClicks = number(raw[col('클릭량')]); row.expectedViews = number(raw[col('조회수')]); row.expectedGrp = number(raw[col('예상grp')]); row.expectedCprp = number(raw[col('cprp')]);
    const embedded = channel.match(/\(([^)]*~[^)]*)\)/)?.[1];
    [row.periodStart, row.periodEnd] = embedded ? period(embedded, month) : common;
    row.sourceCell = `${XLSX.utils.encode_col(col('예산'))}${r + 1}`; row.sourceNotes = 'Summary 기준 · VAT 별도 · 예상 성과';
    const id = row.category === 'TV' ? 'tv' : groupId(row.platform, row.product);
    let group = groups.find(g => g.id === id);
    if (!group) { group = { id, label: id === 'tv' ? 'TV 채널 믹스' : `${row.platform} · ${row.product}`, summaryRows: [], included: row.proposalStatus !== 'TBD', selected: 'summary', options: [] }; groups.push(group); }
    group.summaryRows.push(row);
  }
  if (!groups.length) throw new Error(`${summaryName}: 매체별 예산을 찾지 못했습니다. Summary 열을 확인해주세요.`);
  // Keep standalone TBD proposals as selectable candidates, without including them in the Summary total.
  for (let i = 0; i < book.SheetNames.length; i++) {
    const name = book.SheetNames[i]; if (!/TBD/i.test(name) || book.Workbook?.Sheets?.[i]?.Hidden) continue;
    const platform = canonicalMedia(name.split(/[_\s]/)[0]);
    if (groups.some(g => key(g.summaryRows[0]?.platform).replace(/\*/g, '') === key(platform))) continue;
    const row = empty(name); row.platform = platform; row.product = '미확정 운영안'; row.proposalStatus = 'TBD'; row.sourceNotes = 'Summary 미기재 후보 · 기본 예산에서 제외';
    const source = matrix(book.Sheets[name]);
    for (let r = 0; r < Math.min(12, source.length); r++) { const c = source[r].findIndex(v => /^budget/.test(key(v))); if (c < 0) continue; const n = source[r].findIndex((v, at) => at > c && typeof v === 'number'); if (n >= 0) { row.budget = number(source[r][n]); row.sourceCell = `${XLSX.utils.encode_col(n)}${r + 1}`; break; } }
    groups.push({ id: groupId(platform, row.product), label: platform + ' · 미확정 후보', included: false, selected: 'summary', summaryRows: [row], options: [] });
  }
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  for (const group of groups) {
    group.summaryRows = group.summaryRows.filter(row => !row.periodStart || !row.periodEnd || row.periodStart <= monthEnd && row.periodEnd >= month + '-01');
    group.options.push({ id: 'summary', label: group.summaryRows[0]?.sourceSheet === summaryName ? 'Summary 기준' : '후보 요약', rows: stamp(group.summaryRows, group, group.summaryRows[0]?.sourceSheet === summaryName ? 'Summary' : '후보 요약'), warnings: [] });
  }
  const inventory: WorkbookReview['inventory'] = [];
  for (let i = 0; i < book.SheetNames.length; i++) {
    const name = book.SheetNames[i];
    if (name === summaryName) { inventory.push({ name, kind: 'Summary' }); continue; }
    const namedMonth = name.match(/(\d{1,2})월/);
    if (book.Workbook?.Sheets?.[i]?.Hidden || namedMonth && Number(namedMonth[1]) !== Number(month.slice(5))) { inventory.push({ name, kind: '참고자료 / 다른 월' }); continue; }
    if (/타겟팅|raw|시청률|노선|차량|정류장|집행리스트|판매안|제안 비교/i.test(name)) { inventory.push({ name, kind: '참고자료' }); continue; }
    const tv = groups.find(g => g.id === 'tv');
    if (/TV운영안/.test(name) && tv) { const options = tvOptions(book.Sheets[name], name, month, tv); tv.options.push(...options); inventory.push({ name, kind: '비교 제안' }); continue; }
    const gs = /GS넷비전/.test(name) ? groups.find(g => /GS넷비전/.test(g.label)) : undefined;
    if (gs) { const option = gsOption(book.Sheets[name], name, month, gs); if (option) { gs.options.push(option); inventory.push({ name, kind: '비교 제안 / 후보' }); continue; } }
    const options = detailOptions(book.Sheets[name], name, month, groups);
    for (const item of options) item.group.options.push(item.option);
    inventory.push({ name, kind: options.length > 1 ? '비교 제안' : options.length ? '상세 운영안' : /TBD/i.test(name) ? '미확정 후보' : '참고자료 / 견적서' });
    if (!options.length && /TBD/i.test(name) && !groups.some(g => key(name).includes(key(g.summaryRows[0]?.platform).replace(/\*/g, '')))) checks.push(`${name}: Summary에 없는 미확정 후보입니다. 기본 반영에서 제외했습니다.`);
  }
  for (const group of groups) {
    const detail = group.options.filter(o => o.id !== 'summary');
    if (detail.length > 1 || detail.some(o => o.warnings.length)) group.selected = '';
    else if (detail.length === 1) group.selected = detail[0].id;
    if (!group.included) checks.push(`${group.label}: TBD 후보로 보관하며 기본 예산에서 제외합니다.`);
  }
  const includedTotal = groups.filter(g => g.included).reduce((s, g) => s + (sum(g.summaryRows, 'budget') || 0), 0);
  if (summaryTotal != null && Math.abs(summaryTotal - includedTotal) > 1) checks.push(`Summary 합계 ${summaryTotal.toLocaleString('ko-KR')}원과 반영 대상 합계 ${includedTotal.toLocaleString('ko-KR')}원이 다릅니다. 합계 수식 및 후보 포함 여부를 확인해주세요.`);
  if (totalAt >= 0) for (const field of metricFields) {
    const source = number(m[totalAt][col({ expectedImpressions: '노출량', expectedClicks: '클릭량', expectedViews: '조회수', expectedGrp: '예상grp' }[field])]);
    const expected = groups.filter(g => g.included).map(g => sum(g.summaryRows, field)).filter((v): v is number => v != null).reduce((a, b) => a + b, 0);
    if (source != null && Math.abs(source - expected) > groups.length) checks.push(`Summary 전체 ${labels[field]} ${source.toLocaleString('ko-KR')}와 개별 매체 합 ${expected.toLocaleString('ko-KR')}가 다릅니다. 원본 합계 셀을 확인해주세요.`);
  }
  const rows = groups.filter(g => g.included).flatMap(g => g.options.find(o => o.id === (g.selected || 'summary'))!.rows);
  return { rows, providedFields: rows.map(row => Object.keys(row) as Array<keyof MediaPlanFact>), warnings: checks, sheets: inventory.filter(i => ['Summary', '상세 운영안', '비교 제안'].includes(i.kind)).map(i => ({ name: i.name, rowCount: rows.filter(r => r.sourceSheet === i.name).length, mappings: ['Summary 기준 예산', '선택한 제안 연결', 'VAT 별도', '예상 성과'] })), ignoredSheets: inventory.filter(i => !['Summary', '상세 운영안', '비교 제안'].includes(i.kind)).map(i => i.name), excludedRows: 0, duplicateRows: 0, review: { summarySheet: summaryName, summaryTotal, groups, inventory, checks } };
}
