import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
const rootUrl=process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3100';
const proxyValue=rootUrl.startsWith('https:') ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY : null;
const proxyUrl=proxyValue ? new URL(proxyValue) : null;
const browser=await chromium.launch({headless:true,...(proxyUrl?{proxy:{server:proxyUrl.origin,...(proxyUrl.username?{username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password)}:{})}}:{})});
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let access='editor', mixFailure=false, insightFailure=false, saveCount=0;
let notes=['네이버 성과 요약','카카오 다른 매체 문구 보존'];let insightVersion='2026-10-01T00:00:00Z';
const mixes=new Map();
const basePlan={platform:'네이버 GFA',product:'피드',placement:'피드',creativeName:'소재 A',creativeType:'이미지',device:'MO',periodStart:'2026-09-28',periodEnd:'2026-10-10',budget:1000,expectedImpressions:10000,expectedClicks:100,target:'가구 관심자',sourceSheet:'미디어믹스',operationStatus:'집행 중'};
const plans=[basePlan,{...basePlan,creativeName:'소재 B',periodStart:'2026-10-01',periodEnd:'2026-10-31',budget:2000},{...basePlan,platform:'카카오',product:'비즈보드',creativeName:'소재 C',periodStart:'2026-10-02',periodEnd:'2026-10-31',budget:3000},{...basePlan,creativeName:'일정 미입력 소재',periodStart:'',periodEnd:'',budget:null}];
const bundle=(advertiser,month)=>({advertiser,sourceFile:month+' 리포트.xlsx',reportDate:month+'-05',campaignStart:month+'-01',campaignEnd:month+'-31',placements:[{platform:'네이버 GFA',placement:'피드',sourceSheet:'Summary',impressions:100,clicks:5,ctr:5,spend:100,guaranteed:'100',achievement:100}],parsedSheets:['Summary'],ignoredSheets:[],operationNotes:[],dailyPerformance:[],mailChecks:[],qa:{},mediaPlan:month==='2026-10'?plans:[]});
const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
await page.route('**/api/workspace',route=>json(route,{user:{email:'fixture@example.com',role:'ae',display_name:'검증 계정'},advertisers:[{id:'fixture-a',name:'자코모',slug:'jakomo',accessLevel:access},{id:'fixture-b',name:'교원웰스',slug:'kyowon-wells',accessLevel:access}],months:['2026-09','2026-10']}));
await page.route('**/api/gmail/status',route=>json(route,{connected:false}));
await page.route('**/api/reporting/store',route=>{
 const body=route.request().postDataJSON();
 if(body.action==='load_layout')return json(route,{layout:null,updatedAt:null});
 if(body.action==='load_state'){
  const imports=[{id:'fixture-performance',report_date:body.month+'-05',updated_at:insightVersion,metadata:{bundle:bundle(body.advertiser,body.month)}}];
  const mix=mixes.get(body.advertiser+body.month);if(mix)imports.push(mix);
  return json(route,{imports,insights:body.month==='2026-10'?[{id:'11111111-1111-4111-8111-111111111111',import_id:'fixture-performance',report_date:body.month+'-05',subject:'운영 요약',notes,created_at:insightVersion}]:[]});
 }
 if(body.action==='save_media_mix'){
  assert.equal(access,'editor');const input=body.input;const key=input.advertiser+input.month;
  assert.equal(input.expectedUpdatedAt,mixes.get(key)?.updated_at || null);
  if(mixFailure)return json(route,{error:'MEDIA_MIX_CHANGED'},409);
  const date=input.month+'-01';mixes.set(key,{id:'fixture-mix',report_date:date,updated_at:new Date().toISOString(),metadata:{bundle:{...bundle(input.advertiser,input.month),reportDate:date,sourceFile:'[media-mix] '+input.month,sourceId:'monthly-media-mix',sourceKind:'media_mix',placements:[],mediaPlan:input.rows}}});saveCount++;return json(route,{ok:true});
 }
 if(body.action==='save_insight'){
  assert.equal(access,'editor');assert.equal(body.input.expectedUpdatedAt,insightVersion);
  if(insightFailure)return json(route,{error:'INSIGHT_CHANGED'},409);
  assert.ok(body.input.notes.some(note=>note.includes('카카오')),'Other media notes must survive editing in performance');
  notes=body.input.notes;insightVersion=new Date().toISOString();return json(route,{ok:true});
 }
 throw new Error('Unexpected action '+body.action);
});
const wait=locator=>locator.waitFor({state:'visible',timeout:15000});
try{
 await page.goto(rootUrl+'/schedule');await page.getByRole('combobox',{name:'조회 월 선택'}).selectOption('2026-10');
 const toggle=page.getByRole('switch',{name:'네이버 GFA 캘린더 표시'});await wait(toggle);assert.equal(await toggle.getAttribute('aria-checked'),'true');
 await wait(page.getByRole('heading',{name:'일정 미입력 · 1건'}));
 await page.getByRole('button',{name:'2026-10-01 일정 보기'}).click();await wait(page.getByRole('heading',{name:'2026-10-01 운영 일정'}));
 assert.equal(await page.locator('[data-layout-panel="schedule:day-details"] button').count(),2);
 await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(await page.locator('[data-layout-panel="schedule:day-details"] button').count(),0);
 await page.reload();await wait(toggle);assert.equal(await toggle.getAttribute('aria-checked'),'false');
 await page.getByRole('button',{name:'전체 ON',exact:true}).click();
 await page.getByRole('button',{name:'2026-10-01 일정 보기'}).click();await page.locator('[data-layout-panel="schedule:day-details"] button').first().click();await wait(page.getByRole('heading',{name:'네이버 › GFA › 소재 A'}));
 await page.getByRole('searchbox').fill('소재 B');assert.equal(await page.locator('[data-layout-panel="schedule:day-details"] button').count(),1);await page.getByRole('searchbox').fill('');
 await page.getByRole('button',{name:'전체 OFF',exact:true}).click();await wait(page.getByText('표시 중인 상품이 없습니다. ON 설정과 검색어를 확인해주세요.'));await page.getByRole('button',{name:'전체 ON',exact:true}).click();
 await page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}).click();
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['매체','광고상품','소재명','시작일','종료일','예산','집행상태'],['네이버','GFA','10월 신규 소재','2026-10-01','2026-10-31',4500,'예정']]),'믹스');
 await page.getByLabel('미디어믹스 Excel').setInputFiles({name:'10월_미디어믹스.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})});
 await wait(page.getByText('1행을 불러왔습니다. 광고주·월·기간·예산을 검수한 뒤 저장해주세요.'));
 assert.equal(await page.getByLabel('1행 소재명 (소분류)').inputValue(),'10월 신규 소재');
 mixFailure=true;await page.getByRole('button',{name:'미디어믹스 저장',exact:true}).click();await wait(page.locator('p[role=alert]'));assert.equal(await page.getByLabel('1행 소재명 (소분류)').inputValue(),'10월 신규 소재');
 mixFailure=false;await page.getByRole('button',{name:'미디어믹스 저장',exact:true}).click();await wait(page.getByText('2026-10 미디어믹스를 저장했습니다. 개요·일정·연결 대기 지면에 반영됩니다.'));
 await wait(page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}));assert.equal(saveCount,1);assert.equal(await page.getByRole('switch').count(),1);
 await page.reload();await wait(page.getByRole('switch'));assert.equal(await page.getByRole('switch').count(),1);
 await page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}).click();assert.equal(await page.getByLabel('1행 계획 예산 (원)').inputValue(),'4500');
 await page.getByLabel('1행 계획 예산 (원)').fill('5000');await page.getByRole('button',{name:'미디어믹스 저장',exact:true}).click();await wait(page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}));assert.equal(saveCount,2);
 await page.goto(rootUrl+'/overview');await wait(page.getByText('네이버 성과 요약',{exact:true}));await page.getByRole('button',{name:'문구 수정',exact:true}).click();await page.getByRole('textbox',{name:'인사이트 문구',exact:true}).fill('네이버 개요에서 수정\n\n카카오 다른 매체 문구 보존');await page.getByRole('button',{name:'인사이트 저장',exact:true}).click();await wait(page.getByText('네이버 개요에서 수정',{exact:true}));
 await page.goto(rootUrl+'/performance');await wait(page.getByText('네이버 개요에서 수정',{exact:true}));await page.getByRole('button',{name:'문구 수정',exact:true}).click();assert.ok((await page.getByRole('textbox',{name:'인사이트 문구',exact:true}).inputValue()).includes('카카오 다른 매체 문구 보존'));
 await page.getByRole('textbox',{name:'인사이트 문구',exact:true}).fill('네이버 성과에서 수정\n\n카카오 다른 매체 문구 보존');insightFailure=true;await page.getByRole('button',{name:'인사이트 저장',exact:true}).click();await wait(page.locator('p[role=alert]'));insightFailure=false;await page.getByRole('button',{name:'인사이트 저장',exact:true}).click();await wait(page.getByText('네이버 성과에서 수정',{exact:true}));
 await page.goto(rootUrl+'/overview');await wait(page.getByText('네이버 성과에서 수정',{exact:true}));await wait(page.getByText('카카오 다른 매체 문구 보존',{exact:true}));
 await page.goto(rootUrl+'/schedule');await page.getByRole('combobox',{name:'조회 월 선택'}).selectOption('2026-09');await wait(page.getByText('선택한 월의 운영안이 없습니다. 위에서 미디어믹스를 업데이트해주세요.'));await page.getByRole('combobox',{name:'조회 월 선택'}).selectOption('2026-10');await wait(page.getByRole('switch'));
 await page.getByRole('combobox',{name:'광고주 선택'}).selectOption('kyowon');await wait(page.getByRole('switch',{name:'카카오 비즈보드 캘린더 표시'}));assert.equal(await page.getByRole('switch').count(),2);await page.getByRole('combobox',{name:'광고주 선택'}).selectOption('jacomo');await wait(page.getByRole('switch'));assert.equal(await page.getByRole('switch').count(),1);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/media-mix-calendar-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No page-wide overflow on mobile');
 await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'/tmp/media-mix-calendar-desktop.png',fullPage:true});
 access='viewer';await page.reload();await wait(page.getByRole('switch'));assert.equal(await page.getByRole('button',{name:'미디어믹스 업데이트',exact:true}).count(),0);await page.getByRole('switch').click();
 await page.goto(rootUrl+'/performance');await wait(page.getByText('네이버 성과에서 수정',{exact:true}));assert.equal(await page.getByRole('button',{name:'문구 수정',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('Media mix UI checks passed: Excel preview, save/conflict/reload/edit, advertiser/month isolation, shared insight edits in both directions with other-media preservation, calendar hierarchy/date/details/ON-OFF/search/preferences, mobile overflow and viewer restrictions.');
}finally{await browser.close();}
