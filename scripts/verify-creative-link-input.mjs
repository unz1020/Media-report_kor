import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const context = { exports: {}, Error, Date, Object };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("supabase/functions/reporting-store/creative-link-input.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const normalize = context.exports.normalizeCreativeLinkInput;
const base = { advertiser: "자코모", month: "2026-10", importId: "11111111-1111-4111-8111-111111111111",
  expectedUpdatedAt: "2026-10-01T04:00:00.123456Z", performanceLink: {
    sourceFamily: "자코모::2026-10::audited.xlsx", platform: "네이버", placement: "피드", creative: "소재 A",
  } };
assert.equal(JSON.stringify(normalize(base)), JSON.stringify(base));
assert.equal(normalize({...base, performanceLink:null}).performanceLink,null);
for (const field of Object.keys(base)) {
  const missing={...base}; delete missing[field]; assert.throws(() => normalize(missing));
  for (const bad of [undefined, 1, true, {}, [], "", " ", "x\u0000x", "x\nx", "x\u007fx", "x\u0085x"]) {
    assert.throws(() => normalize({...base,[field]:bad}), field+": "+JSON.stringify(bad));
  }
}
for (const field of Object.keys(base.performanceLink)) {
  const missing={...base.performanceLink}; delete missing[field];
  assert.throws(() => normalize({...base,performanceLink:missing}));
  for (const bad of [null, 0, false, {}, [], "", " ", "x\rname", "x\tname", "x\u009fname"]) {
    assert.throws(() => normalize({...base,performanceLink:{...base.performanceLink,[field]:bad}}));
  }
}
for (const [field,max] of [["sourceFamily",2000],["platform",120],["placement",200],["creative",200]]) {
  assert.equal(normalize({...base,performanceLink:{...base.performanceLink,[field]:"x".repeat(max)}}).performanceLink[field].length,max);
  assert.throws(() => normalize({...base,performanceLink:{...base.performanceLink,[field]:"x".repeat(max+1)}}));
}
for (const bad of [null, [], "input", {...base, advertiser:"x".repeat(201)}, {...base, month:"2026-00"},
  {...base,month:"2026-13"}, {...base,importId:"-".repeat(36)}, {...base,expectedUpdatedAt:"yesterday"},
  {...base,expectedUpdatedAt:"2026-10-01"}, {...base,extra:1}, {...base,performanceLink:{...base.performanceLink,clicks:1}},
  {...base,performanceLink:JSON.parse('{"__proto__":{},"sourceFamily":"x","platform":"x","placement":"x","creative":"x"}')}]) {
  assert.throws(() => normalize(bad));
}
console.log("Creative-link input checks passed: exact required keys, primitive strings and bounds, control/object rejection, UUID/month/version validation and explicit null clear.");
const operation = { status: "집행 중", asOf: "2026-10-23", note: "AE 확인" };
assert.equal(normalize({...base,operation}).operation.note,operation.note);
assert.equal(normalize({...base,operation:null}).operation,null);
assert.equal("operation" in normalize(base),false);
for (const bad of [undefined, [], "집행 중", {}, {...operation,extra:1}, {...operation,status:"active"},
  {...operation,asOf:"2026-02-30"}, {...operation,asOf:"yesterday"}, {...operation,note:"x".repeat(1001)},
  {...operation,note:"bad\u000bname"}, {...operation,note:{}}, {...operation,status:{}}, {...operation,asOf:{}}]) {
  assert.throws(() => normalize({...base,operation:bad}));
}
for (const status of ["예정", "집행 중", "중단", "종료"]) assert.equal(normalize({...base,operation:{status,asOf:operation.asOf}}).operation.status,status);
console.log("Report-only operation schema checks passed: optional preservation, explicit null, strict enum/ISO date/note/keys.");
for (const asOf of ["2026-10-23T00:00:00Z", "2026-13-01", "2026-02-29", "2026-04-31", "2026-2-01"]) assert.throws(() => normalize({...base,operation:{...operation,asOf}}));
assert.equal(normalize({...base,operation:{...operation,asOf:"2024-02-29"}}).operation.asOf,"2024-02-29");
console.log("Operation asOf uses strict YYYY-MM-DD calendar dates, separate from optimistic updated_at timestamps.");
const retain=context.exports.retainCreativeAnnotations;
const prior={bundle:{placementProof:{month:"2026-10",performanceLink:base.performanceLink,operation}}};
const incoming={bundle:{placementProof:{month:"2026-10",status:"fresh evidence"}}};
retain(incoming,prior);
assert.equal(incoming.bundle.placementProof.performanceLink,base.performanceLink);
assert.equal(incoming.bundle.placementProof.operation,operation);
assert.equal(incoming.bundle.placementProof.status,"fresh evidence");
const explicit={bundle:{placementProof:{month:"2026-10",performanceLink:null,operation:null}}};retain(explicit,prior);
assert.equal(explicit.bundle.placementProof.operation,null);assert.equal(explicit.bundle.placementProof.performanceLink,null);
for (const candidate of [{bundle:{}},{bundle:{placementProof:{month:"2026-09"}}},{bundle:{placementProof:[]}},{}]) {
  const before=JSON.stringify(candidate);retain(candidate,prior);assert.equal(JSON.stringify(candidate),before);
}
console.log("Reimport annotation merge copies only omitted leaves for same-month existing proofs; explicit null and other scopes remain untouched.");
// Textarea formatting is supported only for report-only note text, never pointer identity fields.
for (const note of ["first\nsecond", "first\r\nsecond", "first\rsecond", "first\tindented", "x".repeat(999)+"\n"]) {
  assert.equal(normalize({...base,operation:{...operation,note}}).operation.note,note);
}
assert.throws(() => normalize({...base,operation:{...operation,note:"x".repeat(1000)+"\n"}}));
for (let code=0;code<=0x9f;code++) {
  if (code>0x1f && code<0x7f || [9,10,13].includes(code)) continue;
  assert.throws(() => normalize({...base,operation:{...operation,note:"first"+String.fromCharCode(code)+"second"}}),"note control "+code);
}
for (const field of Object.keys(base.performanceLink)) {
  for (const control of ["\n","\r","\t"]) assert.throws(() => normalize({...base,performanceLink:{...base.performanceLink,[field]:"first"+control+"second"}}));
}
console.log("Operation textarea checks passed: LF/CR/tab preserved, 1000-character limit enforced, remaining C0/C1 rejected, pointer fields remain control-free.");
