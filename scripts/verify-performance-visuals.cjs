const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const XLSX = require('xlsx');
const cache = new Map();
function load(file) {
  const name = path.resolve(file); if (cache.has(name)) return cache.get(name).exports;
  const mod = {exports:{}};cache.set(name,mod);
  const js = ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports','module',js)(p=>p.startsWith('@/')?load(p.slice(2)+'.ts'):p.startsWith('.')?load(path.resolve(path.dirname(name),p)+'.ts'):require(p),mod.exports,mod);return mod.exports;
}
const {metricSummary, comparisonMetrics, dailyMetricSeries, placementMetricKey, displayMetric}=load('lib/performance-visuals.ts');
const {MEDIA_MIX_MAX_BYTES,validateMediaMixFile}=load('lib/media-mix-upload-validation.ts');
validateMediaMixFile({name:'mix.xlsx',size:MEDIA_MIX_MAX_BYTES});
validateMediaMixFile({name:'mix.CSV',size:MEDIA_MIX_MAX_BYTES});
assert.throws(()=>validateMediaMixFile({name:'mix.xlsx',size:MEDIA_MIX_MAX_BYTES+1}),/30MB/);
assert.throws(()=>validateMediaMixFile({name:'mix.png',size:100}),/Excel/);
const rows=[{platform:'네이버 GFA',placement:'피드',impressions:100,clicks:10,spend:100},{platform:'네이버 GFA',placement:'피드',impressions:900,clicks:0,spend:0},{platform:'어드레서블TV',placement:'SKB',impressions:2000,clicks:null,spend:null}];
assert.deepEqual(metricSummary(rows),{impressions:3000,clicks:10,ctr:1,spend:100});
assert.deepEqual(metricSummary([{impressions:100,clicks:null}]),{impressions:100,clicks:null,ctr:null,spend:null});
assert.equal(metricSummary([{impressions:0,clicks:0}]).ctr,null);
const columns=comparisonMetrics(rows,placementMetricKey,row=>row.placement);
assert.equal(columns.length,2);assert.equal(columns[0].metrics.impressions,1000);assert.equal(columns[0].metrics.ctr,1);
const series=dailyMetricSeries([{date:'2026-10-01',impressions:100,clicks:10},{date:'2026-10-03',impressions:0,clicks:0},{date:'2026-09-30',impressions:99999}], '2026-10-01','2026-10-03');
assert.equal(series.length,3);assert.equal(series[1].metrics,null);assert.equal(series[2].metrics.impressions,0);assert.equal(series[0].metrics.impressions,100);
assert.deepEqual(dailyMetricSeries([],'invalid','2026-10-03'),[]);
assert.equal(displayMetric(null,'clicks'),'—');assert.equal(displayMetric(0,'clicks'),'0');assert.equal(displayMetric(1,'ctr'),'1.00%');
console.log('Performance visual checks passed: weighted CTR, unknown vs zero, grouping, date gaps, period filtering and exact 30MB boundary.');
