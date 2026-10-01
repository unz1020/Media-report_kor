const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name,...args) { return resolve.call(this,name.startsWith('@/') ? path.resolve(name.slice(2)) : name,...args); };
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const X = require('xlsx');
const {reportSourceStem,performanceMailQuery,tvSupportingFiles,enrichTvDaily} = require('../lib/report-source.ts');
const {parseDailyWorkbookBuffer:parse} = require('../lib/server-daily-parser.ts');
const {sanitizeDailyBundle:clean} = require('../lib/daily-bundle-sanitizer.ts');
const {parseSupplementalDailyPerformance:supplement} = require('../lib/supplemental-daily-parser.ts');
const {hydratePublishedDailyState:hydrate,publishedDatasetsFor:datasets,publishedSnapshotsFor:snapshots} = require('../lib/daily-report-store.ts');
const {rowsFromDatasets,periodRowsFromSnapshots,summarizeRows} = require('../lib/reporting-data.ts');
const fact={platform:'네이버 GFA',placement:'메인',sourceSheet:'Summary',impressions:100,clicks:5,ctr:5,spend:50,guaranteed:'',achievement:null};
const bundle=(file,day,placements)=>({advertiser:'테스트',sourceFile:file,reportDate:day,campaignStart:'2026-09-01',campaignEnd:'2026-09-30',placements,parsedSheets:['Summary'],ignoredSheets:[],operationNotes:[],mailChecks:[],qa:{}});
assert.equal(reportSourceStem('테스트 26년 9월_네이버GFA_260916.xlsx'),reportSourceStem('테스트_26년 9월 네이버GFA_Final_261001.xlsx'));
assert.notEqual(reportSourceStem('캠페인 A_Final.xlsx'),reportSourceStem('캠페인 B_Final.xlsx'));
assert.match(performanceMailQuery('테스트'),/Addr.TV/);
const attachments=[{filename:'Addr.TV 테스트_9월 리포트_261001.xlsx'},{filename:'SKB_Addr.TV 테스트_RawData_261001.xlsx'},{filename:'LGU+_Addr.TV 테스트_RawData_261001.xlsx'},{filename:'이미지.png'}];
assert.equal(tvSupportingFiles(attachments).length,2);assert.equal(tvSupportingFiles(attachments.slice(1)).length,0);
const overall={...fact,platform:'당근마켓',sourceSheet:'Overall'},detail={...fact,platform:'당근',sourceSheet:'당근_Total'};
assert.deepEqual(clean(bundle('테스트_26년 9월_Final.xlsx','2026-09-30',[overall,detail])).placements,[overall]);
const search={...fact,platform:'카카오 검색_Summary',sourceSheet:'카카오 검색_Summary',placement:'전체'};
const cleaned=clean(bundle('테스트_SA_카카오 검색광고_Final.xlsb','2026-09-30',[search,search,{...search,placement:'Week 1'}]));
assert.equal(cleaned.placements.length,1);assert.deepEqual(clean(cleaned).placements,cleaned.placements);
assert.equal(clean({...cleaned,campaignStart:'2026-10-01',campaignEnd:'2026-10-31'}).campaignStart,'2026-09-01');
function workbook(sheet,rows){const b=X.utils.book_new();X.utils.book_append_sheet(b,X.utils.aoa_to_sheet(rows),sheet);return X.write(b,{type:'buffer',bookType:'xlsx'});}
const searchBook=X.utils.book_new();
X.utils.book_append_sheet(searchBook,X.utils.aoa_to_sheet([
 ['계획예산(VAT별도)','광고비(VAT별도)','소진률','노출수','클릭수','CTR','CPC','전환수'],
 [300,250,0.833,1000,10,0.01,25,0],
 ['지면','광고비(VAT별도)','노출수','클릭수','CTR','CPC'],
 ['콘텐츠매체',250,1000,10,0.01,25],['전체',250,1000,10,0.01,25],
 ]),'카카오 검색_Summary');
X.utils.book_append_sheet(searchBook,X.utils.aoa_to_sheet([
 ['일자','광고비(VAT별도)','노출','클릭','CTR','CPC'],
 ['2026-08-31',900,9000,90,0.01,10],
 ['2026-09-01',150,600,6,0.01,25],['2026-09-30',100,400,4,0.01,25],
 ['2026-10-01',900,9000,90,0.01,10],
 ]),'카카오 검색_일자별');
const searchBytes=X.write(searchBook,{type:'buffer',bookType:'xlsb'});
const searchFinal=clean(parse(searchBytes,'테스트_26년 9월_카카오 검색광고_Final.xlsb','*9/30(수)자'),{mailSubject:'26년 9월 마감'});
assert.equal(searchFinal.placements.length,1);
assert.equal(searchFinal.placements[0].spend,250);
assert.equal(searchFinal.placements[0].impressions,1000);
const searchDays=supplement(searchBytes,'2026-09-30','2026-09-01');
assert.equal(searchDays.length,2);assert.equal(searchDays.reduce((s,r)=>s+r.spend,0),250);
const row=(media,target,period,guarantee,imp,spend)=>['',media,target,'30초',period,guarantee,imp,'','','',spend];
const tv=parse(workbook('Summary',[row('LG U+','','9/27~9/30',10,99,20),['','<누적 Data>'],row('매체','타겟'),row('LG U+','맞춤','9/1~9/30',100,200,50),row('Total','','',100,200,50),row('매체','타겟'),row('SKB','맞춤','9/1~9/30',100,300,70),row('Total','','',100,300,70)]),attachments[0].filename,'');
assert.equal(tv.reportDate,'2026-09-30');assert.equal(tv.placements.length,2);assert.equal(tv.placements.reduce((n,p)=>n+p.impressions,0),500);assert.equal(tv.placements[0].clicks,null);
assert.throws(()=>parse(workbook('Summary',[row('LG U+','','9/27~9/30',10,99,20)]),attachments[0].filename,''));
const raw=parse(workbook('집행요약',[['보고 기간 : 2026-09-01~2026-09-15'],['예산','시작일','종료일','보장량','달성량'],[50,'2026-09-01','2026-09-30',100,200],['집행결과'],['개별소재','',50,100]]),attachments[2].filename,'');
assert.equal(raw.reportDate,'2026-09-15');assert.equal(raw.placements.length,1);
const daily=tv.placements.map(p=>({date:'2026-09-01',...p,clicks:null,views:null,cpc:null,cpm:null,cpv:null,vtr:null}));
const enriched=enrichTvDaily(tv,[{...raw,dailyPerformance:daily}]);assert.equal(enriched.dailyPerformance.length,2);
assert.throws(()=>enrichTvDaily(tv,[{...raw,dailyPerformance:[{...daily[0],impressions:1}]}]));
(async()=>{
 global.window={dispatchEvent(){},localStorage:{removeItem(){}}};
 const imports=[{id:'old',updated_at:'2026-09-16T00:00:00Z',metadata:{bundle:bundle('테스트 26년 9월_네이버GFA_260916.xlsx','2026-09-15',[fact])}},{id:'new',updated_at:'2026-10-01T01:00:00Z',metadata:{bundle:bundle('테스트_26년 9월 네이버GFA_Final.xlsx','2026-09-30',[{...fact,impressions:200}])}},{id:'tv',updated_at:'2026-10-01T02:00:00Z',metadata:{bundle:{...enriched,advertiser:'테스트'}}}];
 global.fetch=async()=>({ok:true,json:async()=>({imports:[...imports].reverse()})});await hydrate('테스트','2026-09');
 assert.equal(datasets('테스트','2026-09').length,2);assert.equal(snapshots('테스트','2026-09').length,3);
 assert.equal(summarizeRows(rowsFromDatasets(datasets('테스트','2026-09'))).impressions,700);
 const tvSnapshots=snapshots('테스트','2026-09').filter(d=>d.sourceFile.startsWith('Addr.TV'));
 assert.equal(summarizeRows(periodRowsFromSnapshots(tvSnapshots,'2026-09-01','2026-09-30').rows).spend,120);
 console.log('Report family, history, table authority and Addressable TV checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
