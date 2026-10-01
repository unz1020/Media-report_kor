import assert from "node:assert/strict";
import { chromium } from "playwright";

const rootUrl = "http://localhost:3000";
let response = await fetch(rootUrl + "/api/reporting/store", { method: "POST", headers: { origin: rootUrl, "content-type": "application/json" }, body: JSON.stringify({ action: "save_manual_proof" }) });
assert.equal(response.status, 401);
response = await fetch(rootUrl + "/api/reporting/store", { method: "POST", headers: { origin: "https://foreign.example", "content-type": "application/json" }, body: "{}" });
assert.equal(response.status, 403);
response = await fetch(rootUrl + "/api/reporting/proof-image", { method: "POST", headers: { origin: "https://foreign.example" } });
assert.equal(response.status, 403);

const browser = await chromium.launch({ headless: true });
let access = "editor";
let savedProof;
let saveCount = 0;
let imageCount = 0;
let failImage = false;
let failInsight = false;
let insightNotes = ["이전일 전체 상세", "일곱 번째도 모두 표시"];
let insightVersion = "2026-10-01T01:00:00Z";
const insightId = "11111111-1111-4111-8111-111111111111";
const planBundle = { advertiser: "자코모", sourceFile: "2026-10 운영안.xlsx", reportDate: "2026-10-01", campaignStart: "2026-10-01", campaignEnd: "2026-10-31", placements: [], parsedSheets: [], ignoredSheets: [], operationNotes: [], mailChecks: [], qa: {}, mediaPlan: [{ platform: "카카오", product: "카카오 피드", periodStart: "2026-10-01", periodEnd: "2026-10-31", creativeType: "이미지" }] };
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const json = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
await page.route("**/api/workspace", route => json(route, {
  user: { email: "fixture@example.com", display_name: "검증 계정", role: "ae" },
  advertisers: [{ id: "fixture-advertiser", name: "자코모", slug: "jakomo", accessLevel: access }],
  months: ["2026-09", "2026-10"],
}));
await page.route("**/api/reporting/store", async route => {
  const body = route.request().postDataJSON();
  if (body.action === "load_layout") return json(route, { layout: null, updatedAt: null });
  if (body.action === "load_state") {
    const imports = savedProof && savedProof.month === body.month ? [{
      id: savedProof.importId, report_date: savedProof.reportDate, updated_at: savedProof.publishedAt,
      metadata: { bundle: { placementProof: savedProof } },
    }] : [];
    if (body.month === "2026-10") imports.push(
      { id: "mail-a", report_date: "2026-10-01", updated_at: insightVersion, mail_date: "2026-10-01T01:00:00Z", metadata: { mailOnly: true } },
      { id: "plan", report_date: "2026-10-01", updated_at: "2026-10-01T01:00:00Z", metadata: { bundle: planBundle } }
    );
    return json(route, { imports, insights: body.month === "2026-10" ? [
      { id: insightId, import_id: "mail-a", report_date: "2026-10-01", subject: "첫째 날 운영", notes: insightNotes, created_at: "2026-10-01T01:00:00Z" },
      { id: "b", report_date: "2026-10-02", subject: "둘째 날 운영", notes: ["최근일 운영 상세"], created_at: "2026-10-02T01:00:00Z" },
      { id: "c", report_date: "2026-10-01", subject: "같은 날 추가 메일", notes: ["추가 매체 인사이트"], created_at: "2026-10-01T02:00:00Z" },
    ] : [] });
  }
  if (body.action === "save_insight") {
    assert.equal(access, "editor"); assert.equal(body.input.insightId, insightId);
    assert.equal(body.input.expectedUpdatedAt, insightVersion);
    if (failInsight) return json(route, { error: "INSIGHT_CHANGED" }, 409);
    insightNotes = body.input.notes; insightVersion = new Date().toISOString();
    return json(route, { ok: true });
  }
  assert.equal(body.action, "save_manual_proof");
  assert.equal(access, "editor");
  saveCount++;
  savedProof = {
    ...savedProof, ...body.input, advertiser: "자코모", importId: "fixture-proof",
    reportDate: body.input.month + "-01", sourceFile: "[manual-placement] fixture",
    publishedAt: new Date().toISOString(), attachments: [], serviceType: "디지털 사전 세팅",
    location: "", airingTime: "", dailyFrequency: null, durationSec: null, budgetReference: null,
  };
  return json(route, { ok: true, proof: savedProof });
});
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1S8AAAAASUVORK5CYII=", "base64");
await page.route("**/api/reporting/proof-image**", async route => {
  if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  imageCount++;
  const raw = route.request().postDataBuffer().toString();
  assert.ok(raw.includes('name="importId"'));
  assert.ok(raw.includes("fixture-proof"));
  if (failImage) return json(route, { error: "IMAGE_TEST_FAILURE" }, 500);
  savedProof.manualImagePath = "fixture-advertiser/image.png";
  savedProof.publishedAt = new Date().toISOString();
  return json(route, { ok: true, path: savedProof.manualImagePath, updatedAt: savedProof.publishedAt });
});
async function visible(locator) { await locator.waitFor({ state: "visible", timeout: 15000 }); }
async function chooseOctober() {
  await visible(page.getByLabel("조회 월 선택"));
  await page.getByLabel("조회 월 선택").selectOption("2026-10");
  await visible(page.getByText("DB 동기화 완료"));
}
try {
  await page.goto("http://localhost:3000/overview");
  await chooseOctober();
  await visible(page.getByRole("heading", { name: "2026-10-02 인사이트" }));
  await page.getByRole("button", { name: "2026-10-01", exact: true }).click();
  await visible(page.getByText("이전일 전체 상세", { exact: true }));
  await visible(page.getByText("추가 매체 인사이트", { exact: true }));
  const entry = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "첫째 날 운영" }) });
  await entry.getByRole("button", { name: "문구 수정", exact: true }).click();
  await entry.getByLabel("인사이트 문구", { exact: true }).fill("취소할 문구");
  await entry.getByRole("button", { name: "취소", exact: true }).click();
  assert.deepEqual(insightNotes, ["이전일 전체 상세", "일곱 번째도 모두 표시"]);
  await entry.getByRole("button", { name: "문구 수정", exact: true }).click();
  await entry.getByLabel("인사이트 문구", { exact: true }).fill("직접 수정한 상세\n\n두 번째 항목");
  failInsight = true;
  await entry.getByRole("button", { name: "인사이트 저장", exact: true }).click();
  await visible(entry.getByRole("alert"));
  assert.equal(await entry.getByLabel("인사이트 문구", { exact: true }).inputValue(), "직접 수정한 상세\n\n두 번째 항목");
  failInsight = false;
  await entry.getByRole("button", { name: "인사이트 저장", exact: true }).click();
  await visible(entry.getByText("직접 수정한 상세", { exact: true }));
  assert.deepEqual(insightNotes, ["직접 수정한 상세", "두 번째 항목"]);
  await page.reload(); await chooseOctober();
  await page.getByRole("button", { name: "2026-10-01", exact: true }).click();
  await visible(page.getByText("직접 수정한 상세", { exact: true }));
  await page.goto("http://localhost:3000/reports");
  await chooseOctober();
  await page.getByRole("button", { name: "2026-10-01", exact: true }).click();
  await visible(page.getByText("직접 수정한 상세", { exact: true }));
  await page.goto("http://localhost:3000/creative");
  await chooseOctober();
  await page.getByLabel("카카오 카카오 피드 이미지 등록", { exact: true }).setInputFiles({ name: "pending.png", mimeType: "image/png", buffer: pixel });
  await visible(page.getByAltText("등록할 지면 이미지 미리보기"));
  assert.equal(await page.getByLabel("매체", { exact: true }).inputValue(), "카카오");
  assert.equal(await page.getByLabel("상품 / 게재지면", { exact: true }).inputValue(), "카카오 피드");
  await page.getByRole("button", { name: "지면 저장", exact: true }).click();
  await page.getByRole("region", { name: "지면 수동 세팅" }).waitFor({ state: "hidden" });
  assert.equal(imageCount, 1); assert.equal(savedProof.status, "사전 세팅");
  assert.equal(await page.getByLabel("카카오 카카오 피드 이미지 등록", { exact: true }).count(), 0);
  await visible(page.getByAltText("카카오 피드 게재 확인 이미지"));
  savedProof = undefined; saveCount = 0; imageCount = 0;
  await page.reload(); await chooseOctober();
  await page.getByRole("button", { name: "지면 수동 등록", exact: true }).click();
  await page.getByLabel("매체", { exact: true }).fill("네이버 GFA");
  await page.getByLabel("상품 / 게재지면", { exact: true }).fill("모바일 피드");
  await page.getByLabel("소재명", { exact: true }).fill("10월 테스트 소재");
  await page.getByLabel("매체 미리보기 URL", { exact: true }).fill("https://example.com/preview");
  await page.getByLabel("랜딩 URL", { exact: true }).fill("https://example.com/product?item=1&utm_source=old#detail");
  await page.getByLabel("utm_source", { exact: true }).fill("naver");
  await page.getByLabel("utm_campaign", { exact: true }).fill("10월 캠페인");
  const finalLink = page.getByRole("link", { name: /https:\/\/example.com\/product/ });
  const url = new URL(await finalLink.getAttribute("href"));
  assert.equal(url.searchParams.get("item"), "1");
  assert.equal(url.searchParams.get("utm_source"), "naver");
  assert.equal(url.searchParams.get("utm_campaign"), "10월 캠페인");
  assert.equal(url.hash, "#detail");
  await page.getByLabel("미리보기 / 게재 이미지", { exact: true }).setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: pixel });
  await visible(page.getByAltText("등록할 지면 이미지 미리보기"));
  failImage = true;
  await page.getByRole("button", { name: "지면 저장", exact: true }).click();
  await visible(page.getByText("IMAGE_TEST_FAILURE", { exact: true }));
  assert.equal(saveCount, 1);
  assert.equal(savedProof.status, "사전 세팅");
  assert.equal(savedProof.utm.utm_source, "naver");
  await visible(page.getByRole("button", { name: "지면 저장", exact: true }));
  failImage = false;
  await page.getByRole("button", { name: "지면 저장", exact: true }).click();
  await page.getByRole("region", { name: "지면 수동 세팅" }).waitFor({ state: "hidden" });
  await visible(page.getByRole("heading", { name: "10월 테스트 소재", exact: true }));
  await visible(page.getByRole("link", { name: "매체 미리보기 열기 ↗", exact: true }));
  assert.equal(imageCount, 2);
  assert.equal(saveCount, 2);
  await page.getByRole("button", { name: "지면 · 랜딩 · UTM 수정", exact: true }).click();
  assert.equal(await page.getByLabel("utm_source", { exact: true }).inputValue(), "naver");
  await page.getByLabel("소재명", { exact: true }).fill("수정한 소재");
  await page.getByRole("button", { name: "지면 저장", exact: true }).click();
  await visible(page.getByRole("heading", { name: "수정한 소재", exact: true }));
  await page.getByRole("button", { name: "지면 · 랜딩 · UTM 수정", exact: true }).click();
  await page.getByLabel("조회 월 선택").selectOption("2026-09");
  await page.getByRole("region", { name: "지면 수동 세팅" }).waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("heading", { name: "수정한 소재", exact: true }).count(), 0);
  access = "viewer";
  await page.reload();
  await chooseOctober();
  assert.equal(await page.getByRole("button", { name: "지면 수동 등록", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "지면 · 랜딩 · UTM 수정", exact: true }).count(), 0);
  await visible(page.getByRole("heading", { name: "수정한 소재", exact: true }));
  await page.goto("http://localhost:3000/overview"); await chooseOctober();
  await page.getByRole("button", { name: "2026-10-01", exact: true }).click();
  await visible(page.getByText("직접 수정한 상세", { exact: true }));
  assert.equal(await page.getByRole("button", { name: "문구 수정", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: insight edit/cancel/conflict/persistence, pending placement image, history, mail-only insights, pre-setup, UTM, image failure/retry, edit, month isolation, viewer.");
} catch (error) {
  console.error("Browser state:", await page.locator("body").innerText());
  console.error("Browser errors:", errors);
  throw error;
} finally { await browser.close(); }
