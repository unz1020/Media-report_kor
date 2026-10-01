import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
async function moduleFrom(path) {
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}
const { landingWithUtm, safeHttpUrl } = await moduleFrom("lib/placement-urls.ts");
const { normalizePlacementInput } = await moduleFrom("supabase/functions/reporting-store/placement-input.ts");
const result = new URL(landingWithUtm("https://example.com/product?item=1&utm_source=old#detail", { utm_source: "naver", utm_campaign: "10월 캠페인", utm_content: "a&b" }));
assert.equal(result.searchParams.get("item"), "1");
assert.equal(result.searchParams.getAll("utm_source").length, 1);
assert.equal(result.searchParams.get("utm_source"), "naver");
assert.equal(result.searchParams.get("utm_campaign"), "10월 캠페인");
assert.equal(result.searchParams.get("utm_content"), "a&b");
assert.equal(result.hash, "#detail");
assert.equal(landingWithUtm("https://example.com/?utm_source=existing", {}).includes("utm_source=existing"), true);
assert.throws(() => landingWithUtm("", { utm_source: "naver" }));
for (const value of ["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com"]) assert.throws(() => safeHttpUrl(value));
const base = { month: "2026-10", media: "네이버 GFA", placement: "모바일 피드", status: "사전 세팅", landingUrl: "https://example.com", utm: { utm_source: "naver", unknown: "ignored" } };
assert.equal(normalizePlacementInput(base).status, "사전 세팅");
assert.deepEqual(normalizePlacementInput(base).utm, { utm_source: "naver" });
for (const input of [
  { month: "2026-13" }, { media: "" }, { status: "게재 확인" },
  { periodStart: "2026-02-30" }, { periodStart: "2026-10-10", periodEnd: "2026-10-01" },
  { previewUrl: "javascript:alert(1)" }, { landingUrl: "" }, { utm: { utm_source: "x".repeat(501) } },
]) assert.throws(() => normalizePlacementInput({ ...base, ...input }));
assert.equal(normalizePlacementInput({ ...base, status: "게재 확인", verificationDate: "2026-10-01" }).verificationDate, "2026-10-01");
console.log("Placement validation and UTM checks passed.");
