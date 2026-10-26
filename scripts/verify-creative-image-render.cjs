// Synthetic SSR only. No customer data, network, browser profile or persisted store.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
let canEdit=true;
function load(name){const module={exports:{}};const result=ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
new Function('require','exports','module',result.outputText)(id=>{
 if(id==='react'||id==='react/jsx-runtime')return require(id);
 if(id.includes('workspace-context'))return{useWorkspace:()=>({advertiser:'Fixture',month:'2030-01',canEdit,dataSyncState:'ready'})};
 if(id.includes('daily-report-store'))return{hydratePublishedDailyState:()=>{throw Error('No writes')}};
 if(id.endsWith('.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
 if(id.endsWith('proof-image-picker'))return load('components/proof-image-picker.tsx');
 if(id.endsWith('creative-image'))return load('lib/creative-image.ts');
 if(id.endsWith('placement-urls'))return load('lib/placement-urls.ts');
 if(id.endsWith('creative-url-preview'))return{CreativeUrlPreview:()=>null};
 if(id.endsWith('proof-image-input'))return{fullCrop:{x:0,y:0,width:100,height:100},PROOF_IMAGE_ACCEPT:'image/png,image/jpeg,image/webp,.pdf,.pptx'};
 throw Error('Unexpected dependency '+id);
},module.exports,module);return module.exports;}
const oldFetch=global.fetch;global.fetch=()=>{throw Error('No network')};
try{
 const {PlacementSetupForm}=load('components/placement-setup-form.tsx');
 const proof=Object.freeze({advertiser:'Fixture',month:'2030-01',media:'매체',placement:'지면',creativeName:'선택 소재',status:'게재 확인',manualImagePath:'original.png',creativeImagePath:'registered.png',creativeImageFilename:'등록소재.png',verificationDate:'2030-01-01',importId:'fixture',publishedAt:'v1'});
 const render=extra=>renderToStaticMarkup(React.createElement(PlacementSetupForm,{proof,imageOnly:true,onClose(){},...extra}));
 let html=render({});assert.match(html,/소재 이미지 넣기/);assert.match(html,/등록 대상/);assert.match(html,/사용자 등록 소재 · 게재 증빙 아님/);assert.match(html,/registered.png/);assert.doesNotMatch(html,/original.png/);assert.doesNotMatch(html,/세팅 상태|게재 확인일|type="date"/);assert.match(html,/소재 이미지 저장/);assert.match(html,/aria-label="소재 이미지 입력"/);assert.match(html,/PDF 페이지 선택/);assert.match(html,/PPTX/);
 html=render({proof:undefined,imageOnly:false});assert.match(html,/<option selected="">사전 세팅<\/option>/);assert.match(html,/지면 저장/);
 canEdit=false;html=render({});assert.match(html,/<fieldset disabled=""/);
 const css=fs.readFileSync('components/placement-setup-form.module.css','utf8');assert.match(css,/@media \(max-width: 700px\).*grid-template-columns: 1fr/);assert.match(fs.readFileSync('components/proof-image-picker.module.css','utf8'),/@media\(max-width:600px\)/);assert.match(fs.readFileSync('app/(dashboard)/creative/creative.module.css','utf8'),/@media\(max-width:540px\)/);
 console.log('PASS creative image synthetic SSR: explicit target, creative label, original separate, image-only metadata hidden, pre-setting default, viewer disabled, 390px responsive rules present.');
}finally{global.fetch=oldFetch}
