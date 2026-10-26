const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();
let hookValues = [], hookIndex = 0, updates = [];
const mockReact = { ...React, useMemo: fn => fn(), useState: initial => {
  const index = hookIndex++;
  return [index < hookValues.length ? hookValues[index] : initial, next => updates.push([index, next])];
} };
const childStubs = {
  'media-label': { MediaLabel: ({media}) => React.createElement('span', null, media) },
  'creative-rotation-panel': { CreativeRotationPanel: () => null },
  'viral-placement-board': { ViralPlacementBoard: () => null },
  'creative-url-preview': { CreativeUrlPreview: () => null },
  'media-icon': { MediaIcon: ({ media }) => React.createElement('span', null, media) },
};
function load(file) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  assert.ok(['lib/monitoring-plan-scope.ts', 'lib/placement-showroom.ts', 'lib/media-normalization.ts', 'lib/placement-urls.ts', 'lib/media-icons.ts', 'lib/media-identity.ts', 'lib/creative-image.ts', 'lib/proof-image-input.ts', 'components/placement-showroom.tsx'].some(p => path.resolve(root, p) === filename), filename);
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', 'module', code)(request => {
    if (request === 'react') return mockReact;
    if (request === 'react/jsx-runtime') return require(request);
    if (request.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    const stub = childStubs[path.basename(request)]; if (stub) return stub;
    const resolved = request.startsWith('@/') ? path.resolve(root, request.slice(2)) : path.resolve(path.dirname(filename), request);
    if (['sources.json','performance-sources.json','execution-sources.json'].some(name => resolved.endsWith('public/media-icons/'+name))) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return load(resolved + '.ts');
  }, module.exports, module);
  return module.exports;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const { hasMonitoringSource, monitoringPlanScope, monitoringSelection } = load('lib/monitoring-plan-scope.ts');
const { buildShowroomItems } = load('lib/placement-showroom.ts');
const { PlacementShowroom } = load('components/placement-showroom.tsx');
const plan = (extra = {}) => ({ platform: 'SBS-TV', product: 'TV proposal', placement: 'Proposal broadcast', device: '', creativeType: '', periodStart: '2030-01-01', periodEnd: '2030-01-31', budget: 500, expectedImpressions: 100, expectedClicks: null, target: '', sourceSheet: 'Synthetic', ...extra });
const metric = (extra = {}) => ({ platform: '호갱노노', placement: 'Source app inventory', spend: 0, impressions: 0, clicks: null, ctr: null, achievement: null, guaranteed: '', views: null, sourceSheet: 'Synthetic', sourceFile: 'synthetic.xlsx', reportDate: '2030-01-15', ...extra });
const proof = (extra = {}) => ({ advertiser: 'Synthetic', month: '2030-01', reportDate: '2030-01-20', verificationDate: '', media: '포커스미디어', placement: 'Synthetic elevator', campaignName: 'Synthetic', serviceType: 'Manual', periodStart: '', periodEnd: '', location: '', airingTime: '', dailyFrequency: null, durationSec: null, budgetReference: null, status: '확인 필요', creativeName: 'Original title', messageId: '', mailSubject: '', mailDate: '', sourceFile: '', sourceSummary: '', attachments: [], ...extra });
const inputs = freeze({ proofs: [proof()], plans: [plan(), plan({ platform: '직방', product: 'App proposal', placement: 'Proposal app inventory', device: 'MO' }), plan({ platform: '호갱노노', product: 'Source app inventory', placement: 'Source app inventory' })], rows: [metric()] });
const sourceBefore = JSON.stringify(inputs);
const items = freeze(buildShowroomItems(inputs.proofs, inputs.plans, inputs.rows));
const before = JSON.stringify(items);
const basic = monitoringPlanScope(items);
assert.equal(basic.sourced.length, 2);
assert.equal(basic.planOnly.length, 2);
assert.strictEqual(basic.visible, basic.sourced);
assert.equal(basic.visible.some(i => i.environment === 'tv'), false, 'Proposal TV hidden by default');
assert.equal(basic.visible.find(i => i.media === '호갱노노').plans.length, 1, 'Mixed source/plan item remains source-backed');
assert.equal(basic.visible.find(i => i.media === '호갱노노').metrics[0].spend, 0, 'Zero metrics are source presence, not false/missing');
assert.equal(hasMonitoringSource({ proofs: [], metrics: [{ spend: null }], plans: [] }), true, 'Null-valued source remains a source, not evidence of current delivery');
const expanded = monitoringPlanScope(items, true);
assert.equal(expanded.visible.length, 4);
assert.deepEqual(expanded.visible, items);
expanded.visible.forEach((item, index) => assert.strictEqual(item, items[index], 'Original references retained'));
const emptyItem = freeze({ ...items[0], id: 'empty', proofs: [], metrics: [], plans: [] });
assert.deepEqual(monitoringPlanScope([emptyItem], true).visible, []);
assert.deepEqual(monitoringPlanScope([]).visible, []);
const stale = monitoringSelection(basic.visible, 'digital', 'all', '직방', 'stale-proposal-id');
assert.equal(stale.activeMedia, '전체');
assert.deepEqual(stale.medias, ['호갱노노']);
assert.equal(stale.selected.media, '호갱노노');
assert.equal(stale.visible.length, 1);
assert.equal(monitoringSelection(basic.visible, 'tv', 'broadcast', 'SBS-TV', 'stale').selected, undefined);
const surfaceEmpty = monitoringSelection(basic.visible, 'digital', 'desktop', '호갱노노', stale.selected.id);
assert.deepEqual(surfaceEmpty.medias, []); assert.equal(surfaceEmpty.selected, undefined);
assert.equal(monitoringSelection([], 'ooh', 'all', 'old', 'old').visible.length, 0);
assert.deepEqual(monitoringPlanScope(items).visible, basic.visible, 'Returning from expanded scope is deterministic');
assert.equal(JSON.stringify(items), before); assert.equal(JSON.stringify(inputs), sourceBefore);

// Rendering runs the real showroom and real source model. Only unrelated children and hooks are stubbed.
function render(values = []) { hookValues = values; hookIndex = 0; updates = []; const tree = PlacementShowroom({ ...inputs, onOpenImage() { throw Error('Read-only render'); } }); return { tree, html: renderToStaticMarkup(tree) }; }
function nodes(element, predicate) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(el => nodes(el, predicate));
  return [...(predicate(element) ? [element] : []), ...nodes(element.props?.children, predicate)];
}
const tv = render([false, 'evidence', 'tv', 'broadcast', 'SBS-TV', 'stale']);
assert.ok(tv.html.includes('TV 방송 자료 연결 항목 0개'));
assert.equal(tv.html.includes('Proposal broadcast'), false);
assert.equal(tv.html.includes('class="television"'), false, 'No TV mockup implying a nonexistent source');
assert.ok(tv.html.includes('자료의 존재가 현재 집행 중임을 뜻하지 않습니다.'));
assert.ok(tv.html.includes('운영안만 1개'));
const checkbox = nodes(tv.tree, el => el.type === 'input' && el.props.type === 'checkbox')[0];
assert.equal(checkbox.props.checked, false);
checkbox.props.onChange({ target: { checked: true } });
assert.deepEqual(updates, [[0, true], [4, '전체'], [5, ''], [7, 0], [8, undefined], [9, false], [10, null]], 'Scope change clears stale media, selection, proof, page, app and device');
const tvPlans = render([true, 'evidence', 'tv', 'broadcast', '전체', '']);
assert.ok(tvPlans.html.includes('Proposal broadcast')); assert.ok(tvPlans.html.includes('운영안만 · 제안/예정')); assert.ok(tvPlans.html.includes('운영안만 · 증빙/성과 미연결'));
const digital = render([false, 'evidence', 'digital', 'all', '직방', 'stale', '', 2, 9, true, 'desktop']);
assert.ok(digital.html.includes('Source app inventory'));
assert.equal(digital.html.includes('Proposal app inventory'), false);
assert.equal(digital.html.includes('직방'), false, 'Proposal-only app absent from icon grid, rails, inventory and detail');
assert.ok(digital.html.includes('앱·매체 선택'), 'Invalid app selection returns to source-backed home');
const grid = nodes(digital.tree, el => el.props?.className === 'appGrid')[0];
assert.equal(nodes(grid, el => el.type === 'button').length, 1, 'App grid uses same scoped source list');
const surfaceButton = nodes(digital.tree, el => el.type === 'button' && el.props['aria-pressed'] === true && el.props.children === '전체')[0];
updates = []; surfaceButton.props.onClick();
assert.ok(updates.some(([index, value]) => index === 5 && value === ''), 'Surface clears selection');
const withPlans = render([true, 'evidence', 'digital', 'all', '전체', '']);
assert.ok(withPlans.html.includes('Proposal app inventory')); assert.ok(withPlans.html.includes('직방'));
const overview = fs.readFileSync(path.resolve(root, 'app/(dashboard)/overview/page.tsx'), 'utf8');
assert.ok(overview.includes('id="overview:월 예산:4" title="등록 운영안 금액"'));
assert.ok(overview.includes('확정 예산 아님'));
assert.match(overview, /id="overview:미디어 운영안:9"[^>]*><details[^>]*><summary/);
assert.ok(overview.includes('누적·중복 조정 전 참고값'));
console.log('Monitoring plan scope passed: source/plan partition, original preservation, zero/null metrics, empty TV, opt-in proposals, stale selection/surface safety, digital source-list consistency, checkbox resets, overview labels/collapsed plan table.');
