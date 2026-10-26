import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root = process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[], writes=[]; let access='editor', broken=false;
page.on('pageerror',error=>errors.push(error.message));
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const proof={advertiser:'자코모',month:'2026-10',reportDate:'2026-10-02',verificationDate:'2026-10-01',media:'호갱노노',placement:'종료 팝업',creativeName:'기획전',campaignName:'뷰어 검증',serviceType:'게재보고',periodStart:'2026-10-01',periodEnd:'2026-10-31',location:'',airingTime:'',dailyFrequency:null,durationSec:null,budgetReference:null,status:'게재 확인',messageId:'',mailSubject:'검증 자료',mailDate:'2026-10-02',sourceFile:'lightbox-fixture',sourceSummary:'fixture only',attachments:[],manualImagePath:'fixture/tall.png'};
await page.route('**/api/workspace',route=>json(route,{user:{email:'fixture@example.com',display_name:'검증',role:'ae'},advertisers:[{id:'fixture',name:'자코모',slug:'jacomo',accessLevel:access}],months:['2026-10','2026-09']}));
await page.route('**/api/reporting/store',route=>{const body=route.request().postDataJSON();if(body.action==='load_layout')return json(route,{layout:null,updatedAt:null});if(body.action==='load_state')return json(route,{imports:[{id:'fixture-proof',report_date:proof.reportDate,updated_at:'2026-10-02T00:00:00Z',metadata:{bundle:{advertiser:'자코모',reportDate:proof.reportDate,campaignStart:'2026-10-01',campaignEnd:'2026-10-31',sourceFile:proof.sourceFile,placements:[],dailyPerformance:[],creativeDailyPerformance:[],mediaPlan:[],placementProof:proof}}}],insights:[]});writes.push(body.action);return json(route,{error:'UNEXPECTED_WRITE'},400);});
await page.route('**/api/reporting/proof-image**',route=>{if(route.request().method()!=='GET'){writes.push('image-upload');return json(route,{error:'UNEXPECTED_WRITE'},400);}if(broken)return json(route,{error:'fixture'},404);return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="2000"><rect width="1000" height="2000" fill="#5c4ba5"/><rect x="40" y="40" width="920" height="1920" fill="#eeeeff"/><text x="80" y="140" font-size="60">Placement proof fixture</text></svg>'});});
const trigger=()=>page.getByRole('button',{name:'호갱노노 종료 팝업 기획전 이미지 크게 보기',exact:true});
const replacementAction=()=>page.getByRole('article').filter({has:trigger()}).getByText('소재 이미지 넣기',{exact:true});
const viewer=()=>page.locator('dialog[open]');
async function open() {await trigger().click();await viewer().waitFor({state:'visible',timeout:20000});await page.waitForFunction(()=>document.querySelector('dialog[open] img')?.naturalWidth>0);}
async function closed() {await page.locator('dialog').waitFor({state:'hidden'});}
try {
 await page.goto(root+'/creative');await trigger().waitFor({state:'visible',timeout:30000});
 const before=await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow}));
 await open();assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 const bounds=await viewer().boundingBox();assert.ok(Math.abs(bounds.width-1280)<=1&&Math.abs(bounds.height-1000)<=1,'Full viewport dialog');
 const image=viewer().locator('img'), stage=viewer().getByLabel('확대 이미지 영역',{exact:true});
 const fits=await image.evaluate(i=>{const p=i.closest('[aria-label="확대 이미지 영역"]');return i.getBoundingClientRect().width<=p.clientWidth&&i.getBoundingClientRect().height<=p.clientHeight;});assert.equal(fits,true,'Fit mode never crops image');
 const ratio=()=>viewer().getByLabel('이미지 배율',{exact:true}).textContent();
 const initial=Number((await ratio()).replace('%',''));await viewer().getByRole('button',{name:'확대',exact:true}).click();assert.ok(Number((await ratio()).replace('%',''))>initial);
 await viewer().getByRole('button',{name:'원본 크기',exact:true}).click();assert.equal(await ratio(),'100%');assert.equal(await stage.evaluate(e=>e.scrollHeight>e.clientHeight),true,'Original image is scrollable');
 await viewer().getByRole('button',{name:'축소',exact:true}).click();assert.equal(await ratio(),'80%');
 await viewer().getByRole('button',{name:'화면에 맞춤',exact:true}).click();assert.equal(Number((await ratio()).replace('%','')),initial);
 await image.dblclick();assert.equal(await ratio(),'100%');await image.dblclick();assert.equal(Number((await ratio()).replace('%','')),initial);
 await page.screenshot({path:'/tmp/proof-lightbox-desktop.png'});
 await page.keyboard.press('Escape');await closed();assert.equal(await trigger().evaluate(e=>e===document.activeElement),true,'Focus returns to image trigger');
 assert.deepEqual(await page.evaluate(()=>({body:document.body.style.overflow,html:document.documentElement.style.overflow})),before,'Scroll styles restored');
 await trigger().focus();await page.keyboard.press('Enter');await viewer().waitFor({state:'visible'});await viewer().getByRole('button',{name:'이미지 닫기',exact:true}).click();await closed();
 // Replacement now opens an explicit target editor before the file chooser.
 const proofBeforeReplacement=structuredClone(proof);
 await replacementAction().click();
 const replacementEditor=page.getByRole('region',{name:'지면 수동 세팅',exact:true});await replacementEditor.waitFor({state:'visible'});
 assert.equal(await viewer().count(),0,'Replacement opens the editor, never the read-only viewer');
 assert.equal(await replacementEditor.getByRole('button',{name:'소재 이미지 저장',exact:true}).isDisabled(),true);
 const chooserPromise=page.waitForEvent('filechooser');await replacementEditor.getByLabel('소재 이미지 · 게재 증빙 아님',{exact:true}).click();
 const chooser=await chooserPromise;await chooser.setFiles([]);
 assert.equal(await viewer().count(),0,'File selection does not open viewer');assert.deepEqual(proof,proofBeforeReplacement,'Cancelling file selection preserves the source proof');
 await replacementEditor.getByRole('button',{name:'닫기',exact:true}).click();await replacementEditor.waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await open();const mobile=await viewer().boundingBox();assert.ok(Math.abs(mobile.width-390)<=1&&Math.abs(mobile.height-844)<=1,'Mobile full screen');
 assert.equal(await viewer().evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Mobile toolbar fits');
 await page.keyboard.press('Shift+Tab');assert.equal(await viewer().evaluate(e=>e.contains(document.activeElement)),true,'Native dialog traps focus');
 await page.screenshot({path:'/tmp/proof-lightbox-mobile.png'});await page.keyboard.press('Escape');await closed();
 access='viewer';await page.reload();await trigger().waitFor({state:'visible',timeout:20000});assert.equal(await replacementAction().count(),0);await open();await page.keyboard.press('Escape');await closed();
 broken=true;await page.reload();await trigger().waitFor({state:'visible',timeout:20000});await trigger().click();await viewer().getByRole('alert').waitFor({state:'visible'});assert.equal(await viewer().getByRole('button',{name:'확대',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');await closed();
 assert.deepEqual(writes,[],'Viewing makes no mutations');assert.deepEqual(errors,[],'No client runtime errors');console.log('Proof lightbox UI passed: full screen, fit/zoom/original, double click, Escape, focus/scroll restoration, upload separation, mobile, read-only access, image error, no writes.');
} finally {await browser.close();}
