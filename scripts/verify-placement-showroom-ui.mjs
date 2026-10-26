import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import XLSX from 'xlsx';
const root=process.env.REPORTING_TEST_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],writes=[];let access='editor';
page.on('pageerror',error=>errors.push(error.message));
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const baseProof={advertiser:'자코모',month:'2030-01',reportDate:'2030-01-15',verificationDate:'2030-01-14',media:'애드부스트스크린',placement:'ADVoost Screen 커스텀 패키지',campaignName:'합성 검증',serviceType:'게재보고',periodStart:'2030-01-01',periodEnd:'2030-01-31',location:'합성 위치',airingTime:'',dailyFrequency:null,durationSec:null,budgetReference:null,status:'게재 확인',messageId:'',mailSubject:'합성 검증',mailDate:'2030-01-15',sourceFile:'synthetic-proof',sourceSummary:'합성 검증 전용',attachments:[],manualImagePath:'fixture/contact.jpg',evidence:{type:'contact_sheet_of_original_report_photo_pages',layout:'원본 p5,p6 / p7,p8 / p9 순서; 합성 검증',sourcePage:[5,6,7,8,9],sourcePhotos:[{page:5,site:'을지로 MNME-LIVE (1/2)',photoDate:'2030-01-13'},{page:6,site:'을지로 MNME-LIVE (2/2)',photoDate:'2030-01-13'},{page:7,site:'테헤란로 GV-LIVE',photoDate:'2030-01-13'},{page:8,site:'종각 J-LIVE',photoDate:'2030-01-13'},{page:9,site:'CGV Gold (상영관)',photoDate:'2030-01-14'}]}};
const digitalProof={...baseProof,media:'호갱노노',placement:'모바일 종료 팝업',creativeName:'합성 소재',manualImagePath:'fixture/portrait.jpg',evidence:undefined};
const paidCafeProof={...digitalProof,media:'네이버',placement:'카페 목록/댓글 네이티브 PAID 광고',creativeName:'합성 유료 네이티브 소재',manualImagePath:'fixture/paid-cafe.jpg'};
const extraAppProofs=['직방','당근','키즈노트','마미톡','틱톡'].map((media,index)=>({...digitalProof,media,placement:'합성 앱 피드 '+index,creativeName:'합성 앱 소재 '+index,manualImagePath:'fixture/app-'+index+'.jpg'}));
const viralProofs=[
 {...baseProof,media:'네이버 바이럴',placement:'커뮤니티 바이럴 · 합성 카페 A',creativeName:'합성 의자 주제 · 합성 첫 게시글 · 부제',periodStart:'2030-01-07',reportDate:'2030-01-17',verificationDate:'2030-01-09',manualImagePath:'fixture/viral-a.jpg',previewUrl:'https://cafe.naver.com/synthetic/101',evidence:{type:'report_document_with_embedded_cafe_screenshot',articleUrl:' https://cafe.naver.com/synthetic/101 ',topic:'합성 의자 주제',articleTitle:'합성 첫 게시글 · 부제',reportedPlacementDate:'2030-01-07',reportDate:'2030-01-17',independentlyLiveVerified:false,sourcePage:3}},
 {...baseProof,media:'네이버 바이럴',placement:'커뮤니티 바이럴 · 합성 카페 A',creativeName:'합성 소파 주제 · 합성 두 번째 게시글',status:'확인 필요',periodStart:'2030-01-08',reportDate:'2030-01-18',verificationDate:'',manualImagePath:'fixture/viral-b.jpg',previewUrl:'javascript:alert(1)',evidence:{type:'report_document_with_embedded_cafe_screenshot',articleUrl:'data:text/html,synthetic',topic:'합성 소파 주제',articleTitle:'합성 두 번째 게시글',reportedPlacementDate:'2030-01-08',reportDate:'2030-01-18',independentlyLiveVerified:false,sourcePage:4}},
 {...baseProof,media:'네이버 바이럴',placement:'커뮤니티 바이럴 · 합성 카페 B',creativeName:'날짜 미제공 게시글 · 원제 부제',periodStart:'2030-01-01',reportDate:'2030-01-19',verificationDate:'',manualImagePath:'fixture/viral-c.jpg',previewUrl:'',sourceDocument:{url:'https://source.example.invalid/synthetic.pdf'},mailUrl:'https://mail.example.invalid/synthetic',evidence:{type:'report_document_with_embedded_cafe_screenshot',reportedPlacementDate:'',reportDate:'2030-01-19',independentlyLiveVerified:false,sourcePage:5}},
];
const fact=(platform,placement,spend,impressions)=>({platform,placement,spend,impressions,achievement:null,guaranteed:'',clicks:null,ctr:null,sourceSheet:'Overall'});
const plan={platform:'SBS-TV',product:'TV 광고',placement:'합성 프로그램',device:'',creativeType:'영상',periodStart:'2030-01-01',periodEnd:'2030-01-31',budget:1000,expectedImpressions:null,expectedClicks:null,target:'',sourceSheet:'Synthetic'};
const viralNoProofPlan={...plan,platform:'네이버 바이럴',product:'바이럴 운영안',placement:'합성 증빙 없는 운영안',budget:null};
const common={advertiser:'자코모',reportDate:'2030-01-15',campaignStart:'2030-01-01',campaignEnd:'2030-01-31',sourceFile:'synthetic.xlsx',parsedSheets:[],ignoredSheets:[],placements:[],dailyPerformance:[],creativeDailyPerformance:[],mediaPlan:[],mailChecks:[],operationNotes:[],qa:{matchedMailMetrics:0,mismatchedMailMetrics:0,unmatchedMailMetrics:0,ignoredSheetCount:0}};
const imports=[{id:'base',report_date:common.reportDate,updated_at:'2030-01-15T00:00:00Z',metadata:{bundle:{...common,placements:[fact('애드부스트','애드부스트',160,20),fact('호갱노노','모바일 종료 팝업',null,10),fact('DV360','SBS-TV 합성 동영상',7,9),fact('카카오','합성 디스플레이',3,4),fact('네이버 바이럴','합성 증빙 없는 성과',0,null)],mediaPlan:[plan,viralNoProofPlan]}}},...([baseProof,digitalProof,paidCafeProof,...extraAppProofs,...viralProofs].map((proof,index)=>({id:`proof-${index}`,report_date:proof.reportDate,updated_at:'2030-01-15T00:00:00Z',metadata:{bundle:{...common,sourceFile:`synthetic-proof-${index}`,placementProof:proof}}})))];
const originalBase=JSON.stringify(imports[0]);
const originalImports=JSON.stringify(imports);
const originalImportCount=imports.length;
await page.addInitScript(()=>{localStorage.setItem('media-report-month:fixture@example.test','2030-01');});
await page.route('**/api/workspace',route=>json(route,{user:{email:'fixture@example.test',display_name:'합성 검증',role:'ae'},advertisers:[{id:'fixture',name:'자코모',slug:'fixture',accessLevel:access}],months:['2030-01','2030-02','2030-03']}));
await page.route('**/api/reporting/store',route=>{const body=route.request().postDataJSON();if(body.action==='load_layout')return json(route,{layout:null,updatedAt:null});if(body.action==='load_state')return json(route,{imports:body.month==='2030-02'?[]:body.month==='2030-03'?[{...imports[0],report_date:'2030-03-15',metadata:{bundle:{...imports[0].metadata.bundle,reportDate:'2030-03-15',campaignStart:'2030-03-01',campaignEnd:'2030-03-31',mediaPlan:imports[0].metadata.bundle.mediaPlan.map(plan=>({...plan,periodStart:'2030-03-01',periodEnd:'2030-03-31'}))}}}]:imports,insights:[]});writes.push(body.action);if(body.action==='publish_bundle'&&body.bundle.sourceKind==='showroom_breakdown'){assert.deepEqual(body.bundle.placements,[]);assert.deepEqual(body.bundle.dailyPerformance,[]);assert.deepEqual(body.bundle.mediaPlan,[]);assert.ok(body.bundle.sourceId);imports.push({id:'augmentation',report_date:body.bundle.reportDate,updated_at:'2030-01-16T00:00:00Z',metadata:{bundle:body.bundle}});return json(route,{ok:true});}return json(route,{error:'UNEXPECTED_WRITE'},400);});
await page.route('**/api/reporting/proof-image**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2700"><rect width="3200" height="2700" fill="#e5e0f4"/><rect width="1600" height="900" y="1800" fill="#6d5bd0"/><text x="80" y="2000" font-size="80">Synthetic cinema evidence</text></svg>'});});
const showroom=()=>page.getByRole('region',{name:'게재지면 쇼룸',exact:true});
const viralBoard=()=>showroom().getByRole('region',{name:'바이럴 게시글 탐색',exact:true});
const viralDetail=()=>viralBoard().getByRole('complementary',{name:'바이럴 게시글 상세',exact:true});
const viralCards=()=>viralBoard().locator('article[data-viral-post-id]');
const viralCard=title=>viralCards().filter({has:page.getByRole('button',{name:new RegExp(title+' · '),exact:false})});
const factValue=(region,label)=>region.locator('dl > div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
const selectedDetail=()=>showroom().getByLabel('선택 지면 상세',{exact:true});
const environmentTab=name=>showroom().getByRole('tab',{name:new RegExp(name)});
async function selectViralPost(title){await viralCard(title).getByRole('button',{name:new RegExp(title+' · ')}).click();await viralDetail().getByRole('heading',{name:title,exact:true}).waitFor();}
async function noHorizontalOverflow(locator,label){assert.equal(await locator.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true,label);}
function workbook(){const a=[];a[6]=['','Date','Total_DOOH_커스텀 패키지(서비스제외)','','','','CGV_Screen_Gold','','','','대형전광판_MNME_Live','','','','대형전광판_GV_Live','','','','대형전광판_J_Live','','','','(서비스지면)미디어믿_아파트 엘리베이터'];a[8]=[];a[11]=[];a[11][1]=(Date.parse('2030-01-15T00:00:00Z')/86400000)+25569;[[160,20,550],[100,2,10],[10,3,10],[20,4,10],[30,5,20],[900,6,500]].forEach((values,i)=>{const c=2+i*4;['Spent','Impression','유동인구'].forEach((name,j)=>{a[8][c+j]=name;a[11][c+j]=values[j];});});const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(a),'애드부스트스크린');return XLSX.write(b,{type:'buffer',bookType:'xlsx'});}
try{
 await page.goto(root+'/creative');await showroom().getByRole('button',{name:/CGV Gold/}).waitFor({state:'visible',timeout:30000});
 assert.equal(await showroom().getByRole('tab').count(),4,'Exactly four environment tabs');
 await showroom().getByRole('button',{name:/^영화관/}).click();
 assert.equal(await selectedDetail().getByRole('heading',{name:'CGV Gold (상영관)',exact:true}).count(),1);
 const originalStage=showroom().getByRole('region',{name:'OOH 원본 증빙',exact:true});
 await originalStage.waitFor();assert.equal(await showroom().getByLabel('OOH 공간 안내 도식',{exact:true}).count(),0,'Source evidence is the default, not a contextual mockup');
 assert.equal(await showroom().getByText('CINEMA · 영화관 스크린',{exact:true}).count(),0);
 await page.waitForFunction(()=>document.querySelector('[aria-label="OOH 원본 증빙"] img')?.style.top==='-200%');
 assert.ok((await selectedDetail().textContent()).includes('2030-01-14'));
 assert.equal(await showroom().getByText('160원',{exact:true}).count(),0,'Parent metric is not copied into child');
 await showroom().getByRole('button',{name:'공간 안내',exact:true}).click();
 const context=showroom().getByLabel('OOH 공간 안내 도식',{exact:true});await context.waitFor();
 await context.getByText('CINEMA · 영화관 스크린',{exact:true}).waitFor();
 assert.equal(await context.locator('img').count(),0,'Spatial diagrams never reuse proof images as actual creatives');
 assert.equal(await context.getByText('실제 소재 연결 대기',{exact:true}).count(),1);
 assert.equal(await originalStage.count(),0);
 await showroom().getByRole('button',{name:'게재 증빙',exact:true}).click();await originalStage.waitFor();
 await showroom().getByRole('button',{name:'게재 증빙 원본 크게 보기',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
 await showroom().getByRole('button',{name:/^옥외 LED/}).click();await showroom().getByRole('button',{name:'원본 6쪽',exact:true}).click();assert.ok((await selectedDetail().textContent()).includes('2030-01-13'));
 await environmentTab('TV·OTT').click();assert.equal(await showroom().getByRole('button',{name:'SBS-TV',exact:true}).count(),0,'Unconfirmed plan-only TV is not in the default source view');await showroom().getByRole('checkbox',{name:'운영안 포함',exact:true}).check();assert.equal(await showroom().getByRole('button',{name:'SBS-TV',exact:true}).count(),1);assert.ok((await showroom().textContent()).includes('실시간 방송이나 현재 광고 송출이 아닙니다.'));await showroom().getByRole('checkbox',{name:'운영안 포함',exact:true}).uncheck();
 await environmentTab('디지털 앱·웹').click();
 const device=()=>showroom().getByRole('button',{name:'홈',exact:true}).locator('..').locator('..');
 const platformPanel=()=>showroom().getByText('웹·광고 플랫폼',{exact:true}).locator('..');
 const expectedApps=['hogangnono','karrot','kidsnote','mamitalk','naver','tiktok','zigbang'];
 assert.deepEqual((await device().locator('[data-media-icon]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-media-icon')))).sort(),expectedApps,'Seven official app icons appear in the device home');
 assert.equal(await platformPanel().getByRole('button',{name:'DV360',exact:true}).count(),1);
 assert.equal(await platformPanel().getByRole('button',{name:'카카오',exact:true}).count(),1);
 assert.equal(await device().locator('[data-media-icon="dv360"], [data-media-icon="kakao"]').count(),0,'Buying platforms stay outside the app home');
 for(const key of expectedApps){
  const icon=device().locator('[data-media-icon="'+key+'"]');assert.equal(await icon.locator('img').count(),1);assert.equal((await icon.textContent()).trim(),'','No two-letter app tiles');
 }
 const hgIcon=device().locator('[data-media-icon="hogangnono"] img');await hgIcon.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{const image=document.querySelector('[data-media-icon="hogangnono"] img');return image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0;});
 assert.ok((await hgIcon.getAttribute('src')).includes('/media-icons/hogangnono.png'),'Actual local official icon asset is loaded');
 await device().getByRole('button',{name:'호갱노노',exact:true}).click();assert.equal(await selectedDetail().getByRole('heading',{name:'모바일 종료 팝업',exact:true}).count(),1);await showroom().getByRole('button',{name:'PC',exact:true}).click();await showroom().getByRole('button',{name:'홈',exact:true}).click();assert.equal(await device().getByRole('button',{name:'호갱노노',exact:true}).count(),1);
 await device().getByRole('button',{name:'네이버',exact:true}).click();assert.equal(await selectedDetail().getByRole('heading',{name:paidCafeProof.placement,exact:true}).count(),1,'Paid café native ads remain digital under the Naver app');
 assert.equal(await showroom().getByRole('region',{name:'바이럴 게시글 탐색',exact:true}).count(),0);
 assert.equal(await showroom().getByRole('heading',{name:'합성 두 번째 게시글',exact:true}).count(),0);
 await platformPanel().getByRole('button',{name:'DV360',exact:true}).click();
 assert.equal(await showroom().getByRole('button',{name:'PC',exact:true}).getAttribute('aria-pressed'),'true','Platform selection chooses a PC preview');
 assert.equal(await selectedDetail().getByRole('heading',{name:'SBS-TV 합성 동영상',exact:true}).count(),1,'DV360 inventory does not become the named publisher');
 assert.equal(await factValue(selectedDetail(),'원본 기기 구분').textContent(),'기기별 구분 미제공','Preview device is not an actual-device claim');
 assert.ok((await showroom().textContent()).includes('목업 선택이 실제 노출 기기를 뜻하지 않습니다.'));
 assert.equal(await selectedDetail().getByText('7원',{exact:true}).count(),1);
 await platformPanel().getByRole('button',{name:'카카오',exact:true}).click();assert.equal(await showroom().getByRole('button',{name:'PC',exact:true}).getAttribute('aria-pressed'),'true');

 // Native keyboard navigation includes the fourth environment and wraps back to OOH.
 await environmentTab('디지털 앱·웹').focus();await page.keyboard.press('End');await viralBoard().waitFor();
 assert.equal(await environmentTab('바이럴').getAttribute('aria-selected'),'true');assert.equal(await environmentTab('바이럴').evaluate(element=>element===document.activeElement),true);
 await page.keyboard.press('ArrowRight');await originalStage.waitFor();assert.equal(await environmentTab('OOH·공간매체').getAttribute('aria-selected'),'true');assert.equal(await environmentTab('OOH·공간매체').evaluate(element=>element===document.activeElement),true);
 await environmentTab('바이럴').click();await showroom().getByRole('checkbox',{name:'운영안 포함',exact:true}).check();await viralBoard().waitFor();assert.equal(await viralCards().count(),3,'Only explicit viral posts enter the board');
 const pendingViral=viralBoard().getByRole('region',{name:'바이럴 증빙 미연결 항목',exact:true});
 assert.equal(await pendingViral.locator('article[data-viral-pending-id]').count(),2,'Plan/metric-only viral records remain accessible separately from posts');
 const pendingPlan=pendingViral.locator('article').filter({has:page.getByRole('heading',{name:'합성 증빙 없는 운영안',exact:true})});
 const pendingMetric=pendingViral.locator('article').filter({has:page.getByRole('heading',{name:'합성 증빙 없는 성과',exact:true})});
 assert.equal(await factValue(pendingPlan,'계획 예산').textContent(),'?');
 assert.equal(await factValue(pendingMetric,'집행액').textContent(),'0원');
 assert.equal(await factValue(pendingMetric,'노출').textContent(),'?');
 assert.equal(await factValue(pendingMetric,'클릭').textContent(),'?');
 assert.equal(await pendingViral.getByRole('link').count(),0);assert.equal(await pendingViral.locator('img').count(),0,'Missing evidence never fabricates an article screenshot');
 assert.equal(await pendingViral.getByText('게재 확인',{exact:true}).count(),0);
 assert.equal(await viralBoard().getByLabel('카페 선택',{exact:true}).evaluate(element=>element.tagName),'SELECT','Cafe filtering uses a native select');
 assert.equal(await viralBoard().getByLabel('바이럴 게시글 검색',{exact:true}).getAttribute('type'),'search','Post search uses a native search input');
 assert.equal(await viralBoard().getByText(paidCafeProof.placement,{exact:true}).count(),0);
 assert.equal(await viralCards().last().getByText('날짜 미제공 게시글 · 원제 부제',{exact:true}).count(),1,'Unknown reported placement dates sort last');
 await selectViralPost('합성 첫 게시글 · 부제');
 assert.equal(await viralDetail().getByText('합성 카페 A',{exact:true}).count(),1);assert.equal(await viralDetail().getByText('합성 의자 주제',{exact:true}).count(),1);
 assert.equal(await factValue(viralDetail(),'자료상 게재일').textContent(),'2030-01-07');assert.equal(await factValue(viralDetail(),'보고서 기준일').textContent(),'2030-01-17');assert.equal(await factValue(viralDetail(),'자료상 확인일').textContent(),'2030-01-09');assert.equal(await factValue(viralDetail(),'원본 자료 페이지').textContent(),'3쪽');
 const articleLink=viralDetail().getByRole('link',{name:/원문 게시글 새 창에서 열기/});assert.equal(await articleLink.getAttribute('href'),'https://cafe.naver.com/synthetic/101');assert.equal(await articleLink.getAttribute('target'),'_blank');assert.ok((await articleLink.getAttribute('rel')).includes('noopener'));
 await viralDetail().getByRole('button',{name:'합성 첫 게시글 · 부제 원본 증빙 크게 보기',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
 await selectViralPost('합성 두 번째 게시글');assert.equal(await viralDetail().getByText('합성 카페 A',{exact:true}).count(),1);assert.equal(await factValue(viralDetail(),'자료상 게재일').textContent(),'2030-01-08');assert.equal(await factValue(viralDetail(),'보고서 기준일').textContent(),'2030-01-18');assert.equal(await factValue(viralDetail(),'자료상 확인일').textContent(),'?');
 assert.ok((await viralDetail().textContent()).includes('자료상 상태 · 확인 필요'));assert.equal(await viralDetail().getByRole('link').count(),0,'Unsafe article and preview URLs produce no link');assert.equal(await viralCard('합성 두 번째 게시글').getByRole('link').count(),0);
 assert.equal(await viralBoard().locator('a[href^="javascript:"], a[href^="data:"], iframe').count(),0,'No dangerous URL or live article embedding');
 await viralBoard().getByLabel('카페 선택',{exact:true}).selectOption('합성 카페 B');assert.equal(await viralCards().count(),1);assert.equal(await viralDetail().getByRole('heading',{name:'날짜 미제공 게시글 · 원제 부제',exact:true}).count(),1);
 assert.equal(await factValue(viralDetail(),'자료상 게재일').textContent(),'?','Report date must never substitute for an unknown posting date');assert.equal(await factValue(viralDetail(),'보고서 기준일').textContent(),'2030-01-19');assert.equal(await factValue(viralDetail(),'자료상 확인일').textContent(),'?');assert.equal(await viralDetail().getByRole('link').count(),0,'Private source/mail fields are not article links');
 assert.ok((await viralDetail().textContent()).includes('현재 게시 여부, 수정·삭제 여부는 별도로 확인하지 않았습니다.'));
 await viralBoard().getByLabel('카페 선택',{exact:true}).selectOption('합성 카페 A');assert.equal(await viralCards().count(),2);
 await viralBoard().getByRole('group',{name:'자료상 상태 필터',exact:true}).getByRole('button',{name:/^확인 필요/}).click();assert.equal(await viralCards().count(),1);assert.equal(await viralDetail().getByRole('heading',{name:'합성 두 번째 게시글',exact:true}).count(),1);
 await viralBoard().getByRole('button',{name:'필터 초기화',exact:true}).click();assert.equal(await viralCards().count(),3);
 await viralBoard().getByLabel('바이럴 게시글 검색',{exact:true}).fill('소파');assert.equal(await viralCards().count(),1);assert.equal(await viralDetail().getByRole('heading',{name:'합성 두 번째 게시글',exact:true}).count(),1);
 await viralBoard().getByLabel('바이럴 게시글 검색',{exact:true}).fill('no-such-synthetic-title');await viralBoard().getByText('조건에 맞는 게시글이 없습니다',{exact:true}).waitFor();assert.equal(await viralCards().count(),0);
 await viralBoard().getByRole('button',{name:'필터 초기화',exact:true}).click();assert.equal(await viralCards().count(),3);

 await page.setViewportSize({width:390,height:844});
 await noHorizontalOverflow(showroom(),'Narrow explorer has no horizontal overflow');
 await noHorizontalOverflow(showroom().getByRole('tablist',{name:'게재 환경',exact:true}),'All four tabs fit without horizontal overflow');
 assert.equal(await showroom().getByRole('tab').count(),4);
 for(const tab of await showroom().getByRole('tab').all())assert.equal(await tab.evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.left>=-1&&bounds.right<=innerWidth+1;}),true,'Each environment tab fits within 390px');
 await noHorizontalOverflow(viralBoard(),'Viral card/filter board has no horizontal overflow');
 await noHorizontalOverflow(pendingViral,'Plan/metric-only viral records fit the narrow viewport');
 const narrowCards=await viralCards().evaluateAll(elements=>elements.map(element=>{const bounds=element.getBoundingClientRect();return {left:bounds.left,top:bounds.top,bottom:bounds.bottom};}));
 for(let index=1;index<narrowCards.length;index++){assert.ok(Math.abs(narrowCards[index].left-narrowCards[0].left)<=1,'Narrow viral cards use one column');assert.ok(narrowCards[index].top>=narrowCards[index-1].bottom-1,'Narrow viral cards stack without overlap');}
 for(const card of await viralCards().all())assert.equal(await card.evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.left>=-1&&bounds.right<=innerWidth+1;}),true,'Viral cards fit the narrow viewport');
 for(const label of ['카페 선택','바이럴 게시글 검색'])assert.equal(await viralBoard().getByLabel(label,{exact:true}).evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.left>=-1&&bounds.right<=innerWidth+1;}),true,'Native filters fit the narrow viewport');
 await viralBoard().getByLabel('카페 선택',{exact:true}).selectOption('합성 카페 A');await viralBoard().getByLabel('바이럴 게시글 검색',{exact:true}).fill('첫 게시글');assert.equal(await viralCards().count(),1);await selectViralPost('합성 첫 게시글 · 부제');await viralBoard().getByRole('button',{name:'필터 초기화',exact:true}).click();
 await environmentTab('OOH·공간매체').click();await showroom().getByRole('button',{name:/^영화관/}).click();assert.equal(await showroom().evaluate(e=>e.getBoundingClientRect().right<=innerWidth+1),true);
 assert.deepEqual(writes,[],'All showroom exploration, filters, device previews and zoom never publish data');
 assert.equal(JSON.stringify(imports),originalImports,'Read-only exploration leaves every original bundle unchanged');
 await page.getByText('애드부스트 지면별 성과 연결',{exact:false}).first().click();await page.getByLabel('애드부스트 지면별 성과 원본',{exact:true}).setInputFiles({name:'inventory_20300116.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook()});await page.getByRole('button',{name:'검수한 세부 성과 저장',exact:true}).waitFor();assert.deepEqual(writes,[],'File inspection is not publication');await page.getByRole('button',{name:'검수한 세부 성과 저장',exact:true}).click();await page.getByText('세부 성과를 연결했습니다.',{exact:false}).waitFor();assert.equal(JSON.stringify(imports[0]),originalBase,'Original facts/plans remain byte-for-byte unchanged');assert.equal(imports.length,originalImportCount+1,'Exactly one new augmentation bundle');assert.equal(JSON.stringify(imports.slice(0,originalImportCount)),originalImports,'All original proof/fact/plan bundles remain unchanged');assert.equal(imports.at(-1).metadata.bundle.sourceKind,'showroom_breakdown');
 await showroom().getByRole('button',{name:/^영화관/}).click();await showroom().getByText('100원',{exact:true}).waitFor();await showroom().getByRole('button',{name:/^엘리베이터·생활공간/}).click();assert.ok((await showroom().textContent()).includes('서비스 지면'));assert.ok((await showroom().textContent()).includes('원본 서비스 비용 참고값'));
 assert.deepEqual(writes,['publish_bundle']);
 await page.getByLabel('조회 월 선택',{exact:true}).selectOption('2030-02');await showroom().getByText('현재 필터에 증빙·성과 자료가 연결된 지면이 없습니다.',{exact:false}).waitFor();assert.equal(await showroom().getByRole('heading',{name:/CGV/}).count(),0,'Scope change clears selection');
 await page.getByLabel('조회 월 선택',{exact:true}).selectOption('2030-03');await environmentTab('바이럴').click();await showroom().getByRole('checkbox',{name:'운영안 포함',exact:true}).check();await viralBoard().getByText('등록된 게시글 증빙이 없습니다',{exact:true}).waitFor();
 assert.equal(await viralCards().count(),0);assert.equal(await viralBoard().getByRole('region',{name:'바이럴 증빙 미연결 항목',exact:true}).locator('article').count(),2,'A proof-less scope still exposes its plan and performance rows');
 assert.ok((await environmentTab('바이럴').textContent()).includes('운영안만 1개'));assert.ok((await environmentTab('바이럴').textContent()).includes('자료 연결 항목'));
 access='viewer';await page.reload();await showroom().waitFor({state:'visible',timeout:30000});assert.equal(await page.getByLabel('애드부스트 지면별 성과 원본',{exact:true}).count(),0,'Viewer cannot publish augmentation');assert.deepEqual(errors,[]);
 console.log('Showroom UI passed: four environments and keyboard wrap, source-first OOH/context isolation, cinema/LED crop and dates, official app icons/platform-device separation, per-proof viral cards/filters/safe links/unknown dates, shared lightbox, read-only desktop/mobile exploration, one reviewed augmentation only, unchanged original bundles, service separation, scope and viewer permissions.');
}finally{await browser.close();}
