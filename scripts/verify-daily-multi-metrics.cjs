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
for (const file of ["components/media-label.tsx","lib/media-identity.ts","public/media-icons/sources.json","public/media-icons/performance-sources.json","public/media-icons/execution-sources.json"]) allowed.add(path.resolve(root,file));
const cache = new Map();
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(allowed.has(name), `Unexpected runtime dependency: ${name}`);
  if (cache.has(name)) return cache.get(name).exports;
  if(name.endsWith(".json")) return JSON.parse(fs.readFileSync(name,"utf8"));
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
      assert.ok([cssFile,path.resolve(root,'components/media-label.module.css')].includes(base),'Only allowlisted component CSS stubs');
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

const { buildDailyChange, buildCombinedDailyChart, DailyCombinedChart, buildReportDailySeries, buildReportDailyTable, DailyMetricTable, PerformanceReportTrend, PerformanceReportOverview } = load('components/performance-report.tsx');
const { buildPerformanceReport } = load('lib/performance-report.ts');
const dailyRows = [daily({date:'2030-01-10', impressions:100, clicks:10, spend:20, views:4}),daily({date:'2030-01-10',placement:'Synthetic (서비스)',impressions:50,clicks:null,spend:999}),daily({date:'2030-01-12',impressions:0,clicks:0,spend:0}),daily({date:'2030-01-13',impressions:null,clicks:2,spend:null}),daily({date:'2030-02-30',impressions:999}),daily({date:'2029-01-01',impressions:999})];
const report=buildPerformanceReport(input({dailyRows}));
const media=report.media[0];const before=JSON.stringify(media);deepFreeze(media);
const series=buildReportDailySeries(media,'2030-01-10','2030-01-25');
assert.equal(JSON.stringify(media),before);
assert.deepEqual(series.map(p=>p.date),['2030-01-10','2030-01-12','2030-01-13']);
assert.equal(series[0].impressions,150);assert.equal(series[0].spend,20);assert.equal(series[1].impressions,0);assert.equal(series[1].spend,0);assert.equal(series[2].impressions,null);assert.equal(series[2].views,null);
const html=renderToStaticMarkup(React.createElement(PerformanceReportTrend,{media,startDate:'2030-01-10',endDate:'2030-01-25'}));
assert.equal((html.match(/data-daily-metric=/g)||[]).length,0,'No separate per-metric chart cards');
assert.equal((html.match(/data-daily-combined-chart=/g)||[]).length,1,'One default-visible combined graph');
assert.equal((html.match(/<svg /g)||[]).length,4,'One combined graph and three matching pattern legend icons');
assert.equal((html.match(/aria-hidden=\"true\" class=\"legendStroke\"/g)||[]).length,3,'Legend displays each line dash pattern');
assert.equal((html.match(/data-combined-axis=/g)||[]).length,3);
assert.ok(html.indexOf('data-daily-combined-chart') < html.indexOf('<details'), 'Combined graph is outside the optional table disclosure');
assert.equal((html.match(/<path /g)||[]).length,6,'Missing day and null interrupt each metric independently');
assert.match(html,/공통 비교일/);assert.match(html,/미제공/);assert.match(html,/독립 축/);assert.match(html,/type="checkbox"/);assert.doesNotMatch(html,/NaN|Infinity|undefined/);
const empty=renderToStaticMarkup(React.createElement(PerformanceReportTrend,{media:{...media,dailyRows:[daily({impressions:null,clicks:null,spend:null})]},startDate:'2030-01-10',endDate:'2030-01-25'}));assert.equal((empty.match(/<svg /g)||[]).length,0);assert.match(empty,/disabled=""/);
const overflow=buildReportDailySeries({...media,dailyRows:[daily({impressions:Number.MAX_VALUE}),daily({impressions:Number.MAX_VALUE})]},'2030-01-10','2030-01-25');assert.equal(overflow[0].impressions,null);
const overview=renderToStaticMarkup(React.createElement(PerformanceReportOverview,{report,insights:[],startDate:'2030-01-10',endDate:'2030-01-25',onOpenMedia:()=>{},onOpenPlan:()=>{}}));assert.match(overview,/data-daily-multi-metrics/);
// The optional table uses the same series and preserves absent days separately from null metrics.
const table = buildReportDailyTable([{media,series}], '2030-01-10','2030-01-25');
assert.equal(table.calendarComplete,true);assert.equal(table.groups.length,16);
assert.equal(table.groups[0].date,'2030-01-25');assert.equal(table.groups.at(-1).date,'2030-01-10');
assert.equal(table.groups.find(g=>g.date==='2030-01-11').rows[0].point,null);
assert.equal(table.groups.find(g=>g.date==='2030-01-13').rows[0].point.impressions,null);
assert.equal(table.groups.find(g=>g.date==='2030-01-12').rows[0].point.spend,0);
const tableHtml=html.match(/<table[\s\S]*?<\/table>/)?.[0];assert.ok(tableHtml,'Single optional table is retained');
assert.equal((html.match(/data-daily-table=/g)||[]).length,1);
assert.equal((tableHtml.match(/scope="col"/g)||[]).length,5,'Date, media and three metrics in the same table');
const tableRow = date => tableHtml.match(new RegExp('<tr data-daily-table-date="'+date+'" data-daily-table-media="네이버">([\\s\\S]*?)<\\/tr>'))?.[1];
assert.match(tableRow('2030-01-11'),/원본 없음/);assert.doesNotMatch(tableRow('2030-01-11'),/>0(?:원)?</);
assert.match(tableRow('2030-01-13'),/미제공/);assert.match(tableRow('2030-01-12'),/>0원</);
assert.match(tableRow('2030-01-10'),/>150</);assert.match(tableRow('2030-01-10'),/>20원</);assert.doesNotMatch(tableRow('2030-01-10'),/>1,019원</);
assert.match(html,/<details[^>]*data-daily-table-disclosure[^>]*><summary>일별 수치 표 펼치기/);assert.doesNotMatch(html,/<details[^>]*open/);
assert.match(html,/선택일만 보기/);assert.match(html,/tabindex="0"/);
const rawMedia={...media,name:'합성 방송',kind:'broadcast'};
const otherMedia={...media,name:'합성 동영상',kind:'video'};
const multi=buildReportDailyTable([{media,series},{media:rawMedia,series},{media:otherMedia,series}], '2030-01-10','2030-01-13');
const multiHtml=renderToStaticMarkup(React.createElement(DailyMetricTable,{groups:multi.groups,metrics:['impressions','clicks','spend','views'],date:'2030-01-12'}));
assert.equal((multiHtml.match(/data-daily-table-date=/g)||[]).length,12,'Four dates x three separate media rows');
assert.equal((multiHtml.match(/rowSpan="3"/gi)||[]).length,4);
assert.match(multiHtml,/해당 없음/);assert.match(multiHtml,/원본 지표 · 접촉 인원 아님/);assert.doesNotMatch(multiHtml,/<tfoot|NaN|Infinity|undefined/);
assert.equal(buildReportDailyTable([{media,series}],'2030-02-30','2030-03-03').groups.length,0);
assert.equal(buildReportDailyTable([{media,series}],'2030-01-25','2030-01-10').groups.length,0);
assert.equal(buildReportDailyTable([{media,series}],'2028-01-01','2028-12-31').groups.length,366,'Leap calendar remains complete');
const long=buildReportDailyTable([{media,series}],'2020-01-01','2040-01-01');assert.equal(long.calendarComplete,false);assert.equal(long.groups.length,3,'Long ranges remain bounded to source dates');
assert.equal(JSON.stringify(media),before,'Table rendering never mutates source data');
const model=buildCombinedDailyChart(media,series,['impressions','clicks','spend','views'],Date.parse('2030-01-10T00:00:00Z'),Date.parse('2030-01-25T00:00:00Z'));
assert.equal(model.axes.length,4);assert.equal(new Set(model.axes.map(axis=>axis.color)).size,4);
assert.deepEqual(model.axes.map(axis=>axis.maximum),[150,10,20,4],'Original metric-specific units/scales, not a shared raw-value axis');
assert.deepEqual(model.axes.map(axis=>axis.points.length),[2,3,2,1]);assert.deepEqual(model.axes.map(axis=>axis.paths.length),[2,2,2,1]);
assert.equal(model.axes[0].points.find(p=>p.date==='2030-01-12').value,0);assert.ok(model.axes.every(axis=>!axis.points.some(point=>point.date==='2030-01-11')));
assert.equal(model.axes[2].maximum,20,'Reference service cost never enters the plot');
const rawModel=buildCombinedDailyChart(rawMedia,series,['impressions','clicks','spend','views'],Date.parse('2030-01-10T00:00:00Z'),Date.parse('2030-01-25T00:00:00Z'));assert.equal(rawModel.axes[1].allowed,false);assert.deepEqual(rawModel.axes[1].points,[]);assert.deepEqual(rawModel.axes[1].paths,[]);
const extreme=[{...series[0],impressions:-Number.MAX_VALUE},{...series[1],impressions:Number.MAX_VALUE}];const extremeModel=buildCombinedDailyChart(media,extreme,['impressions'],Date.parse('2030-01-10T00:00:00Z'),Date.parse('2030-01-25T00:00:00Z'));
assert.ok(extremeModel.axes[0].points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));assert.doesNotMatch(extremeModel.axes[0].paths.join(''),/NaN|Infinity/);
const combinedHtml=renderToStaticMarkup(React.createElement(DailyCombinedChart,{media,series,metrics:['impressions','clicks','spend','views'],dates:['2030-01-10','2030-01-11','2030-01-12','2030-01-13'],date:'2030-01-12',minTime:Date.parse('2030-01-10T00:00:00Z'),maxTime:Date.parse('2030-01-25T00:00:00Z'),onDate:()=>{}}));
assert.equal((combinedHtml.match(/data-combined-readout=/g)||[]).length,4);assert.equal((combinedHtml.match(/<svg /g)||[]).length,5,'One combined graph and four legend icons');assert.equal((combinedHtml.match(/data-combined-day=/g)||[]).length,4);assert.equal((combinedHtml.match(/tabindex="0" role="button"/g)||[]).length,0);assert.match(combinedHtml,/data-combined-day="2030-01-12"[^>]*tabindex="0"/);assert.match(combinedHtml,/>0원</);assert.match(combinedHtml,/통합 그래프 스크롤 영역/);
assert.equal(JSON.stringify(media),before,'Combined graph and optional table never mutate sources');
// Consecutive daily changes require identical metric-specific source coverage.
const changeRows = [
 daily({date:'2030-01-14',impressions:384907,clicks:200,spend:0,views:null}),
 daily({date:'2030-01-15',impressions:381317,clicks:217,spend:12.5,views:7}),
 daily({date:'2030-01-16',impressions:381317,clicks:null,spend:12.5,views:7}),
 daily({date:'2030-01-17',placement:'Another slot',impressions:5,clicks:1,spend:3}),
 daily({date:'2030-01-19',impressions:10,clicks:2,spend:1})
];
const changeMedia={...media,dailyRows:changeRows};const changeSeries=buildReportDailySeries(changeMedia,'2030-01-14','2030-01-19');
assert.deepEqual(buildDailyChange(changeMedia,changeSeries,'2030-01-15','impressions'),{difference:-3590,percent:-3590/384907*100});
assert.deepEqual(buildDailyChange(changeMedia,changeSeries,'2030-01-15','clicks'),{difference:17,percent:8.5});
assert.deepEqual(buildDailyChange(changeMedia,changeSeries,'2030-01-15','spend'),{difference:12.5,percent:null});
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-01-15','views'),null,'Missing value never becomes zero');
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-01-16','clicks'),null,'Missing current value');
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-01-17','impressions'),null,'Changed placements are incomparable');
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-01-19','impressions'),null,'No bridging over missing previous day');
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-01-14','impressions'),null,'Beginning of selected period');
assert.equal(buildDailyChange({...changeMedia,kind:'broadcast'},changeSeries,'2030-01-15','clicks'),null,'Metric not applicable');
assert.equal(buildDailyChange(changeMedia,changeSeries,'2030-02-30','clicks'),null,'Invalid calendar date');
const changedHtml=renderToStaticMarkup(React.createElement(DailyCombinedChart,{media:changeMedia,series:changeSeries,metrics:['impressions','clicks','spend','views'],dates:['2030-01-14','2030-01-15'],date:'2030-01-15',minTime:Date.parse('2030-01-14T00:00:00Z'),maxTime:Date.parse('2030-01-19T00:00:00Z'),onDate:()=>{}}));
assert.ok(changedHtml.includes('전일 대비 -3,590 (-0.9%)'));assert.ok(changedHtml.includes('전일 대비 +17 (+8.5%)'));assert.ok(changedHtml.includes('전일 대비 +13원'));assert.ok(changedHtml.includes('전일 대비 비교 불가'));assert.doesNotMatch(changedHtml,/NaN|Infinity/);
assert.match(changedHtml,/class="dailyDelta deltaDown"[^>]*data-daily-change="impressions"[^>]*data-delta-tone="down"/,'fall is blue');assert.match(changedHtml,/class="dailyDelta deltaUp"[^>]*data-daily-change="clicks"[^>]*data-delta-tone="up"/,'rise is red');assert.match(changedHtml,/data-daily-change="views"[^>]*data-delta-tone="none"/,'not comparable stays neutral');
console.log('Combined graph checks passed: one visible SVG, four overlaid metric series/colors/scales, same-day readouts/calendar controls, null and date gaps, real zero, raw units, reference cost exclusion, extreme finite geometry, optional table and source immutability.');
