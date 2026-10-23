const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const XLSX = require('xlsx');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(['lib/showroom-breakdown.ts', 'lib/media-normalization.ts'].some(p => path.resolve(root, p) === name));
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'module', js)(p => {
    if (p === 'xlsx') return XLSX;
    assert.ok(p.startsWith('.'), 'No storage/network dependency allowed');
    return load(path.resolve(path.dirname(name), `${p}.ts`));
  }, module.exports, module);
  return module.exports;
}
const { parseShowroomBreakdown: parse, breakdownRowsFromDatasets: extract } = load('lib/showroom-breakdown.ts');
const context = { month: '2030-01', reportDate: '2030-01-15', expectedSpend: 200, expectedImpressions: 30 };
const headers = ['Total_DOOH_커스텀 패키지(서비스제외)', 'CGV_Screen_Gold', '대형전광판_MNME_Live', '대형전광판_GV_Live', '대형전광판_J_Live', '(서비스지면)미디어믿_아파트 엘리베이터'];
const perDay = [[100, 15, null], [10, 1, null], [20, 2, 200], [30, 3, 300], [40, 4, 400], [900, 5, 500]];
// Serial arithmetic is independent of machine time zone; production uses SSF parsing.
const serial = iso => (Date.parse(`${iso}T00:00:00Z`) / 86400000) + 25569;
function workbook(options = {}) {
  const book = XLSX.utils.book_new();
  const sheet = {};
  const hr = options.shift ? 12 : 6, dateCol = options.shift ? 4 : 1, start = dateCol + 1;
  const write = (r, c, value) => {
    if (value === undefined || value === null) return;
    sheet[XLSX.utils.encode_cell({ r, c })] = typeof value === 'object' ? value : { t: typeof value === 'number' ? 'n' : 's', v: value };
  };
  write(hr, dateCol, 'Date');
  const gap = options.shift ? 5 : 4;
  const selectedHeaders = options.headers || headers;
  selectedHeaders.forEach((header, i) => {
    write(hr, start + gap * i, header);
    ['Spent', 'Impression', '유동인구'].forEach((value, j) => write(hr + 2, start + gap * i + j, value));
  });
  const days = options.days || [
    { date: serial('2029-01-15'), values: perDay }, // Wrong-year helper, must not pollute sums.
    { date: serial('2030-01-14') + 0.5, values: perDay },
    { date: '2030-01-15', values: perDay },
    { date: serial('2030-01-16'), values: [] }, // Blank dated template, not latest real data.
    { date: serial('2030-02-01'), values: perDay }, // Other campaign month ignored.
  ];
  days.forEach((day, i) => {
    const r = hr + 5 + i;
    write(r, dateCol, day.date);
    selectedHeaders.forEach((_, g) => {
      const values = day.values[g] || [];
      values.forEach((value, j) => write(r, start + gap * g + j, value));
    });
  });
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: hr + 5 + days.length, c: start + gap * selectedHeaders.length } });
  if (options.mutate) options.mutate(sheet, { hr, start, gap });
  if (options.date1904) book.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(book, sheet, options.sheetName || '애드부스트스크린(01.01~)');
  if (options.duplicate) XLSX.utils.book_append_sheet(book, sheet, '애드부스트스크린 복제');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
}
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
const result = parse(workbook(), 'synthetic.xlsx', context);
const withSummary = workbook({ mutate: sheet => {
  sheet.B35 = { t: 's', v: 'CGV_Screen_Gold' };
  sheet.C35 = { t: 'n', v: 123 };
  sheet.D35 = { t: 'n', v: 456 };
  const range = XLSX.utils.decode_range(sheet['!ref']); range.e.r = Math.max(range.e.r, 35);
  sheet['!ref'] = XLSX.utils.encode_range(range);
} });
const aggregateTemplates = workbook({ days: [
  { date: '2030-01-14', values: perDay }, { date: context.reportDate, values: perDay },
  { date: '2030-01-16', values: [[0, 0, 0]] }, { date: '2030-01-17', values: [[0, 0, 0]] },
] });
assert.deepEqual(parse(aggregateTemplates, 'synthetic.xlsx', context), result, 'Aggregate cached zero formulas do not create future inventory data');
assert.deepEqual(parse(withSummary, 'synthetic.xlsx', context), result, 'Later summary inventory labels are not data header candidates');
assert.equal(result.version, 1); assert.equal(result.reportDate, context.reportDate);
assert.equal(result.sourceSheet, '애드부스트스크린(01.01~)');
assert.equal(result.rows.length, 5); assert.deepEqual(result.rows.map(r => r.placement), headers.slice(1));
assert.equal(result.paidSpend, 200); assert.equal(result.reportedCount, 30);
assert.equal(result.rows[0].footTraffic, null); assert.equal(result.rows[1].footTraffic, 400);
assert.equal(result.rows[4].spend, 1800); assert.equal(result.rows[4].spendLabel, '원본 서비스 비용 참고값');
for (const row of result.rows) {
  assert.equal(row.clicks, null); assert.equal(row.ctr, null); assert.equal(row.achievement, null); assert.equal(row.guaranteed, '');
  assert.equal(row.metricLabel, '원본 Impression'); assert.equal(row.reportDate, context.reportDate); assert.equal(row.sourceFile, 'synthetic.xlsx');
  assert.ok(Number.isFinite(row.impressions));
}
assert.deepEqual(parse(workbook({ shift: true }), 'synthetic.xlsx', context).rows, result.rows, 'Rows/columns discovered independently of original offsets');
assert.throws(() => parse(workbook(), 'synthetic.xlsx', { ...context, expectedSpend: 203 }), /합계/);
assert.throws(() => parse(workbook(), 'synthetic.xlsx', { ...context, expectedImpressions: 33 }), /합계/);
assert.doesNotThrow(() => parse(workbook(), 'synthetic.xlsx', { ...context, expectedSpend: 201, expectedImpressions: 29 }), 'Tolerance one handles source rounding');
for (const reportDate of ['2030-01-14', '2030-01-16']) assert.throws(() => parse(workbook(), 'synthetic.xlsx', { ...context, reportDate }), /최신/);
assert.throws(() => parse(workbook({ days: [{ date: '2030-01-16', values: perDay }] }), 'synthetic.xlsx', context), /최신/);
assert.throws(() => parse(workbook({ days: [{ date: '2029-01-15', values: perDay }] }), 'synthetic.xlsx', context), /최신/);
for (const bad of [{ month: '2030-13' }, { reportDate: '2030-02-01' }, { reportDate: '2030-01-32' }, { expectedSpend: NaN }, { expectedImpressions: Infinity }]) assert.throws(() => parse(workbook(), 'synthetic.xlsx', { ...context, ...bad }));
assert.throws(() => parse(new ArrayBuffer(16 * 1024 * 1024), 'synthetic.xlsx', context), /15MB/);
assert.throws(() => parse(workbook({ duplicate: true }), 'synthetic.xlsx', context), /하나/);
assert.throws(() => parse(workbook({ sheetName: 'Other campaign' }), 'synthetic.xlsx', context), /하나/);
assert.throws(() => parse(workbook({ mutate: (sheet, { hr, start, gap }) => { delete sheet[XLSX.utils.encode_cell({ r: hr + 2, c: start + gap + 1 })]; } }), 'synthetic.xlsx', context), /열을 확인/);
assert.throws(() => parse(workbook({ mutate: (sheet, { hr, start }) => { sheet[XLSX.utils.encode_cell({ r: hr, c: start - 2 < 0 ? 0 : start - 2 })] = { t: 's', v: 'Date' }; } }), 'synthetic.xlsx', context), /날짜 열/);
const strings = perDay.map(row => row.map(value => value === null ? null : String(value)));
assert.equal(parse(workbook({ days: [{ date: context.reportDate, values: strings }] }), 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 15 }).paidSpend, 100);
const absentService = perDay.map((row, i) => i === 5 ? [] : row);
const withoutService = parse(workbook({ days: [{ date: context.reportDate, values: absentService }] }), 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 10 });
assert.equal(withoutService.rows.length, 4); assert.equal(withoutService.rows.some(row => row.spendLabel), false);
const zeroService = perDay.map((row, i) => i === 5 ? [0, 0, null] : row);
assert.equal(parse(workbook({ days: [{ date: context.reportDate, values: zeroService }] }), 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 10 }).rows[4].impressions, 0, 'Real zero is not blank');
const missingCount = perDay.map((row, i) => i === 1 ? [10, null, 100] : row);
assert.throws(() => parse(workbook({ days: [{ date: context.reportDate, values: missingCount }] }), 'synthetic.xlsx', context), /누락/);
const invalid = perDay.map((row, i) => i === 1 ? ['not a number', 1, 0] : row);
assert.throws(() => parse(workbook({ days: [{ date: context.reportDate, values: invalid }] }), 'synthetic.xlsx', context), /숫자/);
const error = perDay.map((row, i) => i === 1 ? [{ t: 'e', v: 36 }, 1, 0] : row);
assert.throws(() => parse(workbook({ days: [{ date: context.reportDate, values: error }] }), 'synthetic.xlsx', context), /Excel 오류/);
const inconsistent = perDay.map((row, i) => i === 0 ? [1010, 15, null] : row);
assert.throws(() => parse(workbook({ days: [{ date: context.reportDate, values: inconsistent }] }), 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 15 }), /패키지 비용/);
assert.throws(() => parse(workbook({ days: [{ date: context.reportDate, values: perDay }, { date: context.reportDate, values: perDay }] }), 'synthetic.xlsx', context), /중복/);
const nullSpend = perDay.map((row, i) => i === 5 ? [null, 5, null] : row);
assert.equal(parse(workbook({ days: [{ date: context.reportDate, values: nullSpend }] }), 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 15 }).rows[4].spend, null);
const date1904 = workbook({ date1904: true, days: [{ date: serial(context.reportDate) - 1462, values: perDay }] });
assert.equal(parse(date1904, 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 15 }).reportDate, context.reportDate);
const numericOnly = workbook({ days: [{ date: serial(context.reportDate), values: perDay }] });
assert.equal(parse(numericOnly, 'synthetic.xlsx', { ...context, expectedSpend: 100, expectedImpressions: 15 }).reportDate, '2030-01-15', 'KST numeric serial stays on the same calendar day');

function dataset(breakdown, extra = {}) { return { key: 'fixture', advertiser: 'Synthetic', month: '2030-01', sourceFile: 'synthetic.xlsx', publishedAt: '2030-01-16T00:00:00Z', mailSubject: '', mailDate: '', bundle: { reportDate: '2030-01-15', placements: [], dailyPerformance: [], mediaPlan: [], showroomBreakdown: breakdown }, ...extra }; }
const older = { ...result, reportDate: '2030-01-14', rows: result.rows.map(row => ({ ...row, reportDate: '2030-01-14', platform: '애드부스트' })) };
const anotherMonth = { ...result, reportDate: '2030-02-15', rows: result.rows.map(row => ({ ...row, reportDate: '2030-02-15' })) };
const datasets = deepFreeze([dataset(older), dataset(result), dataset(anotherMonth, { month: '2030-02' }), dataset(undefined), dataset({ version: 2, rows: result.rows }), dataset({ ...result, rows: [null, {}, { ...result.rows[0], impressions: NaN }] })]);
const before = JSON.stringify(datasets);
const extracted = extract(datasets);
assert.equal(extracted.length, 10, 'Latest per inventory and month, canonical media aliases coalesce');
assert.strictEqual(extracted.find(row => row.reportDate === context.reportDate && row.placement === headers[1]), result.rows[0]);
assert.equal(JSON.stringify(datasets), before); assert.deepEqual(datasets[1].bundle.placements, []);
assert.deepEqual(extract([dataset({ ...result, reportDate: '2030-02-15' })]), [], 'Wrong-month metadata ignored');
for (const value of [null, {}, { ...result.rows[0], clicks: 10 }, { ...result.rows[0], footTraffic: Infinity }, { ...result.rows[0], platform: 'Other' }, { ...result.rows[0], reportDate: '2030-01-14' }]) {
  assert.deepEqual(extract([dataset({ ...result, rows: [value] })]), [], 'Malformed metadata is not exposed');
}
const later = { ...result, rows: [{ ...result.rows[0], spend: 77 }] };
assert.strictEqual(extract([dataset(result), dataset(later, { publishedAt: '2030-01-17T00:00:00Z' })])[0], later.rows[0]);
assert.equal(extract([dataset(result), dataset(result, { advertiser: 'Another synthetic advertiser' })]).length, 10, 'Advertiser scopes never collapse');
console.log('Breakdown regressions passed: discovered headers, serial/ISO dates, KST/1904 dates, latest-date validation, service-aware totals, blank/null/zero handling, malformed numeric rejection, source metadata, canonical latest projection and unchanged base facts.');
