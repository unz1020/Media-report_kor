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
let access = "editor", verified = true, active = true, concurrent = false;
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
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload) { this.mode = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  delete() { this.mode = "delete"; return this; }
  update(payload) { this.mode = "update"; this.payload = payload; return this; }
  async result(single) {
    if (this.table === "workspace_user_advertisers") rows[this.table][0].access_level = access;
    if (this.table === "workspace_users") rows[this.table][0].is_active = active;
    const list = rows[this.table] ||= [];
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
  exports: {}, require: name => name === "./media-plan-input.ts" ? mediaValidation.exports : name === "./placement-input.ts" ? validation.exports : name === "./insight-input.ts" ? insightValidation.exports : name === "./layout-input.ts" ? layoutValidation.exports : { createClient: () => ({ from: table => new Query(table), rpc: async (name, args) => { assert.ok(["edit_daily_insight", "save_dashboard_layout"].includes(name)); assert.equal(args.caller_email, "fixture@example.com"); assert.equal(args.advertiser_id_input, "fixture-advertiser"); return { data: { updatedAt: "2026-10-01T05:00:00Z" }, error: rpcError ? { message: rpcError } : null }; } }) },
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
