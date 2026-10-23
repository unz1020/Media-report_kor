const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const allowed = ['lib/performance-report.ts', 'lib/media-normalization.ts', 'lib/placement-showroom.ts', 'lib/placement-urls.ts'].map(p => path.resolve(root, p));
// Type-only fact imports disappear. Storage, network, customer data and UI
// dependencies are deliberately unavailable to this synthetic-only harness.
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.includes(name), `Unexpected runtime dependency: ${file}`);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const result = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  new Function('require', 'exports', 'module', result.outputText)(p => {
    assert.ok(p.startsWith('.'), `Non-pure dependency: ${p}`);
    return load(path.resolve(path.dirname(name), `${p}.ts`));
  }, module.exports, module);
  return module.exports;
}
const { buildPerformanceReport, isPerformanceReferenceRow } = load('lib/performance-report.ts');
const row = (extra = {}) => ({ platform: '네이버', placement: '검색 PC', achievement: null, guaranteed: '', spend: null,
  impressions: null, clicks: null, ctr: null, views: null, conversions: null, cpc: null, cpm: null, cpv: null,
  sourceSheet: 'synthetic', sourceFile: 'fixture.xlsx', reportDate: '2030-01-20', ...extra });
const daily = (extra = {}) => ({ ...row(), date: '2030-01-19', ...extra });
const plan = (extra = {}) => ({ platform: '네이버', placement: '검색 PC', product: '검색광고', device: 'PC', creativeType: '',
  periodStart: '2030-01-01', periodEnd: '2030-01-31', budget: 9000000, expectedImpressions: 1000000, expectedClicks: 100,
  target: '', sourceSheet: 'synthetic plan', ...extra });
const input = (extra = {}) => ({ rows: [], dailyRows: [], plans: [], startDate: '2030-01-10', endDate: '2030-01-25', baselineComplete: true, ...extra });
const build = (extra = {}) => buildPerformanceReport(input(extra));
const values = ['spend', 'impressions', 'clicks', 'ctr', 'views', 'conversions', 'cpc', 'cpm', 'cpv'];
function nullMetrics(metrics) { for (const key of values) assert.equal(metrics[key], null, key); }
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`); }

// Empty/all-unknown must not manufacture zeros or rates. Provided rates alone
// cannot supply a valid aggregate, even when the supplied row rate is zero.
const empty = build();
assert.deepEqual(empty.media, []); assert.equal(empty.planOnlyCount, 0);
for (const k of ['reportedSpend', 'digitalImpressions', 'digitalClicks', 'digitalCtr', 'videoViews']) assert.equal(empty.totals[k], null);
const unknown = build({ rows: [row({ ctr: 0, cpc: 2, cpm: 3, cpv: 4 })] });
nullMetrics(unknown.media[0].metrics); assert.equal(unknown.totals.metricMediaCount, 0);
const invalid = build({ rows: [row({ spend: NaN, impressions: Infinity, clicks: -Infinity, views: NaN, conversions: undefined })] });
nullMetrics(invalid.media[0].metrics); assert.equal(invalid.media[0].metrics.spendRowCount, 0);
const zero = build({ rows: [row({ spend: 0, impressions: 0, clicks: 0, views: 0, conversions: 0 })] });
for (const key of ['spend', 'impressions', 'clicks', 'views', 'conversions']) assert.equal(zero.media[0].metrics[key], 0);
for (const key of ['ctr', 'cpc', 'cpm', 'cpv']) assert.equal(zero.media[0].metrics[key], null, 'Zero denominator is undefined, not zero');
assert.equal(zero.totals.reportedSpend, 0); assert.equal(zero.totals.spendMediaCount, 1);
assert.equal(zero.media[0].metrics.clickRowCount, 1);
const validZero = build({ rows: [row({ spend: 0, impressions: 100, clicks: 10, views: 10 })] }).media[0].metrics;
assert.equal(validZero.cpc, 0); assert.equal(validZero.cpm, 0); assert.equal(validZero.cpv, 0);

// Each denominator has its own compatible paired subset. Standalone spend,
// clicks/views and impressions must not leak into unrelated rate numerators.
const paired = build({ rows: [
  row({ spend: 100, impressions: 1000, clicks: 10, views: 20, ctr: 99, cpc: 999 }),
  row({ spend: 900, impressions: 9000, clicks: null, views: null, ctr: 99 }),
  row({ spend: null, impressions: 100, clicks: 90, views: 4000, ctr: 99 }),
  row({ spend: 500, impressions: null, clicks: 100, views: 100 }),
  row({ spend: null, impressions: null, clicks: 7000, views: 8000 }),
] });
const pm = paired.media[0].metrics;
assert.equal(pm.spend, 1500); assert.equal(pm.clicks, 7200);
near(pm.ctr, 100 / 1100 * 100); near(pm.cpc, 600 / 110); near(pm.cpm, 1000 / 10000 * 1000); near(pm.cpv, 600 / 120);
near(paired.totals.digitalCtr, pm.ctr);
const weighted = build({ rows: [row({ impressions: 100, clicks: 50, ctr: 50 }), row({ impressions: 9900, clicks: 50, ctr: 0.505 })] });
assert.equal(weighted.media[0].metrics.ctr, 1, 'CTR must be weighted by paired impressions');
const incompatible = build({ rows: [row({ spend: 50 }), row({ clicks: 10, views: 20, impressions: 200 })] }).media[0].metrics;
assert.equal(incompatible.cpc, null); assert.equal(incompatible.cpm, null); assert.equal(incompatible.cpv, null);
const overflow = build({ rows: [row({ spend: Number.MAX_VALUE, impressions: Number.MAX_VALUE, clicks: 1 }), row({ spend: Number.MAX_VALUE, impressions: Number.MAX_VALUE, clicks: 1 })] });
assert.equal(overflow.totals.reportedSpend, null); assert.equal(overflow.totals.digitalCtr, null);

// Physical/TV counts remain per-media raw figures, not digital impressions or
// clicks. Only explicitly known video channels contribute global raw views.
const channels = build({ rows: [
  row({ platform: 'NAVER GFA', impressions: 100, clicks: 2, views: 1000, spend: 10 }),
  row({ platform: 'YouTube', impressions: 200, clicks: 4, views: 50, spend: 20 }),
  row({ platform: 'Netflix', impressions: null, clicks: null, views: 70 }),
  row({ platform: 'SBS-TV', impressions: 9000, clicks: 500, views: 9000, spend: 30 }),
  row({ platform: '포커스미디어', impressions: 8000, clicks: 500, views: 8000, spend: 40 }),
  row({ platform: 'Unknown video campaign', placement: 'CTR traffic 동영상 캠페인', impressions: 1, clicks: 1, views: 7000 }),
] });
const byName = name => channels.media.find(m => m.name === name);
assert.equal(byName('유튜브').kind, 'video'); assert.equal(byName('넷플릭스').kind, 'video');
assert.equal(byName('SBS-TV').kind, 'broadcast'); assert.equal(byName('포커스미디어').kind, 'ooh');
assert.equal(byName('Unknown video campaign').kind, 'other');
assert.equal(byName('네이버').kind, 'digital', 'Views do not imply a video objective');
assert.equal(byName('SBS-TV').metrics.impressions, 9000); assert.equal(byName('포커스미디어').metrics.clicks, 500);
assert.equal(channels.totals.digitalImpressions, 300); assert.equal(channels.totals.digitalClicks, 6); assert.equal(channels.totals.digitalCtr, 2);
assert.equal(channels.totals.videoViews, 120); assert.equal(channels.totals.videoMediaCount, 2); assert.equal(channels.totals.reportedSpend, 100);
for (const platform of ['tvN STORY', 'KBS2', '어드레서블TV', 'Addr.TV']) assert.equal(build({ rows: [row({ platform })] }).media[0].kind, 'broadcast');
for (const platform of ['CGV', '서울버스TV', '애드부스트']) assert.equal(build({ rows: [row({ platform })] }).media[0].kind, 'ooh');
assert.equal(build({ rows: [row({ platform: 'DV360', placement: 'SBS-TV CGV 영상' })] }).media[0].kind, 'digital');

// Reference cost exclusion is explicit; general service-related source notes
// must not erase legitimate paid package cost. Raw records/counts are retained.
assert.equal(isPerformanceReferenceRow({ service: true }), true);
assert.equal(isPerformanceReferenceRow({ sourceKind: 'showroom_breakdown' }), true);
assert.equal(isPerformanceReferenceRow({ spendLabel: '원본 서비스 비용 참고값' }), true);
assert.equal(isPerformanceReferenceRow({ placement: '메인배너' }), false);
assert.equal(isPerformanceReferenceRow({}), false);
const referenceRows = [
  row({ spend: 100, impressions: 100, clicks: 10, views: 20, sourceNotes: 'counts include service; spend excludes service' }),
  row({ spend: 1000, impressions: 1, clicks: 1, views: 1, service: true }),
  row({ spend: 2000, impressions: 2, sourceKind: 'showroom_breakdown' }),
  row({ spend: 3000, impressions: 3, placement: '메인배너(서비스)' }),
  row({ spend: 4000, impressions: 4, spendLabel: '원본 서비스 비용 참고값' }),
  row({ spend: 5000, impressions: 5, placement: 'Bonus placement' }),
];
const refs = build({ rows: referenceRows });
assert.equal(refs.totals.reportedSpend, 100); assert.equal(refs.totals.excludedReferenceRows, 5);
assert.equal(refs.media[0].metrics.spendRowCount, 1); assert.equal(refs.media[0].metrics.cpc, 10);
assert.equal(refs.media[0].metrics.cpm, 1000); assert.equal(refs.media[0].metrics.cpv, 5);
assert.equal(refs.media[0].rows.length, 6); assert.equal(refs.media[0].metrics.impressions, 115);
const referenceOnly = build({ rows: [row({ service: true, spend: 123 })] });
assert.equal(referenceOnly.totals.reportedSpend, null); assert.equal(referenceOnly.totals.spendMediaCount, 0);

// Canonical union, daily-only and plan-only sources. No plan allocation, row
// deduplication, source mutation, or source-row replacement is allowed.
const originalRow = row({ platform: '네이버 GFA', spend: 2, impressions: 100, reportDate: '2030-01-17' });
const originalDaily = daily({ spend: 999, impressions: 999, date: '2030-01-14', reportDate: '2030-01-21' });
const originalPlan = plan({ platform: 'navergfa' });
const planOnly = plan({ platform: '새로운 매체' });
const frozen = deepFreeze(input({ rows: [originalRow, originalRow], dailyRows: [originalDaily, originalDaily,
  daily({ platform: 'TikTok', date: '2030-01-12', reportDate: '2030-01-13', sourceFile: 'daily.csv' }),
  daily({ platform: 'Out of range', date: '2030-01-09' }), daily({ platform: 'Future', date: '2030-01-26' })],
  plans: [originalPlan, planOnly, planOnly] }));
const before = JSON.stringify(frozen);
const union = buildPerformanceReport(frozen);
assert.equal(JSON.stringify(frozen), before); assert.deepEqual(buildPerformanceReport(frozen), union);
assert.equal(union.media.length, 3); assert.equal(union.planOnlyCount, 1);
const naver = union.media.find(m => m.name === '네이버');
assert.equal(naver.rows.length, 2); assert.strictEqual(naver.rows[0], originalRow); assert.strictEqual(naver.rows[1], originalRow);
assert.strictEqual(naver.dailyRows[0], originalDaily); assert.equal(naver.dailyRows.length, 2); assert.strictEqual(naver.plans[0], originalPlan);
assert.notStrictEqual(naver.rows, frozen.rows); assert.equal(naver.metrics.spend, 4, 'Never double-add daily facts or monthly budget');
assert.equal(naver.metrics.impressions, 200); assert.equal(naver.sourceCount, 1);
assert.equal(naver.reportDate, '2030-01-21'); assert.equal(naver.dailyThrough, '2030-01-14');
const tt = union.media.find(m => m.name === '틱톡');
nullMetrics(tt.metrics); assert.equal(tt.reportDate, '2030-01-13'); assert.equal(tt.dailyThrough, '2030-01-12');
assert.equal(union.latestReportDate, '2030-01-21'); assert.equal(union.latestDailyDate, '2030-01-14');
const planned = union.media.find(m => m.name === '새로운 매체');
assert.equal(planned.plans.length, 2); assert.strictEqual(planned.plans[0], planOnly); assert.strictEqual(planned.plans[1], planOnly);
nullMetrics(planned.metrics); assert.equal(planned.reportDate, null); assert.equal(planned.dailyThrough, null); assert.equal(planned.sourceCount, 0);
const outsideRow = row({ reportDate: '2030-02-01', spend: 1 });
assert.strictEqual(build({ rows: [outsideRow] }).media[0].rows[0], outsideRow, 'Period rows are caller-scoped, never date-filtered again');
const sources = build({ rows: [row({ sourceFile: 'a.xlsx' }), row({ sourceFile: 'b.xlsx' })], dailyRows: [daily({ sourceFile: 'b.xlsx' }), daily({ sourceFile: 'c.csv' })] });
assert.equal(sources.media[0].sourceCount, 3);

// A missing cumulative baseline invalidates ALL derived period metrics, not
// source facts, independent dates, evidence coverage counters or reference flags.
const incompleteInput = deepFreeze(input({ baselineComplete: false, rows: referenceRows.concat(row({ platform: 'YouTube', spend: 10, impressions: 20, clicks: 2, views: 5 })), dailyRows: [originalDaily], plans: [planOnly] }));
const incomplete = buildPerformanceReport(incompleteInput);
assert.equal(incomplete.baselineComplete, false);
for (const item of incomplete.media) nullMetrics(item.metrics);
for (const key of ['reportedSpend', 'digitalImpressions', 'digitalClicks', 'digitalCtr', 'videoViews']) assert.equal(incomplete.totals[key], null, key);
assert.equal(incomplete.totals.excludedReferenceRows, 5); assert.equal(incomplete.totals.spendMediaCount, 2);
assert.equal(incomplete.media[0].metrics.rowCount, 6); assert.strictEqual(incomplete.media[0].rows[0], referenceRows[0]);
assert.equal(incomplete.latestReportDate, '2030-01-21'); assert.equal(incomplete.latestDailyDate, '2030-01-14');
// Creative daily facts are independent source evidence, not cumulative actuals.
const creative = (extra = {}) => ({ platform: '네이버 GFA', placement: 'Creative slot', creative: 'Synthetic creative',
  date: '2030-01-18', impressions: 999999, clicks: 88888, ctr: 8.8888,
  sourceSheet: 'Creative facts', sourceFile: 'creative.xlsx', reportDate: '2030-01-23', ...extra });
const creativeOnlyRow = creative({ platform: 'YouTube', date: '2030-01-19', sourceFile: 'video-creatives.xlsx', reportDate: '2030-01-24' });
const ownedCreative = creative();
const truePlan = plan({ platform: 'True plan only' });
const creativeOnlyPlan = plan({ platform: 'YouTube' });
const creativeInput = deepFreeze(input({ rows: [originalRow], dailyRows: [originalDaily],
  creativeRows: [ownedCreative, ownedCreative, creativeOnlyRow,
    creative({ platform: 'Too early', date: '2030-01-09' }), creative({ platform: 'Too late', date: '2030-01-26' })],
  plans: [truePlan, creativeOnlyPlan] }));
const creativeBefore = JSON.stringify(creativeInput);
const creativeReport = buildPerformanceReport(creativeInput);
const withCreative = creativeReport.media.find(m => m.name === '네이버');
assert.equal(withCreative.creativeRows.length, 2); assert.strictEqual(withCreative.creativeRows[0], ownedCreative); assert.strictEqual(withCreative.creativeRows[1], ownedCreative);
assert.notStrictEqual(withCreative.creativeRows, creativeInput.creativeRows);
assert.strictEqual(withCreative.rows[0], originalRow); assert.strictEqual(withCreative.dailyRows[0], originalDaily);
assert.equal(withCreative.reportDate, '2030-01-23'); assert.equal(withCreative.dailyThrough, '2030-01-14'); assert.equal(withCreative.creativeThrough, '2030-01-18');
assert.equal(withCreative.sourceCount, 2, 'Creative owner filename contributes to independent source metadata');
assert.equal(withCreative.metrics.spend, 2); assert.equal(withCreative.metrics.impressions, 100); assert.equal(withCreative.metrics.clicks, null);
const onlyCreative = creativeReport.media.find(m => m.name === '유튜브');
assert.equal(onlyCreative.kind, 'video'); assert.strictEqual(onlyCreative.creativeRows[0], creativeOnlyRow);
assert.deepEqual(onlyCreative.rows, []); assert.deepEqual(onlyCreative.dailyRows, []); nullMetrics(onlyCreative.metrics);
assert.equal(onlyCreative.reportDate, '2030-01-24'); assert.equal(onlyCreative.creativeThrough, '2030-01-19'); assert.equal(onlyCreative.dailyThrough, null); assert.equal(onlyCreative.sourceCount, 1);
assert.equal(creativeReport.planOnlyCount, 1, 'Creative-backed plan media is not plan-only');
assert.equal(creativeReport.media.length, 3, 'Out-of-range creative-only media do not leak into union');
assert.equal(creativeReport.latestReportDate, '2030-01-24'); assert.equal(creativeReport.latestDailyDate, '2030-01-14', 'No creative-through stamping on daily date');
assert.deepEqual(creativeReport.totals, build({ rows: [originalRow], dailyRows: [originalDaily] }).totals, 'Creative counts never inflate any cumulative metric or coverage total');
assert.equal(JSON.stringify(creativeInput), creativeBefore); assert.deepEqual(buildPerformanceReport(creativeInput), creativeReport);
const noCreative = build(); assert.deepEqual(noCreative.media, []);
const creativeWithoutPlan = build({ creativeRows: [creativeOnlyRow] });
assert.equal(creativeWithoutPlan.media.length, 1); assert.equal(creativeWithoutPlan.planOnlyCount, 0); assert.equal(creativeWithoutPlan.totals.digitalImpressions, null); assert.equal(creativeWithoutPlan.totals.digitalClicks, null); assert.equal(creativeWithoutPlan.totals.videoViews, null);
const legacyMedia = build({ rows: [originalRow] }).media[0];
assert.deepEqual(legacyMedia.creativeRows, []); assert.equal(legacyMedia.creativeThrough, null, 'Optional creative input preserves legacy callers');

const classificationBase = { rows: [row({ platform: 'Synthetic buyer', impressions: 100, clicks: 10 })], plans: [plan({ platform: 'Synthetic buyer', category: '디지털' })] };
assert.deepEqual(build({ ...classificationBase, creativeRows: [creative({ platform: 'Synthetic buyer', placement: 'CGV cinema creative evidence' })] }).totals, build(classificationBase).totals, 'Creative inventory details cannot reclassify cumulative buying-channel totals');

// latest() must ignore invalid calendar dates independently in every evidence
// stream, while retaining the original caller-scoped source records themselves.
const strictDatesInput = deepFreeze(input({ startDate: '2030-01-01', endDate: '2030-12-31',
  rows: [row({ reportDate: '2030-04-30' }), row({ reportDate: '2030-04-31' }), row({ reportDate: '2030-13-01' })],
  dailyRows: [daily({ date: '2030-02-28', reportDate: '2030-03-01' }), daily({ date: '2030-02-30', reportDate: '2030-02-30' })],
  creativeRows: [creative({ date: '2030-02-28', reportDate: '2030-03-02' }), creative({ date: '2030-02-29', reportDate: '2030-11-31' })] }));
const strictDates = buildPerformanceReport(strictDatesInput);
assert.equal(strictDates.media[0].reportDate, '2030-04-30'); assert.equal(strictDates.latestReportDate, '2030-04-30');
assert.equal(strictDates.media[0].dailyThrough, '2030-02-28'); assert.equal(strictDates.media[0].creativeThrough, '2030-02-28'); assert.equal(strictDates.latestDailyDate, '2030-02-28');
assert.strictEqual(strictDates.media[0].creativeRows[1], strictDatesInput.creativeRows[1], 'Invalid calendar evidence remains raw, never repaired or replaced');
const leapCreative = build({ startDate: '2032-02-01', endDate: '2032-03-01', creativeRows: [creative({ date: '2032-02-29', reportDate: '2032-02-29' })] });
assert.equal(leapCreative.media[0].creativeThrough, '2032-02-29'); assert.equal(leapCreative.latestReportDate, '2032-02-29');
console.log('Performance report regression checks passed (synthetic inputs only, pure runtime dependency allowlist).');
