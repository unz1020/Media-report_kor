const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.resolve(__dirname, '../lib/performance-brief.ts');
const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
});
assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const moduleFixture = { exports: {} };
// The projection has only type dependencies. Any runtime I/O, storage, network,
// UI or customer-data import is a regression; all fixtures below are synthetic.
new Function('require', 'exports', 'module', result.outputText)(p => {
  assert.fail(`Unexpected runtime dependency: ${p}`);
}, moduleFixture.exports, moduleFixture);
const { buildPerformanceChanges } = moduleFixture.exports;
const row = (extra = {}) => ({ date: '2030-01-20', platform: 'Original platform', placement: 'Slot A', sourceSheet: 'Daily',
  sourceFile: 'fixture.xlsx', reportDate: '2030-01-21', spend: null, impressions: 100, clicks: 10, views: null,
  ctr: null, cpc: null, cpm: null, cpv: null, vtr: null, ...extra });
const media = (dailyRows, extra = {}) => ({ name: 'Synthetic', kind: 'digital', rows: [], plans: [], dailyRows,
  metrics: { spend: null, impressions: null, clicks: null, ctr: null, views: null, conversions: null, cpc: null, cpm: null, cpv: null,
    rowCount: 0, spendRowCount: 0, clickRowCount: 0, viewRowCount: 0 }, reportDate: null, dailyThrough: null, sourceCount: 1, ...extra });
const pair = (...args) => {
  const previous = args.length > 0 ? args[0] : 10;
  const current = args.length > 1 ? args[1] : 15;
  return media([row({ date: '2030-01-19', clicks: previous }), row({ clicks: current })], args[2] || {});
};
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
const change = buildPerformanceChanges([pair()]);
assert.deepEqual(change, [{ media: 'Synthetic', date: '2030-01-20', previousDate: '2030-01-19', metric: 'clicks', current: 15, previous: 10, percent: 50 }]);
assert.deepEqual(buildPerformanceChanges([]), []);
assert.deepEqual(buildPerformanceChanges([media([])]), []);
assert.deepEqual(buildPerformanceChanges([pair(10, 10)]), [], 'No unchanged entries');
assert.equal(buildPerformanceChanges([pair(10, 0)])[0].percent, -100, 'Current zero is real, not missing');
for (const previous of [0, null, undefined, NaN, Infinity, -1]) assert.deepEqual(buildPerformanceChanges([pair(previous, 2)]), [], `Invalid/zero previous ${previous}`);
for (const current of [null, undefined, NaN, Infinity, -1]) assert.deepEqual(buildPerformanceChanges([pair(2, current)]), [], `Invalid current ${current}`);
assert.deepEqual(buildPerformanceChanges([pair(Number.MIN_VALUE, Number.MAX_VALUE)]), [], 'Nonfinite percentage suppressed');

// No selected metric can be filtered away to manufacture stable coverage.
const stable = media([
  row({ date: '2030-01-19', placement: 'A', clicks: 10 }), row({ date: '2030-01-19', placement: 'B', clicks: 20 }),
  row({ placement: 'B', clicks: 30 }), row({ placement: 'A', clicks: 15 }),
]);
assert.equal(buildPerformanceChanges([stable])[0].percent, 50, 'Order-independent full placement coverage');
for (const field of ['platform', 'placement', 'sourceSheet']) {
  const changed = media([row({ date: '2030-01-19' }), row({ clicks: 15, [field]: 'Different' })]);
  assert.deepEqual(buildPerformanceChanges([changed]), [], `${field} changes coverage`);
}
assert.deepEqual(buildPerformanceChanges([media(stable.dailyRows.slice(1))]), [], 'Added/removed placement suppresses');
assert.deepEqual(buildPerformanceChanges([media(stable.dailyRows.map((r, i) => i === 2 ? { ...r, clicks: null } : r))]), [], 'One missing metric suppresses whole media');
assert.deepEqual(buildPerformanceChanges([media([
  row({ date: '2030-01-19' }), row({ date: '2030-01-19', placement: 'B', clicks: null }), row({ clicks: 15 }),
])]), [], 'Missing metric row still participates in coverage identity');
const aliases = media([row({ date: '2030-01-19', platform: 'YouTube' }), row({ platform: '유튜브', clicks: 20 })]);
assert.deepEqual(buildPerformanceChanges([aliases]), [], 'Original platform identity, not canonical aliases');
const importChange = media([
  row({ date: '2030-01-19', sourceFile: 'old.xlsx', reportDate: '2030-01-19' }),
  row({ clicks: 20, sourceFile: 'new.xlsx', reportDate: '2030-01-23' }),
]);
assert.equal(buildPerformanceChanges([importChange])[0].percent, 100, 'Import identity does not alter placement coverage');
const missingSheet = media([row({ date: '2030-01-19', sourceSheet: undefined }), row({ sourceSheet: '', clicks: 20 })]);
assert.deepEqual(buildPerformanceChanges([missingSheet]), [], 'Missing and empty sheet remain distinct');

// Duplicate multiplicity is evidence, never deduplicated or allocated.
const duplicate = row({ date: '2030-01-19', clicks: 10 });
const currentDuplicate = row({ clicks: 20 });
const duplicateMedia = media([duplicate, duplicate, currentDuplicate, currentDuplicate]);
assert.deepEqual(buildPerformanceChanges([duplicateMedia])[0], { media: 'Synthetic', date: '2030-01-20', previousDate: '2030-01-19', metric: 'clicks', current: 40, previous: 20, percent: 100 });
assert.deepEqual(buildPerformanceChanges([media([duplicate, duplicate, currentDuplicate])]), [], 'Multiplicity mismatch suppresses');
assert.deepEqual(buildPerformanceChanges([media([duplicate, duplicate, currentDuplicate, row({ clicks: NaN })])]), [], 'Every duplicate must supply metric');
const differentMultiplicity = media([
  row({ date: '2030-01-19', placement: 'A' }), row({ date: '2030-01-19', placement: 'A' }), row({ date: '2030-01-19', placement: 'B' }),
  row({ placement: 'A', clicks: 20 }), row({ placement: 'B', clicks: 20 }), row({ placement: 'B', clicks: 20 }),
]);
assert.deepEqual(buildPerformanceChanges([differentMultiplicity]), [], 'Equal day row count is not equal multiset');
assert.deepEqual(buildPerformanceChanges([media([row({ date: '2030-01-19', clicks: Number.MAX_VALUE }), row({ date: '2030-01-19', clicks: Number.MAX_VALUE }), currentDuplicate, currentDuplicate])]), [], 'Overflow totals suppressed');

// Views are raw platform-defined counts, not reach. Partial/invalid views never
// fall through to an easier click comparison; absent views allow known clicks.
const video = media([row({ date: '2030-01-19', views: 20, clicks: 100 }), row({ views: 10, clicks: 500 })], { kind: 'video' });
assert.equal(buildPerformanceChanges([video])[0].metric, 'views'); assert.equal(buildPerformanceChanges([video])[0].percent, -50);
assert.equal(buildPerformanceChanges([pair(10, 20, { kind: 'video' })])[0].metric, 'clicks');
for (const views of [null, NaN, -1, Infinity]) {
  assert.deepEqual(buildPerformanceChanges([media([row({ date: '2030-01-19', views: 10 }), row({ views, clicks: 30 })], { kind: 'video' })]), []);
}
assert.equal(buildPerformanceChanges([media([row({ date: '2030-01-19', views: 10 }), row({ views: 0 })], { kind: 'video' })])[0].percent, -100);
assert.deepEqual(buildPerformanceChanges([media([row({ date: '2030-01-19', views: 0 }), row({ views: 20 })], { kind: 'video' })]), []);
assert.equal(buildPerformanceChanges([media([row({ date: '2030-01-19', views: 100 }), row({ views: 100, clicks: 20 })])])[0].metric, 'clicks', 'Digital chooses clicks regardless of views');
for (const kind of ['ooh', 'broadcast', 'other']) assert.deepEqual(buildPerformanceChanges([pair(10, 100, { kind })]), []);

// Latest actual media day and exactly preceding calendar date, not latest two
// observed dates, report import dates or global UI range end dates.
assert.deepEqual(buildPerformanceChanges([media([row({ date: '2030-01-18' }), row({ clicks: 20 })])]), [], 'Calendar gap');
assert.deepEqual(buildPerformanceChanges([media([row({ date: '2030-01-18' }), row({ date: '2030-01-19', clicks: 20 }), row({ date: '2030-01-22', clicks: 30 })])]), [], 'Never fall back to older adjacent pair');
for (const bad of ['2030-02-29', '2030-02-30', '2030-04-31', '2030-00-20', '2030-13-20', '2030-01-00', '2030-01-32', '2030-1-20', '2030-01-20T00:00:00Z', '', 'invalid']) {
  assert.deepEqual(buildPerformanceChanges([media([...pair().dailyRows, row({ date: bad })])]), [], `Invalid date ${bad} cannot hide behind valid old pair`);
}
for (const [previousDate, date] of [['2032-02-28', '2032-02-29'], ['2032-02-29', '2032-03-01'], ['2030-02-28', '2030-03-01'], ['2029-12-31', '2030-01-01'], ['2030-04-30', '2030-05-01']]) {
  const result = buildPerformanceChanges([media([row({ date: previousDate }), row({ date, clicks: 20 })])]);
  assert.equal(result[0].previousDate, previousDate); assert.equal(result[0].date, date);
}
const distinctDates = buildPerformanceChanges([
  pair(10, 20, { name: 'A', reportDate: '2030-01-31', dailyThrough: '2030-01-31' }),
  media([row({ date: '2030-01-12' }), row({ date: '2030-01-13', clicks: 20 })], { name: 'B' }),
]);
assert.equal(distinctDates.find(r => r.media === 'A').date, '2030-01-20');
assert.equal(distinctDates.find(r => r.media === 'B').date, '2030-01-13');

// At most three, largest absolute movement first, lexical name tie-break;
// direction carries no positive/negative-outcome interpretation.
const rankingInput = [pair(100, 110, { name: 'D' }), pair(100, 150, { name: 'C' }), pair(100, 50, { name: 'B' }), pair(100, 0, { name: 'A' })];
assert.deepEqual(buildPerformanceChanges(rankingInput).map(r => [r.media, r.percent]), [['A', -100], ['B', -50], ['C', 50]]);
assert.deepEqual(buildPerformanceChanges([...rankingInput].reverse()), buildPerformanceChanges(rankingInput));
const frozen = deepFreeze([stable, duplicateMedia, video, ...rankingInput]);
const before = JSON.stringify(frozen);
const first = buildPerformanceChanges(frozen);
assert.deepEqual(buildPerformanceChanges(frozen), first); assert.equal(JSON.stringify(frozen), before);
assert.strictEqual(frozen[1].dailyRows[0], duplicate); assert.strictEqual(frozen[1].dailyRows[1], duplicate);
console.log('Performance brief regressions passed: strict calendar adjacency, complete identity multisets, paired metric coverage, zero/invalid guards, neutral ranking, frozen source ownership.');
