import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright';
const root = process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3000';
function fixturePdf() {
  const drawing = '0.1 0.5 0.8 rg 30 30 340 240 re f';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>', ...[5,6].map(i=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << >> /Contents ${i} 0 R >>`), ...[1,2].map(()=>`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`)];
  let value = '%PDF-1.7\n', offsets = [0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(value));value+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const start=Buffer.byteLength(value);value+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(value);
}
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let proof, uploads=0, saves=0, imageBytes, failure=false, access='editor';
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
await page.route('**/api/workspace',route=>json(route,{user:{email:'fixture@example.com',display_name:'검증',role:'ae'},advertisers:[{id:'fixture',name:'자코모',slug:'jakomo',accessLevel:access}],months:['2026-10']}));
await page.route('**/api/reporting/store',route=>{
 const body=route.request().postDataJSON();
 if(body.action==='load_layout')return json(route,{layout:null,updatedAt:null});
 if(body.action==='load_state')return json(route,{imports:proof?[{id:proof.importId,report_date:proof.reportDate,updated_at:proof.publishedAt,metadata:{bundle:{placementProof:proof}}}]:[],insights:[]});
 assert.equal(body.action,'save_manual_proof');assert.equal(access,'editor');saves++;
 proof={...proof,...body.input,advertiser:'자코모',importId:'fixture-proof',reportDate:'2026-10-01',sourceFile:'[manual-placement] fixture',publishedAt:new Date().toISOString(),attachments:[],serviceType:'디지털 사전 세팅',location:'',airingTime:'',dailyFrequency:null,durationSec:null,budgetReference:null};
 return json(route,{ok:true,proof});
});
await page.route('**/api/reporting/proof-image**',async route=>{
 if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'image/jpeg',body:imageBytes});
 uploads++;const request=route.request(), form=await new Request('https://fixture.invalid',{method:'POST',headers:{'content-type':request.headers()['content-type']},body:request.postDataBuffer()}).formData();
 const file=form.get('file');assert.equal(form.get('importId'),'fixture-proof');assert.ok(/^image\/(png|jpeg|webp)$/.test(file.type));assert.ok(file.size<=4*1024*1024);
 imageBytes=Buffer.from(await file.arrayBuffer());
 if(failure)return json(route,{error:'IMAGE_TEST_FAILURE'},500);
 proof={...proof,manualImagePath:'fixture/image.jpg',publishedAt:new Date().toISOString()};return json(route,{path:proof.manualImagePath,updatedAt:proof.publishedAt});
});
const visible=locator=>locator.waitFor({state:'visible',timeout:20000});
const editor=page.getByLabel('지면 수동 세팅',{exact:true}), picker=page.getByLabel('게재 이미지 입력',{exact:true});
async function drop(bytes,name,type) {
 await picker.locator('[class*="drop"]').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(({base64,name,type})=>{const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([data],name,{type}));return transfer;},{base64:bytes.toString('base64'),name,type})});
}
try {
 await page.goto(root+'/creative');await visible(page.getByRole('button',{name:'지면 수동 등록',exact:true}));
 await page.getByRole('button',{name:'지면 수동 등록',exact:true}).click();
 await editor.getByLabel('매체',{exact:true}).fill('카카오');await editor.getByLabel('상품 / 게재지면',{exact:true}).fill('키워드 PC');await editor.getByLabel('소재명',{exact:true}).fill('게재 화면');
 const bytes=process.env.PROOF_TEST_PDF?fs.readFileSync(process.env.PROOF_TEST_PDF):fixturePdf();
 await drop(bytes,'게재 보고.pdf','application/pdf');await visible(picker.getByLabel('PDF 페이지',{exact:true}));
 const pages=await picker.getByLabel('PDF 페이지',{exact:true}).locator('option').count();assert.ok(pages>=2);
 assert.equal(await editor.getByRole('button',{name:'지면 저장',exact:true}).isDisabled(),true);
 const number=Math.min(3,pages);await picker.getByLabel('PDF 페이지',{exact:true}).selectOption(String(number));
 await page.waitForFunction(()=>!document.querySelector('[aria-label="게재 이미지 입력"] button[class*="primary"]')?.disabled);
 await page.screenshot({path:'/tmp/proof-pdf-picker.png',fullPage:true});
 const sourceSize=await picker.getByAltText('보고서 이미지 미리보기').evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight}));assert.ok(sourceSize.width>=800);
 for(const [name,value] of [['왼쪽','10'],['위쪽','15'],['너비','50'],['높이','60']])await picker.getByLabel(`자르기 ${name} (%)`,{exact:true}).fill(value);
 await picker.getByRole('button',{name:'이 이미지 사용',exact:true}).click();await visible(picker.getByText('선택한 영역을 이미지로 준비했습니다. 지면 저장을 누르면 등록됩니다.',{exact:true}));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'PDF preview fits mobile');await page.screenshot({path:'/tmp/proof-picker-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:1000});
 assert.equal(uploads,0);assert.equal(saves,0);
 failure=true;await editor.getByRole('button',{name:'지면 저장',exact:true}).click();await visible(editor.getByText('IMAGE_TEST_FAILURE',{exact:true}));assert.equal(saves,1);
 failure=false;await editor.getByRole('button',{name:'지면 저장',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(uploads,2);
 const outputSize=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/jpeg;base64,'+base64;await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};},imageBytes.toString('base64'));
 assert.equal(outputSize.width,Math.round(sourceSize.width*.5));assert.equal(outputSize.height,Math.round(sourceSize.height*.6));
 const visual=page.getByLabel('게재 화면 이미지 드롭 또는 붙여넣기',{exact:true});await visible(visual);
 // Paste an image on the existing placement card, then verify deferred replacement.
 const png=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#2459ac';c.fillRect(0,0,320,180);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
 await visual.evaluate((element,base64)=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'클립보드.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},png.toString('base64'));
 await visible(editor);await visible(picker.getByAltText('보고서 이미지 미리보기'));assert.equal(uploads,2);
 // Plain text paste stays a native input action.
 const campaign=editor.getByLabel('캠페인명',{exact:true});await campaign.evaluate(input=>{const data=new DataTransfer();data.setData('text/plain','캠페인 문구');const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});input.dispatchEvent(event);if(event.defaultPrevented)throw Error('Text paste was intercepted');});
 // Drag a crop rectangle using pointer coordinates.
 const area=picker.getByLabel('게재 이미지 자르기',{exact:true});await area.scrollIntoViewIfNeeded();const bounds=await area.boundingBox();
 await page.mouse.move(bounds.x+bounds.width*.1,bounds.y+bounds.height*.1);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.8,bounds.y+bounds.height*.8);await page.mouse.up();
 assert.equal(await editor.getByRole('button',{name:'지면 저장',exact:true}).isDisabled(),true);await picker.getByRole('button',{name:'이 이미지 사용',exact:true}).click();await visible(picker.getByText('선택한 영역을 이미지로 준비했습니다. 지면 저장을 누르면 등록됩니다.',{exact:true}));
 await editor.getByRole('button',{name:'지면 저장',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(uploads,3);
 await page.getByRole('button',{name:'지면 · 랜딩 · UTM 수정',exact:true}).click();
 const zip=new JSZip();
 zip.file('ppt/presentation.xml','<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="1" r:id="s1"/></p:sldIdLst></p:presentation>');
 zip.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="s1" Target="slides/slide1.xml"/></Relationships>');
 zip.file('ppt/slides/slide1.xml','<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><a:blip r:embed="image1"/></p:sld>');
 zip.file('ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="image1" Target="../media/image1.png"/></Relationships>');zip.file('ppt/media/image1.png',png);
 await drop(await zip.generateAsync({type:'nodebuffer'}),'게재보고.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation');
 await visible(picker.getByRole('button',{name:'슬라이드 1 · 이미지 1',exact:true}));await picker.getByRole('button',{name:'이 이미지 사용',exact:true}).click();await visible(picker.getByText('선택한 영역을 이미지로 준비했습니다. 지면 저장을 누르면 등록됩니다.',{exact:true}));
 await editor.getByRole('button',{name:'지면 저장',exact:true}).click();await editor.waitFor({state:'hidden'});assert.equal(uploads,4);
 await page.getByRole('button',{name:'지면 · 랜딩 · UTM 수정',exact:true}).click();
 await drop(Buffer.from('invalid'),'구형.ppt','application/vnd.ms-powerpoint');await visible(picker.getByRole('alert'));assert.ok((await picker.getByRole('alert').innerText()).includes('구형 PPT'));
 await drop(Buffer.from('bad pdf'),'손상.pdf','application/pdf');await visible(picker.getByRole('alert'));
 await picker.locator('[class*="drop"]').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(31*1024*1024)],'큰자료.pdf',{type:'application/pdf'}));return transfer;})});await visible(picker.getByText('이미지·PDF·PPTX 자료는 30MB 이하로 넣어주세요.',{exact:true}));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await editor.getByRole('button',{name:'닫기',exact:true}).click();access='viewer';await page.reload();assert.equal(await page.getByRole('button',{name:'지면 수동 등록',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('Proof image UI passed: PDF drop/page/crop, real image dimensions, deferred save/retry, clipboard card replacement, native text paste, pointer crop, PPTX images, malformed/legacy/oversize errors, mobile and viewer.');
} catch(error) { console.error(errors);console.error(await page.locator('body').innerText());throw error; }
finally {await browser.close();}
