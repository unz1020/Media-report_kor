'use strict';
// Synthetic SSR only. No customer files, browser, account, remote request or store writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const allowed = new Set(['components/creative-rotation-panel.tsx', 'components/creative-link-editor.tsx', 'lib/creative-rotation.ts', 'lib/performance-report.ts', 'lib/media-normalization.ts', 'lib/placement-showroom.ts', 'lib/placement-urls.ts', 'lib/creative-material.ts', 'supabase/functions/reporting-store/creative-material-input.ts'].map(file => path.join(root, file)));
const cssAllowed = new Set(['components/creative-rotation-panel.module.css', 'components/creative-link-editor.module.css'].map(file => path.join(root, file)));
for (const file of ["lib/creative-image.ts","components/media-label.tsx","lib/media-identity.ts","public/media-icons/sources.json","public/media-icons/performance-sources.json","public/media-icons/execution-sources.json"]) allowed.add(path.resolve(root,file));
const cache = new Map();
let workspace = { advertiser: 'Synthetic', month: '2030-01', canEdit: true, dataSyncState: 'ready' };
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.has(name), `Unexpected dependency ${name}`);
  if (cache.has(name)) return cache.get(name).exports;
  if(name.endsWith(".json")) return JSON.parse(fs.readFileSync(name,"utf8"));
  const module = { exports: {} }; cache.set(name, module);
  const result = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  new Function('require', 'exports', 'module', result.outputText)(specifier => {
    if (['react', 'react/jsx-runtime'].includes(specifier)) return require(specifier);
    if (specifier === './workspace-context') return { useWorkspace: () => workspace };
    if (specifier === '@/lib/daily-report-store') return { hydratePublishedDailyState: () => { throw new Error('Store unavailable in synthetic test'); } };
    assert.ok(specifier.startsWith('.') || specifier.startsWith('@/'), `Forbidden dependency ${specifier}`);
    const base = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(name), specifier);
    if (base.endsWith('.css')) { assert.ok(cssAllowed.has(base) || base === path.resolve(root,'components/media-label.module.css')); return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; }
    const resolved = [...allowed].find(candidate => candidate === base || candidate === `${base}.ts` || candidate === `${base}.tsx`);
    assert.ok(resolved, `Forbidden module ${specifier}`); return load(resolved);
  }, module.exports, module);
  return module.exports;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const metrics = { impressions: null, clicks: null, ctr: null, spend: null, views: null, conversions: null, cpc: null, cpm: null, cpv: null };
const proof = (name, extra = {}) => ({ advertiser: 'Synthetic', month: '2030-01', importId: `proof-${name}`, publishedAt: '2030-01-21T00:00:00Z', creativeName: name, media: 'Synthetic media', placement: 'Synthetic placement', reportDate: '2030-01-20', verificationDate: '2030-01-15', status: '게재 확인', sourceFile: 'synthetic-proof.pdf', messageId: 'synthetic-message', manualImagePath: `synthetic/${name}.png`, attachments: [], ...extra });
const owner = (creative, extra = {}) => ({ row: { date: '2030-01-10', platform: 'Synthetic media', placement: 'Synthetic placement', creative, sourceSheet: 'Synthetic sheet', impressions: 0, clicks: 0, ctr: null }, sourceFamily: 'synthetic-family', datasetKey: 'synthetic-family::2030-01-20', family: 'Synthetic::2030-01::synthetic-family', sourceFile: 'synthetic.xlsx', reportDate: '2030-01-20', publishedAt: '2030-01-21T00:00:00Z', selected: true, conflict: false, mapping: 'unlinked', sourceIndex: 0, ...extra });
const entry = (name, extra = {}) => ({ id: name, name, proofs: [], plans: [], rows: [], metrics: { ...metrics }, firstPerformanceDate: null, lastPerformanceDate: null, lastReportDate: null, reportedDates: [], conflictDates: [], ...extra });
const group = freeze({ id: 'inventory-one', media: 'Synthetic media', placement: 'Synthetic placement', environment: 'digital', surface: 'desktop', creatives: [entry('기획전', { proofs: [proof('기획전')] }), entry('브랜드', { proofs: [proof('브랜드')] })], unlinkedPerformance: [entry('소재A', { rows: [owner('소재A')], metrics: { ...metrics, impressions: 0, clicks: 0 }, reportedDates: ['2030-01-10'], firstPerformanceDate: '2030-01-10', lastPerformanceDate: '2030-01-10', lastReportDate: '2030-01-20' }), entry('소재B', { rows: [owner('소재B')] })], unnamedProofs: [], unassignedPlans: [], placementMetrics: [], ambiguousScope: false });
const other = freeze({ ...group, id: 'inventory-two', media: 'Other media', creatives: [entry('Other asset')], unlinkedPerformance: [] });
const report = freeze({ startDate: '2030-01-01', endDate: '2030-01-31', groups: [other, group], sourceRowCount: 2, conflictCount: 0 });
const originalFetch = globalThis.fetch;
let count = 0;
function test(name, callback) { callback(); console.log(`PASS ${name}`); count++; }
try {
  globalThis.fetch = () => { throw new Error('Network forbidden'); };
  const { CreativeRotationPanel } = load('components/creative-rotation-panel.tsx');
  const { CreativeLinkEditor } = load('components/creative-link-editor.tsx');
  const before = JSON.stringify(report);
  const render = extra => renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report, ...extra }));
  const html = render({});
  test('registered and unmapped names remain separate, no four-asset claim', () => {
    assert.match(html, /登録素材|등록 소재명 2개/); assert.match(html, /미연결 성과 원본명 2개/);
    assert.match(html, /성과 원본명 연결 확인 필요/); assert.match(html, /aria-label="기획전 성과 상세 선택"/); assert.match(html, /날짜 필터는 성과 행에만 적용/); assert.doesNotMatch(html, /등록 소재명 4개/);
    assert.equal((html.match(/<img /g) || []).length, 1); assert.match(html, /\/api\/reporting\/proof-image\?/);
  });
  test('default rolling inventory excludes singleton and exposes provenance collapsed', () => {
    assert.doesNotMatch(html, /Other asset|Other media/); assert.match(html, /<details class="provenance">/); assert.doesNotMatch(html, /<details[^>]* open/);
    assert.match(html, /순도달이 아닙니다/); assert.match(html, /집행량·타기팅·기간/);
  });
  test('full-mode deep links include singleton targets and never silently replace missing targets', () => {
    const singleton = render({ groupId: other.id });
    assert.match(singleton, /<h3><span[^>]*data-media-label="Other media"/); assert.match(singleton, /Other asset/);
    const unnamed = { ...other, id: 'unnamed-inventory', creatives: [], unnamedProofs: [proof('')] };
    const unnamedHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: { ...report, groups: [group, unnamed] }, groupId: unnamed.id }));
    assert.match(unnamedHtml, /소재명 없는 증빙 1건/);
    const missing = render({ groupId: 'missing-full-target' });
    assert.match(missing, /선택한 지면을 현재 광고주·월 자료에서 찾을 수 없습니다/);
    assert.doesNotMatch(missing, /class="inventory"|<img /);
  });
  test('compact exact group scope and controlled selected creative', () => {
    const raw = render({ compact: true, groupId: group.id, selectedCreativeName: '소재A' });
    assert.match(raw, /compactPanel/); assert.match(raw, /<h3>소재A<\/h3>/); assert.match(raw, /최근 보고된 성과일/); assert.match(raw, /2030-01-10/);
    assert.match(raw, /<td>0<\/td><td>0<\/td><td>미제공<\/td>/); assert.equal((raw.match(/<img /g) || []).length, 0);
    assert.doesNotMatch(raw, /Other media|매체·지면 검색/);
    assert.match(render({ compact: true, groupId: 'not-present' }), /이 지면의 소재 자료가 없습니다/);
  });
  test('selection shows one original image and separates proof/report/performance dates', () => {
    const selected = render({ compact: true, groupId: group.id, selectedCreativeName: '브랜드', onOpenImage: () => {} });
    assert.equal((selected.match(/<img /g) || []).length, 1); assert.match(selected, /원본 증빙 확대/);
    for (const label of ['증빙 자료상 상태', '자료상 확인일', '증빙 보고서 기준일', '성과 보고서 최신 기준일']) assert.ok(selected.includes(label));
  });
  test('editor candidates are wrapper sources only and exact tuples deduplicate', () => {
    const repeated = { ...group, unlinkedPerformance: [group.unlinkedPerformance[0], { ...group.unlinkedPerformance[0], id: 'duplicate' }] };
    const editor = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: proof('기획전'), group: repeated, onClose: () => {} }));
    assert.equal((editor.match(/type="radio"/g) || []).length, 2); assert.match(editor, /원본 계열 synthetic-family/);
    assert.match(editor, /소재 A\/B/); assert.match(editor, /수동 연결 해제/); assert.match(editor, /정확히 일치하면/);
    assert.match(editor, /type="submit"[^>]*disabled/);
  });
  test('report-only operation defaults are blank and can be edited without performance candidates', () => {
    const noMetrics = { ...group, creatives: [entry('기획전', { proofs: [proof('기획전')] })], unlinkedPerformance: [] };
    const editor = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: proof('기획전'), group: noMetrics, onClose: () => {} }));
    assert.match(editor, /보고용 운영상태/); assert.match(editor, /운영보고 기준일/); assert.match(editor, /운영보고 메모/);
    assert.match(editor, /value="" selected=""/); assert.match(editor, /type="date"[^>]*disabled=""[^>]*value=""/);
    assert.doesNotMatch(editor, /<fieldset disabled/); assert.match(editor, /선택할 성과 원본명이 없습니다/);
    assert.match(editor, /실제 광고를 시작하거나 중단하지 않습니다/);
    const linked = proof('기획전', { performanceLink: { sourceFamily: 'outside-range', platform: 'Synthetic media', placement: 'Synthetic placement', creative: 'Old raw name' } });
    const preserved = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: linked, group: noMetrics, onClose: () => {} }));
    assert.match(preserved, /기존 연결은 그대로 유지/); assert.doesNotMatch(preserved, /<fieldset disabled/);
  });
  test('AE operating status and date stay separate from proof evidence status', () => {
    const operating = proof('기획전', { operation: { status: '중단', asOf: '2030-01-19', note: 'Synthetic report-only note' } });
    const operatingGroup = { ...group, creatives: [entry('기획전', { proofs: [operating] }), group.creatives[1]] };
    const operatingReport = { ...report, groups: [operatingGroup] };
    const operatingHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: operatingReport, compact: true, groupId: group.id, onEditLink: () => {} }));
    assert.match(operatingHtml, /AE 보고용 운영상태/); assert.match(operatingHtml, /중단/); assert.match(operatingHtml, /2030-01-19/);
    assert.match(operatingHtml, /증빙 자료상 상태/); assert.match(operatingHtml, /게재 확인/); assert.match(operatingHtml, /운영정보·성과 연결/);
    const editor = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: operating, group: operatingGroup, onClose: () => {} }));
    assert.match(editor, /value="중단" selected=""/); assert.match(editor, /type="date"[^>]*required=""[^>]*value="2030-01-19"/);
    assert.match(editor, /Synthetic report-only note/);
  });
  test('table uses latest explicit as-of date, separate from selected capture, and preserves all reports', () => {
    const captures = [proof('기획전', { reportDate: '2030-01-10', operation: { status: '중단', asOf: '2030-01-25', note: 'Later explicit report' } }), proof('기획전', { reportDate: '2030-01-20', operation: { status: '집행 중', asOf: '2030-01-15', note: 'Earlier explicit report' } })];
    const capturesGroup = { ...group, creatives: [entry('기획전', { proofs: captures }), group.creatives[1]] };
    const capturesHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: { ...report, groups: [capturesGroup] }, compact: true, groupId: group.id }));
    assert.match(capturesHtml, /AE 최신 운영보고/); assert.match(capturesHtml, /<td>중단 · 2030-01-25<\/td>/);
    assert.match(capturesHtml, /선택 증빙의 AE 보고용 운영상태<\/dt><dd>집행 중/);
    assert.match(capturesHtml, /AE 운영보고: 중단 · 기준일 2030-01-25 · 메모 Later explicit report/);
    assert.match(capturesHtml, /AE 운영보고: 집행 중 · 기준일 2030-01-15 · 메모 Earlier explicit report/);
  });
  test('same-date different explicit operating statuses render conflict rather than arbitrary status', () => {
    const captures = [proof('기획전', { operation: { status: '중단', asOf: '2030-01-19' } }), proof('기획전', { operation: { status: '집행 중', asOf: '2030-01-19' } })];
    const conflictGroup = { ...group, creatives: [entry('기획전', { proofs: captures }), group.creatives[1]] };
    const conflictHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: { ...report, groups: [conflictGroup] }, compact: true, groupId: group.id }));
    assert.match(conflictHtml, /<td>상충 보고 · 2030-01-19<\/td>/);
  });
  test('select controls expose exact labels independent of option text', () => {
    const capturesGroup = { ...group, creatives: [entry('기획전', { proofs: [proof('기획전'), proof('기획전', { reportDate: '2030-01-18' })] }), group.creatives[1]] };
    const controlsHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: { ...report, groups: [capturesGroup] } }));
    assert.match(controlsHtml, /<select[^>]*aria-label="비교할 매체·지면"/);
    assert.match(controlsHtml, /<select[^>]*aria-label="증빙 자료 선택"/);
  });
  test('operation editor exposes exact labels even with selected options and existing memo text', () => {
    const noteProof = proof('기획전', { operation: { status: '중단', asOf: '2030-01-19', note: 'Existing multiline\nmemo' } });
    const editorHtml = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: noteProof, group, onClose: () => {} }));
    assert.match(editorHtml, /<select[^>]*aria-label="보고용 운영상태"/);
    assert.match(editorHtml, /<input[^>]*aria-label="운영보고 기준일"/);
    assert.match(editorHtml, /<textarea[^>]*aria-label="운영보고 메모 \(선택\)"/);
  });
  test('viewer, loading, missing proof identity and wrong workspace disable writing', () => {
    for (const state of [{ canEdit: false }, { dataSyncState: 'loading' }, { advertiser: 'Other' }]) {
      workspace = { advertiser: 'Synthetic', month: '2030-01', canEdit: true, dataSyncState: 'ready', ...state };
      const editor = renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: proof('기획전'), group, onClose: () => {} }));
      assert.match(editor, /<fieldset disabled/);
    }
    workspace = { advertiser: 'Synthetic', month: '2030-01', canEdit: true, dataSyncState: 'ready' };
    assert.match(renderToStaticMarkup(React.createElement(CreativeLinkEditor, { proof: proof('기획전', { importId: undefined }), group, onClose: () => {} })), /<fieldset disabled/);
  });
  test('no original supplied records are mutated; narrow layouts contain tables', () => {
    assert.equal(JSON.stringify(report), before);
    const css = fs.readFileSync(path.join(root, 'components/creative-rotation-panel.module.css'), 'utf8');
    assert.match(css, /overflow-x: auto/); assert.match(css, /minmax\(0, 1fr\)/); assert.match(css, /focus-visible/);
  });
  test('merged material aliases select the matching entry and original proof, never unrelated metrics', () => {
    const materialIdentity = { assetId: 'CR777', version: 'v01', displayName: 'Declared alias material' };
    const aliases = entry('A', { id: 'aliased-material', materialIdentity, proofs: [proof('A', { reportDate: '2030-01-21', manualImagePath: 'synthetic/canonical-A.png' }), proof('Alias', { reportDate: '2030-01-20', manualImagePath: 'synthetic/selected-alias.png' })] });
    const unrelated = entry('B', { id: 'unrelated-material', proofs: [proof('B', { manualImagePath: 'synthetic/unrelated-B.png' })], metrics: { ...metrics, impressions: 500 } });
    const aliasGroup = { ...group, id: 'alias-group', creatives: [aliases, unrelated], unlinkedPerformance: [] };
    const aliasHtml = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report: { ...report, groups: [aliasGroup] }, groupId: aliasGroup.id, compact: true, selectedCreativeName: 'Alias', onEditLink: () => {} }));
    assert.match(aliasHtml, /<h3>A<\/h3>/);assert.match(aliasHtml,/selected-alias.png/);assert.doesNotMatch(aliasHtml,/unrelated-B.png|canonical-A.png/);
    assert.match(aliasHtml,/선택 증빙 원본 소재명/);
  });
  test('unknown or ambiguous external names never default to another material detail', () => {
    const ambiguousGroup = { ...group, id: 'ambiguous-external', creatives: [entry('A', { id:'one', proofs:[proof('Alias')] }), entry('B', { id:'two', proofs:[proof('Alias')], metrics:{...metrics,impressions:500} })], unlinkedPerformance: [] };
    for(const selectedCreativeName of ['Unknown external name','Alias']) {
      const output=renderToStaticMarkup(React.createElement(CreativeRotationPanel,{report:{...report,groups:[ambiguousGroup]},groupId:ambiguousGroup.id,compact:true,selectedCreativeName}));
      assert.doesNotMatch(output,/class="detail"|<img /);
    }
  });
  test('registered images are distinct from evidence and never assigned to an unrelated performance row', () => {
    const a = entry('A', { proofs: [proof('A', { creativeImagePath:'fixture/asset-A.jpg', creativeImageFilename:'asset-A.jpg', manualImagePath:'fixture/evidence-A.png' })] });
    const b = entry('B', { proofs: [proof('B', { creativeImagePath:'fixture/asset-B.jpg', manualImagePath:undefined })] });
    const imageGroup = { ...group, id:'image-group', creatives:[a,b], unlinkedPerformance:[entry('소재A')] };
    const out = renderToStaticMarkup(React.createElement(CreativeRotationPanel, { report:{...report,groups:[imageGroup]}, groupId:imageGroup.id, onOpenImage:()=>{} }));
    assert.match(out, /asset-A.jpg/); assert.match(out, /asset-B.jpg/); assert.match(out, /evidence-A.png/);
    assert.match(out, /사용자 등록 소재 · 게재 증빙 아님/); assert.match(out, /원본 증빙 확대/);
    const unlinked = out.match(/<section class="entrySection"><h4>미연결 성과 원본명[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(unlinked, /asset-A.jpg|asset-B.jpg|evidence-A.png/); assert.match(unlinked, /소재 이미지 미등록/);
    const ambiguous = entry('복수 이미지', { proofs:[proof('복수 이미지',{creativeImagePath:'fixture/one.jpg'}),proof('복수 이미지',{creativeImagePath:'fixture/two.jpg'})] });
    const conflict = entry('충돌', { identityConflict:true, proofs:[proof('충돌',{creativeImagePath:'fixture/conflict.jpg'})] });
    const multiGroup = {...group,id:'multi-image',creatives:[ambiguous,conflict],unlinkedPerformance:[]};
    const multi = renderToStaticMarkup(React.createElement(CreativeRotationPanel,{report:{...report,groups:[multiGroup]},groupId:multiGroup.id,selectedCreativeName:'복수 이미지'}));
    const rows = multi.match(/<tbody>[\s\S]*?<\/tbody>/)[0];
    assert.doesNotMatch(rows,/one.jpg|two.jpg|conflict.jpg/); assert.equal((rows.match(/이미지 확인 필요/g)||[]).length,2);
    assert.match(multi,/one.jpg/); assert.doesNotMatch(multi,/two.jpg/); // selected proof is shown, never silently merged
  });
  console.log(`Creative rotation render checks passed (${count} synthetic cases).`);
} finally { globalThis.fetch = originalFetch; }
