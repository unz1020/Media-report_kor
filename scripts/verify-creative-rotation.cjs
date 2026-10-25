const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const allowed = ['creative-rotation', 'media-normalization', 'placement-showroom', 'placement-urls', 'performance-report'].map(p => path.join(root, 'lib', p + '.ts'));
// No runtime storage, network, UI, or customer fixture dependency is available.
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.includes(name), `Unexpected non-pure dependency: ${file}`);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const output = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.equal(output.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  new Function('require', 'exports', 'module', output.outputText)(p => {
    assert.ok(p.startsWith('.'), `Non-pure import: ${p}`);
    return load(path.resolve(path.dirname(name), p + '.ts'));
  }, module.exports, module);
  return module.exports;
}
const { buildCreativeRotationReport: build, creativeRotationCsv: csv, creativeRotationAuditCsv: auditCsv } = load('lib/creative-rotation.ts');
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const fact = (extra = {}) => ({ date: '2030-01-10', platform: '네이버', placement: '배너 PC', creative: 'A', impressions: 100, clicks: 10, ctr: 99, sourceSheet: 'synthetic', ...extra });
const dataset = (rows, extra = {}) => ({ key: 'synthetic', advertiser: 'Fixture', month: '2030-01', sourceFile: 'fixture.xlsx', mailSubject: '', mailDate: '', publishedAt: '2030-01-20T00:00:00Z', bundle: { reportDate: '2030-01-20', placements: [], creativeDailyPerformance: rows }, ...extra });
const proof = (extra = {}) => ({ advertiser: 'Fixture', month: '2030-01', reportDate: '2030-01-20', verificationDate: '2030-01-15', media: '네이버', placement: '배너 PC', campaignName: '', serviceType: '', periodStart: '2030-01-01', periodEnd: '2030-01-31', location: '', airingTime: '', dailyFrequency: null, durationSec: null, budgetReference: 9999, status: '게재 확인', creativeName: 'A', messageId: '', mailSubject: '', mailDate: '', sourceFile: 'proof.pdf', sourceSummary: '', attachments: [], ...extra });
const plan = (extra = {}) => ({ platform: '네이버', placement: '배너 PC', product: '', device: 'PC', creativeType: '', creativeName: 'A', periodStart: '2030-01-01', periodEnd: '2030-01-31', budget: 99999, expectedImpressions: 9999, expectedClicks: 99, target: '', sourceSheet: 'plan', operationStatus: '종료', ...extra });
const make = (extra = {}) => build(freeze({ datasets: [], proofs: [], plans: [], startDate: '2030-01-01', endDate: '2030-01-31', ...extra }));
const entries = report => report.groups.flatMap(g => [...g.creatives, ...g.unlinkedPerformance]);
const one = (rows, extra = {}) => entries(make({ datasets: [dataset(rows)], ...extra }))[0];
assert.deepEqual(make().groups, []);
const original = fact(); const owner = dataset([original]); const p = proof(); const pl = plan();
const input = freeze({ datasets: [owner], proofs: [p], plans: [pl], startDate: '2030-01-01', endDate: '2030-01-31' });
const before = JSON.stringify(input); const r = build(input); const e = r.groups[0].creatives[0];
assert.strictEqual(e.proofs[0], p); assert.strictEqual(e.plans[0], pl); assert.strictEqual(e.rows[0].row, original); assert.strictEqual(e.rows[0].dataset, owner);
assert.equal(JSON.stringify(input), before); assert.equal(e.metrics.impressions, 100); assert.equal(e.metrics.ctr, 10); assert.equal(e.metrics.spend, null);
assert.equal(e.plans[0].operationStatus, '종료'); assert.equal(e.proofs[0].status, '게재 확인'); assert.ok(!('status' in e));
assert.deepEqual(e.reportedDates, ['2030-01-10']); assert.equal(e.firstPerformanceDate, '2030-01-10'); assert.equal(e.lastReportDate, '2030-01-20');
const independent = build(input); independent.groups[0].creatives[0].rows[0].selected = false; assert.equal(e.rows[0].selected, true);
// Latest and archived datasets are one family; revisions replace, not add.
const old = dataset([fact({ impressions: 50 })], { key: 'synthetic::2030-01-19', bundle: { reportDate: '2030-01-19', creativeDailyPerformance: [fact({ impressions: 50 })] } });
let result = make({ datasets: [old, owner, owner] });
assert.equal(entries(result)[0].metrics.impressions, 100); assert.equal(entries(result)[0].rows.length, 3); assert.equal(result.sourceRowCount, 3);
assert.equal(entries(result)[0].rows.filter(r => r.selected).length, 1);
const newer = dataset([fact({ impressions: 200 })], { publishedAt: '2030-01-20T01:00:00Z' });
assert.equal(entries(make({ datasets: [owner, newer] }))[0].metrics.impressions, 200);
result = make({ datasets: [dataset([fact(), fact({ impressions: 200 }), fact({ date: '2030-01-11', impressions: 30 })])] });
assert.deepEqual(entries(result)[0].conflictDates, ['2030-01-10']); assert.equal(entries(result)[0].metrics.impressions, 30); assert.equal(result.conflictCount, 1);
result = make({ datasets: [owner, dataset([fact()], { key: 'another-family' })] });
assert.equal(entries(result)[0].metrics.impressions, null); assert.equal(result.conflictCount, 1);
assert.equal(one([fact(), fact()]).metrics.impressions, 100);
assert.equal(one([fact(), fact({ sourceSheet: 'different-sheet' })]).metrics.impressions, null);
// Only NFKC/case/whitespace creator normalization. All qualifiers survive.
result = make({ proofs: [proof({ creativeName: 'Ａ  · Seoul / Flight 1' }), proof({ creativeName: '' }), proof({ creativeName: '홍보' })],
  datasets: [dataset([fact({ creative: 'a · seoul / flight 1' }), fact({ creative: 'A' }), fact({ creative: 'A · Seoul / Flight 2' }), fact({ creative: '' })])] });
assert.equal(result.groups[0].creatives.find(c => c.name.includes('Seoul')).metrics.impressions, 100);
assert.equal(result.groups[0].creatives.find(c => c.name === '홍보').rows.length, 0);
assert.equal(result.groups[0].unlinkedPerformance.length, 3); assert.equal(result.groups[0].unnamedProofs.length, 1);
assert.equal(one([fact({ creative: '소재A' })], { proofs: [proof({ creativeName: '기획전' })] }).rows.length, 0);
result = make({ proofs: [proof({ media: 'NAVER', creativeName: 'A' })], datasets: [owner] });
assert.equal(result.groups.length, 1); assert.equal(result.groups[0].creatives[0].metrics.impressions, 100);
// Ambiguous PC/MO inventories retain source-only metrics, never broadcast them.
result = make({ plans: [plan({ placement: '공통배너', device: 'PC' }), plan({ placement: '공통배너', device: 'MO' })], datasets: [dataset([fact({ placement: '공통배너' })])] });
assert.equal(result.groups.length, 3); assert.equal(result.groups.flatMap(g => g.creatives).reduce((n, e) => n + e.rows.length, 0), 0);
assert.equal(result.groups.find(g => g.unlinkedPerformance.length).ambiguousScope, true);
// Registered source statuses/dates are retained; no allocation or invented costs/states.
result = make({ proofs: [proof()], placementRows: [{ platform: '네이버', placement: '배너 PC', spend: 10000, impressions: 99999, clicks: 999, ctr: 99, sourceFile: 'p.xlsx', reportDate: '2030-01-20', sourceSheet: '', achievement: null, guaranteed: '' }], datasets: [owner] });
assert.equal(result.groups[0].placementMetrics.length, 1); assert.equal(result.groups[0].creatives[0].metrics.spend, null);
const unknown = one([fact({ impressions: null, clicks: undefined, ctr: 0, spend: NaN, views: Infinity })]);
for (const v of Object.values(unknown.metrics)) assert.equal(v, null);
const zero = one([fact({ impressions: 0, clicks: 0, spend: 0, views: 0, conversions: 0 })]).metrics;
for (const key of ['impressions', 'clicks', 'spend', 'views', 'conversions']) assert.equal(zero[key], 0);
for (const key of ['ctr', 'cpc', 'cpm', 'cpv']) assert.equal(zero[key], null);
const paired = one([fact({ spend: 100, views: 20, conversions: 2 }), fact({ date: '2030-01-11', impressions: 900, clicks: null, spend: 900 }), fact({ date: '2030-01-12', impressions: 100, clicks: 90, spend: null })]).metrics;
assert.equal(paired.ctr, 50); assert.equal(paired.cpc, 10); assert.equal(paired.cpm, 1000); assert.equal(paired.cpv, 5); assert.equal(paired.conversions, 2);
assert.equal(one([fact({ impressions: Number.MAX_VALUE }), fact({ date: '2030-01-11', impressions: Number.MAX_VALUE })]).metrics.impressions, null);
assert.equal(make({ datasets: [dataset([fact({ date: '2030-02-30' }), fact({ date: '2030-01-10x' }), fact({ date: '2029-12-31' })])] }).sourceRowCount, 0);
for (const extra of [{ startDate: '2030-02-30' }, { endDate: '2030-1-20' }, { startDate: '2031-01-01' }]) assert.throws(() => make(extra), /ISO/);
// Explicit source-scoped mapping is the only way to link differently named creatives.
const link = { sourceFamily: 'synthetic', platform: '네이버', placement: '배너 PC', creative: 'A' };
result = make({ proofs: [proof({ creativeName: '기획전', performanceLink: link })], datasets: [owner] });
assert.equal(result.groups[0].creatives[0].name, '기획전'); assert.equal(result.groups[0].creatives[0].rows[0].row.creative, 'A');
assert.equal(result.groups[0].creatives[0].rows[0].mapping, 'explicit_link');
for (const changed of [{ sourceFamily: 'other' }, { placement: '배너 MO' }, { platform: '카카오' }, { creative: 'B' }]) {
  result = make({ proofs: [proof({ creativeName: '기획전', performanceLink: { ...link, ...changed } })], datasets: [owner] });
  assert.equal(result.groups[0].creatives[0].rows.length, 0); assert.equal(result.groups[0].unlinkedPerformance.length, 1);
}
result = make({ proofs: [proof({ creativeName: '기획전', performanceLink: link }), proof({ creativeName: '브랜드', performanceLink: link })], datasets: [owner] });
assert.equal(result.groups[0].unlinkedPerformance[0].rows[0].mapping, 'mapping_conflict'); assert.equal(result.conflictCount, 1);
assert.equal(result.groups[0].unlinkedPerformance[0].metrics.impressions, null);
result = make({ proofs: [proof({ creativeName: '기획전', performanceLink: link }), proof({ creativeName: '기획전', performanceLink: link })], datasets: [owner] });
assert.equal(result.groups[0].creatives[0].metrics.impressions, 100); assert.equal(result.conflictCount, 0);
const malicious = '=SUM(1,2)\n"quoted"'; const text = csv(make({ proofs: [proof({ creativeName: malicious })], datasets: [dataset([fact({ creative: malicious })])] }));
assert.equal(text.charCodeAt(0), 0xfeff); assert.ok(text.includes('"\'=SUM(1,2)\n""quoted"""'));
for (const header of ['scope_start', 'reported_dates', 'conflict_dates', 'proof_source_status', 'plan_source_status', 'row_mapping', 'ambiguous_scope', 'counted_dates']) assert.ok(text.includes(header));
assert.ok(!text.includes('account_total')); assert.ok(csv(r).includes('게재 확인')); assert.ok(csv(r).includes('종료'));
// Additional bounded owner-scope, export and paid-cost regressions.
console.log('Creative rotation: pure frozen synthetic regressions passed (snapshots, provenance, exact identities, ambiguity, mapping/collisions, null/zero, paired rates, source-only evidence, CSV safety).');

// Exact advertiser/month scope is applied BEFORE any inventory or metric join.
const scopedOwner = dataset([fact()], { bundle: { advertiser: 'Fixture', reportDate: '2030-01-20', creativeDailyPerformance: [fact()] } });
const wrongDatasetOwner = { ...scopedOwner, advertiser: 'Other' };
const wrongBundleOwner = { ...scopedOwner, bundle: { ...scopedOwner.bundle, advertiser: 'Other' } };
const missingBundleOwner = { ...scopedOwner, bundle: { ...scopedOwner.bundle, advertiser: undefined } };
const wrongMonth = { ...scopedOwner, month: '2030-02' };
const scopedInput = freeze({ advertiser: 'Fixture', month: '2030-01', startDate: '2030-01-01', endDate: '2030-01-31',
  proofs: [proof(), proof({ advertiser: 'Other', creativeName: 'foreign advertiser' }), proof({ month: '2030-02', creativeName: 'foreign month' })], plans: [],
  datasets: [wrongDatasetOwner, wrongBundleOwner, missingBundleOwner, wrongMonth, scopedOwner] });
const scopedBefore = JSON.stringify(scopedInput); const scopedReport = build(scopedInput);
assert.equal(scopedReport.sourceRowCount, 1); assert.equal(scopedReport.groups.length, 1);
assert.equal(scopedReport.groups[0].creatives.length, 1); assert.equal(scopedReport.groups[0].creatives[0].proofs.length, 1);
assert.equal(scopedReport.groups[0].creatives[0].metrics.impressions, 100);
assert.equal(scopedReport.advertiser, 'Fixture'); assert.equal(scopedReport.month, '2030-01');
assert.strictEqual(scopedReport.groups[0].creatives[0].rows[0].dataset, scopedOwner); assert.equal(JSON.stringify(scopedInput), scopedBefore);
assert.equal(make({ advertiser: 'Fixture', datasets: [wrongDatasetOwner, wrongBundleOwner, missingBundleOwner] }).sourceRowCount, 0);
assert.equal(make({ month: '2030-01', datasets: [wrongMonth], proofs: [proof({ month: '2030-02' })] }).groups.length, 0);
// Paid-only costs/rates exclude explicit service/reference flags, but retain raw count evidence.
const paidFact = fact({ spend: 100, views: 20 });
for (const flags of [{ service: true }, { serviceType: '서비스 노출' }, { spendLabel: '원본 서비스 비용 참고값' }, { sourceKind: 'showroom_breakdown' }]) {
  const referenceFact = fact({ date: '2030-01-11', spend: 900, impressions: 9000, clicks: 90, views: 900, ...flags });
  const costReport = make({ datasets: [dataset([paidFact, referenceFact])] }); const costEntry = entries(costReport)[0];
  assert.equal(costEntry.metrics.spend, 100); assert.equal(costEntry.metrics.cpc, 10); assert.equal(costEntry.metrics.cpm, 1000); assert.equal(costEntry.metrics.cpv, 5);
  assert.equal(costEntry.metrics.impressions, 9100); assert.equal(costEntry.metrics.clicks, 100); assert.equal(costEntry.metrics.views, 920);
  assert.strictEqual(costEntry.rows[1].row, referenceFact); assert.equal(referenceFact.spend, 900);
}
for (const source of ['dataset', 'bundle']) {
  const raw = fact({ spend: 999, views: 10 });
  const sourceDataset = dataset([raw]);
  if (source === 'dataset') sourceDataset.sourceKind = 'showroom_breakdown'; else sourceDataset.bundle.sourceKind = 'showroom_breakdown';
  const sourceEntry = entries(make({ datasets: [sourceDataset] }))[0];
  for (const field of ['spend', 'cpc', 'cpm', 'cpv']) assert.equal(sourceEntry.metrics[field], null);
  assert.equal(sourceEntry.metrics.impressions, 100); assert.strictEqual(sourceEntry.rows[0].row, raw); assert.equal(raw.spend, 999);
}
assert.equal(one([fact({ spend: 0, sourceNotes: 'counts include service; costs exclude service' })]).metrics.spend, 0);
// Small CSV reader verifies semantic rows, including quoted multiline formula payloads.
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 1; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\r' && text[i + 1] === '\n' && !quoted) { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += char;
  }
  row.push(field); rows.push(row); return rows;
}
const repeatedDays = Array.from({ length: 21 }, (_, i) => fact({ date: '2030-01-' + String(i + 1).padStart(2, '0'), spend: 10 }));
const aeProof = proof({ operation: { status: '중단', asOf: '2030-01-25', note: 'AE 확인, 원본 기준' } });
const exportReport = make({ advertiser: 'Fixture', month: '2030-01', proofs: [aeProof], datasets: [dataset(repeatedDays, { bundle: { advertiser: 'Fixture', reportDate: '2030-01-25', creativeDailyPerformance: repeatedDays } })] });
const summary = parseCsv(csv(exportReport)); assert.equal(summary.length, 2, '21 daily owners produce one summary entry');
const summaryValue = key => summary[1][summary[0].indexOf(key)];
assert.equal(summaryValue('impressions'), '2100'); assert.equal(summaryValue('paid_provided_spend'), '210');
assert.equal(summaryValue('counted_row_count'), '21'); assert.equal(summaryValue('counted_day_count'), '21');
assert.equal(summaryValue('scope_advertiser'), 'Fixture'); assert.equal(summaryValue('scope_month'), '2030-01');
assert.equal(summaryValue('registration'), 'registered'); assert.ok(summaryValue('ae_operation_source_reports').includes('중단 (2030-01-25)'));
assert.equal(summaryValue('proof_source_status'), '게재 확인'); assert.ok(summaryValue('source_files').includes('proof.pdf'));
assert.equal(summaryValue('paid_spend_coverage_dates').split('|').length, 21);
for (const forbidden of ['source_row_json', 'dataset_key', 'mail_subject', 'source_published_at']) assert.ok(!summary[0].includes(forbidden));
const audit = parseCsv(auditCsv(exportReport)); assert.equal(audit.length, 23); assert.ok(audit[0].includes('raw_spend'));
assert.ok(!audit[0].some(header => /aggregate|paid_provided/.test(header)), 'Audit contains raw values only');
assert.ok(!audit.slice(1).some(row => row[audit[0].indexOf('raw_impressions')] === '2100'));
assert.equal(parseCsv(text).length, 2); assert.equal(parseCsv(text)[1][parseCsv(text)[0].indexOf('creative')], "'" + malicious);
const twoEntries = make({ datasets: [dataset([fact(), fact({ creative: 'B' })])] });
assert.equal(parseCsv(csv(twoEntries)).length, 3); assert.ok(parseCsv(csv(twoEntries)).slice(1).every(row => row[9] === 'unlinked_source_only'));
const invalidOperationProof = proof({ operation: { status: '중단', asOf: '2030-02-30' } });
assert.ok(!csv(make({ proofs: [invalidOperationProof] })).includes('AE 원본 보고: 중단'));
assert.strictEqual(entries(make({ proofs: [aeProof] }))[0].proofs[0], aeProof);
console.log('Bounded follow-up passed: strict advertiser/month ownership, one-row summary, raw-only audit, explicit AE operation reports, reference-cost exclusion, original frozen owners.');

const mixedReference = make({ datasets: [dataset([fact({ spend: 100 }), fact({ spend: 100, service: true })])] });
assert.equal(mixedReference.conflictCount, 1, 'Same-day reference/paid label conflicts cannot choose spend arbitrarily');
assert.equal(entries(mixedReference)[0].metrics.spend, null);
const multiCreator = make({ proofs: [proof({ creativeName: '등록소재', performanceLink: link }), proof({ creativeName: '등록소재', performanceLink: { ...link, creative: 'B' } })], datasets: [dataset([fact(), fact({ creative: 'B' })])] });
assert.equal(multiCreator.conflictCount, 1, 'Different raw creators under one registered name cannot silently coalesce');
assert.equal(multiCreator.groups[0].creatives[0].metrics.impressions, null);

for (const missingName of ['-', '—', 'N/A', ' n/a ']) {
  const missingProof = proof({ creativeName: missingName, performanceLink: { ...link, creative: missingName } });
  const missingPlan = plan({ creativeName: missingName });
  const missingFact = fact({ creative: missingName });
  const missing = make({ proofs: [missingProof], plans: [missingPlan], datasets: [dataset([missingFact])] });
  const group = missing.groups[0];
  assert.equal(group.creatives.length, 0); assert.strictEqual(group.unnamedProofs[0], missingProof);
  assert.strictEqual(group.unassignedPlans[0], missingPlan); assert.equal(group.unlinkedPerformance.length, 1);
  assert.strictEqual(group.unlinkedPerformance[0].rows[0].row, missingFact);
  assert.equal(group.unlinkedPerformance[0].rows[0].mapping, 'unlinked');
}
console.log('Missing-name placeholders stay unassigned; metric placeholders remain source-only with original owners.');
