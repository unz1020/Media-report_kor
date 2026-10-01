import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
const rootUrl=process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3000';
const proxyValue=rootUrl.startsWith('https:') ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY : null;
const proxyUrl=proxyValue ? new URL(proxyValue) : null;
const browser=await chromium.launch({headless:true,...(proxyUrl?{proxy:{server:proxyUrl.origin,...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}}:{})});
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let access='editor', historyFailure=false, savedAt='2026-10-01T00:00:00Z', saves=0, memo='최초 운영안';
let plans=[{rowId:'11111111-1111-4111-8111-111111111111',platform:'네이버',product:'GFA',placement:'피드',creativeName:'기존 소재',creativeType:'이미지',device:'MO',periodStart:'2026-10-01',periodEnd:'2026-10-31',budget:1000,expectedImpressions:10000,expectedClicks:null,target:'가구 관심자',sourceSheet:'믹스',operationStatus:'집행 중'}];
const versions=[];
function capture(){versions.unshift({id:String(versions.length+1),capturedAt:savedAt,actor:'fixture@example.com',rows:structuredClone(plans),sourceFile:'미디어믹스.xlsx',changeMemo:memo});}capture();
const bundle=()=>({advertiser:'자코모',sourceFile:'[media-mix] 2026-10',originalSourceFile:'미디어믹스.xlsx',sourceId:'monthly-media-mix',sourceKind:'media_mix',mediaMixChangeMemo:memo,reportDate:'2026-10-01',campaignStart:'2026-10-01',campaignEnd:'2026-10-31',placements:[],mediaPlan:plans,parsedSheets:[],ignoredSheets:[],dailyPerformance:[],creativeDailyPerformance:[],operationNotes:[],mailChecks:[],qa:{}});
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
await page.route('**/api/workspace',r=>json(r,{user:{email:'fixture@example.com',role:'ae'},advertisers:[{id:'fixture',name:'자코모',slug:'jakomo',accessLevel:access}],months:['2026-10']}));
await page.route('**/api/gmail/status',r=>json(r,{connected:false}));
await page.route('**/api/reporting/store',r=>{
 const body=r.request().postDataJSON();
 if(body.action==='load_layout')return json(r,{layout:null,updatedAt:null});
 if(body.action==='load_state')return json(r,{insights:[],imports:[{id:'mix',updated_at:savedAt,metadata:{bundle:bundle()}}]});
 if(body.action==='load_media_mix_history'){assert.equal(body.advertiser,'자코모');assert.equal(body.month,'2026-10');return historyFailure?json(r,{error:'일시적 이력 오류'},500):json(r,{history:versions});}
 if(body.action==='save_media_mix'){assert.equal(access,'editor');assert.equal(body.input.expectedUpdatedAt,savedAt);plans=body.input.rows;memo=body.input.changeMemo;savedAt=`2026-10-01T00:00:${String(++saves).padStart(2,'0')}Z`;capture();return json(r,{ok:true});}
 throw new Error('Unexpected action '+body.action);
});
const visible=locator=>locator.waitFor({state:'visible',timeout:20000});
const upload=async(rows,name='10월_운영안.xlsx')=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'10월');await page.getByLabel('미디어믹스 Excel').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});await visible(page.getByRole('heading',{name:'Excel 자동 분석 결과'}));};
try{
 await page.goto(rootUrl+'/schedule');await page.getByLabel('조회 월 선택').selectOption('2026-10');await visible(page.getByRole('button',{name:'운영안 추가',exact:true}));
 assert.ok(await page.getByLabel('기존 운영안에 추가·변경 병합').isChecked());
 await upload([['매체명','광고상품명','지면','소재명','예산'],['네이버','GFA','피드','기존 소재',2000],['카카오','비즈보드','비즈보드','추가 소재',3000]]);
 assert.equal(await page.getByLabel('1행 계획 예산 (원)').inputValue(),'2000');assert.equal(await page.getByLabel('1행 시작일').inputValue(),'2026-10-01');assert.equal(await page.getByLabel('1행 집행상태').inputValue(),'집행 중');assert.equal(await page.getByLabel('2행 소재명 (소분류)').inputValue(),'추가 소재');
 const changes=page.getByLabel('운영안 변경 요약',{exact:true});assert.ok((await changes.innerText()).includes('추가 1건 · 변경 1건 · 삭제 0건'));assert.ok((await changes.innerText()).includes('1,000원 → 2,000원'));
 await page.getByLabel('2행 시작일').fill('2026-10-05');await page.getByLabel('2행 종료일').fill('2026-10-31');await page.getByLabel('운영안 변경 메모').fill('GFA 예산 증액 및 카카오 추가');await page.getByRole('button',{name:'미디어믹스 저장',exact:true}).click();await visible(page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}));assert.equal(plans.length,2);assert.equal(plans[0].device,'MO');assert.equal(plans[0].rowId,'11111111-1111-4111-8111-111111111111');
 await page.getByRole('button',{name:'운영안 추가',exact:true}).click();assert.equal(await page.getByLabel('3행 시작일').inputValue(),'2026-10-01');assert.equal(await page.getByLabel('3행 종료일').inputValue(),'2026-10-31');await page.getByLabel('3행 매체 (대분류)').fill('직방');await page.getByLabel('3행 광고상품 (중분류)').fill('디스커버리 배너');await page.getByLabel('3행 소재명 (소분류)').fill('수동 신규 소재');await page.getByLabel('3행 계획 예산 (원)').fill('4000');await page.getByLabel('1행 소재명 (소분류)').fill('변경 소재');assert.ok((await changes.innerText()).includes('소재명: 기존 소재 → 변경 소재'));await page.getByLabel('운영안 변경 메모').fill('직방 신규 집행 및 소재 교체');await page.getByRole('button',{name:'미디어믹스 저장',exact:true}).click();await visible(page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}));assert.equal(plans.length,3);
 await page.reload();await visible(page.getByRole('button',{name:'운영안 변경 이력',exact:true}));historyFailure=true;await page.getByRole('button',{name:'운영안 변경 이력',exact:true}).click();await visible(page.getByRole('button',{name:'다시 불러오기',exact:true}));historyFailure=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();const history=page.getByLabel('저장된 운영안 변경 이력',{exact:true});await visible(history.locator('details').first());await history.locator('details').first().locator('summary').click();await visible(history.getByText('변경 메모: 직방 신규 집행 및 소재 교체',{exact:true}));assert.ok((await history.locator('details').first().innerText()).includes('소재명: 기존 소재 → 변경 소재'));
 await page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}).click();await upload([['매체','상품','소재명','예산'],['당근','피드','추가 업데이트',5000]],'추가 업데이트.xlsx');await page.waitForTimeout(100);assert.equal(await page.getByLabel('4행 소재명 (소분류)').inputValue(),'추가 업데이트');assert.equal(await page.getByLabel('1행 소재명 (소분류)').inputValue(),'변경 소재');await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(plans.length,3);
 await page.getByLabel('월 운영안 전체 교체').check();await upload([['매체','상품','소재명','일정','예산'],['네이버','GFA','교체 소재','10월',0]]);assert.equal(await page.getByLabel('2행 소재명 (소분류)').count(),0);assert.ok((await page.locator('[aria-label="운영안 변경 요약"]').first().innerText()).includes('삭제 3건'));await page.getByRole('button',{name:'취소',exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Automatic media mix UI must not cause page overflow');await page.screenshot({path:'/tmp/media-mix-auto-mobile.png',fullPage:true});
 access='viewer';await page.reload();await visible(page.getByRole('button',{name:'운영안 변경 이력',exact:true}));assert.equal(await page.getByLabel('미디어믹스 Excel').count(),0);assert.equal(await page.getByRole('button',{name:'운영안 추가',exact:true}).count(),0);await page.getByRole('button',{name:'운영안 변경 이력',exact:true}).click();await visible(page.getByLabel('저장된 운영안 변경 이력').locator('details').first());assert.equal(saves,2);assert.deepEqual(errors,[]);
 console.log('Automatic media mix UI checks passed: direct Excel analysis, default merge, missing-field preservation, stable edits/new manual row/month dates, memo save/reload, durable change history/retry, appended updates, explicit replacement, cancellation, mobile overflow and viewer restrictions.');
}catch(error){console.error(await page.locator('body').innerText());throw error;}finally{await browser.close();}
