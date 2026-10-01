import assert from "node:assert/strict";
import { chromium } from "playwright";
const rootUrl = process.env.REPORTING_TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const layouts = new Map();
let access = "editor", conflict = false, failLoad = false, saveCount = 0;
const json = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
await page.route("**/api/workspace", route => {
  if (route.request().method() === "POST") return json(route, { members: [], activity: [] });
  return json(route, { user: { email: "fixture@example.com", display_name: "검증 계정", role: "admin" }, advertisers: [
    { id: "fixture-a", name: "자코모", slug: "jakomo", accessLevel: access },
    { id: "fixture-b", name: "교원웰스", slug: "kyowon-wells", accessLevel: access },
  ], months: ["2026-09", "2026-10"] });
});
await page.route("**/api/gmail/status", route => json(route, { connected: false }));
await page.route("**/api/reporting/store", route => {
  const body = route.request().postDataJSON();
  if (body.action === "load_layout") {
    if (failLoad) return json(route, { error: "LOAD_TEST_FAILURE" }, 500);
    return json(route, layouts.get(body.advertiser + ":" + body.page) || { layout: null, updatedAt: null });
  }
  if (body.action === "save_layout") {
    assert.equal(access, "editor");
    if (conflict) return json(route, { error: "LAYOUT_CHANGED" }, 409);
    const key = body.input.advertiser + ":" + body.input.page;
    assert.equal(body.input.expectedUpdatedAt, layouts.get(key)?.updatedAt || null);
    const saved = { layout: body.input.layout, updatedAt: new Date().toISOString() };
    layouts.set(key, saved); saveCount++;
    return json(route, saved);
  }
  assert.equal(body.action, "load_state");
  const date = body.month + "-01";
  const fact = { platform: "네이버 GFA", placement: "피드", sourceSheet: "Summary", impressions: 100, clicks: 5, ctr: 5, spend: 500, guaranteed: "100", achievement: 100 };
  const bundle = { advertiser: body.advertiser, sourceFile: body.month + " 리포트.xlsx", reportDate: date, campaignStart: date, campaignEnd: body.month + "-28", placements: [fact], parsedSheets: ["Summary"], ignoredSheets: [], operationNotes: ["운영 인사이트"], dailyPerformance: [], mailChecks: [], qa: {}, mediaPlan: [{ platform: "네이버 GFA", product: "피드", placement: "피드", periodStart: date, periodEnd: body.month + "-28", budget: 1000, creativeType: "이미지", sourceSheet: "운영안" }] };
  return json(route, { imports: [{ id: "fixture-import", report_date: date, updated_at: "2026-10-01T00:00:00Z", metadata: { bundle } }], insights: [{ id: "fixture-insight", import_id: "fixture-import", report_date: date, subject: "데일리 메일", notes: ["운영 인사이트"], created_at: "2026-10-01T00:00:00Z" }] });
});
const panelIds = () => page.locator('[data-layout-page="overview"] > [data-layout-panel]').evaluateAll(nodes => nodes.map(node => node.dataset.layoutPanel));
async function visible(locator) { await locator.waitFor({ state: "visible", timeout: 15000 }); }
async function edit() { const button = page.getByRole("button", { name: "화면 편집", exact: true }); await visible(button); await button.click(); await visible(page.getByRole("button", { name: "배치 저장", exact: true })); }
async function save() { await page.getByRole("button", { name: "배치 저장", exact: true }).click(); await visible(page.getByRole("button", { name: "화면 편집", exact: true })); }
try {
  await page.goto(rootUrl + "/overview");
  await visible(page.getByText("DB 동기화 완료", { exact: true }));
  await edit();
  const original = await panelIds();
  assert.equal(original.length, 9);
  const budget = page.getByRole("button", { name: "월 예산 이동", exact: true });
  const spend = page.getByRole("button", { name: "집행액 이동", exact: true });
  const a = await budget.boundingBox(), b = await spend.boundingBox();
  await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 8, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
  let ids = await panelIds();
  assert.ok(ids.indexOf("overview:월 예산:4") < ids.indexOf("overview:집행액:3"));
  await page.getByRole("button", { name: "미디어 운영안 이동", exact: true }).press("Home");
  await page.getByLabel("미디어 운영안 너비", { exact: true }).selectOption("30");
  await page.getByLabel("데일리 인사이트 너비", { exact: true }).selectOption("30");
  ids = await panelIds(); assert.equal(ids[0], "overview:미디어 운영안:9");
  const planRect = await page.locator('[data-layout-panel="overview:미디어 운영안:9"]').boundingBox();
  const insightRect = await page.locator('[data-layout-panel="overview:데일리 인사이트:1"]').boundingBox();
  assert.ok(Math.abs(planRect.y - insightRect.y) < 2); assert.ok(planRect.x < insightRect.x);
  conflict = true;
  await page.getByRole("button", { name: "배치 저장", exact: true }).click();
  await visible(page.locator("p[role=alert]"));
  assert.deepEqual(await panelIds(), ids); assert.equal(saveCount, 0);
  conflict = false; await save(); assert.equal(saveCount, 1);
  await page.reload(); await edit();
  assert.deepEqual(await panelIds(), ids);
  await page.screenshot({ path: "/tmp/media-layout-desktop.png", fullPage: true });
  assert.equal(await page.getByLabel("미디어 운영안 너비", { exact: true }).inputValue(), "30");
  await page.getByRole("button", { name: "기본 배치", exact: true }).click();
  assert.deepEqual(await panelIds(), original);
  await page.getByRole("button", { name: "배치 취소", exact: true }).click();
  await visible(page.getByRole("button", { name: "화면 편집", exact: true }));
  assert.deepEqual(await panelIds(), ids); assert.equal(saveCount, 1);
  await page.getByLabel("조회 월 선택").selectOption("2026-09");
  await visible(page.getByText("DB 동기화 완료", { exact: true }));
  assert.deepEqual(await panelIds(), ids);
  await edit(); await page.getByLabel("광고주 선택").selectOption("kyowon");
  await visible(page.getByRole("button", { name: "화면 편집", exact: true }));
  assert.deepEqual(await panelIds(), original);
  assert.equal(await page.getByRole("button", { name: "배치 저장", exact: true }).count(), 0);
  await page.getByLabel("광고주 선택").selectOption("jacomo");
  await edit(); await page.getByRole("button", { name: "배치 취소", exact: true }).click();
  assert.deepEqual(await panelIds(), ids);
  for (const route of ["performance", "schedule", "creative", "reports", "data-update", "team"]) {
    await page.goto(rootUrl + "/" + route); await edit();
    assert.ok(await page.locator(`[data-layout-page="${route}"] > [data-layout-panel]`).count() > 0);
    if(route === "data-update") await visible(page.getByLabel("데일리 리포트 메일 수신일"));
    await page.getByRole("button", { name: "배치 취소", exact: true }).click();
  }
  access = "viewer"; await page.goto(rootUrl + "/overview");
  await visible(page.getByText("DB 동기화 완료", { exact: true }));
  assert.equal(await page.getByRole("button", { name: "화면 편집", exact: true }).count(), 0);
  assert.deepEqual(await panelIds(), ids);
  await page.setViewportSize({ width: 390, height: 844 });
  const rectangles = await page.locator('[data-layout-page="overview"] > [data-layout-panel]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  assert.ok(rectangles.every(width => Math.abs(width - rectangles[0]) < 2));
  access = "editor"; failLoad = true; await page.reload();
  await visible(page.locator("p[role=alert]"));
  assert.ok(await page.getByRole("button", { name: "화면 편집", exact: true }).isDisabled());
  failLoad = false; await page.getByRole("button", { name: "배치 다시 불러오기", exact: true }).click();
  await edit(); await page.getByRole("button", { name: "기본 배치", exact: true }).click(); await save();
  assert.deepEqual(await panelIds(), original);
  await page.reload(); await visible(page.getByText("운영 인사이트", { exact: true }));
  assert.deepEqual(await panelIds(), original);
  assert.deepEqual(errors, []);
  console.log("Layout UI checks passed: drag, keyboard, side-by-side widths, save/reload, cancel/reset, conflicts, advertiser/page/month isolation, all seven pages, shared viewer layout and mobile widths.");
} catch (error) { console.error(await page.locator("body").innerText()); console.error(errors); throw error; }
finally { await browser.close(); }
