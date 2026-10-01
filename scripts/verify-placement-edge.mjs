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
let access = "editor", verified = true, active = true, concurrent = false;
let handler;
const rows = { workspace_users: [{ email: "fixture@example.com", role: "ae", is_active: true }],
  advertisers: [{ id: "fixture-advertiser", name: "자코모", slug: "jakomo", is_active: true }],
  workspace_user_advertisers: [{ email: "fixture@example.com", advertiser_id: "fixture-advertiser", access_level: "editor" }],
  report_imports: [], workspace_activity: [] };
class Query {
  constructor(table) { this.table = table; this.filters = []; this.mode = "select"; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  insert(payload) { this.mode = "insert"; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload) { this.mode = "update"; this.payload = payload; return this; }
  async result(single) {
    if (this.table === "workspace_user_advertisers") rows[this.table][0].access_level = access;
    if (this.table === "workspace_users") rows[this.table][0].is_active = active;
    const list = rows[this.table] || [];
    let matches = list.filter(row => this.filters.every(filter => filter(row)));
    if (this.mode === "insert") {
      matches = this.payload.map(row => ({ id: randomUUID(), ...row }));
      list.push(...matches);
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
  exports: {}, require: name => name === "./placement-input.ts" ? validation.exports : { createClient: () => ({ from: table => new Query(table) }) },
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
verified = false; assert.equal((await call(base)).status, 500); verified = true;
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
console.log("Edge handler checks passed: authentication, active user, viewer denial, allowlisted input, create/edit, image preservation, scope and concurrency.");
