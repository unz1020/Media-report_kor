const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {File} = require('node:buffer');
const edge = fs.readFileSync('supabase/functions/placement-proof-image/index.ts','utf8');
const original = {manualImagePath:'tenant/original.png',attachments:[{filename:'original.pdf'}],evidence:{type:'original'},status:'게재 확인',verificationDate:'2030-01-01',sourceFile:'original.pdf',creativeName:'original',materialIdentity:{assetId:'ABC',version:'v01'},performanceLink:{creative:'original'},creativeImagePath:'tenant/old-reference.png'};
async function run({purpose='creative_reference',id='import',stamp='v1',role='editor',tenant='tenant',conflict=false,mime='image/png',bytes=1}={}) {
 let handler, patch, removed=false, uploaded=false;const filters=[];
 const record={id:'import',updated_at:'v1',metadata:{unchanged:true,bundle:{performance:[1,2],placementProof:structuredClone(original)}}};
 function query(table){const q={select(){return q},eq(k,v){filters.push([table,k,v]);return q},or(){return q},order(){return q},limit(){return Promise.resolve({data:tenant==='tenant'&&id==='import'?[record]:[]})},update(value){patch=value;return q},insert(){return Promise.resolve({})},maybeSingle(){return Promise.resolve({data:table==='workspace_users'?{email:'x@fixture',role:'editor'}:table==='advertisers'?{id:'tenant'}:table==='workspace_user_advertisers'?{access_level:role}:conflict?null:{id:'import'}})}};return q;}
 const client={from:query,storage:{from(){return{upload:async()=>{uploaded=true;return{}},remove:async()=>{removed=true;return{}},createSignedUrl:async()=>({data:{signedUrl:'https://fixture.invalid'}})}}}};
 const code=ts.transpileModule(edge.replace(/import .*?;\n/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{exports:{},createClient:()=>client,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,Request,File,crypto:{randomUUID:()=> 'uuid'},fetch:async()=>({ok:true,json:async()=>({email:'x@fixture',verified_email:true})}),console});
 const map=new Map([['advertiser',tenant],['reportDate','2030-01-01'],['sourceFile','original.pdf'],['file',new File([new Uint8Array(bytes)],'registered.png',{type:mime})]]);if(purpose!==null)map.set('purpose',purpose);if(id)map.set('importId',id);if(stamp)map.set('expectedUpdatedAt',stamp);
 const response=await handler({method:'POST',headers:new Headers({authorization:'Bearer synthetic','content-type':'multipart/form-data'}),formData:async()=>({get:k=>map.get(k)??null})});
 return {status:response.status,patch,removed,uploaded,filters};
}
(async()=>{
 const success=await run();assert.equal(success.status,200);const next=success.patch.metadata.bundle.placementProof;
 for(const [key,value] of Object.entries(original))if(key!=='creativeImagePath')assert.deepEqual(next[key],value,key+' preserved');
 assert.equal(next.creativeImageFilename,'registered.png');assert.notEqual(next.creativeImagePath,original.creativeImagePath);assert.deepEqual(success.patch.metadata.bundle.performance,[1,2]);
 assert.ok(success.filters.some(([table,key,val])=>table==='report_imports'&&key==='advertiser_id'&&val==='tenant'));
 const legacy=await run({purpose:null});assert.equal(legacy.status,200);assert.equal(legacy.patch.metadata.bundle.placementProof.creativeImagePath,original.creativeImagePath);assert.notEqual(legacy.patch.metadata.bundle.placementProof.manualImagePath,original.manualImagePath);
 for(const purpose of ['proof','unknown','',{},new File(['x'],'x')])assert.equal((await run({purpose})).status,400);
 for(const args of [{id:''},{stamp:''}])assert.equal((await run(args)).status,400);
 for(const args of [{id:'other'},{tenant:'other'}])assert.equal((await run(args)).status,404);
 assert.equal((await run({role:'viewer'})).status,403);assert.equal((await run({stamp:'stale'})).status,409);
 const conflict=await run({conflict:true});assert.equal(conflict.status,409);assert.equal(conflict.removed,true);
 assert.equal((await run({mime:'application/pdf'})).status,415);assert.equal((await run({bytes:8*1024*1024+1})).status,413);
 assert.equal((await run()).status,200,'retry succeeds');
 const route=fs.readFileSync('app/api/reporting/proof-image/route.ts','utf8');assert.match(route,/purpose !== null && purpose !== "creative_reference"/);assert.match(route,/form.set\("purpose", purpose\)/);
 const page=fs.readFileSync('app/(dashboard)/creative/page.tsx','utf8');assert.ok(!page.includes('replaceProofImage'));assert.match(page,/소재 이미지 넣기/);assert.match(page,/value="">등록 대상을 선택하세요/);
 const form=fs.readFileSync('components/placement-setup-form.tsx','utf8');assert.match(form,/if \(!imageOnly\) \{/);assert.match(form,/form.set\("purpose", CREATIVE_IMAGE_PURPOSE\)/);assert.ok(!form.includes('manualImagePath: imagePayload'));
 const picker=fs.readFileSync('components/proof-image-picker.tsx','utf8');assert.match(picker,/onChange\(undefined\); clearResources/);assert.match(picker,/files.length > 1/);
 console.log('PASS creative image: original evidence/performance preservation, explicit purpose/default legacy, isolation, access, optimistic conflict cleanup, retry, MIME/size, explicit selection and stale-file invalidation.');
})().catch(error=>{console.error(error);process.exitCode=1});
