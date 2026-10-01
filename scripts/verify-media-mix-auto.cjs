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
const {analyzeMediaMixWorkbook}=load('lib/media-mix-workbook.ts');
const {mergeMediaMix,mediaMixChanges,mediaMixGroups}=load('lib/media-mix-operations.ts');
const {normalizeMediaMix}=load('supabase/functions/reporting-store/media-plan-input.ts');
const book=XLSX.utils.book_new();
const sheet=XLSX.utils.aoa_to_sheet([
 ['10월 미디어믹스'],['집행기간','10월'],
 ['매체명','광고상품명','소재명','예산','','일정','집행상태'],
 ['매체명','광고상품명','소재명','Net','Gross','일정','집행상태'],
 ['네이버 GFA','GFA','소재 A','10만원',110000,'10/1 ~ 31일','ON'],
 ['','','소재 B','5만원',55000,'10/16 ~ 10/31','OFF'],
 ['네이버 소계','','',150000,165000,'',''],
 ['카카오','비즈보드','소재 C',0,0,'','예정'],
 ['매체명','광고상품명','소재명','예산 Net','예산 Gross','일정','집행상태'],
 ['직방','디스커버리 배너','소재 D',500,550,'9/1 ~ 9/30','종료'],
 ['직방','디스커버리 배너','소재 E','협의',0,'10월','예정'],
]);
sheet['!merges']=[{s:{r:2,c:3},e:{r:2,c:4}},{s:{r:4,c:0},e:{r:5,c:0}},{s:{r:4,c:1},e:{r:5,c:1}}];
XLSX.utils.book_append_sheet(book,sheet,'10월');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['매체','상품','소재명'],['카카오','비즈보드','9월 소재']]),'9월');
const analysis=analyzeMediaMixWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'2026-10');
assert.equal(analysis.rows.length,4);assert.equal(analysis.rows[0].budget,100000,'Choose Net, not Gross');assert.equal(analysis.rows[1].budget,50000);
assert.equal(analysis.rows[0].periodEnd,'2026-10-31');assert.equal(analysis.rows[1].periodStart,'2026-10-16');assert.equal(analysis.rows[0].operationStatus,'집행 중');assert.equal(analysis.rows[1].operationStatus,'중단');assert.equal(analysis.rows[2].budget,0);assert.equal(analysis.rows[2].periodStart,'2026-10-01','Explicit campaign month supplies missing period');assert.equal(analysis.rows[3].budget,null);assert.deepEqual(analysis.ignoredSheets,['9월']);assert.equal(analysis.excludedRows,2);
const old={...analysis.rows[0],rowId:'11111111-1111-4111-8111-111111111111',device:'MO',budget:500,operationStatus:'집행 중'};
const incoming={...old,device:'',budget:2000,periodStart:'',periodEnd:'',operationStatus:'예정'};
const partial={...analysis,rows:[incoming],providedFields:[['platform','product','creativeName','budget']]};
const merged=mergeMediaMix([old,analysis.rows[2]],partial,'merge');assert.equal(merged.rows.length,2);assert.equal(merged.rows[0].budget,2000);assert.equal(merged.rows[0].device,'MO');assert.equal(merged.rows[0].operationStatus,'집행 중');assert.equal(merged.rows[0].periodStart,'2026-10-01');assert.equal(merged.rows[0].rowId,old.rowId);assert.equal(merged.warnings.length,0);
const changes=mediaMixChanges([old,analysis.rows[2]],merged.rows);assert.equal(changes.length,1);assert.equal(changes[0].kind,'변경');assert.equal(changes[0].fields[0].label,'예산');assert.equal(changes[0].fields[0].before,500);
const renamed={...old,creativeName:'수정 소재'};assert.equal(mediaMixChanges([old],[renamed])[0].kind,'변경');
const replaced=mergeMediaMix([old],analysis,'replace');assert.equal(replaced.rows.length,4);assert.ok(replaced.rows.every(row=>row.rowId));assert.equal(mediaMixGroups(replaced.rows).find(group=>group.media==='네이버').budget,150000);
const ambiguous=mergeMediaMix([old,{...old,rowId:'22222222-2222-4222-8222-222222222222',device:'PC'}],partial,'merge');assert.equal(ambiguous.rows.length,2);assert.equal(ambiguous.rows[0].budget,500);assert.equal(ambiguous.warnings.length,1);
assert.equal(normalizeMediaMix({month:'2026-10',rows:merged.rows,changeMemo:'예산 증액'}).changeMemo,'예산 증액');assert.throws(()=>normalizeMediaMix({month:'2026-10',rows:[{...old,rowId:'bad'}]}),/ROW_ID/);
const mergedBudget=XLSX.utils.book_new();const budgetSheet=XLSX.utils.aoa_to_sheet([['매체','상품','소재명','예산'],['네이버','GFA','A','1,000'],['네이버','GFA','B','']]);budgetSheet['!merges']=[{s:{r:1,c:3},e:{r:2,c:3}}];XLSX.utils.book_append_sheet(mergedBudget,budgetSheet,'mix');const amounts=analyzeMediaMixWorkbook(XLSX.write(mergedBudget,{type:'buffer',bookType:'xlsx'}),'2026-10');assert.equal(amounts.rows[0].budget,1000);assert.equal(amounts.rows[1].budget,null,'Merged budget strings must never be counted twice');assert.equal(amounts.warnings.length,2);
const unitBook=XLSX.utils.book_new();const unitSheet=XLSX.utils.aoa_to_sheet([['매체','광고','예산'],['','상품명','만원'],['카카오','비즈보드',12]]);unitSheet['!merges']=[{s:{r:0,c:0},e:{r:1,c:0}}];XLSX.utils.book_append_sheet(unitBook,unitSheet,'10월');const unitAnalysis=analyzeMediaMixWorkbook(XLSX.write(unitBook,{type:'buffer',bookType:'xlsx'}),'2026-10');assert.equal(unitAnalysis.rows.length,1);assert.equal(unitAnalysis.rows[0].budget,120000,'Header currency units must be applied to numeric values');
const dayBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(dayBook,XLSX.utils.aoa_to_sheet([['매체','상품','시작일','종료일'],['네이버','GFA',1,31]]),'믹스');const dayPlans=analyzeMediaMixWorkbook(XLSX.write(dayBook,{type:'buffer',bookType:'xlsx'}),'2026-10');assert.equal(dayPlans.rows[0].periodStart,'2026-10-01');assert.equal(dayPlans.rows[0].periodEnd,'2026-10-31');
console.log('Automatic media mix checks passed: two-row aliases/Net budget, merged labels/costs, monthly and short dates, month exclusions, zero/unknown, partial merges/preservation, ambiguity handling, stable rename diffs, grouping and memo validation.');
