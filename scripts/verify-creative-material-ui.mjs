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
    delete copy.metadata.bundle.placementProof.materialIdentity;
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
      assert.deepEqual(Object.keys(input).sort(), ['advertiser', 'expectedUpdatedAt', 'importId', 'month', 'operation', 'performanceLink', ...('materialIdentity' in input ? ['materialIdentity'] : [])].sort());
      assert.equal(input.advertiser, advertiser); assert.equal(input.month, month);
      const record = imports.find(item => item.id === input.importId);
      assert.ok(record?.metadata.bundle.placementProof, 'Only saved synthetic proof UUIDs can be edited');
      assert.equal(input.expectedUpdatedAt, record.updated_at, 'CAS uses publishedAt hydrated from updated_at');
      if (conflictNext) { conflictNext = false; return json(route, { error: 'STALE_IMPORT' }, 409); }
      if (input.performanceLink) assert.deepEqual(input.performanceLink, { sourceFamily, platform: '직방', placement, creative: '소재A' });
      if (input.operation) assert.ok(['예정', '집행 중', '중단', '종료'].includes(input.operation.status));
      const before = clone(imports);
      if (Object.prototype.hasOwnProperty.call(input, "materialIdentity")) record.metadata.bundle.placementProof.materialIdentity = clone(input.materialIdentity);
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

  const open = async () => { await detail().getByRole('button',{name:'운영정보·성과 연결',exact:true}).click();await visible(editor()); };
  const save = async () => {await editor().getByRole('checkbox').check();await editor().getByRole('button',{name:'운영정보·성과 연결 저장',exact:true}).click();await gone(editor());};
  await page.goto(root+'/performance?view=rotation');await visible(panel().getByRole('button',{name:'기획전 성과 상세 선택',exact:true}));
  assert.equal(writes.length,0);
  await open();await editor().getByLabel('식별정보 관리',{exact:true}).selectOption('edit');
  await editor().getByLabel('소재ID',{exact:true}).fill('cr001');await editor().getByLabel('소재 버전',{exact:true}).fill('v1');
  await editor().getByLabel('소재 관리명',{exact:true}).fill('기획전');await editor().getByLabel('소재 규격 (선택)',{exact:true}).fill('30초');
  await editor().getByLabel('확인한 소재 파일명 (보고용·선택)',{exact:true}).fill('original.mp4');
  await visible(editor().getByText('자코모_CR001_기획전_v01_30초.mp4',{exact:true}));assert.equal(writes.length,0,'Typing never persists or renames a file');
  await editor().getByRole('radio',{name:/^소재A/}).check();await save();
  const declared=imports.find(record=>record.id===uuid(10)).metadata.bundle.placementProof;
  assert.deepEqual(declared.materialIdentity,{assetId:'CR001',version:'v01',displayName:'기획전',format:'30초',reportedFilename:'original.mp4'});
  assert.equal(declared.creativeName,'기획전');assert.equal(declared.sourceFile,'synthetic-proof.pdf');
  await panel().getByRole('button',{name:'기획전 (CR001 · v01) 성과 상세 선택',exact:true}).click();
  await metric('노출','3,000');await visible(panel().getByText('original.mp4',{exact:true}));
  await panel().locator('input[type="search"]').fill('CR001');assert.match(await panel().textContent(),/CR001/);await panel().locator('input[type="search"]').fill('');
  const downloadPending=page.waitForEvent('download');await panel().getByRole('button',{name:'선택 지면 CSV',exact:true}).click();const download=await downloadPending;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');assert.ok(csv.includes('material_id'));assert.ok(csv.includes('CR001'));assert.ok(csv.includes('original.mp4'));assert.equal(writes.length,1);
  await page.setViewportSize({width:390,height:844});await open();await editor().getByLabel('식별정보 관리',{exact:true}).selectOption('edit');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Material editor fits 390px');
  await editor().screenshot({path:process.env.MATERIAL_EDITOR_PROOF||'/tmp/creative-material-editor.png'});
  await editor().getByLabel('소재ID',{exact:true}).fill('AB');await editor().getByRole('checkbox').check();await editor().getByRole('button',{name:'운영정보·성과 연결 저장',exact:true}).click();await visible(editor().getByRole('alert'));assert.equal(writes.length,1,'Invalid key never reaches the endpoint');await editor().getByRole('button',{name:'취소',exact:true}).click();await gone(editor());
  await page.setViewportSize({width:1440,height:1000});await panel().screenshot({path:process.env.MATERIAL_PANEL_PROOF||'/tmp/creative-material-panel.png'});
  await open();assert.equal(await editor().getByLabel('식별정보 관리',{exact:true}).inputValue(),'preserve');await editor().getByLabel('식별정보 관리',{exact:true}).selectOption('clear');await save();assert.equal(imports.find(record=>record.id===uuid(10)).metadata.bundle.placementProof.materialIdentity,null);
  assert.deepEqual(imports.find(record=>record.id===uuid(10)).metadata.bundle.placementProof.performanceLink,{sourceFamily,platform:'직방',placement,creative:'소재A'});
  assert.deepEqual(stripEditable(imports),stripEditable(original),'Only annotations and CAS fields changed; facts, names, source files, pictures and dates preserved');
  access='viewer';await page.reload();await visible(panel().getByRole('button',{name:'기획전 성과 상세 선택',exact:true}));assert.equal(await detail().getByRole('button',{name:'운영정보·성과 연결',exact:true}).count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.equal(writes.length,2);
  console.log('Material identity UI checks passed: draft-only form, canonical ID/version, explicit source mapping, filename suggestion, search, CSV, 390px, invalid key denial, explicit clear, source preservation and viewer read-only.');
} finally { await browser.close(); }
