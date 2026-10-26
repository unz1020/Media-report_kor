const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
const allowed = ['lib/creative-material.ts', 'supabase/functions/reporting-store/creative-material-input.ts',
  ...['creative-rotation', 'media-normalization', 'placement-showroom', 'placement-urls', 'performance-report'].map(name => `lib/${name}.ts`)];
function load(filename) {
  const full = path.resolve(root, filename), rel = path.relative(root, full);
  assert.ok(allowed.includes(rel), `Unexpected non-pure dependency: ${rel}`);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }, reportDiagnostics: true });
  assert.equal(output.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  new Function('require', 'exports', 'module', output.outputText)(name => {
    assert.ok(name.startsWith('.')); return load(path.resolve(path.dirname(full), name + '.ts'));
  }, module.exports, module);
  return module.exports;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const { normalizeCreativeMaterialIdentity: normalize, readCreativeMaterialIdentity: read,
  materialIdentityKey: key, suggestedCreativeFilename: filename } = load('lib/creative-material.ts');
const material = freeze({ assetId: 'ABC-001', version: 'v01', displayName: '봄 신제품', format: '1080x1920', reportedFilename: 'original.MP4' });
assert.deepEqual(normalize(material), material);
assert.deepEqual(normalize({ ...material, assetId: ' abc-001 ', version: 'v1' }), material);
assert.equal(normalize(null), null); assert.equal(read(undefined), null); assert.equal(key(undefined), null);
assert.equal(key(material), '["ABC-001","v01"]');
assert.equal(filename('광고주', material), '광고주_ABC-001_봄_신제품_v01_1080x1920.mp4');
assert.equal(filename('광고주', { assetId: 'ABC', version: 'v9999', displayName: '이름' }), '광고주_ABC_이름_v9999_규격.확장자');
assert.equal(filename('광고주', null), null);
assert.ok(!/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/.test(filename('../광고주:*', { ...material, displayName: '../이름:?', format: '9/16' })));
for (const version of ['v1', 'v01', 'v0001', 'v99', 'v100', 'v9999']) assert.ok(normalize({ ...material, version }).version.startsWith('v'));
for (const bad of [undefined, [], false, {}, 'ABC', { ...material, extra: 1 }, { ...material, assetId: '12A' },
  { ...material, assetId: 'AB' }, { ...material, assetId: 'A'.repeat(33) }, ...['v0', 'v0000', 'v10000', '1', 'v1.0'].map(version => ({ ...material, version })),
  ...['a/b.jpg', 'a\\b.jpg', '.', '..'].map(reportedFilename => ({ ...material, reportedFilename }))]) {
  assert.throws(() => normalize(bad)); assert.equal(read(bad), null);
}
for (const [field, max] of [['displayName', 80], ['format', 60], ['reportedFilename', 180]]) {
  assert.equal(normalize({ ...material, [field]: 'x'.repeat(max) })[field].length, max);
  for (const value of [undefined, null, false, [], {}, '', ' ', 'x'.repeat(max + 1)]) assert.throws(() => normalize({ ...material, [field]: value }));
}
for (let code = 0; code <= 0x9f; code++) {
  if (code > 0x1f && code < 0x7f) continue;
  for (const field of Object.keys(material)) assert.throws(() => normalize({ ...material, [field]: 'A' + String.fromCharCode(code) + 'B' }));
}
for (const field of ['assetId', 'version', 'displayName']) { const missing = { ...material }; delete missing[field]; assert.throws(() => normalize(missing)); }
assert.throws(() => normalize(JSON.parse('{"assetId":"ABC","version":"v1","displayName":"x","__proto__":{}}')));
const { buildCreativeRotationReport: build, creativeRotationCsv: csv, creativeRotationAuditCsv: audit } = load('lib/creative-rotation.ts');
const fact = (extra = {}) => ({ date: '2030-01-10', platform: '네이버', placement: '배너 PC', creative: 'A', impressions: 100, clicks: 10, ctr: 99, sourceSheet: 'synthetic', ...extra });
const dataset = (rows, extra = {}) => ({ key: 'synthetic', advertiser: 'Fixture', month: '2030-01', sourceFile: 'fixture.xlsx', mailSubject: '', mailDate: '', publishedAt: '2030-01-20T00:00:00Z', bundle: { reportDate: '2030-01-20', creativeDailyPerformance: rows }, ...extra });
const proof = (extra = {}) => ({ advertiser: 'Fixture', month: '2030-01', reportDate: '2030-01-20', verificationDate: '2030-01-15', media: '네이버', placement: '배너 PC', campaignName: '', serviceType: '', periodStart: '2030-01-01', periodEnd: '2030-01-31', location: '', airingTime: '', dailyFrequency: null, durationSec: null, budgetReference: 9999, status: '게재 확인', creativeName: 'A', messageId: '', mailSubject: '', mailDate: '', sourceFile: 'proof.pdf', sourceSummary: '', attachments: [], ...extra });
const plan = { platform: '네이버', placement: '배너 PC', device: 'PC', creativeName: 'A' };
const link = { sourceFamily: 'synthetic', platform: '네이버', placement: '배너 PC', creative: 'A' };
const make = (extra = {}) => {
  const input = freeze({ datasets: [], proofs: [], plans: [], startDate: '2030-01-01', endDate: '2030-01-31', ...extra });
  const before = JSON.stringify(input), report = build(input); assert.equal(JSON.stringify(input), before); return report;
};
const entries = report => report.groups.flatMap(g => [...g.creatives, ...g.unlinkedPerformance]);
const registered = report => report.groups.flatMap(g => g.creatives);
const raw = report => report.groups.flatMap(g => g.unlinkedPerformance);
const tagged = (identity = material, extra = {}) => proof({ materialIdentity: identity, ...extra });
let report = make({ proofs: [proof()], datasets: [dataset([fact()])] });
assert.equal(registered(report)[0].rows[0].mapping, 'exact_name'); assert.equal(registered(report)[0].metrics.impressions, 100);
report = make({ proofs: [tagged()], datasets: [dataset([fact()])] });
assert.equal(registered(report)[0].rows.length, 0); assert.equal(raw(report)[0].rows[0].mapping, 'unlinked');
report = make({ proofs: [tagged(material, { performanceLink: link })], datasets: [dataset([fact()])] });
assert.equal(registered(report)[0].rows[0].mapping, 'explicit_link'); assert.equal(registered(report)[0].metrics.impressions, 100);
const version2 = { ...material, version: 'v02' };
for (const proofs of [[tagged(), tagged(version2)], [tagged(), proof()], [tagged(), tagged(version2), proof()]]) {
  report = make({ proofs, datasets: [dataset([fact()])] });
  assert.equal(registered(report).length, proofs.length); assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict');
  assert.equal(raw(report)[0].metrics.impressions, null); assert.ok(registered(report).every(e => !e.rows.length));
}
report = make({ proofs: [tagged(), tagged(version2, { performanceLink: link })], plans: [plan], datasets: [dataset([fact()])] });
assert.equal(registered(report).length, 3); assert.equal(registered(report).find(e => e.materialIdentity?.version === 'v02').metrics.impressions, 100);
assert.equal(registered(report).find(e => !e.materialIdentity).rows.length, 0, 'Plan cannot steal explicitly linked version');
report = make({ proofs: [tagged()], plans: [plan], datasets: [dataset([fact()])] });
assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict', 'Plan cannot steal unlinked version');
report = make({ proofs: [tagged(material, { performanceLink: link }), tagged(version2, { performanceLink: link })], datasets: [dataset([fact()])] });
assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict'); assert.equal(report.conflictCount, 1);
const original = fact(), source = dataset([original]), p = tagged(material, { performanceLink: link });
report = make({ proofs: [p, tagged({ ...material, version: 'v1' }, { performanceLink: link, creativeName: 'Alias' })], datasets: [source] });
assert.equal(registered(report).length, 1); assert.equal(registered(report)[0].proofs.length, 2);
assert.equal(registered(report)[0].metrics.impressions, 100); assert.strictEqual(registered(report)[0].rows[0].row, original);
assert.strictEqual(registered(report)[0].rows[0].dataset, source); assert.strictEqual(registered(report)[0].proofs[0], p);
for (const patch of [{ displayName: '다른 이름' }, { format: '다른 규격' }, { reportedFilename: 'other.mp4' }]) {
  report = make({ proofs: [tagged(material, { performanceLink: link }), tagged({ ...material, ...patch })], datasets: [source] });
  assert.equal(registered(report).length, 1); assert.equal(registered(report)[0].identityConflict, true);
  assert.equal(registered(report)[0].rows.length, 0); assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict');
}
report = make({ proofs: [tagged(material, { performanceLink: link }), tagged({ ...material, displayName: '다른 이름' }, { media: '카카오', placement: '피드' })], datasets: [source] });
assert.ok(registered(report).every(e => e.identityConflict)); assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict');
for (const invalid of [{}, [], 'ABC', { ...material, version: 'v0' }, { ...material, reportedFilename: '../bad.mp4' }]) {
  for (const performanceLink of [undefined, link]) {
    report = make({ proofs: [tagged(invalid, { performanceLink })], datasets: [source] });
    assert.equal(registered(report)[0].identityConflict, true); assert.equal(registered(report)[0].rows.length, 0);
    assert.equal(raw(report)[0].rows[0].mapping, 'mapping_conflict');
  }
}
// Local model reader and strict helper agree on canonical ID/version and definitions.
for (const identity of [material, { ...material, assetId: ' abc-001 ', version: 'v1' }]) {
  report = make({ proofs: [tagged(identity)] }); assert.deepEqual(registered(report)[0].materialIdentity, normalize(identity));
}
report = make({ proofs: [tagged(material, { creativeName: '' })] });
assert.equal(registered(report).length, 1); assert.equal(registered(report)[0].name, material.displayName);
const exported = csv(report), audited = audit(report);
for (const text of [exported, audited]) {
  assert.equal(text.charCodeAt(0), 0xfeff);
  for (const header of ['material_id', 'material_version', 'material_label', 'material_reported_filename', 'material_format', 'source_link_status']) assert.ok(text.includes(header));
  assert.ok(text.includes('ABC-001')); assert.ok(text.includes('original.MP4')); assert.ok(text.includes('requires_explicit_link'));
}
assert.ok(exported.includes('"raw_spend"') === false); assert.ok(audited.includes('"raw_spend"'));
assert.ok(exported.split('\r\n')[0].endsWith('"source_link_status"'));
report = make({ proofs: [tagged({ ...material, displayName: '=SUM(1,2)' })] });
assert.ok(csv(report).includes('"\'=SUM(1,2)"')); assert.ok(audit(report).includes('"\'=SUM(1,2)"'));
// Optional read-only captured fixture: pass a CreativeRotationInput JSON file after the script.
if (process.argv[2]) {
  const captured = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const actual = make(captured), selected = entries(actual).flatMap(e => e.rows).filter(r => r.selected && !r.conflict).length;
  assert.equal(actual.sourceRowCount, 264); assert.equal(selected, 252); assert.equal(actual.conflictCount, 0);
  console.log('Captured dataset regression passed: 264 source rows, 252 selected, 0 conflicts.');
}
console.log('Creative material checks passed: strict input, safe suggestions, frozen legacy/version mapping, ambiguity, definition conflicts, invalid declarations, provenance and append-only CSV metadata.');
