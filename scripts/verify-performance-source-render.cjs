'use strict';
// Synthetic SSR only: allowlisted implementation modules, no customer files,
// browser, network, account access, or persistent state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const allowed = new Set([
  'components/performance-source-panels.tsx', 'components/placement-performance-matrix.tsx',
  'lib/performance-visuals.ts', 'lib/performance-report.ts', 'lib/media-normalization.ts',
  'lib/placement-showroom.ts', 'lib/placement-urls.ts',
].map(file => path.resolve(root, file)));
const cssAllowed = new Set(['components/performance-source-panels.module.css', 'components/performance-visuals.module.css'].map(file => path.resolve(root, file)));
for (const file of ["components/media-label.tsx","lib/media-identity.ts","public/media-icons/sources.json","public/media-icons/performance-sources.json","public/media-icons/execution-sources.json"]) allowed.add(path.resolve(root,file));
const cache = new Map();
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.has(name), `Unexpected module: ${name}`);
  if (cache.has(name)) return cache.get(name).exports;
  if(name.endsWith(".json")) return JSON.parse(fs.readFileSync(name,"utf8"));
  const module = { exports: {} }; cache.set(name, module);
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = specifier => {
    if (specifier === 'react' || specifier === 'react/jsx-runtime') return require(specifier);
    if (specifier === '@/components/layout-canvas') {
      const wrapper = ({ children }) => React.createElement('section', null, children);
      return { LayoutCanvas: wrapper, LayoutPanel: wrapper, LayoutGroup: wrapper };
    }
    if (specifier === '@/components/daily-insight-history') return { InsightEntry: () => null };
    assert.ok(specifier.startsWith('.') || specifier.startsWith('@/'), `Forbidden runtime dependency: ${specifier}`);
    const base = specifier.startsWith('@/') ? path.resolve(root, specifier.slice(2)) : path.resolve(path.dirname(name), specifier);
    if (base.endsWith('.css')) {
      assert.ok(cssAllowed.has(base) || base === path.resolve(root,'components/media-label.module.css'));
      return { __esModule: true, default: new Proxy({}, { get: (_obj, key) => String(key) }) };
    }
    const resolved = [...allowed].find(candidate => candidate === base || candidate === `${base}.ts` || candidate === `${base}.tsx`);
    assert.ok(resolved, `Forbidden local dependency: ${specifier}`);
    return load(resolved);
  };
  new Function('require', 'exports', 'module', js)(localRequire, module.exports, module);
  return module.exports;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const row = (extra = {}) => ({ platform: '네이버', placement: 'Synthetic slot', sourceFile: 'synthetic.xlsx',
  sourceSheet: 'Synthetic sheet', reportDate: '2030-01-20', guaranteed: '', achievement: null,
  spend: null, impressions: null, clicks: null, ctr: null, views: null, conversions: null,
  cpc: null, cpm: null, cpv: null, vtr: null, ...extra });
const originalFetch = globalThis.fetch;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };
try {
  globalThis.fetch = () => { throw new Error('Network forbidden'); };
  const { PerformanceSourcePanels } = load('components/performance-source-panels.tsx');
  const render = (rows, dailyRows = [], extra = {}) => {
    const props = freeze({ advertiser: 'Synthetic advertiser', month: '2030-01', startDate: '2030-01-01', endDate: '2030-01-20',
      viewMode: 'placement', baselineComplete: true, placementGroups: [{ media: '네이버', rows }], creativeGroups: [], dailyRows,
      relevantInsights: () => [], ...extra });
    const before = JSON.stringify(props);
    const html = renderToStaticMarkup(React.createElement(PerformanceSourcePanels, props));
    assert.equal(JSON.stringify(props), before, 'Rendering never mutates supplied source facts');
    return html;
  };
  const total = html => html.match(/<tr class="totalRow">([\s\S]*?)<\/tr>/)?.[1] || '';
  const text = html => html.replace(/<[^>]*>/g, '');
  const cells = html => [...total(html).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(match => text(match[1]));
  const fixtures = [
    row({ spend: 100, impressions: 100, clicks: 10, views: 20, ctr: 87.65, cpc: 777, cpm: 888, cpv: 999 }),
    row({ spend: 900 }),
    row({ impressions: 900, clicks: 90, views: 180 }),
    row({ spend: 300, impressions: 300, views: 60 }),
    row({ clicks: 50 }),
    row({ service: true, placement: '서비스 지면', spend: 10000, impressions: 1000, clicks: 100, views: 200 }),
  ];
  const html = render(fixtures);
  test('paid spend and cost rates exclude reference and unmatched metric populations', () => {
    assert.deepEqual(cells(html), ['합계', '1,300원 · 유료 집행액', '2,300', '250', '10.00%', '460', '1,000원', '10원', '5원']);
    assert.match(html, /10,000원<small> · 원본 참고 금액<\/small>/);
  });
  test('supplied original row rates remain authoritative and untouched', () => {
    for (const value of ['87.65%', '777원', '888원', '999원']) assert.ok(html.includes(value), value);
    assert.match(html, /<th>원본 금액<\/th>/);
    assert.doesNotMatch(html, /<th>집행액<\/th>/);
  });
  test('source matrix CTR also uses finite paired rows', () => {
    const matrix = html.match(/<tr class="matrixTotal"[\s\S]*?<\/tr>/)?.[0];
    assert.ok(matrix.includes('10.00%'));
    assert.ok(!matrix.includes('12.50%'));
  });
  test('unknown aggregates stay missing while actual zeros remain zero', () => {
    assert.deepEqual(cells(render([row()])), ['합계', '-', '-']);
    const zero = cells(render([row({ spend: 0, impressions: 100, clicks: 0, views: 0, cpc: 0, cpm: 0, cpv: 0 })]));
    assert.deepEqual(zero, ['합계', '0원 · 유료 집행액', '100', '0', '0.00%', '0', '0원', '-', '-']);
    const references = cells(render([row({ service: true, spend: 50, impressions: 100, clicks: 1, cpc: 50 })]));
    assert.deepEqual(references, ['합계', '- · 유료 집행액', '100', '1', '1.00%', '-']);
  });
  test('nonfinite and unpaired operands cannot poison aggregate rates', () => {
    const result = cells(render([
      row({ spend: 100, impressions: 100, clicks: 10, views: 20, cpc: 100, cpm: 100, cpv: 100 }),
      row({ spend: Infinity, impressions: 1000, clicks: 100, views: 200 }),
      row({ spend: 200, impressions: Infinity, clicks: null }),
      row({ spend: NaN, impressions: 1000, clicks: NaN }),
      row({ clicks: 500, impressions: null }),
    ]));
    assert.deepEqual(result.slice(-3), ['1,000원', '10원', '5원']);
    assert.ok(!result.some(value => /NaN|Infinity/.test(value)));
    assert.ok(result.includes('10.00%'));
  });
  test('daily-only evidence renders real dates and no fabricated cumulative summary', () => {
    const dailyRows = [row({ date: '2030-01-19', impressions: 100, clicks: 10, spend: 900, service: true, ctr: 54.32, cpc: 999 }),
      row({ date: '2030-01-20', impressions: 0, clicks: 0 }),
      row({ date: '2030-01-20', placement: 'Unknown daily slot' })];
    const dailyHtml = render([], dailyRows);
    assert.match(dailyHtml, /일별 성과 제공 · 누적 성과 미제공/);
    assert.match(dailyHtml, /data-matrix-date="2030-01-19"/);
    assert.match(dailyHtml, /data-matrix-date="2030-01-20"/);
    assert.match(dailyHtml, /<td>0<\/td><td>0<\/td><td>-<\/td>/);
    assert.match(dailyHtml, /<td>-<\/td><td>-<\/td><td>-<\/td>/);
    assert.doesNotMatch(dailyHtml, /data-matrix-total|class="totalRow"|0개 광고 지면|선택 기간 합계|계획만/);
    assert.match(dailyHtml, /900원<small> · 원본 참고 금액<\/small>/);
    assert.ok(dailyHtml.includes('54.32%') && dailyHtml.includes('999원'));
  });
  test('incomplete baseline never calls source rows a period total', () => {
    const incomplete = render([row({ spend: 0, impressions: 0 })], [], { baselineComplete: false });
    assert.match(incomplete, /원본값 참고 · 기간 합계 아님/);
    assert.doesNotMatch(incomplete, /선택 기간 합계/);
  });
  console.log(`Performance source render checks passed (${passed} synthetic cases).`);
} finally { globalThis.fetch = originalFetch; }
