import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root = process.env.REPORTING_TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let access = 'editor', conflict = false, saves = 0;
let version = '2026-10-01T01:00:00Z';
const base = { creativeType: '15초', device: '', periodStart: '2026-10-01', periodEnd: '2026-10-31', budget: 100, expectedImpressions: null, expectedClicks: null, target: '', sourceSheet: 'Summary', operationStatus: '예정' };
let rows = [
 { ...base, rowId: '11111111-1111-4111-8111-111111111111', category: 'TV', platform: 'MBC', product: 'TV 광고', placement: 'MBC', creativeName: '지상파 정성편' },
 { ...base, rowId: '22222222-2222-4222-8222-222222222222', category: 'TV', platform: 'tvN', product: 'TV 광고', placement: 'tvN', creativeName: '케이블 정성편' },
 { ...base, rowId: '33333333-3333-4333-8333-333333333333', platform: '유튜브', product: 'VRC', placement: '인스트림', creativeName: '유튜브 정성편', creativeUrl: 'https://youtu.be/M7lc1UVf-VE' },
 { ...base, rowId: '44444444-4444-4444-8444-444444444444', platform: '틱톡', product: 'Feed 영상', placement: '피드', creativeName: '틱톡 정성편', creativeUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173' },
 { ...base, rowId: '55555555-5555-4555-8555-555555555555', platform: '네이버', product: 'GFA', placement: '피드', creativeName: '유튜브 정성편' },
 { ...base, rowId: '66666666-6666-4666-8666-666666666666', platform: '네이버', product: '브랜드검색', placement: 'MO', creativeName: '프로모션편' },
];
const review = { summarySheet: 'Summary', summaryTotal: 600, checks: [], inventory: [{ name: 'Summary', kind: 'Summary' }], groups: [] };
const bundle = () => ({ advertiser: '자코모', sourceFile: '[media-mix] 2026-10', originalSourceFile: '운영안.xlsx', sourceKind: 'media_mix', reportDate: '2026-10-01', placements: [], daily: [], creativeDaily: [], mediaPlan: rows, mediaMixSourceReview: review, parsedSheets: [], ignoredSheets: [], operationNotes: [], mailChecks: [], qa: {} });
const json = (r, b, status=200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
await page.route('**/api/workspace', r => json(r, { user: { email: 'fixture@example.com', display_name: '검증', role: 'ae' }, advertisers: [{ id: 'fixture', name: '자코모', slug: 'jacomo', accessLevel: access }], months: ['2026-10', '2026-09'] }));
await page.route('**/api/reporting/store', r => {
 const b = r.request().postDataJSON();
 if (b.action === 'load_layout') return json(r, { layout: null, updatedAt: null });
 if (b.action === 'load_state') return json(r, { imports: b.month === '2026-10' ? [{ id: 'fixture-mix', report_date: '2026-10-01', updated_at: version, metadata: { bundle: bundle() } }] : [], insights: [] });
 if (b.action === 'save_media_mix') {
  assert.equal(access, 'editor'); assert.equal(b.input.expectedUpdatedAt, version);
  assert.equal(b.input.rows.length, 6); assert.equal(b.input.rows.reduce((s, r) => s + r.budget, 0), 600);
  assert.deepEqual(b.input.sourceReview, review); assert.equal(b.input.sourceFile, '운영안.xlsx');
  if (conflict) return json(r, { error: 'MEDIA_MIX_CHANGED' }, 409);
  rows = b.input.rows; version = new Date().toISOString(); saves++; return json(r, { ok: true });
 }
 if (b.action === 'load_media_mix_history') return json(r, { history: [] });
 throw new Error('Unexpected action ' + b.action);
});
await page.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<p>Video fixture</p>' }));
await page.route('https://www.tiktok.com/player/**', r => r.fulfill({ contentType: 'text/html', body: '<p>Video fixture</p>' }));
const visible = l => l.waitFor({ state: 'visible', timeout: 15000 });
async function october() { await visible(page.getByLabel('조회 월 선택')); await page.getByLabel('조회 월 선택').selectOption('2026-10'); await page.getByText('DB 동기화 완료').waitFor({state:'attached',timeout:15000}); }
try {
 await page.goto(root + '/schedule'); await october();
 const tree = page.getByLabel('매체 상품 소재 분류');
 await visible(tree.locator('summary').filter({ hasText: /^TV$/ })); await visible(tree.locator('summary').filter({ hasText: /^지상파$/ })); await visible(tree.locator('summary').filter({ hasText: /^케이블$/ }));
 const cable = page.getByRole('switch', { name: 'tvN TV 광고 캘린더 표시' }); await cable.click(); assert.equal(await cable.getAttribute('aria-checked'), 'false'); assert.equal(await page.getByRole('switch', { name: 'MBC TV 광고 캘린더 표시' }).getAttribute('aria-checked'), 'true');
 const tv = page.getByRole('switch', { name: 'TV 전체 캘린더 표시', exact: true });
 assert.equal(await tv.innerText(), '일부 ON');
 const nav = page.getByRole('switch', { name: '네이버 전체 캘린더 표시', exact: true });
 await tv.click(); assert.equal(await tv.getAttribute('aria-checked'), 'false');
 assert.equal(await page.getByRole('switch', { name: 'MBC TV 광고 캘린더 표시' }).getAttribute('aria-checked'), 'false');
 assert.equal(await nav.getAttribute('aria-checked'), 'true');
 await page.reload(); await october(); assert.equal(await tv.getAttribute('aria-checked'), 'false');
 await tv.focus(); await page.keyboard.press('Space'); assert.equal(await tv.getAttribute('aria-checked'), 'true');
 assert.equal(await cable.getAttribute('aria-checked'), 'true');
 await nav.click();
 for (const name of ['네이버 GFA 캘린더 표시', '네이버 브랜드검색 캘린더 표시']) assert.equal(await page.getByRole('switch', {name, exact:true}).getAttribute('aria-checked'),'false');
 await page.getByRole('button', { name: '2026-10-01 일정 보기', exact: true }).click();
 const details = page.locator('[data-layout-panel="schedule:day-details"]');
 assert.equal(await details.getByRole('button', {name:/네이버/}).count(),0);
 await nav.click(); assert.equal(await details.getByRole('button', {name:/네이버/}).count(),2);
 const marker = details.getByRole('button', {name:/유튜브 › VRC/}).locator('[data-creative-key]');
 const identity = {emoji:await marker.innerText(), color:await marker.getAttribute('data-creative-color')};
 assert.ok(identity.emoji); assert.match(identity.color,/^#[a-f0-9]{6}$/i);
 const identities=await details.locator('[data-creative-key]').evaluateAll(nodes=>nodes.map(node=>[node.dataset.creativeKey,node.dataset.creativeColor,node.textContent]));
 const unique=new Map(identities.map(([name,color,emoji])=>[name,`${color}:${emoji}`]));
 assert.equal(new Set(unique.values()).size,unique.size,'Fixture materials have distinct markers');
 const duplicate=identities.filter(([name])=>name==='유튜브 정성편');assert.equal(duplicate.length,2);assert.deepEqual(duplicate[0],duplicate[1]);
 await page.getByRole('button', { name: '전체 OFF', exact:true }).click();assert.equal(await details.getByRole('button').count(),0);
 await page.getByRole('button', { name: '전체 ON', exact:true }).click();assert.equal(await details.getByRole('button').count(),6);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'/tmp/category-calendar-mobile.png',fullPage:true});await page.setViewportSize({width:1400,height:1000});
 assert.equal(saves,0,'Calendar visibility never writes media operations');

 const daily = page.locator('[data-layout-panel="schedule:day-details"]');
 await daily.getByRole('button', { name: /유튜브 › VRC/ }).click();
 const selected = page.locator('[data-layout-panel="schedule:selected-product"]');
 await selected.getByRole('button', { name: '유튜브 미리보기', exact: true }).click(); assert.ok((await selected.locator('iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/'));
 await selected.getByRole('button', { name: '소재 URL 수정', exact: true }).click();
 const form = selected.getByRole('form', { name: '운영안 소재 URL 편집' });
 await form.getByLabel('매체 지면 미리보기 URL', { exact: true }).fill('https://example.com/ad-preview');
 await form.getByLabel('운영 소재 URL', { exact: true }).fill('https://www.youtube.com/shorts/M7lc1UVf-VE');
 conflict = true; await form.getByRole('button', { name: '소재 URL 저장' }).click(); await visible(form.getByRole('alert')); assert.equal(await form.getByLabel('운영 소재 URL', { exact: true }).inputValue(), 'https://www.youtube.com/shorts/M7lc1UVf-VE');
 conflict = false; await form.getByRole('button', { name: '소재 URL 저장' }).click(); await form.waitFor({ state: 'hidden' }); assert.equal(saves, 1);
 assert.equal(rows[2].previewUrl, 'https://example.com/ad-preview'); assert.equal(rows[3].creativeUrl, 'https://www.tiktok.com/@scout2015/video/6718335390845095173');
 await page.goto(root + '/creative'); await october();
 const cards = page.locator('[data-layout-panel="creative:plan-urls"]');
 const yt = cards.locator('article').filter({hasText:'유튜브 › VRC'});
 await visible(yt.getByRole('heading', { name: '유튜브 정성편', exact: true }));
 assert.equal(await yt.locator('h3 [data-creative-key]').innerText(),identity.emoji);assert.equal(await yt.locator('h3 [data-creative-key]').getAttribute('data-creative-color'),identity.color);
 assert.equal(await yt.getByRole('link', { name: '매체 지면 미리보기 열기 ↗', exact: true }).getAttribute('href'), 'https://example.com/ad-preview');
 await yt.getByRole('button', { name: '유튜브 미리보기', exact: true }).click(); assert.ok((await yt.locator('iframe').getAttribute('src')).includes('/embed/M7lc1UVf-VE'));
 const tt = cards.locator('article').filter({ has: page.getByRole('heading', { name: '틱톡 정성편', exact: true }) }); await tt.getByRole('button', { name: '틱톡 미리보기', exact: true }).click(); assert.ok((await tt.locator('iframe').getAttribute('src')).includes('/player/v1/6718335390845095173'));
 await yt.getByRole('button', { name: '소재 URL 수정' }).click(); await yt.getByLabel('운영 소재 URL', { exact: true }).fill(''); await yt.getByRole('button', { name: '소재 URL 저장' }).click(); await yt.getByRole('form').waitFor({ state: 'hidden' }); assert.equal(rows[2].creativeUrl, undefined); assert.equal(saves, 2);
 await page.reload(); await october(); assert.equal(await cards.locator('article').filter({hasText:'유튜브 › VRC'}).getByRole('button', { name: '유튜브 미리보기', exact: true }).count(), 0);
 await cards.getByRole('button', { name: 'TV', exact: true }).click(); assert.equal(await cards.locator('article').count(), 2);
 await cards.getByRole('button', { name: '전체', exact: true }).click();
 await page.screenshot({path:'/tmp/tv-preview-desktop.png',fullPage:true});
 await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No mobile overflow');
 await page.screenshot({path:'/tmp/tv-preview-mobile.png',fullPage:true});
 access = 'viewer'; await page.reload(); await october(); assert.equal(await cards.getByRole('button', { name: /소재 URL (등록|수정)/ }).count(), 0); await cards.locator('article').filter({ has: page.getByRole('heading', { name: '틱톡 정성편', exact: true }) }).getByRole('button', { name: '틱톡 미리보기', exact: true }).click();
 await page.goto(root+'/schedule');await october();await tv.click();await page.getByLabel('조회 월 선택').selectOption('2026-09');await page.getByLabel('조회 월 선택').selectOption('2026-10');await visible(tv);assert.equal(await tv.getAttribute('aria-checked'),'false');await page.goto(root+'/creative');await october();
 await page.getByLabel('조회 월 선택').selectOption('2026-09'); await cards.waitFor({ state: 'hidden' });
 assert.deepEqual(errors, []);
 console.log('TV and URL UI passed: nested TV categories, category bulk toggles/persistence/keyboard/month isolation, distinct shared material emojis/colors, independent product toggles, URL edit/conflict/save, preserved budgets/source archive/other materials, gallery sync, embeds, URL deletion/reload, TV filter, mobile, viewer and month isolation.');
} catch (error) { console.error(await page.locator('body').innerText()); throw error; }
finally { await browser.close(); }
