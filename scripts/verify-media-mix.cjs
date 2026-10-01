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
const {parseMediaMixWorkbook} = load('lib/media-mix-workbook.ts');
const {mediaPlansFromDatasets} = load('lib/reporting-data.ts');
const {scheduleProduct,planOverlapsMonth,planOnDate,monthBounds} = load('lib/schedule-data.ts');
const {normalizeMediaMix} = load('supabase/functions/reporting-store/media-plan-input.ts');
const book = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
 ['광고 운영안'],['매체','광고상품','소재명','일정','예산','예상 노출수'],
 ['네이버','GFA','소재 A','10/1 ~ 10/15',1000,10000],
 ['', '', '소재 B','10/16 ~ 10/31',2000,20000],
 ['합계','','','',3000,30000],
 ['카카오','비즈보드','소재 C','10/1 ~ 10/31',500,1000],
]);
sheet['!merges']=[{s:{r:2,c:0},e:{r:3,c:0}},{s:{r:2,c:1},e:{r:3,c:1}}];
XLSX.utils.book_append_sheet(book,sheet,'10월 미디어믹스');
const parsed = parseMediaMixWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'2026-10');
assert.equal(parsed.length,3);assert.equal(parsed[1].platform,'네이버');assert.equal(parsed[1].creativeName,'소재 B');assert.equal(parsed[1].periodEnd,'2026-10-31');assert.equal(parsed[2].budget,500);
assert.equal(normalizeMediaMix({month:'2026-10',rows:parsed}).rows.length,3);
assert.equal(monthBounds('2026-10').offset,4);assert.equal(monthBounds('2024-02').days,29);
assert.equal(scheduleProduct({...parsed[0],platform:'네이버 GFA',product:'피드'}),'GFA');
assert.equal(planOverlapsMonth({...parsed[0],periodStart:'2026-09-20',periodEnd:'2026-10-10'},'2026-10'),true);
assert.equal(planOnDate({...parsed[0],periodStart:'',periodEnd:''},'2026-10-01'),false);
assert.equal(planOnDate(parsed[1],'2026-10-15'),false);assert.equal(planOnDate(parsed[1],'2026-10-16'),true);
const dataset = (rows,sourceKind,publishedAt='2026-10-01T00:00:00Z') => ({publishedAt,bundle:{mediaPlan:rows,sourceKind}});
const legacy = dataset(parsed);
const latest = dataset([parsed[2]],'media_mix','2026-10-02T00:00:00Z');
assert.deepEqual(mediaPlansFromDatasets([legacy,latest]),[parsed[2]]);
assert.equal(mediaPlansFromDatasets([legacy]).length,3);
const dateBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(dateBook,XLSX.utils.aoa_to_sheet([['매체','상품','소재명','시작일','종료일','예산'],['네이버','GFA','날짜 소재',new Date('2026-10-01T00:00:00Z'),new Date('2026-10-31T00:00:00Z'),0]]),'mix');
const dated=parseMediaMixWorkbook(XLSX.write(dateBook,{type:'buffer',bookType:'xlsx'}),'2026-10');assert.equal(dated[0].periodStart,'2026-10-01');assert.equal(dated[0].budget,0);
console.log('Media mix workbook checks passed: merged labels, totals, later products, date formats, zero budget, authoritative replacement, cross-month calendar and undated rows.');
