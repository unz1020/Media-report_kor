'use strict';

// Run: node scripts/verify-performance-report-render.cjs
// Synthetic SSR only. Reads exactly the allowlisted implementation modules,
// never fixtures from disk/customer data. No browser, network or storage writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const allowed = new Set([
  'components/performance-report.tsx', 'lib/performance-report.ts',
  'lib/performance-brief.ts', 'lib/media-normalization.ts',
  'lib/placement-showroom.ts', 'lib/placement-urls.ts',
].map(file => path.resolve(root, file)));
const cssFile = path.resolve(root, 'components/performance-report.module.css');
const css = Object.freeze({ __esModule: true, default: new Proxy(Object.freeze({}), {
  get: (_target, key) => String(key),
}) });
const cache = new Map();
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.has(name), `Unexpected runtime dependency: ${name}`);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const result = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `Transpilation errors: ${name}`);
  const localRequire = specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'react/jsx-runtime') return require('react/jsx-runtime');
    assert.ok(specifier.startsWith('.') || specifier.startsWith('@/'), `Forbidden runtime dependency: ${specifier}`);
    const base = specifier.startsWith('@/') ? path.resolve(root, specifier.slice(2)) : path.resolve(path.dirname(name), specifier);
    if (base.endsWith('.css')) {
      assert.equal(base, cssFile, 'Only the component CSS stub is allowed');
      return css;
    }
    const resolved = path.extname(base) ? base : [...allowed].find(candidate => candidate === `${base}.ts` || candidate === `${base}.tsx`);
    assert.ok(resolved && allowed.has(resolved), `Forbidden local dependency: ${specifier}`);
    return load(resolved);
  };
  new Function('require', 'exports', 'module', result.outputText)(localRequire, module.exports, module);
  return module.exports;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
const row = (extra = {}) => ({ platform: '네이버', placement: 'Synthetic slot', achievement: null,
  guaranteed: '', spend: null, impressions: null, clicks: null, ctr: null, views: null,
  conversions: null, cpc: null, cpm: null, cpv: null, sourceSheet: 'Synthetic sheet',
  sourceFile: 'synthetic-only.xlsx', reportDate: '2030-01-20', ...extra });
const daily = (extra = {}) => ({ ...row(), date: '2030-01-19', vtr: null, ...extra });
const plan = (extra = {}) => ({ platform: '계획 전용 테스트', placement: 'Synthetic plan slot',
  product: '', device: '', creativeType: '', periodStart: '2030-01-01', periodEnd: '2030-01-31',
  budget: 999999999, expectedImpressions: 888888888, expectedClicks: 777777777,
  target: '', sourceSheet: 'Synthetic plan', ...extra });
const insight = (extra = {}) => ({ key: 'memo-latest', advertiser: 'Synthetic advertiser',
  datasetKey: 'synthetic-dataset', reportDate: '2030-01-20', mailDate: '2030-01-21T03:04:00Z',
  publishedAt: '2099-12-31T23:59:59Z', mailSubject: 'Synthetic source mail',
  notes: ['수동 등록 운영 메모: 원본의 확인 범위를 기록했습니다.'], ...extra });
const input = (extra = {}) => ({ rows: [], dailyRows: [], plans: [], startDate: '2030-01-10',
  endDate: '2030-01-25', baselineComplete: true, ...extra });
const metrics = ['spend', 'impressions', 'clicks', 'ctr', 'views', 'conversions', 'cpc', 'cpm', 'cpv'];
let passed = 0;
function test(name, run) { run(); passed++; process.stdout.write(`PASS ${name}\n`); }
function text(html) { return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"'); }
function validSvg(html) {
  const svg = html.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0];
  assert.ok(svg, 'SVG exists');
  assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined|\[object Object\])/);
  const stack = [];
  for (const token of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const [tag, closing, name] = token;
    assert.ok(['svg', 'g', 'line', 'text', 'path', 'circle', 'title'].includes(name), `Unexpected SVG element ${name}`);
    if (closing) assert.equal(stack.pop(), name, `Balanced SVG closing tag: ${name}`);
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  assert.deepEqual(stack, [], 'SVG is structurally balanced');
  for (const match of svg.matchAll(/<path\b[^>]*d="([^"]*)"/g)) {
    assert.match(match[1], /^M[-\d., eEL]+$/, 'Only finite move/line path coordinates');
  }
  assert.ok((svg.match(/<title>/g) || []).length > 0, 'Point tooltip titles present');
}

// Guard ambient I/O too: runtime modules cannot accidentally fetch or open a
// browser-storage path. Restore all globals and consoles even on test failure.
const originalFetch = globalThis.fetch;
const storageDescriptors = Object.fromEntries(['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalError = console.error, originalWarn = console.warn;
const warnings = [];
try {
  globalThis.fetch = () => { throw new Error('Network is forbidden in synthetic SSR tests'); };
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, key, {
    configurable: true, get() { throw new Error(`${key} is forbidden in synthetic SSR tests`); },
  });
  console.error = (...args) => warnings.push(args.map(String).join(' '));
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  const { buildPerformanceReport } = load('lib/performance-report.ts');
  const { buildPerformanceChanges } = load('lib/performance-brief.ts');
  const { PerformanceReportOverview: Overview, MediaReportKpis: Kpis, PerformanceReportTrend: Trend } = load('components/performance-report.tsx');
  const build = extra => buildPerformanceReport(deepFreeze(input(extra)));
  const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
  const overview = (report, insights = []) => render(Overview, { report, insights, startDate: '2030-01-10', endDate: '2030-01-25', onOpenMedia() {}, onOpenPlan() {} });
  const trend = media => render(Trend, { media, startDate: '2030-01-10', endDate: '2030-01-25' });
  const sourceInput = deepFreeze(input({ rows: [
    row({ spend: 100, impressions: 1000, clicks: 10, reportDate: '2030-01-17' }),
    row({ spend: 987654321, impressions: 20, clicks: 0, service: true, placement: '서비스 지면', reportDate: '2030-01-17' }),
    row({ platform: '카카오', spend: 0, impressions: 0, clicks: 0, reportDate: '2030-01-22' }),
    row({ platform: 'YouTube', spend: null, impressions: 200, clicks: null, views: 50, reportDate: '2030-01-18' }),
  ], dailyRows: [
    daily({ date: '2030-01-15', reportDate: '2030-01-17', impressions: 100, clicks: 10 }),
    daily({ date: '2030-01-16', reportDate: '2030-01-17', impressions: 120, clicks: 15 }),
    daily({ platform: '카카오', date: '2030-01-21', reportDate: '2030-01-22', impressions: 0, clicks: 0 }),
  ], plans: [plan()] }));
  const ownersBefore = JSON.stringify(sourceInput);
  const report = deepFreeze(buildPerformanceReport(sourceInput));
  const reportBefore = JSON.stringify(report);
  const html = overview(report);

  test('summary is editorial, scoped and navigable without raw tables', () => {
    assert.doesNotMatch(html, /<(?:table|thead|tbody)\b/);
    for (const phrase of ['비용 제공분', '전체 예산 아님', '디지털·동영상', '방송·옥외 제외', '미제공분 제외', '성과 순위가 아닙니다']) assert.ok(html.includes(phrase), phrase);
    assert.match(html, /type="search"/);
    assert.match(html, /aria-label="매체 유형 필터"/);
    assert.match(html, /aria-label="네이버 성과 상세 보기"/);
    assert.ok(html.includes('매체 계획 보기'));
  });
  test('reference spend excluded with an explicit note; source counts preserved', () => {
    assert.equal(report.totals.reportedSpend, 100);
    assert.equal(report.totals.excludedReferenceRows, 1);
    assert.ok(html.includes('서비스·참고 비용은 집행액에서 제외합니다 (1개 원본 행)'));
    assert.ok(!html.includes('987,654,321'));
    assert.equal(report.media.find(m => m.name === '네이버').metrics.impressions, 1020);
  });
  test('actual zero stays zero and unknown remains an em dash', () => {
    const zero = render(Kpis, { media: report.media.find(m => m.name === '카카오'), baselineComplete: true });
    assert.match(zero, /<dd[^>]*>0원<\/dd>/); assert.match(zero, /<dd[^>]*>0<\/dd>/);
    const unknown = overview(build());
    assert.equal((unknown.match(/<dd[^>]*>—<\/dd>/g) || []).length, 3);
    assert.ok(unknown.includes('등록된 운영 메모가 없습니다'));
    assert.ok(unknown.includes('누적 성과와 계획 수치로 추이를 만들지 않습니다'));
  });
  test('each media row retains its own report and daily coverage dates', () => {
    const naver = html.match(/<button[^>]*aria-label="네이버 성과 상세 보기"[\s\S]*?<\/button>/)?.[0];
    const kakao = html.match(/<button[^>]*aria-label="카카오 성과 상세 보기"[\s\S]*?<\/button>/)?.[0];
    assert.ok(naver && kakao);
    assert.ok(text(naver).includes('보고 기준 2030-01-17'));
    assert.ok(text(naver).includes('일별 원본 ~ 2030-01-16'));
    assert.ok(!naver.includes('2030-01-22'));
    assert.ok(text(kakao).includes('보고 기준 2030-01-22'));
    assert.ok(text(kakao).includes('일별 원본 ~ 2030-01-21'));
  });
  test('plan-only media remain accessible separately without fabricated actuals', () => {
    assert.equal(report.planOnlyCount, 1);
    assert.ok(html.includes('계획 등록 · 성과 원본 대기'));
    assert.match(html, /<button[^>]*><span>계획 전용 테스트<\/span><small>[^<]*계획 상세/);
    assert.ok(html.includes('집행 여부나 성과를 판단하지 않습니다'));
    assert.doesNotMatch(html, /(?:999,999,999|888,888,888|777,777,777|비활성|집행 실패)/);
  });
  test('long media lists show seven results with explicit expansion', () => {
    const many = build({ rows: Array.from({ length: 9 }, (_, i) => row({ platform: `Synthetic medium ${i}`, spend: i })) });
    const output = overview(many);
    assert.equal((output.match(/성과 상세 보기/g) || []).length, 7);
    assert.ok(output.includes('나머지 2개 매체 더 보기'));
    assert.match(output, /aria-expanded="false"/);
  });
  test('manual memos remain collapsed, bounded and report/mail dated', () => {
    const notes = deepFreeze([
      insight({ notes: ['수동 운영 기록 '.repeat(300)] }),
      insight({ key: 'second', reportDate: '2030-01-19', notes: ['두 번째 수동 메모'] }),
      insight({ key: 'third', reportDate: '2030-01-18', notes: ['세 번째 제외 메모'] }),
      insight({ key: 'outside', reportDate: '2030-01-26', notes: ['기간 밖 제외 메모'] }),
    ]);
    const before = JSON.stringify(notes), output = overview(report, notes);
    const memos = [...output.matchAll(/<details class="memo"[^>]*>[\s\S]*?<\/details>/g)].map(m => m[0]);
    assert.equal(memos.length, 2); memos.forEach(m => assert.doesNotMatch(m, /<details[^>]*\bopen(?:=|\s|>)/));
    assert.ok(output.includes('보고 기준일 2030-01-20'));
    assert.ok(output.includes('메일 수신일 2030. 01. 21.'));
    assert.ok(output.includes('Synthetic source mail'));
    assert.ok(output.includes('보고 이후의 조치·해결 여부를 뜻하지 않습니다'));
    assert.ok(!output.includes('2099') && !output.includes('세 번째 제외 메모') && !output.includes('기간 밖 제외 메모'));
    assert.ok(output.length < html.length + 6000, 'Long excerpts cannot expand the summary indefinitely');
    assert.equal(JSON.stringify(notes), before);
  });
  test('source discrepancy finding is historical, not a current resolution claim', () => {
    const output = overview(report, [insight({ notes: ['네이버 원본 불일치: 원본 표의 날짜 확인 필요'] })]);
    assert.ok(output.includes('보고 당시 원본 대조 메모'));
    assert.ok(output.includes('현재 해결 여부는 별도 기록 전까지 판단하지 않습니다'));
    assert.ok(output.includes('네이버 근거 확인'));
    assert.doesNotMatch(output, /(?:오늘 확인 완료|오늘 최적화|실시간 모니터링|해결 완료)/);
  });
  test('incomplete baseline holds cumulative metrics but retains daily evidence', () => {
    const incomplete = deepFreeze(buildPerformanceReport(deepFreeze({ ...sourceInput, baselineComplete: false })));
    incomplete.media.forEach(m => metrics.forEach(key => assert.equal(m.metrics[key], null, key)));
    const output = overview(incomplete);
    assert.ok(output.includes('누적 합계와 효율은 표시하지 않습니다'));
    assert.ok(!output.includes('집행액 분포'));
    assert.equal((output.match(/<dd[^>]*>—<\/dd>/g) || []).length, 4);
    assert.ok(output.includes('2030-01-16 노출수 120'), 'Supplied daily value is still accessible');
    // UI also guards stale externally supplied metrics when baseline is false.
    const stale = render(Kpis, { media: report.media.find(m => m.name === '네이버'), baselineComplete: false });
    assert.ok(stale.includes('누적 합계와 효율을 표시하지 않습니다'));
    assert.doesNotMatch(stale, /<dd[^>]*>(?!—)[^<]+<\/dd>/);
  });
  test('OOH and broadcast display raw counts, never digital efficiencies', () => {
    for (const platform of ['포커스미디어', 'SBS-TV']) {
      const medium = build({ rows: [row({ platform, spend: 100, impressions: 1000, clicks: 10, views: 20 })] }).media[0];
      assert.ok(['ooh', 'broadcast'].includes(medium.kind));
      const output = render(Kpis, { media: medium, baselineComplete: true });
      assert.ok(output.includes('원본 지표 · 노출수'));
      assert.ok(output.includes('실제 시청 인원 아님'));
      assert.doesNotMatch(output, /(?:CTR|CPC|클릭률|클릭당 비용)/);
    }
  });
  test('brief changes are neutral same-coverage adjacent source-day comparisons', () => {
    const changes = buildPerformanceChanges(report.media);
    assert.equal(changes.length, 1); assert.equal(changes[0].percent, 50);
    assert.equal(changes[0].previousDate, '2030-01-15'); assert.equal(changes[0].date, '2030-01-16');
    assert.ok(html.includes('+50.0%'));
    assert.ok(html.includes('같은 지면·지표의 전일 비교 · 효율 판단 아님'));
    assert.doesNotMatch(html, /(?:AI 추천|성과 개선|최적화 완료|효율 개선)/);
    for (const patch of [{ placement: 'Changed slot' }, { sourceSheet: 'Changed sheet' }, { platform: 'Changed owner' }, { clicks: null }, { date: '2030-01-18' }]) {
      const original = report.media.find(m => m.name === '네이버');
      const changed = deepFreeze({ ...original, dailyRows: [original.dailyRows[0], { ...original.dailyRows[1], ...patch }] });
      assert.deepEqual(buildPerformanceChanges([changed]), [], JSON.stringify(patch));
      assert.ok(!overview(deepFreeze({ ...report, media: [changed] })).includes('최근 일별 변화'));
    }
  });
  test('SVG is balanced, finite, source-labeled and keyboard accessible', () => {
    const output = trend(report.media.find(m => m.name === '네이버'));
    validSvg(output);
    assert.match(output, /role="button"[^>]*aria-label="2030-01-15 노출수 100"/);
    assert.match(output, /tabindex="0"/);
    assert.ok(output.includes('일별 원본의 제공 범위는 누적 성과 카드와 다를 수 있습니다'));
  });
  test('daily gaps and missing metrics break paths without synthetic zero-fill', () => {
    const medium = build({ dailyRows: [
      daily({ date: '2030-01-11', impressions: 0 }), daily({ date: '2030-01-13', impressions: 20 }),
      daily({ date: '2030-01-14', impressions: null }), daily({ date: '2030-01-15', impressions: 30 }),
    ] }).media[0];
    const output = trend(deepFreeze(medium));
    validSvg(output);
    assert.equal((output.match(/<path\b/g) || []).length, 3);
    assert.ok(output.includes('2030-01-11 노출수 0'));
    assert.ok(!output.includes('2030-01-12') && !output.includes('2030-01-14 노출수 0'));
    assert.equal((output.match(/class="chartTarget"/g) || []).length, 3);
  });
  test('fractional unit costs do not round into false zero', () => {
    const medium = build({ rows: [row({ spend: 1, impressions: 100, clicks: 10 })] }).media[0];
    assert.ok(render(Kpis, { media: medium, baselineComplete: true }).includes('0.1원'));
  });
  test('frozen inputs and original source owners are unchanged after projections/SSR', () => {
    assert.equal(JSON.stringify(sourceInput), ownersBefore);
    assert.equal(JSON.stringify(report), reportBefore);
    const naver = report.media.find(m => m.name === '네이버');
    assert.strictEqual(naver.rows[0], sourceInput.rows[0]);
    assert.strictEqual(naver.rows[1], sourceInput.rows[1]);
    assert.strictEqual(naver.dailyRows[0], sourceInput.dailyRows[0]);
    assert.strictEqual(report.media.find(m => m.name === '계획 전용 테스트').plans[0], sourceInput.plans[0]);
    assert.ok(Object.isFrozen(sourceInput.rows[0]) && Object.isFrozen(naver.dailyRows));
  });
  test('all component SSR is free of React console warnings', () => assert.deepEqual(warnings, []));
  process.stdout.write(`\n${passed} synthetic performance report render checks passed. No browser/data/network/storage access.\n`);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of ['localStorage', 'sessionStorage']) {
    if (storageDescriptors[key]) Object.defineProperty(globalThis, key, storageDescriptors[key]);
    else delete globalThis[key];
  }
  console.error = originalError; console.warn = originalWarn;
}
