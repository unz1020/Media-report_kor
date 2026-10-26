import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Playwright 1.56.1-compatible, disposable context only. Never use customer data,
// a persistent profile, real API responses, external assets or account mutations.
const root = (process.env.REPORTING_TEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const origin = new URL(root).origin;
const advertiser = '자코모', month = '2026-10';
const clockStart = new Date('2026-10-15T03:00:00.000Z'); // Seoul October, regardless of CI date.
// Expected calendar coverage comes from the accepted scope, never from table rows.
const expectedDays = async explorer => {
  const period = await explorer.locator(':scope > p:first-of-type').textContent();
  const match = period?.match(/^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  assert.ok(match, 'Daily explorer exposes its selected date range');
  const [, start, end] = match;
  const first = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z');
  assert.ok(Number.isFinite(first) && Number.isFinite(last) && first <= last, 'Accepted period is a valid inclusive range');
  assert.equal(new Date(first).toISOString().slice(0, 10), start);
  assert.equal(new Date(last).toISOString().slice(0, 10), end);
  return Array.from({ length: (last - first) / 86400000 + 1 }, (_, i) => new Date(last - i * 86400000).toISOString().slice(0, 10));
};
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Local, synthetic 2x2 RGBA PNG; crop to 50% produces a real 1px output.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=', 'base64');
const fact = (platform, placement = 'Synthetic banner') => ({ platform, placement,
  impressions: 300, clicks: 3, spend: 60, views: 30, ctr: 1,
  achievement: null, guaranteed: '', sourceSheet: 'Synthetic daily' });
const platforms = ['네이버', '카카오', '직방', '당근'];
const baseBundle = { advertiser, sourceId: 'report-upgrade-synthetic', sourceFile: 'synthetic-upgrade.xlsx',
  reportDate: '2026-10-06', campaignStart: '2026-10-01', campaignEnd: '2026-10-31',
  placements: [], dailyPerformance: [], creativeDailyPerformance: [], mediaPlan: [],
  operationNotes: [], mailChecks: [], parsedSheets: ['Synthetic'], ignoredSheets: [],
  qa: { mismatchedMailMetrics: 0, unmatchedMailMetrics: 0 } };
const bundle = { ...clone(baseBundle), placements: [...platforms, 'LGU+', 'SKB'].map(name => fact(name)),
  dailyPerformance: platforms.flatMap(platform => [
    { ...fact(platform), date: '2026-10-01', impressions: 100, clicks: 1, spend: 20, views: 10 },
    { ...fact(platform), date: '2026-10-02', impressions: null, clicks: null, spend: null, views: null, ctr: null },
    { ...fact(platform), date: '2026-10-04', impressions: 0, clicks: 0, spend: 0, views: 0, ctr: null },
    { ...fact(platform), date: '2026-10-06', impressions: 200, clicks: 2, spend: 40, views: 20 },
  ]).concat([{ ...fact('LGU+'), date: '2026-10-04', impressions: 0, clicks: 0, spend: 0, views: 0 }]), mediaPlan: [{ platform: '네이버', product: 'Synthetic October plan', placement: 'Synthetic banner',
    device: '', creativeType: '이미지', periodStart: '2026-10-01', periodEnd: '2026-10-31',
    budget: 123456, expectedImpressions: null, expectedClicks: null, target: '', sourceSheet: 'Synthetic plan' }] };
const proof = { advertiser, month, reportDate: '2026-10-06', verificationDate: '2026-10-03',
  media: '직방', placement: 'Synthetic existing placement', creativeName: 'Synthetic existing creative',
  campaignName: 'Synthetic only', serviceType: '게재보고', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  status: '게재 확인', location: '', airingTime: '', dailyFrequency: null, durationSec: null, budgetReference: null,
  messageId: '', mailSubject: 'Synthetic only', mailDate: '2026-10-06', sourceFile: 'synthetic-proof.pdf',
  sourceSummary: 'Synthetic only', attachments: [], manualImagePath: 'fixture/original-evidence.png',
  materialIdentity: { assetId: 'SYN001', version: 'v01', displayName: 'Synthetic material', format: '2x2', reportedFilename: 'original.png' },
  performanceLink: { sourceFamily: '자코모::2026-10::report-upgrade-synthetic', platform: '직방', placement: 'Synthetic banner', creative: 'Synthetic source creative' },
  operation: { status: '중단', asOf: '2026-10-05', note: 'Synthetic report only' },
  previewUrl: '', landingUrl: '', utm: { utm_source: 'synthetic' } };
const imports = [
  { id: uuid(1), report_date: bundle.reportDate, updated_at: '2026-10-06T03:00:00.000Z', metadata: { bundle } },
  { id: uuid(2), report_date: proof.reportDate, updated_at: '2026-10-06T04:00:00.000Z', metadata: { bundle: { ...clone(baseBundle), sourceId: 'synthetic-proof', sourceFile: proof.sourceFile, placementProof: proof } } },
];
const original = clone(imports);
const errors = [], unexpected = [], reads = [], uploads = [], storeWrites = [];
let conflictNext = true, holdRefresh = false, releaseRefresh;
const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
const browser = await chromium.launch({ headless: true });
const deadline = setTimeout(() => { console.error('Report upgrade UI exceeded 180 seconds'); void browser.close(); }, 180000);
deadline.unref();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('media-report-month:fixture@example.test', '2026-10');
    localStorage.setItem('media-report-advertiser:fixture@example.test', 'jacomo');
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== origin) {
      unexpected.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname === '/api/workspace') {
      assert.equal(method, 'GET');
      return json(route, { user: { email: 'fixture@example.test', display_name: 'Synthetic', role: 'ae' },
        advertisers: [{ id: uuid(100), name: advertiser, slug: 'jakomo', accessLevel: 'editor' },
          { id: uuid(101), name: '교원웰스', slug: 'kyowon-wells', accessLevel: 'editor' }],
        months: [month] }); // November must be offered without existing records.
    }
    if (url.pathname === '/api/gmail/status') {
      assert.equal(method, 'GET'); return json(route, { connected: false, configured: false });
    }
    if (url.pathname === '/api/reporting/store') {
      assert.equal(method, 'POST'); const body = request.postDataJSON();
      if (body.action === 'load_layout') return json(route, { layout: null, updatedAt: null });
      if (body.action === 'load_media_mix_history') return json(route, { history: [] });
      if (body.action === 'load_state') {
        reads.push({ advertiser: body.advertiser, month: body.month });
        if (holdRefresh) await refreshGate;
        return json(route, { imports: body.advertiser === advertiser && body.month === month ? clone(imports) : [], insights: [] });
      }
      storeWrites.push(clone(body)); unexpected.push(`store:${body.action}`);
      return json(route, { error: 'UNEXPECTED_WRITE' }, 400);
    }
    if (url.pathname === '/api/reporting/proof-image') {
      if (method === 'GET') {
        assert.equal(url.searchParams.get('advertiser'), advertiser);
        assert.match(url.searchParams.get('path') || '', /^fixture\//);
        return route.fulfill({ status: 200, contentType: 'image/png', body: png });
      }
      assert.equal(method, 'POST');
      const form = await new Request('https://fixture.invalid', { method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] }, body: request.postDataBuffer() }).formData();
      assert.deepEqual([...form.keys()].sort(), ['advertiser', 'expectedUpdatedAt', 'file', 'importId', 'purpose', 'reportDate', 'sourceFile'].sort());
      assert.equal(form.get('purpose'), 'creative_reference');
      assert.equal(form.get('advertiser'), advertiser); assert.equal(form.get('importId'), uuid(2));
      assert.equal(form.get('expectedUpdatedAt'), imports[1].updated_at);
      assert.equal(form.get('reportDate'), proof.reportDate); assert.equal(form.get('sourceFile'), proof.sourceFile);
      const file = form.get('file'), bytes = Buffer.from(await file.arrayBuffer());
      assert.ok(/^image\/(png|jpeg|webp)$/.test(file.type)); assert.ok(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024);
      uploads.push({ filename: file.name, type: file.type, bytes });
      if (conflictNext) { conflictNext = false; return json(route, { error: 'STALE_IMPORT' }, 409); }
      assert.equal(uploads.length, 2, 'Only one retry is expected');
      proof.creativeImagePath = 'fixture/creative-reference.png'; proof.creativeImageFilename = file.name;
      imports[1].updated_at = '2026-10-15T03:01:00.000Z';
      return json(route, { path: proof.creativeImagePath, updatedAt: imports[1].updated_at });
    }
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(method)) {
      unexpected.push(`${method} ${url.pathname}`); return json(route, { error: 'UNEXPECTED_REQUEST' }, 400);
    }
    return route.continue(); // Same-origin app HTML, Next chunks and local public logos only.
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(clockStart);
  const visible = locator => locator.waitFor({ state: 'visible', timeout: 30000 });
  const trend = () => page.locator('[data-daily-multi-metrics]');
  const mediaChoices = () => trend().getByRole('group', { name: '비교 매체 (최대 3개)', exact: true });
  const metricChoices = () => trend().getByRole('group', { name: '일별 지표 (최대 4개)', exact: true });
  const card = (name, metric) => trend().locator(`[data-daily-media="${name}"][data-daily-metric="${metric}"]`);
  // Responsive CSS hides this status below 900px; its exact text still signals ready.
  const syncReady = () => page.getByText('DB 동기화 완료', { exact: true }).waitFor({ state: 'attached', timeout: 30000 });
  const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits 390px without document overflow`);
  const checkGeometry = async () => {
    assert.doesNotMatch(await trend().textContent(), /NaN|Infinity|undefined/);
    const geometry = await trend().locator('svg').evaluateAll(nodes => nodes.map(node => node.outerHTML).join('\n'));
    assert.doesNotMatch(geometry, /NaN|Infinity|undefined/, 'All SVG paths/coordinates must be finite');
  };
  const table = () => trend().getByRole('table', { name: '일별 지표 통합표', exact: true });
  const chartDetails = () => trend().locator('details').filter({ has: page.locator('summary').filter({ hasText: /^일별 그래프 펼치기$/ }) });
  const openCharts = async () => {
    assert.equal(await chartDetails().count(), 1);
    if (await chartDetails().getAttribute('open') === null) await chartDetails().locator('summary').click();
    await visible(trend().locator('[data-daily-metric]').first());
  };
  const tableRow = (date, name) => table().locator(`tbody tr[data-daily-table-date="${date}"][data-daily-table-media="${name}"]`);
  const checkTable = async names => {
    await visible(table());
    assert.notEqual(await table().getAttribute('data-daily-table'), null);
    assert.deepEqual(await table().locator('thead th').allTextContents(), ['날짜', '매체', '노출수', '클릭수', '집행액 (원)', '조회수']);
    assert.equal(await table().locator('thead th[scope="col"]').count(), 6);
    assert.equal(await table().locator('[data-daily-metric]').count(), 0, 'Only chart cards use the legacy metric attribute');
    const days = await expectedDays(trend());
    assert.ok(['2026-10-02', '2026-10-03', '2026-10-04'].every(day => days.includes(day)), 'Accepted range covers fixture data-state checks');
    const rows = table().locator('tbody tr');
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-daily-table-date'))), days.flatMap(day => names.map(() => day)), 'All accepted-range calendar days descend without gaps');
    for (const day of days) {
      const group = table().locator(`tbody tr[data-daily-table-date="${day}"]`);
      assert.deepEqual((await group.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-daily-table-media')))).sort(), [...names].sort());
      const dateHeader = group.locator('th[scope="rowgroup"]');
      assert.equal(await dateHeader.count(), 1);assert.equal(await dateHeader.getAttribute('rowspan'), String(names.length));
    }
    for (const name of names) {
      const source = bundle.dailyPerformance.filter(point => point.platform === name);
      const zeroSource = source.find(point => point.date === '2026-10-04'), nullSource = source.find(point => point.date === '2026-10-02');
      assert.ok(zeroSource && nullSource, 'Fixture provides zero and explicit-null original rows');
      assert.deepEqual(['impressions', 'clicks', 'spend', 'views'].map(metric => zeroSource[metric]), [0, 0, 0, 0]);
      assert.deepEqual(['impressions', 'clicks', 'spend', 'views'].map(metric => nullSource[metric]), [null, null, null, null]);
      assert.equal(source.some(point => point.date === '2026-10-03'), false, 'Fixture omits the missing calendar day');
      const zero = tableRow('2026-10-04', name);
      assert.equal(await zero.count(), 1);
      assert.deepEqual(await zero.locator('[data-daily-table-metric]').evaluateAll(cells => cells.map(cell => cell.getAttribute('data-daily-table-metric'))), ['impressions', 'clicks', 'spend', 'views']);
      assert.deepEqual(await zero.locator('[data-daily-table-metric]').allTextContents(), ['0', '0', '0원', '0'], 'One row contains all selected real-zero metrics');
      assert.deepEqual(await tableRow('2026-10-02', name).locator('[data-daily-table-metric]').allTextContents(), Array(4).fill('미제공'), 'Explicit null remains unknown in the same row');
      assert.deepEqual(await tableRow('2026-10-03', name).locator('[data-daily-table-metric]').allTextContents(), Array(4).fill('원본 없음'), 'Missing calendar day is not zero or explicit null');
    }
    await trend().getByLabel('공통 비교일', { exact: true }).selectOption('2026-10-04');
    const selectedOnly = trend().getByRole('checkbox', { name: '선택일만 보기', exact: true });
    assert.equal(await selectedOnly.isChecked(), false);await selectedOnly.check();
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-daily-table-date'))), names.map(() => '2026-10-04'));
    await trend().getByLabel('공통 비교일', { exact: true }).selectOption('2026-10-02');
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-daily-table-date'))), names.map(() => '2026-10-02'), 'Selected-only rows follow the shared date');
    await selectedOnly.uncheck();assert.equal(await rows.count(), days.length * names.length);
  };
  const checkTableScroll = async () => {
    const region = trend().getByRole('region', { name: '일별 통합표 스크롤 영역', exact: true });await visible(region);
    assert.equal(await region.getByRole('table', { name: '일별 지표 통합표', exact: true }).count(), 1);
    const size = await region.evaluate(node => {
      const style = getComputedStyle(node);node.scrollLeft = 0;const before = node.scrollLeft;node.scrollLeft = node.scrollWidth;const after = node.scrollLeft;node.scrollLeft = 0;
      return { before, after, width: node.clientWidth, content: node.scrollWidth, height: node.clientHeight, contentHeight: node.scrollHeight, overflowX: style.overflowX, overflowY: style.overflowY, maxHeight: style.maxHeight };
    });
    assert.ok(size.content > size.width && size.after > size.before, 'Mobile table really scrolls horizontally within its own region');
    assert.match(size.overflowX, /auto|scroll/);assert.match(size.overflowY, /auto|scroll/);
    assert.notEqual(size.maxHeight, 'none');assert.ok(size.height <= parseFloat(size.maxHeight) + 1, 'Accepted-range rows stay within the bounded vertical scrolling region');
    await noOverflow('Daily table');
  };
  const checkGaps = async () => {
    await openCharts();
    const naver = card('네이버', 'impressions');
    assert.equal(await naver.getByRole('button').count(), 3, 'Null and missing days are not synthetic zero points');
    assert.equal(await naver.getByRole('button', { name: '2026-10-04 노출수 0', exact: true }).count(), 1, 'A real zero is retained');
    assert.equal(await naver.locator('svg path').count(), 3, 'Both explicit null and missing calendar days break the line');
    await trend().getByLabel('공통 비교일', { exact: true }).selectOption('2026-10-02');
    assert.equal(await naver.locator('p[aria-live="polite"] strong').textContent(), '미제공');
    for (const text of await trend().locator('[data-daily-metric] p[aria-live="polite"] strong').allTextContents()) assert.equal(text, '미제공', 'Null shared day remains unknown across all selected media/metrics');
    await trend().getByLabel('공통 비교일', { exact: true }).selectOption('2026-10-04');
    assert.equal(await naver.locator('p[aria-live="polite"] strong').textContent(), '0');
    for (const text of await trend().locator('[data-daily-metric] p[aria-live="polite"] strong').allTextContents()) assert.match(text, /^0(?:원)?$/, 'Real zero remains visible across all selected metrics');
    const point = naver.getByRole('button', { name: '2026-10-01 노출수 100', exact: true });
    await point.focus(); await point.press('ArrowRight');
    assert.equal(await trend().getByLabel('공통 비교일', { exact: true }).inputValue(), '2026-10-04', 'Keyboard comparison skips absent values');
    await checkGeometry();
  };

  await page.goto(root + '/performance'); await visible(trend()); await syncReady();
  await visible(table());
  assert.equal(await chartDetails().getAttribute('open'), null, 'First summary load defaults to the table, not expanded charts');
  assert.equal(await trend().locator('[data-daily-metric]:visible').count(), 0);
  assert.equal(await trend().locator('[data-daily-metric]').count(), 3, 'Existing default remains three metrics');
  assert.equal(await metricChoices().getByRole('checkbox', { checked: true }).count(), 3);
  assert.equal(await table().locator('thead th').count(), 5);
  await openCharts();
  // Ensure a deterministic explicit first media, independent of Korean sort order.
  if (!(await mediaChoices().getByRole('checkbox', { name: '네이버', exact: true }).isChecked())) {
    await mediaChoices().getByRole('checkbox', { name: '네이버', exact: true }).check();
    for (const name of [...platforms, 'LGU+'].filter(name => name !== '네이버')) {
      const checkbox = mediaChoices().getByRole('checkbox', { name, exact: true });
      if (await checkbox.isChecked()) await checkbox.uncheck();
    }
  }
  await mediaChoices().getByRole('checkbox', { name: '카카오', exact: true }).check();
  await mediaChoices().getByRole('checkbox', { name: '직방', exact: true }).check();
  assert.equal(await mediaChoices().getByRole('checkbox', { checked: true }).count(), 3);
  assert.ok(await mediaChoices().getByRole('checkbox', { name: '당근', exact: true }).isDisabled(), 'Fourth media cannot be selected');
  for (const name of ['노출수', '클릭수', '집행액', '조회수']) await metricChoices().getByRole('checkbox', { name, exact: true }).check();
  assert.equal(await metricChoices().getByRole('checkbox').count(), 4);
  assert.equal(await metricChoices().getByRole('checkbox', { checked: true }).count(), 4);
  assert.equal(await trend().locator('[data-daily-metric]').count(), 12, '3 media x 4 metrics');
  await mediaChoices().getByRole('searchbox', { name: '매체 찾기', exact: true }).fill('no-such-synthetic-media');
  await visible(trend().getByText('검색한 매체가 없습니다. 기존 선택은 유지됩니다.', { exact: true }));
  assert.equal(await trend().locator('[data-daily-metric]').count(), 12);
  await mediaChoices().getByRole('searchbox', { name: '매체 찾기', exact: true }).fill('');
  await checkTable(['네이버', '카카오', '직방']);
  await checkGaps();
  // A raw broadcast metric is inapplicable even when its source carries zero.
  await mediaChoices().getByRole('checkbox', { name: '직방', exact: true }).uncheck();
  await mediaChoices().getByRole('checkbox', { name: 'LGU+', exact: true }).check();
  assert.equal(await tableRow('2026-10-04', 'LGU+').locator('[data-daily-table-metric="clicks"]').textContent(), '해당 없음');
  assert.equal(await tableRow('2026-10-04', 'LGU+').locator('[data-daily-table-metric="impressions"]').textContent(), '0');
  await mediaChoices().getByRole('checkbox', { name: 'LGU+', exact: true }).uncheck();
  await mediaChoices().getByRole('checkbox', { name: '직방', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 }); await noOverflow('Multi-media summary');
  await chartDetails().locator('summary').click();assert.equal(await trend().locator('[data-daily-metric]:visible').count(), 0);
  await checkTableScroll();await openCharts();await noOverflow('Expanded multi-media charts');
  await page.getByRole('button', { name: '네이버 성과 상세 보기', exact: true }).click();
  await visible(page.getByRole('region', { name: '네이버 성과 요약', exact: true }));
  await openCharts(); // Detail navigation may remount the explorer with closed charts.
  assert.equal(await trend().count(), 1); assert.equal(await trend().locator('[data-daily-media="카카오"]').count(), 0);
  for (const name of ['노출수', '클릭수', '집행액', '조회수']) await metricChoices().getByRole('checkbox', { name, exact: true }).check();
  assert.equal(await trend().locator('[data-daily-metric]').count(), 4);
  await checkTable(['네이버']); await checkGaps(); await checkTableScroll(); await noOverflow('Multi-metric media detail');

  // Explicit operator identities, not a generic addressable-TV surrogate logo.
  for (const [media, key, src] of [['LGU+', 'lg-uplus', '/media-icons/lg-uplus.png'], ['SKB', 'sk-broadband', '/media-icons/sk-broadband.png']]) {
    await page.getByLabel('상세 매체 선택', { exact: true }).selectOption(media);
    const summary = page.getByRole('region', { name: `${media} 성과 요약`, exact: true }); await visible(summary);
    const heading = page.getByRole('heading', { level: 2, name: media, exact: true });
    const icon = heading.locator(`[data-media-icon="${key}"]`).first(); await visible(icon);
    assert.equal(await icon.getAttribute('aria-hidden'), 'true');
    const image = icon.locator('img'); assert.equal(await image.getAttribute('src'), src); assert.equal(await image.getAttribute('alt'), '');
    await image.evaluate(async img => { await img.decode(); });
    assert.ok(await image.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0), `${media} uses its real local official-source image`);
    await noOverflow(`${media} detail`);
  }

  // Only October is supplied by workspace. November must be generated by the UI.
  assert.equal(await page.getByLabel('조회 월 선택', { exact: true }).locator('option[value="2026-11"]').count(), 1);
  await page.getByRole('link', { name: '11월 매체 정리', exact: true }).click();
  const mix = () => page.getByRole('region', { name: '월 미디어믹스 업데이트', exact: true });
  await visible(mix()); await syncReady();
  assert.equal(await page.getByLabel('조회 월 선택', { exact: true }).inputValue(), '2026-11');
  await visible(mix().getByText('11월 매체 구성을 새로 정리하세요', { exact: true }));
  assert.match(await mix().textContent(), /다른 월의 예산·실적·소재·증빙은 자동 복사하지 않습니다/);
  assert.doesNotMatch(await mix().textContent(), /Synthetic October plan|123,456/);
  await mix().getByRole('button', { name: '운영안 추가', exact: true }).click();
  assert.doesNotMatch(await mix().textContent(), /Synthetic October plan/);
  await mix().getByRole('button', { name: '취소', exact: true }).click(); await noOverflow('Empty future-month onboarding');
  await page.getByRole('button', { name: '다른 월', exact: true }).click();
  await page.getByLabel('직접 조회 월 선택', { exact: true }).fill('2031-02'); await syncReady();
  await visible(mix().getByText('2월 매체 구성을 새로 정리하세요', { exact: true }));
  assert.equal(await page.getByLabel('조회 월 선택', { exact: true }).inputValue(), '2031-02');
  await page.getByRole('navigation', { name: '주 메뉴', exact: true }).getByRole('link', { name: '성과', exact: true }).click();
  await visible(page.getByRole('heading', { name: '아직 반영된 성과 데이터가 없습니다.', exact: true }));
  assert.equal(await page.locator('[data-daily-multi-metrics]').count(), 0, 'Manual future scope has no old trend');
  await page.getByLabel('조회 월 선택', { exact: true }).selectOption(month);
  await visible(page.getByRole('button', { name: '네이버 성과 상세 보기', exact: true }));
  await page.getByLabel('광고주 선택', { exact: true }).selectOption('kyowon');
  await visible(page.getByRole('heading', { name: '아직 반영된 성과 데이터가 없습니다.', exact: true }));
  assert.equal(await page.getByRole('button', { name: '네이버 성과 상세 보기', exact: true }).count(), 0);
  await page.getByLabel('광고주 선택', { exact: true }).selectOption('jacomo');
  await visible(page.getByRole('button', { name: '네이버 성과 상세 보기', exact: true }));
  assert.deepEqual(imports, original, 'Navigation and onboarding never copy or save facts'); assert.deepEqual(storeWrites, []);

  await page.getByRole('navigation', { name: '주 메뉴', exact: true }).getByRole('link', { name: '소재 · 게재지면', exact: true }).click();
  const editor = () => page.getByRole('region', { name: '지면 수동 세팅', exact: true });
  await page.getByRole('button', { name: '소재 이미지 넣기', exact: true }).first().click();
  const entry = page.getByRole('region', { name: '소재 이미지 등록 대상 선택', exact: true }); await visible(entry);
  assert.equal(await editor().count(), 0, 'Top entry cannot silently infer the target');
  // A wrapping HTML label also contains its option text; assert the prompt separately.
  assert.match(await entry.locator('label').textContent(), /^기존 매체\s*\/\s*지면\s*\/\s*소재/);
  const target = entry.getByRole('combobox');
  assert.equal(await target.count(), 1, 'Exactly one explicit existing-target selector');
  await target.locator('option', { hasText: 'Synthetic existing creative' }).waitFor({ state: 'attached' });
  await target.selectOption({ label: '직방 / Synthetic existing placement / Synthetic existing creative' });
  await visible(editor()); assert.match(await editor().textContent(), /등록 대상.*직방.*Synthetic existing placement.*Synthetic existing creative/s);
  assert.equal(await editor().getByLabel('세팅 상태', { exact: true }).count(), 0, 'Image-only editor cannot rewrite proof metadata');
  const picker = editor().getByRole('region', { name: '소재 이미지 입력', exact: true });
  const submit = () => editor().getByRole('button', { name: '소재 이미지 저장', exact: true });
  assert.ok(await submit().isDisabled());
  await picker.getByLabel('소재 이미지 · 게재 증빙 아님', { exact: true }).setInputFiles({ name: 'synthetic-local.png', mimeType: 'image/png', buffer: png });
  const preview = picker.getByAltText('보고서 이미지 미리보기', { exact: true }); await visible(preview);
  await preview.evaluate(async image => { await image.decode(); });
  assert.deepEqual(await preview.evaluate(image => [image.naturalWidth, image.naturalHeight]), [2, 2]);
  assert.equal(await submit().isDisabled(), false);
  for (const [label, value] of [['왼쪽', '0'], ['위쪽', '0'], ['너비', '50'], ['높이', '50']]) await picker.getByLabel(`자르기 ${label} (%)`, { exact: true }).fill(value);
  assert.ok(await submit().isDisabled(), 'A changed crop must be applied first');
  await picker.getByRole('button', { name: '이 이미지 사용', exact: true }).click();
  await visible(picker.getByText('선택한 영역을 이미지로 준비했습니다. 지면 저장을 누르면 등록됩니다.', { exact: true }));
  const ready = editor().getByAltText('사용자 등록 소재 미리보기 · 게재 증빙 아님', { exact: true });
  await ready.evaluate(async image => { await image.decode(); });
  assert.deepEqual(await ready.evaluate(image => [image.naturalWidth, image.naturalHeight]), [1, 1], 'Crop changes actual encoded pixels');
  assert.equal(uploads.length, 0, 'Selecting, previewing and applying never writes');
  await noOverflow('Image preview and crop');

  // Force the 30-second background-refresh branch without a real wait. Keep the
  // read pending so an accidental foreground/loading transition cannot hide.
  holdRefresh = true; await page.clock.setFixedTime(new Date(clockStart.getTime() + 31000));
  const backgroundRequest = page.waitForRequest(request => request.url() === origin + '/api/reporting/store' && request.postDataJSON()?.action === 'load_state');
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await backgroundRequest;
  assert.equal(await submit().isDisabled(), false, 'Focus background refresh does not disable a prepared image');
  holdRefresh = false; releaseRefresh(); await syncReady();
  await submit().click(); await visible(editor().getByRole('alert').filter({ hasText: 'STALE_IMPORT' }));
  assert.equal(uploads.length, 1); assert.deepEqual(imports, original, '409 does not mutate proof or CAS');
  assert.equal(await submit().isDisabled(), false, '409 retains the prepared image for retry');
  assert.equal(await ready.count(), 1); await noOverflow('409 retry');
  await submit().click(); await editor().waitFor({ state: 'hidden' });
  assert.equal(uploads.length, 2); assert.deepEqual(uploads[0], uploads[1], 'Retry uses the exact same prepared file');
  assert.equal(proof.creativeImagePath, 'fixture/creative-reference.png');
  assert.equal(proof.creativeImageFilename, uploads[1].filename);
  const normalized = clone(imports);
  delete normalized[1].metadata.bundle.placementProof.creativeImagePath;
  delete normalized[1].metadata.bundle.placementProof.creativeImageFilename;
  normalized[1].updated_at = original[1].updated_at;
  assert.deepEqual(normalized, original, 'Only creativeImagePath/Filename and CAS timestamp changed; status, verificationDate, manualImagePath, materialIdentity, operation and performanceLink are untouched');
  await visible(page.getByAltText(/Synthetic existing placement.*사용자 등록 소재 · 게재 증빙 아님/).first());
  await noOverflow('Saved creative reference');
  assert.ok(reads.some(read => read.advertiser === advertiser && read.month === '2026-11'));
  assert.ok(reads.some(read => read.advertiser === advertiser && read.month === '2031-02'));
  assert.ok(reads.some(read => read.advertiser === '교원웰스' && read.month === month));
  assert.deepEqual(storeWrites, []); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log('Report upgrade UI passed: default unified daily tables and expandable summary/detail multi-metric charts (3 media / 4 metrics), real zero vs null/calendar gaps and finite SVGs, keyboard shared date, explicit LGU+/SKB source images, generated November/manual months and advertiser isolation, empty media-mix onboarding, explicit creative target/local PNG/crop, deferred creative_reference-only upload, focus-ready submit, 409 same-image retry, original proof preservation and 390px overflow. All API traffic mocked.');
} finally { clearTimeout(deadline); releaseRefresh(); await browser.close(); }
