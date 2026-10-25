import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { randomUUID } from "node:crypto";
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const validation = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/reporting-store/placement-input.ts", "utf8")), {
  exports: validation.exports, URL, Date, Error,
});
const insightValidation = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/reporting-store/insight-input.ts", "utf8")), {
  exports: insightValidation.exports, Date, Error,
});
const layoutValidation = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/reporting-store/layout-input.ts", "utf8")), { exports: layoutValidation.exports, Date, Error, Set, Object });
const mediaValidation = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/reporting-store/media-plan-input.ts", "utf8")), { exports: mediaValidation.exports, Date, Error, Number, URL });
const creativeLinkValidation = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/reporting-store/creative-link-input.ts", "utf8")), { exports: creativeLinkValidation.exports, Date, Error, Object });
let access = "editor", verified = true, active = true, concurrent = false, knownUser = true;
const writes = [];
let handler;
let rpcError = "";
const rows = { workspace_users: [{ email: "fixture@example.com", role: "ae", is_active: true }],
  advertisers: [{ id: "fixture-advertiser", name: "자코모", slug: "jakomo", is_active: true }],
  workspace_user_advertisers: [{ email: "fixture@example.com", advertiser_id: "fixture-advertiser", access_level: "editor" }],
  report_imports: [], workspace_activity: [] };
class Query {
  constructor(table) { this.table = table; this.filters = []; this.mode = "select"; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => key.split(/->>?/).reduce((item, part) => item?.[part], row) === value); return this; }
  or(expression) { this.filters.push(row => expression.split(",").some(term => { const [key, operator, ...parts] = term.split("."); return operator === "eq" && row[key] === parts.join("."); })); return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload) { this.mode = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  delete() { this.mode = "delete"; return this; }
  update(payload) { this.mode = "update"; this.payload = payload; return this; }
  async result(single) {
    if (this.table === "workspace_user_advertisers" && rows[this.table][0]) rows[this.table][0].access_level = access;
    if (this.table === "workspace_users") rows[this.table][0].is_active = active;
    if (this.mode !== "select") writes.push({ table: this.table, mode: this.mode, payload: this.payload });
    const list = this.table === "workspace_users" && !knownUser ? [] : rows[this.table] ||= [];
    let matches = list.filter(row => this.filters.every(filter => filter(row)));
    if (this.mode === "insert") {
      matches = this.payload.map(row => ({ id: randomUUID(), ...row }));
      list.push(...matches);
    } else if (this.mode === "delete") {
      rows[this.table] = list.filter(row => !matches.includes(row));
    } else if (this.mode === "update") {
      if (concurrent) matches = [];
      else matches.forEach(row => Object.assign(row, this.payload));
    }
    return { data: single ? matches[0] || null : matches, error: null };
  }
  maybeSingle() { return this.result(true); }
  single() { return this.result(true); }
  then(resolve, reject) { return this.result(false).then(resolve, reject); }
}
const source = fs.readFileSync("supabase/functions/reporting-store/index.ts", "utf8");
vm.runInNewContext(compile(source), {
  exports: {}, require: name => name === "./creative-link-input.ts" ? creativeLinkValidation.exports : name === "./media-plan-input.ts" ? mediaValidation.exports : name === "./placement-input.ts" ? validation.exports : name === "./insight-input.ts" ? insightValidation.exports : name === "./layout-input.ts" ? layoutValidation.exports : { createClient: () => ({ from: table => new Query(table), rpc: async (name, args) => { assert.ok(["edit_daily_insight", "save_dashboard_layout"].includes(name)); assert.equal(args.caller_email, "fixture@example.com"); assert.equal(args.advertiser_id_input, "fixture-advertiser"); return { data: { updatedAt: "2026-10-01T05:00:00Z" }, error: rpcError ? { message: rpcError } : null }; } }) },
  Deno: { env: { get: () => "fixture" }, serve: fn => { handler = fn; } }, crypto: { randomUUID },
  Response, Request, URL, Date, Error, Set, Map,
  fetch: async () => new Response(JSON.stringify({ email: "fixture@example.com", verified_email: verified }), { status: 200 }),
});
async function call(input, token = true) {
  return handler(new Request("https://example.com", { method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer fixture" } : {}) },
    body: JSON.stringify({ action: "save_manual_proof", input }) }));
}
const base = { advertiser: "자코모", month: "2026-10", clientId: randomUUID(), media: "네이버 GFA", placement: "피드",
  creativeName: "사전 소재", status: "사전 세팅", landingUrl: "https://example.com", utm: { utm_source: "naver" },
  manualImagePath: "unauthorized/should-not-save" };
assert.equal((await call(base, false)).status, 401);
verified = false; assert.equal((await call(base)).status, 401); verified = true;
active = false; assert.equal((await call(base)).status, 403); active = true;
access = "viewer"; assert.equal((await call(base)).status, 403); access = "editor";
assert.equal(rows.report_imports.length, 0);
let response = await call(base);
assert.equal(response.status, 200);
let payload = await response.json();
assert.equal(rows.report_imports.length, 1);
assert.equal(payload.proof.manualImagePath, undefined);
assert.equal(payload.proof.month, "2026-10");
assert.equal(payload.proof.status, "사전 세팅");
assert.equal(rows.report_imports[0].source_type, "other");
assert.equal(rows.report_imports[0].updated_by, "fixture@example.com");
const existing = rows.report_imports[0];
existing.metadata.bundle.placementProof.manualImagePath = "fixture-advertiser/original.png";
const edit = { ...base, importId: payload.proof.importId, expectedUpdatedAt: payload.proof.publishedAt, creativeName: "수정 소재" };
response = await call(edit);
assert.equal(response.status, 200);
payload = await response.json();
assert.equal(payload.proof.manualImagePath, "fixture-advertiser/original.png");
assert.equal(rows.report_imports.length, 1);
assert.equal(rows.workspace_activity.length, 2);
assert.equal((await call({ ...edit, expectedUpdatedAt: "stale" })).status, 409);
assert.equal((await call({ ...edit, month: "2026-09", expectedUpdatedAt: payload.proof.publishedAt })).status, 403);
assert.equal((await call({ ...edit, importId: randomUUID() })).status, 404);
assert.equal((await call({ ...base, previewUrl: "javascript:alert(1)" })).status, 400);
concurrent = true;
assert.equal((await call({ ...edit, expectedUpdatedAt: payload.proof.publishedAt })).status, 409);
assert.equal(rows.report_imports[0].metadata.bundle.placementProof.creativeName, "수정 소재");
async function insightCall(input, token = true) {
  return handler(new Request("https://example.com", { method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer fixture" } : {}) },
    body: JSON.stringify({ action: "save_insight", input }) }));
}
concurrent = false;
const editInsight = { advertiser: "자코모", insightId: randomUUID(), expectedUpdatedAt: "2026-10-01T04:00:00Z", notes: ["직접 수정한 문구"] };
assert.equal((await insightCall(editInsight, false)).status, 401);
access = "viewer"; assert.equal((await insightCall(editInsight)).status, 403); access = "editor";
assert.equal((await insightCall(editInsight)).status, 200);
for (const notes of [[], [{}], [""], ["x".repeat(4001)], Array(81).fill("x")]) {
  assert.equal((await insightCall({ ...editInsight, notes })).status, 400);
}
rpcError = "INSIGHT_CHANGED"; assert.equal((await insightCall(editInsight)).status, 409);
rpcError = "INSIGHT_NOT_FOUND"; assert.equal((await insightCall(editInsight)).status, 404); rpcError = "";
const metadata = { bundle: { operationNotes: ["메일 원본"] } };
insightValidation.exports.retainInsightOverride(metadata, { insightOverride: { notes: ["직접 수정"] } });
assert.deepEqual(metadata.bundle.operationNotes, ["직접 수정"]);
const mailMetadata = { mailOnly: true, input: { notes: ["메일 원본"] } };
insightValidation.exports.retainInsightOverride(mailMetadata, { insightOverride: { notes: ["직접 수정"] } });
assert.deepEqual(mailMetadata.input.notes, ["직접 수정"]);
async function publish(body) {
  return handler(new Request("https://example.com", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify(body) }));
}
const mailInput = { advertiser: "자코모", reportDate: "2026-10-01", mailSubject: "검증 메일", notes: ["원본"] };
assert.equal((await publish({ action: "publish_mail_only", input: mailInput })).status, 200);
const mailImport = rows.report_imports.find(row => row.source_file === "[mail] 검증 메일");
mailImport.metadata.insightOverride = { notes: ["사이트에서 수정한 메일 문구"] };
assert.equal((await publish({ action: "publish_mail_only", input: mailInput })).status, 200);
assert.deepEqual(rows.daily_insights.find(row => row.import_id === mailImport.id).notes, ["사이트에서 수정한 메일 문구"]);
const reportBundle = { advertiser: "자코모", reportDate: "2026-10-01", sourceFile: "fixture-report.xlsx", placements: [], dailyPerformance: [], operationNotes: ["원본 보고서 문구"] };
assert.equal((await publish({ action: "publish_bundle", bundle: reportBundle })).status, 200);
const reportImport = rows.report_imports.find(row => row.source_file === "fixture-report.xlsx");
reportImport.metadata.insightOverride = { notes: ["사이트에서 수정한 보고서 문구"] };
assert.equal((await publish({ action: "publish_bundle", bundle: reportBundle })).status, 200);
assert.deepEqual(rows.daily_insights.find(row => row.import_id === reportImport.id).notes, ["사이트에서 수정한 보고서 문구"]);
async function layoutCall(action, input, token = true) {
  return handler(new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer fixture" } : {}) }, body: JSON.stringify(action === "save_layout" ? { action, input } : { action, ...input }) }));
}
const layoutInput = { advertiser: "자코모", page: "overview", expectedUpdatedAt: null, layout: { version: 1, order: ["overview:인사이트"], widths: { "overview:인사이트": 30 } } };
assert.equal((await layoutCall("load_layout", layoutInput)).status, 200);
assert.equal((await layoutCall("save_layout", layoutInput, false)).status, 401);
access="viewer";
assert.equal((await layoutCall("load_layout", layoutInput)).status, 200);
assert.equal((await layoutCall("save_layout", layoutInput)).status, 403); access="editor";
assert.equal((await layoutCall("save_layout", layoutInput)).status, 200);
assert.equal((await layoutCall("save_layout", { ...layoutInput, page: "unknown" })).status, 400);
for(const layout of [{ version: 1, order: ["a","a"], widths: {} }, {version:1,order:["a"],widths:{a:999}}, {version:1,order:["a"],widths:{unknown:30}}, {order:["a"],widths:{}}]) {
  assert.equal((await layoutCall("save_layout", { ...layoutInput, layout })).status, 400);
}
rpcError="LAYOUT_CHANGED";assert.equal((await layoutCall("save_layout", layoutInput)).status,409);rpcError="";
console.log("Layout Edge checks passed: verified editors, viewer read, invalid page/layout denial, width validation and stale save rejection.");
console.log("Insight checks passed: authenticated editors, validation, conflicts, missing source, re-import preservation.");
console.log("Edge handler checks passed: authentication, active user, viewer denial, allowlisted input, create/edit, image preservation, scope and concurrency.");

let imageHandler;
const signedPaths = [];
vm.runInNewContext(compile(fs.readFileSync("supabase/functions/placement-proof-image/index.ts", "utf8")), {
  exports: {}, require: () => ({ createClient: () => ({ from: table => new Query(table), storage: { from: () => ({
    createSignedUrl: async path => { signedPaths.push(path); return { data: { signedUrl: "https://example.com/image" }, error: null }; },
  }) } }) }),
  Deno: { env: { get: () => "fixture" }, serve: fn => { imageHandler = fn; } }, crypto: { randomUUID },
  Response, Request, URL, Date, Error, Set, Map, File, FormData,
  fetch: async () => new Response(JSON.stringify({ email: "fixture@example.com", verified_email: verified }), { status: 200 }),
});
async function signed(path) {
  return imageHandler(new Request("https://example.com", { method: "POST",
    headers: { authorization: "Bearer fixture", "content-type": "application/json" },
    body: JSON.stringify({ action: "signed_url", advertiser: "자코모", path }) }));
}
access = "viewer";
assert.equal((await signed("fixture-advertiser/2026-10-01/proof.png")).status, 200);
for (const path of ["other-advertiser/proof.png", "fixture-advertiser/../other-advertiser/proof.png",
  "fixture-advertiser/%2e%2e/other-advertiser/proof.png", "fixture-advertiser/./proof.png",
  "fixture-advertiser//proof.png", "fixture-advertiser/..\\other-advertiser/proof.png"]) {
  assert.equal((await signed(path)).status, 403);
}
assert.equal(signedPaths.length, 1);
verified = false;
assert.equal((await signed("fixture-advertiser/2026-10-01/proof.png")).status, 401);
console.log("Image access checks passed: viewer read, advertiser boundary, canonical paths, verified identity.");

verified = true; active = true; access = "editor";
const mediaRow = { creativeUrl: "https://youtu.be/M7lc1UVf-VE", previewUrl: "https://example.com/ad-preview", platform: "네이버", product: "GFA", creativeName: "소재 A", periodStart: "2026-10-01", periodEnd: "2026-10-31", budget: 1000 };
const mixInput = { advertiser: "자코모", month: "2026-10", rows: [mediaRow], expectedUpdatedAt: null };
const saveMix = (input, token=true) => handler(new Request("https://example.com", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer fixture" } : {}) }, body: JSON.stringify({ action: "save_media_mix", input }) }));
assert.equal((await saveMix(mixInput, false)).status, 401);
access = "viewer"; assert.equal((await saveMix(mixInput)).status, 403); access = "editor";
for (const input of [{...mixInput,month:"2026-13"},{...mixInput,rows:[]},{...mixInput,rows:[{...mediaRow,budget:-1}]},{...mixInput,rows:[{...mediaRow,periodStart:"2026-02-30"}]},{...mixInput,rows:[{...mediaRow,periodStart:"2026-09-01",periodEnd:"2026-09-30"}]},{...mixInput,rows:[{...mediaRow,operationStatus:"unknown"}]}]) assert.equal((await saveMix(input)).status,400);
const beforeMix = rows.report_imports.length;
assert.equal((await saveMix(mixInput)).status,200);
assert.equal(rows.report_imports.length,beforeMix+1);
const mix = rows.report_imports.find(row=>row.source_sheet === "media-mix");
assert.equal(mix.metadata.bundle.placements.length,0);
assert.equal(mix.metadata.bundle.sourceKind,"media_mix");
assert.equal(mix.metadata.bundle.mediaPlan[0].creativeUrl, mediaRow.creativeUrl);
assert.equal(mix.metadata.bundle.mediaPlan[0].previewUrl, mediaRow.previewUrl);
assert.equal((await saveMix(mixInput)).status,409);
const nextMix = {...mixInput,expectedUpdatedAt:mix.updated_at,rows:[{...mediaRow,budget:2000}]};
assert.equal((await saveMix(nextMix)).status,200);
assert.equal(rows.report_imports.length,beforeMix+1);
assert.equal(mix.metadata.bundle.mediaPlan[0].budget,2000);
concurrent = true; assert.equal((await saveMix({...nextMix,expectedUpdatedAt:mix.updated_at})).status,409); concurrent = false;
assert.equal(mix.metadata.bundle.mediaPlan[0].budget,2000);
console.log("Media mix Edge checks passed: authentication, viewer denial, strict dates/month/budget/status, create/update and stale/concurrent conflict; performance data preserved.");

const historySnapshot = { metadata: { bundle: { sourceKind: 'media_mix', mediaPlan: [mediaRow], originalSourceFile: '10월 믹스.xlsx', mediaMixChangeMemo: '예산 조정' } } };
rows.report_import_versions = [
 { id: 'valid', advertiser_id: 'fixture-advertiser', report_date: '2026-10-01', captured_at: '2026-10-01T10:00:00Z', actor_email: 'fixture@example.com', snapshot: historySnapshot },
 { id: 'other-advertiser', advertiser_id: 'other-advertiser', report_date: '2026-10-01', snapshot: historySnapshot },
 { id: 'other-month', advertiser_id: 'fixture-advertiser', report_date: '2026-09-01', snapshot: historySnapshot },
 { id: 'performance', advertiser_id: 'fixture-advertiser', report_date: '2026-10-01', snapshot: { metadata: { bundle: { sourceKind: 'daily' } } } },
];
const loadMixHistory = (month='2026-10',token=true) => handler(new Request('https://example.com',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer fixture'}:{})},body:JSON.stringify({action:'load_media_mix_history',advertiser:'자코모',month})}));
assert.equal((await loadMixHistory('2026-10',false)).status,401);assert.equal((await loadMixHistory('2026-13')).status,400);
access='viewer';const historyResponse=await loadMixHistory();assert.equal(historyResponse.status,200);const historyPayload=await historyResponse.json();assert.equal(historyPayload.history.length,1);assert.equal(historyPayload.history[0].id,'valid');assert.equal(historyPayload.history[0].changeMemo,'예산 조정');assert.equal(historyPayload.history[0].rows.length,1);
access='editor';assert.equal((await saveMix({...nextMix,expectedUpdatedAt:mix.updated_at,changeMemo:'기간 변경',rows:[{...mediaRow,rowId:'11111111-1111-4111-8111-111111111111'}]})).status,200);assert.equal(mix.metadata.bundle.mediaMixChangeMemo,'기간 변경');assert.equal(mix.metadata.bundle.mediaPlan[0].rowId,'11111111-1111-4111-8111-111111111111');
console.log('Media mix history checks passed: authentication, viewer read, advertiser/month/source isolation, normalized memo and stable row IDs.');

// Creative links mutate one metadata leaf only, never inventory, source reports or facts.
verified = true; active = true; knownUser = true; access = "editor"; concurrent = false;
const linkFixture = { id: randomUUID(), advertiser_id: "fixture-advertiser", report_date: "2026-10-12", month: "2026-10-01",
  updated_at: "2026-10-12T05:00:00.000Z", updated_by: "original@example.com", source_file: "원본.xlsx", source_sheet: "원본",
  source_type: "gmail_excel", source_url: "https://example.com/source", status: "published", mail_subject: "original mail", parser_version: "v1",
  metadata: { preserved: { flags: [1, 2] }, insightOverride: { notes: ["override"] }, bundle: {
    sourceFile: "원본.xlsx", sourceUrl: "https://example.com/source", placements: [{ impressions: 123, clicks: 5 }],
    dailyPerformance: [{ date: "2026-10-12", spend: 20 }], creativeDailyPerformance: [{ creative: "source creative", impressions: 100 }],
    mediaPlan: [{ budget: 555 }], operationNotes: ["원본 문구"], qa: { matchedMailMetrics: 4 },
    placementProof: { month: "2026-10", creativeName: "named proof creative", operation: {status:"예정",asOf:"2026-10-01",note:"keep omitted operation"}, status: "게재 확인", verificationDate: "2026-10-12",
      manualImagePath: "fixture-advertiser/original.png", attachments: ["original.png"], previewUrl: "https://example.com/preview",
      landingUrl: "https://example.com/landing", utm: { utm_source: "original" }, notes: ["keep"], unknownFutureField: { keep: true } },
  } } };
rows.report_imports.push(linkFixture);
const linkInput = { advertiser: "자코모", month: "2026-10", importId: linkFixture.id, expectedUpdatedAt: linkFixture.updated_at,
  performanceLink: { sourceFamily: "자코모::2026-10::audited-report.xlsx", platform: "네이버", placement: "피드", creative: "source creative" } };
const linkCall = (input=linkInput, token=true) => handler(new Request("https://example.com", { method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer fixture" } : {}) },
  body: JSON.stringify({ action: "save_creative_link", input }) }));
const stable = () => JSON.stringify(rows);
let unchanged = stable();
assert.equal((await linkCall(linkInput, false)).status, 401);
verified=false; assert.equal((await linkCall()).status,401); verified=true;
knownUser=false; assert.equal((await linkCall()).status,403); knownUser=true;
active=false; assert.equal((await linkCall()).status,403); active=true;
access="viewer"; assert.equal((await linkCall()).status,403); access="editor"; rows.workspace_user_advertisers[0].access_level=access;
assert.equal((await linkCall({...linkInput, advertiser:"unknown"})).status,500);
const membership=rows.workspace_user_advertisers.pop();
assert.equal((await linkCall()).status,403); rows.workspace_user_advertisers.push(membership);
assert.equal(stable(),unchanged);
for (const bad of [null, [], {}, {...linkInput, extra: "no"}, {...linkInput, performanceLink: undefined},
  {...linkInput, importId: "bad"}, {...linkInput, importId: undefined}, {...linkInput, expectedUpdatedAt: "stale"},
  {...linkInput, expectedUpdatedAt: null}, {...linkInput, month:"2026-13"}, {...linkInput, advertiser:{}},
  {...linkInput, performanceLink:{}}, {...linkInput, performanceLink:[]}, {...linkInput, performanceLink:"x"},
  {...linkInput, performanceLink:{...linkInput.performanceLink, impressions:100}},
  {...linkInput, performanceLink:{...linkInput.performanceLink, creative:{toString:"x"}}},
  {...linkInput, performanceLink:{...linkInput.performanceLink, creative:"bad\nname"}},
  {...linkInput, performanceLink:{...linkInput.performanceLink, platform:"x".repeat(121)}}]) {
  assert.equal((await linkCall(bad)).status,400,JSON.stringify(bad));
}
assert.equal((await linkCall({...linkInput, importId:randomUUID()})).status,404);
assert.equal((await linkCall({...linkInput, expectedUpdatedAt:"2026-10-11T05:00:00.000Z"})).status,409);
for (const sourceFamily of ["다른광고주::2026-10::report", "자코모::2026-09::report", "jakomo::2026-10::report", "자코모::2026-100::report"]) {
  assert.equal((await linkCall({...linkInput,performanceLink:{...linkInput.performanceLink,sourceFamily}})).status,403);
}
assert.equal((await linkCall({...linkInput,month:"2026-09",performanceLink:null})).status,403);
const foreign = {...structuredClone(linkFixture),id:randomUUID(),advertiser_id:"other-advertiser"};
rows.report_imports.push(foreign);
assert.equal((await linkCall({...linkInput,importId:foreign.id})).status,404);
rows.report_imports.pop();
const oldProof=linkFixture.metadata.bundle.placementProof;
for (const proof of [undefined, {...oldProof,month:"2026-09"}, {...oldProof,creativeName:""}, {...oldProof,creativeName:{}}]) {
  linkFixture.metadata.bundle.placementProof=proof;
  assert.equal((await linkCall()).status,proof && proof.month === "2026-10" ? 400 : 403);
}
linkFixture.metadata.bundle.placementProof=oldProof;
assert.equal(stable(),unchanged);
const before=structuredClone(linkFixture), factsBefore=JSON.stringify(Object.fromEntries(Object.entries(rows).filter(([table]) => !["report_imports","workspace_activity"].includes(table))));
const writeStart=writes.length, importCount=rows.report_imports.length, auditCount=rows.workspace_activity.length;
let linkedResponse=await linkCall({...linkInput,advertiser:"jakomo"});
assert.equal(linkedResponse.status,200);
let linkedPayload=await linkedResponse.json();
assert.deepEqual(linkedPayload.proof.performanceLink,linkInput.performanceLink);
assert.equal(linkedPayload.proof.importId,linkFixture.id);
assert.equal(linkedPayload.proof.publishedAt,linkFixture.updated_at);
assert.notEqual(linkFixture.updated_at,before.updated_at);
const expected=structuredClone(before);
expected.metadata.bundle.placementProof.performanceLink=linkInput.performanceLink;
expected.updated_by="fixture@example.com"; expected.updated_at=linkFixture.updated_at;
assert.equal(JSON.stringify(linkFixture),JSON.stringify(expected));
assert.equal(rows.report_imports.length,importCount);
assert.equal(rows.workspace_activity.length,auditCount+1);
assert.equal(rows.workspace_activity.at(-1).action,"creative_link_saved");
assert.equal(factsBefore,JSON.stringify(Object.fromEntries(Object.entries(rows).filter(([table]) => !["report_imports","workspace_activity"].includes(table)))));
assert.deepEqual(writes.slice(writeStart).map(({table,mode}) => [table,mode]),[["report_imports","update"],["workspace_activity","insert"]]);
assert.deepEqual(Object.keys(writes[writeStart].payload).sort(),["metadata","updated_at","updated_by"]);
unchanged=stable();
assert.equal((await linkCall(linkInput)).status,409); // a second writer using the original token loses
assert.equal(stable(),unchanged);
concurrent=true;
assert.equal((await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,performanceLink:null})).status,409);
assert.equal(stable(),unchanged); concurrent=false;
access="owner";
const clearResponse=await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,performanceLink:null});
assert.equal(clearResponse.status,200);
const clearPayload=await clearResponse.json();
assert.equal(clearPayload.proof.performanceLink,null);
assert.equal(linkFixture.metadata.bundle.placementProof.performanceLink,null);
assert.equal(clearPayload.proof.publishedAt,linkFixture.updated_at);
const afterClear=structuredClone(linkFixture); delete afterClear.metadata.bundle.placementProof.performanceLink;
afterClear.updated_at=before.updated_at; afterClear.updated_by=before.updated_by;
assert.equal(JSON.stringify(afterClear),JSON.stringify(before));
console.log("Creative-link Edge checks passed: verified active editors/owners, viewer/unknown-user denial, strict schemas, namespace and advertiser/month isolation, missing/stale IDs, null clear, complete metadata/source/facts preservation and concurrent conflict.");

// Operation statement and link share one metadata CAS; proof evidence fields never change.
const operationBefore=structuredClone(linkFixture), operationAuditBefore=rows.workspace_activity.length;
const statement={status:"집행 중",asOf:"2026-10-23",note:"AE report only\nSecond line\r\nThird line\tindented"};
const operationReply=await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation:statement});
assert.equal(operationReply.status,200);
assert.deepEqual((await operationReply.json()).proof.operation,statement);
const operationExpected=structuredClone(operationBefore);
operationExpected.metadata.bundle.placementProof.operation=statement;
operationExpected.metadata.bundle.placementProof.performanceLink=linkInput.performanceLink;
operationExpected.updated_at=linkFixture.updated_at;
assert.equal(JSON.stringify(linkFixture),JSON.stringify(operationExpected));
assert.equal(rows.workspace_activity.length,operationAuditBefore+1);
for (const operation of [{...statement,status:"unknown"},{...statement,asOf:"bad"},{...statement,asOf:"2026-02-30"},
  {...statement,note:"bad\u000bname"},{...statement,unknown:true}]) {
  const untouched=stable();
  assert.equal((await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation})).status,400);
  assert.equal(stable(),untouched);
}
const clearOperation=await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation:null});
assert.equal(clearOperation.status,200);
assert.equal((await clearOperation.json()).proof.operation,null);
operationExpected.metadata.bundle.placementProof.operation=null;
operationExpected.updated_at=linkFixture.updated_at;
assert.equal(JSON.stringify(linkFixture),JSON.stringify(operationExpected));
console.log("Report-only operation Edge checks passed: omitted preserves, explicit update/clear, invalid values denied, metadata CAS and independent evidence/source/fact preservation.");

// Existing manual edits already merge previous proof fields. Verify both non-null annotations survive.
access="editor";
let annotationReply=await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation:statement});
assert.equal(annotationReply.status,200);
const manualEditReply=await call({advertiser:"자코모",month:"2026-10",importId:linkFixture.id,expectedUpdatedAt:linkFixture.updated_at,
  media:"네이버",placement:"피드",creativeName:"named proof creative",status:"게재 확인",verificationDate:"2026-10-12"});
assert.equal(manualEditReply.status,200);
const manualEditProof=(await manualEditReply.json()).proof;
assert.deepEqual(manualEditProof.performanceLink,linkInput.performanceLink);
assert.deepEqual(manualEditProof.operation,statement);
// Publishing the same existing import still refreshes its source facts, not the omitted annotations.
const reimportBundle={advertiser:"자코모",reportDate:linkFixture.report_date,sourceFile:linkFixture.source_file,
  placements:[{platform:"네이버",placement:"피드",impressions:456}],dailyPerformance:[],creativeDailyPerformance:[],operationNotes:["fresh source note"],
  placementProof:{month:"2026-10",creativeName:"named proof creative",status:"확인 필요",verificationDate:"",sourceSummary:"fresh evidence"}};
// Publish matches the existing import by empty source_sheet, like all published bundles.
linkFixture.source_sheet="";
const totalImports=rows.report_imports.length;
assert.equal((await publish({action:"publish_bundle",bundle:reimportBundle})).status,200);
assert.equal(rows.report_imports.length,totalImports);
assert.equal(linkFixture.metadata.bundle.placementProof.status,"확인 필요");
assert.equal(linkFixture.metadata.bundle.placementProof.sourceSummary,"fresh evidence");
assert.equal(linkFixture.metadata.bundle.placements[0].impressions,456);
assert.equal(JSON.stringify(linkFixture.metadata.bundle.placementProof.performanceLink),JSON.stringify(linkInput.performanceLink));
assert.equal(JSON.stringify(linkFixture.metadata.bundle.placementProof.operation),JSON.stringify(statement));
// New action null clears stay cleared after another omitted-annotation reimport.
assert.equal((await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,performanceLink:null,operation:null})).status,200);
const withoutAnnotations=structuredClone(reimportBundle);
delete withoutAnnotations.placementProof.performanceLink; delete withoutAnnotations.placementProof.operation;
assert.equal((await publish({action:"publish_bundle",bundle:withoutAnnotations})).status,200);
assert.equal(linkFixture.metadata.bundle.placementProof.performanceLink,null);
assert.equal(linkFixture.metadata.bundle.placementProof.operation,null);
console.log("Annotation regression checks passed: existing manual edit and same-proof bundle reimport preserve omitted annotations; evidence/facts refresh independently; explicit null clears remain cleared.");
// End-to-end formatting roundtrip changes only allowed note/link leaves plus audit fields.
for (const note of ["First line\nSecond line", "First line\r\nSecond line\tindented", "First line\rSecond line"]) {
  const multilineBefore=structuredClone(linkFixture), multilineAudit=rows.workspace_activity.length;
  const multilineReply=await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation:{...statement,note}});
  assert.equal(multilineReply.status,200);
  const multilineProof=(await multilineReply.json()).proof;
  assert.equal(multilineProof.operation.note,note);
  assert.deepEqual(multilineProof.performanceLink,linkInput.performanceLink);
  const multilineExpected=structuredClone(multilineBefore);
  multilineExpected.metadata.bundle.placementProof.performanceLink=linkInput.performanceLink;
  multilineExpected.metadata.bundle.placementProof.operation={...statement,note};
  multilineExpected.updated_at=linkFixture.updated_at;
  multilineExpected.updated_by="fixture@example.com";
  assert.equal(JSON.stringify(linkFixture),JSON.stringify(multilineExpected));
  assert.equal(rows.workspace_activity.length,multilineAudit+1);
}
for (const note of ["bad\u0000memo", "bad\u000bmemo", "bad\u000cmemo", "bad\u001bmemo", "bad\u007fmemo", "bad\u0085memo", "bad\u009fmemo", "x".repeat(1000)+"\n"]) {
  const untouched=stable();
  assert.equal((await linkCall({...linkInput,expectedUpdatedAt:linkFixture.updated_at,operation:{...statement,note}})).status,400);
  assert.equal(stable(),untouched);
}
console.log("Operation textarea Edge checks passed: multiline memo plus link saves roundtrip without unrelated changes; unsupported controls and overlong notes cause no writes.");
