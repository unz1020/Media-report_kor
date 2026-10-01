import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const qa={matchedMailMetrics:0,mismatchedMailMetrics:0,unmatchedMailMetrics:0,ignoredSheetCount:0};
const fact=(platform,placement,impressions,clicks)=>({platform,placement,sourceSheet:'Summary',impressions,clicks,ctr:clicks===null?null:5,spend:50,guaranteed:'100',achievement:100});
const bundle=(file,date,placements)=>({advertiser:'자코모',sourceFile:file,reportDate:date,campaignStart:'2026-09-01',campaignEnd:'2026-09-30',placements,parsedSheets:['Summary'],ignoredSheets:[],dailyPerformance:[],operationNotes:[],mailChecks:[],qa});
const tv=bundle('Addr.TV 자코모_9월 리포트_261001.xlsx','2026-09-30',[fact('어드레서블TV','SKB',300,null),fact('어드레서블TV','LG U+',200,null)]);
const rawFiles=['SKB_Addr.TV 자코모_9월 리포트_RawData_261001.xlsx','LGU+_Addr.TV 자코모_9월 리포트_RawData_261001.xlsx'];
let published=[];
const json=(route,value)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
await page.route('**/api/workspace',r=>json(r,{user:{email:'fixture@example.com',role:'ae'},advertisers:[{id:'fixture',name:'자코모',slug:'jakomo',accessLevel:'editor'}],months:['2026-09']}));
await page.route('**/api/gmail/status',r=>json(r,{connected:true}));
await page.route('**/api/reporting/store',r=>{const b=r.request().postDataJSON();if(b.action==='publish_bundle'){published.push(b);return json(r,{ok:true});}return json(r,{insights:[],imports:[
 {id:'old',updated_at:'2026-09-16T00:00:00Z',metadata:{bundle:bundle('자코모 26년 9월_네이버GFA_260916.xlsx','2026-09-15',[fact('네이버 GFA','메인',100,5)])}},
 {id:'final',updated_at:'2026-10-01T00:00:00Z',metadata:{bundle:bundle('자코모_26년 9월 네이버GFA_Final.xlsx','2026-09-30',[fact('네이버 GFA','메인',200,10)])}},
 {id:'tv',updated_at:'2026-10-01T01:00:00Z',metadata:{bundle:tv}}
]});});
await page.route('**/api/gmail/today?**',r=>{assert.match(new URL(r.request().url()).searchParams.get('q'),/Addr.TV/);return json(r,{date:'2026-10-01',messages:[{id:'tv-mail',subject:'자코모 9월 전체 Addr.TV 리포트',date:'2026-10-01T13:00:00+09:00',body:'',attachments:[tv.sourceFile,...rawFiles].map((filename,i)=>({filename,attachmentId:String(i)}))}]});});
await page.route('**/api/gmail/parse',r=>{const b=r.request().postDataJSON();if(b.attachmentId==='0')return json(r,{bundle:tv});const p=tv.placements[Number(b.attachmentId)-1];return json(r,{bundle:{...bundle(b.filename,'2026-09-30',[p]),dailyPerformance:[{...p,date:'2026-09-01',spend:null,views:null,vtr:null,cpc:null,cpm:null,cpv:null}]}});});
async function visible(locator){await locator.waitFor({state:'visible',timeout:15000});}
try{
 await page.goto('http://localhost:3000/reports');await page.getByLabel('조회 월 선택').selectOption('2026-09');await visible(page.getByText('DB 동기화 완료'));
 const latest=page.locator('section').filter({has:page.getByRole('heading',{name:'현재 월 최신 원본',exact:true})});
 assert.equal(await latest.locator('tbody tr').count(),2);assert.equal(await latest.getByText('자코모 26년 9월_네이버GFA_260916.xlsx',{exact:true}).count(),0);
 await visible(latest.getByText('Addr.TV 자코모_9월 리포트_261001.xlsx',{exact:true}));
 await page.goto('http://localhost:3000/performance');await visible(page.getByRole('heading',{name:'어드레서블TV',exact:true}));
 await page.goto('http://localhost:3000/data-update');await visible(page.getByText('Gmail 연결됨',{exact:true}));await page.getByLabel('데일리 리포트 메일 수신일').fill('2026-10-01');
 await page.getByRole('button',{name:'2026-10-01 데일리 불러오기',exact:true}).click();await visible(page.getByText('준비 1/1',{exact:true}));
 assert.equal(await page.getByText('· 일별 보조자료 (중복 집계 제외)',{exact:true}).count(),2);
 await page.getByRole('button',{name:'검수 완료 후 대시보드 반영',exact:true}).click();await visible(page.getByText('대시보드 반영 완료 · 1개 데이터',{exact:true}));
 assert.equal(published.length,1);assert.equal(published[0].bundle.dailyPerformance.length,2);assert.equal(published[0].bundle.supportingFiles.length,2);assert.deepEqual(errors,[]);
 console.log('Browser checks passed: latest-only sources, TV grouping, Gmail query, supporting files and one publish.');
} catch(e){console.error(await page.locator('body').innerText());throw e;}finally{await browser.close();}
