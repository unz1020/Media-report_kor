import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// CI-only native Playwright regression. All reporting/workspace requests and proof
// images are synthetic; no persisted browser profile or customer fixtures are used.
const root = (process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const origin = new URL(root).origin;
const advertiser = '자코모', month = '2030-01';
const sourceFamily = '자코모::2030-01::rotation-fixture';
const placement = '모바일 배너';
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const baseBundle = {
  advertiser, sourceId: 'rotation-fixture', sourceFile: '=rotation-fixture.xlsx',
  reportDate: '2030-01-04', campaignStart: '2030-01-01', campaignEnd: '2030-01-31',
  placements: [], dailyPerformance: [], creativeDailyPerformance: [], mediaPlan: [],
  operationNotes: [], mailChecks: [], parsedSheets: ['Synthetic'], ignoredSheets: [],
  qa: { mismatchedMailMetrics: 0, unmatchedMailMetrics: 0 },
};
const creativeRows = date => ['소재A', '소재B'].map((creative, index) => ({
  date, platform: '직방', placement, creative, impressions: 1500,
  clicks: index ? 30 : 10, spend: null, ctr: 99, sourceSheet: 'Synthetic daily',
}));
const parentFact = { platform: '직방', placement, impressions: 6000, clicks: 80,
  spend: 900, ctr: null, achievement: null, guaranteed: '', sourceSheet: 'Synthetic placement' };
const imports = [1, 4].map(day => ({
  id: uuid(day), report_date: `2030-01-0${day}`, updated_at: `2030-01-0${day}T12:00:00.000Z`,
  metadata: { bundle: { ...clone(baseBundle), reportDate: `2030-01-0${day}`,
    sourceFile: `=rotation-fixture-${day}.xlsx`, placements: [clone(parentFact)],
    creativeDailyPerformance: day === 1 ? creativeRows('2030-01-01') : [...creativeRows('2030-01-01'), ...creativeRows('2030-01-04')],
  } },
}));
const baseProof = {
  advertiser, month, reportDate: '2030-01-04', verificationDate: '2030-01-02',
  media: '직방', placement, campaignName: 'Synthetic rotation', serviceType: '게재보고',
  periodStart: '2030-01-01', periodEnd: '2030-01-31', location: '', airingTime: '',
  dailyFrequency: null, durationSec: null, budgetReference: null, status: '게재 확인',
  messageId: '', mailSubject: 'Synthetic only', mailDate: '2030-01-04',
  sourceFile: 'synthetic-proof.pdf', sourceSummary: 'Synthetic only', attachments: [],
};
const proofs = [
  { ...baseProof, creativeName: '기획전', manualImagePath: 'fixture/zigbang-sale.svg', operation: { status: '중단', asOf: '2030-01-03', note: 'Synthetic stopped report' } },
  { ...baseProof, creativeName: '브랜드', manualImagePath: 'fixture/zigbang-brand.svg' },
  ...['A', 'B'].map(creativeName => ({ ...baseProof, media: '네이버', placement: 'PC 배너', creativeName, manualImagePath: `fixture/naver-${creativeName}.svg` })),
];
proofs.forEach((proof, index) => imports.push({ id: uuid(10 + index), report_date: proof.reportDate,
  updated_at: '2030-01-04T13:00:00.000Z', metadata: { bundle: { ...clone(baseBundle), sourceId: `proof-${index}`, placementProof: clone(proof) } } }));
const original = clone(imports);
const stripEditable = records => records.map(record => {
  const copy = clone(record);
  if (copy.metadata.bundle.placementProof) {
    delete copy.updated_at;
    delete copy.metadata.bundle.placementProof.performanceLink;
    delete copy.metadata.bundle.placementProof.operation;
  }
  return copy;
});
const errors = [], writes = [], unexpected = [], reads = [];
let access = 'editor', conflictNext = false, savedVersion = 0, proofOnly = false;
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    // Only this disposable context's synthetic account preferences are populated.
    localStorage.setItem('media-report-month:fixture@example.test', '2030-01');
    localStorage.setItem('media-report-advertiser:fixture@example.test', 'jacomo');
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === '/api/workspace') {
      assert.equal(request.method(), 'GET');
      return json(route, { user: { email: 'fixture@example.test', display_name: 'Synthetic', role: access === 'viewer' ? 'advertiser' : 'ae' },
        advertisers: [{ id: uuid(100), name: advertiser, slug: 'jacomo', accessLevel: access }, { id: uuid(101), name: '교원웰스', slug: 'kyowon-wells', accessLevel: access }], months: ['2030-01', '2030-02'] });
    }
    if (url.pathname === '/api/reporting/proof-image') {
      assert.equal(request.method(), 'GET');
      assert.equal(url.searchParams.get('advertiser'), advertiser);
      assert.match(url.searchParams.get('path') || '', /^fixture\//);
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#ded4fa"/><text x="15" y="200" font-size="20">Synthetic rotation evidence</text></svg>' });
    }
    if (url.pathname === '/api/reporting/store') {
      assert.equal(request.method(), 'POST');
      const body = request.postDataJSON();
      if (body.action === 'load_layout') return json(route, { layout: null, updatedAt: null });
      if (body.action === 'load_state') {
        reads.push({ advertiser: body.advertiser, month: body.month });
        return json(route, { imports: body.advertiser === advertiser && body.month === month ? clone(proofOnly ? imports.filter(item => item.metadata.bundle.placementProof) : imports) : [], insights: [] });
      }
      writes.push(clone(body));
      if (body.action !== 'save_creative_link') {
        unexpected.push(`store:${body.action}`);
        return json(route, { error: 'UNEXPECTED_WRITE' }, 400);
      }
      assert.equal(access, 'editor', 'Viewer must never submit');
      assert.deepEqual(Object.keys(body).sort(), ['action', 'input']);
      const input = body.input;
      assert.deepEqual(Object.keys(input).sort(), ['advertiser', 'expectedUpdatedAt', 'importId', 'month', 'operation', 'performanceLink']);
      assert.equal(input.advertiser, advertiser); assert.equal(input.month, month);
      const record = imports.find(item => item.id === input.importId);
      assert.ok(record?.metadata.bundle.placementProof, 'Only saved synthetic proof UUIDs can be edited');
      assert.equal(input.expectedUpdatedAt, record.updated_at, 'CAS uses publishedAt hydrated from updated_at');
      if (conflictNext) { conflictNext = false; return json(route, { error: 'STALE_IMPORT' }, 409); }
      if (input.performanceLink) assert.deepEqual(input.performanceLink, { sourceFamily, platform: '직방', placement, creative: '소재A' });
      if (input.operation) assert.ok(['예정', '집행 중', '중단', '종료'].includes(input.operation.status));
      const before = clone(imports);
      const proof = record.metadata.bundle.placementProof;
      if (input.performanceLink === null) delete proof.performanceLink;
      else proof.performanceLink = clone(input.performanceLink);
      if (input.operation === null) delete proof.operation;
      else proof.operation = clone(input.operation);
      record.updated_at = `2030-01-05T00:00:${String(++savedVersion).padStart(2, '0')}.000Z`;
      assert.deepEqual(stripEditable(imports), stripEditable(before), 'Fake action changes only link/operation and updated_at');
      return json(route, { ok: true, updatedAt: record.updated_at });
    }
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return json(route, { error: 'UNEXPECTED_REQUEST' }, 400);
    }
    return route.continue(); // Local app pages, Next assets and local icons only.
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const visible = locator => locator.waitFor({ state: 'visible', timeout: 30000 });
  const gone = locator => locator.waitFor({ state: 'hidden', timeout: 30000 });
  const panel = () => page.getByRole('region', { name: '소재별 운영·성과', exact: true });
  const detail = () => panel().getByRole('region', { name: '선택 소재 상세', exact: true });
  const editor = () => page.getByRole('region', { name: '운영정보·성과 연결', exact: true });
  const showroom = () => page.getByRole('region', { name: '게재지면 쇼룸', exact: true });
  const registered = () => panel().getByRole('region', { name: '등록 소재 비교표, 가로 스크롤 가능', exact: true });
  const unlinked = () => panel().getByRole('region', { name: '미연결 성과 원본명 비교표, 가로 스크롤 가능', exact: true });
  const selectEntry = async name => {
    await panel().getByRole('button', { name: `${name} 성과 상세 선택`, exact: true }).click();
    await visible(detail().getByRole('heading', { name, exact: true }));
  };
  const value = (scope, label) => scope.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('dd');
  const metric = async (label, expected) => {
    await visible(value(detail(), label).filter({ hasText: expected }));
    assert.equal(await value(detail(), label).textContent(), expected, label);
  };
  const assertSeparate = async () => {
    await visible(panel().getByText('등록 소재명 2개 · 미연결 성과 원본명 2개 · 소재명 없는 증빙 0건', { exact: true }));
    assert.equal(await registered().locator('tbody tr').count(), 2);
    assert.equal(await unlinked().locator('tbody tr').count(), 2);
    await selectEntry('기획전'); await metric('노출', '미제공'); await metric('클릭', '미제공');
  };
  const confirmAndSave = async () => {
    const confirmation = editor().getByRole('checkbox');
    if (await confirmation.count()) await confirmation.check();
    const button = editor().getByRole('button', { name: '운영정보·성과 연결 저장', exact: true });
    assert.ok(await button.isEnabled()); await button.click();
  };
  const openEditor = async () => {
    const button = detail().getByRole('button', { name: '운영정보·성과 연결', exact: true });
    assert.ok(await button.isEnabled()); await button.click(); await visible(editor());
  };
  const noOverflow = async label => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page fits 390px`);
    for (const table of await panel().getByRole('region', { name: /비교표, 가로 스크롤 가능/ }).all()) {
      assert.ok(await table.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= innerWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth;
      }), `${label}: wide tables scroll internally`);
    }
  };
  // Read download streams directly. No real filesystem fixture/download is needed.
  const csvDownload = async () => {
    const pending = page.waitForEvent('download');
    await panel().getByRole('button', { name: '선택 지면 CSV', exact: true }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), 'creative-rotation-2030-01-04-2030-01-04.csv');
    const stream = await download.createReadStream(); assert.ok(stream);
    const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    assert.equal(await download.failure(), null);
    return Buffer.concat(chunks).toString('utf8');
  };
  const parseCsv = text => {
    assert.equal(text.charCodeAt(0), 0xfeff, 'CSV includes UTF-8 BOM');
    const rows = []; let row = [], cell = '', quoted = false;
    const input = text.slice(1);
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\r' || char === '\n') && !quoted) {
        if (char === '\r' && input[i + 1] === '\n') i++;
        row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
      } else cell += char;
    }
    assert.equal(quoted, false); if (cell || row.length) { row.push(cell); rows.push(row); }
    const [header, ...data] = rows;
    return data.map(fields => { assert.equal(fields.length, header.length); return Object.fromEntries(header.map((key, i) => [key, fields[i]])); });
  };

  await page.goto(root + '/creative');
  await visible(showroom());
  await page.getByLabel('조회 월 선택', { exact: true }).selectOption(month);
  await showroom().getByRole('tab', { name: /디지털 앱·웹/ }).click();
  await showroom().getByRole('button', { name: '직방', exact: true }).click();
  await assertSeparate();
  assert.match(await panel().textContent(), /2030-01-01 ~ 2030-01-04/);
  await metric('선택 증빙의 AE 보고용 운영상태', '중단'); await metric('운영보고 기준일', '2030-01-03');
  await selectEntry('소재A'); await metric('노출', '3,000'); await metric('클릭', '20'); await metric('CTR', '0.67%'); await metric('유료 집행비용', '미제공');
  await selectEntry('소재B'); await metric('노출', '3,000'); await metric('클릭', '60'); await metric('CTR', '2%');
  const galleryDetail = showroom().getByRole('complementary', { name: '선택 지면 상세', exact: true });
  await galleryDetail.getByRole('button', { name: '브랜드', exact: true }).click();
  await visible(detail().getByRole('heading', { name: '브랜드', exact: true }));
  await selectEntry('기획전');
  assert.equal(await galleryDetail.getByRole('button', { name: '기획전', exact: true }).getAttribute('aria-pressed'), 'true');
  const screen = showroom().getByRole('button', { name: `${placement} 증빙 원본 크게 보기`, exact: true });
  assert.match(await screen.locator('img').getAttribute('src'), /zigbang-sale/);
  assert.deepEqual(writes, [], 'Browsing never publishes or edits facts');

  // Compact panel's new callback opens the exact proof editor, not an import form.
  await openEditor();
  await editor().getByRole('radio', { name: /^소재A\b/ }).check();
  if (await editor().getByRole('checkbox').count()) assert.ok(await editor().getByRole('button', { name: '운영정보·성과 연결 저장', exact: true }).isDisabled());
  await confirmAndSave(); await gone(editor());
  assert.deepEqual(imports.find(item => item.id === uuid(10)).metadata.bundle.placementProof.performanceLink,
    { sourceFamily, platform: '직방', placement, creative: '소재A' });
  await visible(panel().getByText('등록 소재명 2개 · 미연결 성과 원본명 1개 · 소재명 없는 증빙 0건', { exact: true }));
  await selectEntry('기획전'); await metric('노출', '3,000'); await metric('클릭', '20'); await metric('유료 집행비용', '미제공');
  await metric('선택 증빙의 AE 보고용 운영상태', '중단'); await metric('최근 보고된 성과일', '2030-01-04');
  assert.notEqual(await value(detail(), '선택 증빙의 AE 보고용 운영상태').textContent(), '집행 중', 'Jan 4 metrics never infer active status over Jan 3 operation report');

  await page.goto(root + '/performance');
  const nav = page.getByRole('navigation', { name: '성과 리포트 화면', exact: true });
  await visible(nav);
  await visible(page.getByRole('button', { name: '직방 성과 상세 보기', exact: true }));
  await nav.getByRole('button', { name: '소재 비교', exact: true }).click();
  await visible(panel());
  assert.equal(new URL(page.url()).searchParams.get('view'), 'rotation');
  assert.equal(await nav.getByRole('button', { name: '소재 비교', exact: true }).getAttribute('aria-current'), 'page');
  const zigbangOption = panel().getByLabel('비교할 매체·지면', { exact: true }).getByRole('option', { name: `직방 · ${placement}`, exact: true });
  await visible(panel().getByLabel('비교할 매체·지면', { exact: true }));
  const groupId = await zigbangOption.getAttribute('value'); assert.ok(groupId);
  await panel().getByLabel('비교할 매체·지면', { exact: true }).selectOption(groupId);
  await selectEntry('기획전'); await metric('노출', '3,000');
  // Direct query view must retain the source's Jan 4 end, not the calendar month end.
  await page.goto(root + `/performance?view=rotation&group=${encodeURIComponent(groupId)}`);
  await visible(panel().getByText('등록 소재명 2개 · 미연결 성과 원본명 1개 · 소재명 없는 증빙 0건', { exact: true }));
  assert.match(await panel().textContent(), /2030-01-01 ~ 2030-01-04/);
  await page.getByText('조회 기간', { exact: true }).first().click();
  assert.equal(await page.getByLabel('성과 조회 종료일').inputValue(), '2030-01-04');
  await page.getByLabel('성과 조회 시작일').fill('2030-01-04');
  await selectEntry('기획전'); await metric('노출', '1,500'); await metric('클릭', '10');
  await metric('선택 증빙의 AE 보고용 운영상태', '중단'); await metric('유료 집행비용', '미제공');
  const csv = parseCsv(await csvDownload());
  assert.equal(csv.length, 3, 'One summary row per entry, never per proof/date owner');
  assert.equal(new Set(csv.map(row => `${row.registration}:${row.creative}`)).size, 3);
  const mapped = csv.find(row => row.creative === '기획전'); assert.ok(mapped);
  assert.equal(mapped.impressions, '1500'); assert.equal(mapped.clicks, '10');
  assert.equal(mapped.counted_row_count, '1'); assert.equal(mapped.counted_day_count, '1');
  assert.equal(mapped.scope_start, '2030-01-04'); assert.equal(mapped.scope_end, '2030-01-04');
  assert.equal(mapped.paid_provided_spend, '');
  assert.match(csv.find(row => row.creative === '소재B').source_files, /^'=rotation-fixture/, 'Formula-leading source text is escaped');
  assert.equal(csv.reduce((sum, row) => sum + Number(row.impressions || 0), 0), 3000, 'Numeric facts exported exactly once across entries');
  assert.equal(csv.find(row => row.creative === '브랜드').impressions, '', 'Unknown metrics are empty, not zero');

  // Latest/archived Jan 1 owners remain auditable but only one is counted.
  await page.getByLabel('성과 조회 시작일').fill('2030-01-01');
  await selectEntry('기획전');
  const provenance = detail().locator('details').filter({ has: page.getByText('성과 제공일·원본 출처 3행', { exact: true }) });
  await provenance.locator('summary').click();
  assert.equal(await provenance.locator('li').count(), 3);
  assert.equal(await provenance.locator('li').filter({ hasText: '집계: 반영' }).count(), 2);
  assert.equal(await provenance.locator('li').filter({ hasText: '이전 자료 또는 중복 · 제외' }).count(), 1);
  await metric('노출', '3,000');

  const beforeConflict = clone(imports);
  await openEditor(); await editor().getByLabel('보고용 운영상태', { exact: true }).selectOption('종료');
  await editor().getByLabel('운영보고 기준일', { exact: true }).fill('2030-01-04');
  await editor().getByLabel('운영보고 메모 (선택)', { exact: true }).fill('Synthetic retained draft');
  conflictNext = true; await confirmAndSave();
  await visible(editor().getByRole('alert').filter({ hasText: '선택한 초안은 유지했습니다.' }));
  assert.equal(await editor().getByLabel('보고용 운영상태', { exact: true }).inputValue(), '종료');
  assert.equal(await editor().getByLabel('운영보고 메모 (선택)', { exact: true }).inputValue(), 'Synthetic retained draft');
  assert.ok(await editor().getByRole('radio', { name: /^소재A\b/ }).isChecked());
  assert.deepEqual(imports, beforeConflict, '409 changes no persisted fixture data');
  await editor().getByRole('button', { name: '닫기', exact: true }).click();
  await openEditor(); await editor().getByRole('radio', { name: /^수동 연결 해제/ }).check();
  await confirmAndSave(); await gone(editor()); await assertSeparate();
  assert.equal(imports.find(item => item.id === uuid(10)).metadata.bundle.placementProof.performanceLink, undefined);
  assert.deepEqual(imports.find(item => item.id === uuid(10)).metadata.bundle.placementProof.operation, proofs[0].operation, 'Clear link retains separately reported operation');

  await panel().getByLabel('비교할 매체·지면', { exact: true }).selectOption({ label: '네이버 · PC 배너' });
  await selectEntry('A'); await metric('노출', '미제공'); await metric('클릭', '미제공'); await metric('CTR', '미제공');
  assert.equal(await unlinked().count(), 0, 'Naver proof-only sources do not invent per-creative facts');
  await openEditor(); assert.equal(await editor().getByRole('radio').count(), 1, 'Operation-only editor has no cross-placement candidates');
  await editor().getByLabel('보고용 운영상태', { exact: true }).selectOption('예정');
  await editor().getByLabel('운영보고 기준일', { exact: true }).fill('2030-01-03');
  await confirmAndSave(); await gone(editor());
  await metric('선택 증빙의 AE 보고용 운영상태', '예정'); await metric('노출', '미제공');
  await selectEntry('B'); await metric('노출', '미제공');

  await page.goto(root + '/reports'); await visible(panel());
  await page.getByLabel('리포트 조회 종료일', { exact: true }).fill('2030-01-04');
  await panel().getByLabel('비교할 매체·지면', { exact: true }).selectOption({ label: `직방 · ${placement}` });
  await assertSeparate(); assert.match(await panel().textContent(), /2030-01-01 ~ 2030-01-04/);
  await selectEntry('소재A'); await metric('노출', '3,000'); await metric('클릭', '20');
  await page.getByLabel('리포트 조회 시작일', { exact: true }).fill('2030-01-04');
  await metric('노출', '1,500');
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow('Reports');
  await page.goto(root + `/performance?view=rotation&group=${encodeURIComponent(groupId)}`);
  await visible(panel().getByText('등록 소재명 2개 · 미연결 성과 원본명 2개 · 소재명 없는 증빙 0건', { exact: true }));
  await noOverflow('Performance rotation');
  await page.goto(root + '/creative'); await visible(showroom());
  await showroom().getByRole('tab', { name: /디지털 앱·웹/ }).click();
  await showroom().getByRole('button', { name: '직방', exact: true }).click();
  await assertSeparate(); await noOverflow('Compact showroom');
  await page.getByLabel('조회 월 선택', { exact: true }).selectOption('2030-02');
  await visible(showroom().getByText('현재 필터에 증빙·성과 자료가 연결된 지면이 없습니다.', { exact: false }));
  assert.equal(await panel().count(), 0, 'Month switch removes stale compact facts and preview');
  await page.goto(root + '/reports'); await visible(panel());
  await page.getByLabel('조회 월 선택', { exact: true }).selectOption(month);
  await visible(panel().getByRole('button', { name: '소재A 성과 상세 선택', exact: true }));
  await page.getByLabel('광고주 선택', { exact: true }).selectOption('kyowon');
  await visible(panel().getByText('조건에 맞는 지면이 없습니다. 검색어나 복수 소재 필터를 바꿔주세요.', { exact: true }));
  assert.equal(await panel().getByRole('button', { name: '소재A 성과 상세 선택', exact: true }).count(), 0, 'Advertiser scope clears old facts');

  const writesBeforeViewer = writes.length;
  access = 'viewer';
  await page.goto(root + '/performance?view=rotation');
  await visible(panel());
  // Fresh synthetic preference init restores January/Jacomo on a full navigation.
  await page.getByLabel('광고주 선택', { exact: true }).selectOption('jacomo');
  await page.getByLabel('조회 월 선택', { exact: true }).selectOption(month);
  await visible(panel().getByRole('button', { name: '기획전 성과 상세 선택', exact: true }));
  await selectEntry('기획전');
  assert.equal(await detail().getByRole('button', { name: '운영정보·성과 연결', exact: true }).count(), 0);
  await page.goto(root + '/reports'); await visible(panel()); await selectEntry('기획전');
  assert.equal(await detail().getByRole('button', { name: '운영정보·성과 연결', exact: true }).count(), 0);
  await page.goto(root + '/creative'); await visible(showroom());
  await showroom().getByRole('tab', { name: /디지털 앱·웹/ }).click();
  await showroom().getByRole('button', { name: '직방', exact: true }).click(); await selectEntry('기획전');
  assert.equal(await detail().getByRole('button', { name: '운영정보·성과 연결', exact: true }).count(), 0);
  proofOnly = true;
  await page.goto(root + '/performance?view=rotation'); await visible(panel());
  await panel().getByLabel('비교할 매체·지면', { exact: true }).selectOption({ label: `직방 · ${placement}` });
  await selectEntry('기획전'); await metric('노출', '미제공');
  assert.equal(await registered().locator('tbody tr').count(), 2, 'Proof-only months retain material operation drilldown');
  assert.equal(await detail().getByRole('button', { name: '운영정보·성과 연결', exact: true }).count(), 0);
  proofOnly = false;
  assert.equal(writes.length, writesBeforeViewer);
  assert.equal(writes.length, 4, 'One link, one 409, one clear, one operation-only save');
  assert.equal(savedVersion, 3);
  assert.ok(writes.every(write => write.action === 'save_creative_link'), 'No publish_bundle or fact writes');
  assert.deepEqual(stripEditable(imports), stripEditable(original));
  assert.deepEqual(imports.slice(0, 2), original.slice(0, 2), 'Both cumulative snapshots, all raw facts and plans are untouched');
  assert.ok(reads.some(read => read.month === '2030-02'));
  assert.ok(reads.some(read => read.advertiser === '교원웰스'));
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('Creative rotation UI passed: synthetic snapshot deduplication, distinct registrations/source names, explicit CAS links, operation-only edits, 409 draft retention, clear semantics, safe period CSV, gallery preview sync, performance query/nav, reports parity, viewer boundaries, mobile internal scrolling, scope reset and no fact/publication writes.');
} finally {
  await browser.close();
}
