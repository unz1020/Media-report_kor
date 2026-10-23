const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
// Only pure model dependencies may load. A storage, network, or UI dependency fails.
function load(file) {
  const name = path.resolve(root, file);
  assert.ok(['lib/placement-showroom.ts', 'lib/media-normalization.ts', 'lib/placement-urls.ts'].some(p => path.resolve(root, p) === name), `Unexpected dependency: ${file}`);
  if (cache.has(name)) return cache.get(name).exports;
  const module = { exports: {} }; cache.set(name, module);
  const js = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'module', js)(p => {
    assert.ok(p.startsWith('.'), `Non-pure dependency: ${p}`);
    return load(path.resolve(path.dirname(name), `${p}.ts`));
  }, module.exports, module);
  return module.exports;
}
const { buildShowroomItems, classifyShowroom, showroomEvidenceFor, viralPostInfo } = load('lib/placement-showroom.ts');
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
const proof = (extra = {}) => ({ advertiser: 'Synthetic', month: '2030-01', reportDate: '2030-01-20', verificationDate: '2030-01-19', media: '포커스미디어', placement: '테스트 엘리베이터', campaignName: 'Fixture campaign', serviceType: '게재 보고', periodStart: '2030-01-01', periodEnd: '2030-02-01', location: 'Fixture location', airingTime: '', dailyFrequency: null, durationSec: null, budgetReference: null, status: '게재 확인', messageId: 'fixture', mailSubject: 'Synthetic report', mailDate: '2030-01-20', sourceFile: 'fixture.pdf', sourceSummary: '', attachments: [], ...extra });
const plan = (extra = {}) => ({ platform: '네이버', product: '검색광고', placement: '검색 PC', device: 'PC', creativeType: '영상', periodStart: '2030-01-01', periodEnd: '2030-02-01', budget: null, expectedImpressions: null, expectedClicks: null, target: '', sourceSheet: 'fixture', ...extra });
const metric = (extra = {}) => ({ platform: '네이버', placement: '검색 PC', achievement: null, guaranteed: '', spend: null, impressions: 0, clicks: null, ctr: null, views: null, sourceSheet: 'fixture', sourceFile: 'fixture.xlsx', reportDate: '2030-01-20', ...extra });
function expectClass(input, environment, surface) { assert.deepEqual(classifyShowroom(input), { environment, surface }, JSON.stringify(input)); }
for (const platform of ['SBS-TV', 'tvN STORY', 'tvN SRORY', 'ENA', 'E채널', 'KBS N스포츠', 'addressableTV', '어드레서블TV', 'Addr.TV', 'MBC', 'KBS2']) expectClass({ platform }, 'tv', 'broadcast');
for (const platform of ['Netflix', 'TVING', '넷플릭스']) expectClass({ platform, placement: '영상' }, 'tv', 'ott');
for (const platform of ['DV360', 'Display & Video 360']) for (const placement of ['SBS-TV 영상', 'CGV 영상', '메가박스', '동영상 네트워크']) expectClass({ platform, placement }, 'digital', 'unknown');
for (const platform of ['서울버스TV', 'SeoulBusTV']) expectClass({ platform }, 'ooh', 'transit');
for (const platform of ['포커스미디어', 'Focusmedia', '타운보드', 'Townboard', 'elevator']) expectClass({ platform }, 'ooh', 'elevator');
for (const platform of ['Yeoui12', 'GrowthStella', '올이즈웰']) expectClass({ platform }, 'ooh', 'outdoor');
expectClass({ platform: 'GS넷비전' }, 'ooh', 'unknown');
expectClass({ platform: 'GS넷비전', placement: '9호선 LCD' }, 'ooh', 'transit');
expectClass({ platform: '별도 매체', placement: '메가박스 중앙 서울버스내 TV광고' }, 'ooh', 'transit');
expectClass({ platform: '메가박스 중앙 서울버스내 TV광고' }, 'ooh', 'transit');
expectClass({ platform: 'CGV', placement: '상영관' }, 'ooh', 'cinema');
expectClass({ platform: '미상', placement: '동영상 TV광고' }, 'unclassified', 'unknown');
for (const platform of ['네이버', 'DV360', '네트워크']) {
  expectClass({ platform, placement: '검색 PC' }, 'digital', 'desktop');
  expectClass({ platform, placement: '검색 MO' }, 'digital', 'mobile');
  expectClass({ platform, device: 'PC/MO' }, 'digital', 'mixed');
  expectClass({ platform, device: '' }, 'digital', 'unknown');
  expectClass({ platform, device: 'mixed' }, 'digital', 'mixed');
}

// Synthetic package structure mirrors the schema, not private campaign values/sites.
const packageProof = proof({ media: '애드부스트스크린', placement: 'ADVoost Screen 커스텀 패키지', location: 'Outdoor A · Outdoor B · Outdoor C · Cinema A', evidence: { type: 'contact_sheet_of_original_report_photo_pages', sourcePage: [11, 12, 13, 14, 15], sourcePhotos: [
  { page: 11, site: '옥외 A (1/2)', photoDate: '2030-01-18' },
  { page: 12, site: '옥외 A (2/2)', photoDate: '2030-01-18' },
  { page: 13, site: '옥외 B', photoDate: '2030-01-18' },
  { page: 14, site: '옥외 C', photoDate: '2030-01-18' },
  { page: 15, site: 'CGV Fixture (상영관)', photoDate: '2030-01-19' },
] } });
const packageTotal = metric({ platform: '애드부스트', placement: '애드부스트', spend: 1234, impressions: 5678, sourceNotes: 'counts include service; spend excludes service' });
const packagePlan = plan({ platform: '애드부스트스크린', product: 'DOOH 커스텀 패키지', placement: 'DOOH 커스텀 패키지', device: '', budget: 1500 });
const inputs = deepFreeze({ proofs: [packageProof], plans: [packagePlan], rows: [packageTotal] });
const before = JSON.stringify(inputs);
const items = buildShowroomItems(inputs.proofs, inputs.plans, inputs.rows);
assert.equal(items.length, 5);
assert.equal(items.filter(i => i.surface === 'outdoor').length, 3);
assert.equal(items.filter(i => i.surface === 'cinema').length, 1);
assert.equal(items.filter(i => i.surface === 'elevator').length, 0, 'Never invent service inventory');
const children = items.filter(i => i.packageName);
assert.equal(children.length, 4);
for (const child of children) { assert.strictEqual(child.proofs[0], packageProof); assert.equal(child.proofs.length, 1); assert.equal(child.metrics.length, 0); assert.equal(child.plans.length, 0); assert.equal(child.service, false); }
assert.deepEqual(items.find(i => i.title === '옥외 A').evidencePages, [11, 12]);
assert.equal(items.find(i => i.title === '옥외 A').evidenceDate, '2030-01-18');
assert.equal(items.find(i => i.surface === 'cinema').evidenceDate, '2030-01-19');
const total = items.find(i => i.title === '패키지 합계');
assert.equal(total.surface, 'unknown'); assert.equal(total.environment, 'ooh');
assert.deepEqual(total.metrics, [packageTotal]); assert.deepEqual(total.plans, [packagePlan]);
assert.equal(items.flatMap(i => i.metrics).reduce((s, r) => s + (r.spend ?? 0), 0), 1234);
assert.equal(items.flatMap(i => i.metrics).reduce((s, r) => s + r.impressions, 0), 5678);
assert.equal(JSON.stringify(inputs), before);
assert.deepEqual(buildShowroomItems(inputs.proofs, inputs.plans, inputs.rows), items, 'Deterministic output and IDs');
assert.equal(new Set(items.map(i => i.id)).size, items.length);

// Explicit photo evidence, not a fixed service site list, creates a service child.
const explicitService = proof({ ...packageProof, evidence: { sourcePhotos: [{ page: 21, site: '미디어믿 아파트 엘리베이터', serviceType: '서비스', photoDate: '2030-01-19' }] } });
const serviceChild = buildShowroomItems([explicitService], [], [])[0];
assert.equal(serviceChild.surface, 'elevator'); assert.equal(serviceChild.service, true); assert.equal(serviceChild.metrics.length, 0);
for (const evidence of [null, {}, { sourcePhotos: [] }, { sourcePhotos: [null, {}, { site: '' }] }]) {
  assert.equal(buildShowroomItems([proof({ ...packageProof, evidence })], [], []).flatMap(i => i.proofs).length, 1, 'Malformed evidence retains proof');
}
const conflictingDates = proof({ ...packageProof, evidence: { sourcePhotos: [{ site: '옥외 A (1/2)', page: 1, photoDate: '2030-01-01' }, { site: '옥외 A (2/2)', page: 2, photoDate: '2030-01-02' }] } });
assert.equal(buildShowroomItems([conflictingDates], [], [])[0].evidenceDate, undefined);

// Canonical media and exact placement matching, without losing qualifiers or source rows.
const p1 = proof({ media: '네이버 GFA', placement: '검색 PC', location: '', creativeName: 'A' });
const p2 = proof({ ...p1, creativeName: 'B' });
const planOnly = plan({ platform: '새로운 매체', placement: '새 지면', budget: 0, device: '' });
const metricOnly = metric({ platform: '다른 미상매체', placement: '미확인', spend: 0, clicks: 0, impressions: 0 });
const row = metric({ platform: '네이버', placement: '검색 PC', spend: null, clicks: null });
const scoped = deepFreeze({ proofs: [p1, p2, p1], plans: [plan(), planOnly], rows: [row, metricOnly, { ...metricOnly, reportDate: '2030-02-20' }] });
const scopedBefore = JSON.stringify(scoped);
const result = buildShowroomItems(scoped.proofs, scoped.plans, scoped.rows);
const search = result.find(i => i.title === '검색 PC');
assert.equal(search.proofs.length, 3, 'Stored duplicates are not removed');
assert.strictEqual(search.proofs[0], p1); assert.strictEqual(search.proofs[2], p1);
assert.equal(search.plans.length, 1); assert.strictEqual(search.metrics[0], row);
assert.equal(search.metrics[0].spend, null); assert.equal(search.metrics[0].clicks, null); assert.equal(search.metrics[0].impressions, 0);
assert.strictEqual(result.flatMap(i => i.plans).find(p => p === planOnly), planOnly);
assert.equal(result.find(i => i.media === '새로운 매체').environment, 'unclassified');
const unknown = result.find(i => i.media === '다른 미상매체');
assert.equal(unknown.metrics.length, 2, 'No implicit date/campaign scope filtering');
assert.equal(unknown.metrics[0].spend, 0); assert.equal(unknown.metrics[0].clicks, 0);
assert.equal(JSON.stringify(scoped), scopedBefore);
const noAlias = buildShowroomItems([], [plan({ placement: '검색 (PC)' }), plan({ placement: '검색 (MO)', device: 'MO' })], [metric({ placement: '검색' })]);
assert.equal(noAlias.length, 3, 'No fuzzy parent-to-child assignment');
assert.equal(noAlias.find(i => i.title === '검색').metrics.length, 1);
const ambiguous = buildShowroomItems([], [plan({ placement: '검색', device: 'PC' }), plan({ placement: '검색', device: 'MO' })], [metric({ placement: '검색' })]);
assert.equal(ambiguous.length, 3, 'Unknown aggregate device cannot attach to either of two children');
const physicalSplit = buildShowroomItems([proof({ media: '애드부스트스크린', placement: '공통 지면', location: '옥외' }), proof({ media: '애드부스트스크린', placement: '공통 지면', location: '상영관' })], [], []);
assert.equal(physicalSplit.length, 2, 'Physical environments distinguish equal placement names');
// Header aliases are explicit inventory tokens, never fuzzy location containment.
const inventoryProof = proof({ ...packageProof, evidence: { sourcePhotos: [
  { site: 'MNME-LIVE (1/2)', page: 31, photoDate: '2030-01-18' },
  { site: 'MNME-LIVE (2/2)', page: 32, photoDate: '2030-01-18' },
  { site: 'GV-LIVE', page: 33 }, { site: 'J-LIVE', page: 34 },
  { site: 'CGV Gold (상영관)', page: 35, photoDate: '2030-01-19' },
] } });
const headers = ['대형전광판_MNME_Live', '대형전광판_GV_Live', '대형전광판_J_Live', 'CGV_Screen_Gold'];
const siteRows = headers.map((placement, index) => metric({ platform: '애드부스트스크린', placement, spend: index, impressions: 10, footTraffic: 50, metricLabel: '원본 Impression' }));
const joined = buildShowroomItems([inventoryProof], [], siteRows);
assert.equal(joined.length, 4);
for (const item of joined) { assert.equal(item.metrics.length, 1); assert.strictEqual(item.proofs[0], inventoryProof); }
assert.strictEqual(joined.find(i => i.surface === 'cinema').metrics[0], siteRows[3]);
assert.equal(joined.find(i => i.surface === 'cinema').metrics[0].footTraffic, 50);
const explicitServiceRow = metric({ platform: '애드부스트스크린', placement: '미디어믿_아파트 엘리베이터', spend: 0 });
const serviceOnly = buildShowroomItems([], [], [explicitServiceRow]);
assert.equal(serviceOnly.length, 1); assert.equal(serviceOnly[0].surface, 'elevator'); assert.equal(serviceOnly[0].service, true); assert.equal(serviceOnly[0].proofs.length, 0);
assert.equal(buildShowroomItems([inventoryProof], [], [metric({ platform: '애드부스트스크린', placement: 'CGV Gold 다른 지점' })]).length, 5, 'Different named site is not aliased');
assert.deepEqual(buildShowroomItems([], [], []), []);

const popupAlias = buildShowroomItems([proof({media:'호갱노노',placement:'종료 팝업'})],[],[metric({platform:'호갱노노',placement:'종료 팝업 (호갱노노)'})]);
assert.equal(popupAlias.length,1); assert.equal(popupAlias[0].metrics.length,1);
const paidWithBonus=buildShowroomItems([],[plan({platform:'ENA',placement:'ENA (*ENA PLAY 등 보너스)',product:'TV 광고',device:''})],[]);
assert.equal(paidWithBonus[0].service,false,'Bonus inventory included in a paid product does not make the whole product free');
const secondDocument=proof({...inventoryProof,evidence:{sourcePage:[91],sourcePhotos:[{page:91,site:'CGV Gold (상영관)',photoDate:'2030-01-25'}]}});
const mergedCinema=buildShowroomItems([inventoryProof,secondDocument],[],[]).find(item=>item.surface==='cinema');
assert.deepEqual(showroomEvidenceFor(mergedCinema,inventoryProof),{pages:[35],date:'2030-01-19'});
assert.deepEqual(showroomEvidenceFor(mergedCinema,secondDocument),{pages:[91],date:'2030-01-25'});
const noPhotoDate=proof({...secondDocument,evidence:{sourcePhotos:[{page:91,site:'CGV Gold (상영관)'}]}});
assert.equal(showroomEvidenceFor(mergedCinema,noPhotoDate).date,undefined,'Do not reuse a package-wide verification date for an undated site');

// Viral is an explicit source classification, not a synonym for all café advertising.
for (const field of ['media', 'platform', 'category', 'placement', 'product']) {
  for (const value of ['바이럴', '네이버 바이럴', '네이버바이럴', '커뮤니티 바이럴', 'VIRAL']) {
    expectClass({ [field]: value }, 'viral', 'community');
  }
}
for (const placement of ['네이버 카페 목록 네이티브 PAID 광고', '카페 댓글 네이티브 광고', '커뮤니티 네이티브', 'https://cafe.naver.com/synthetic/100']) {
  expectClass({ media: '네이버', placement }, 'digital', 'unknown');
}
expectClass({ placement: 'https://cafe.naver.com/synthetic/100' }, 'unclassified', 'unknown');
for (const field of ['media', 'platform', 'category', 'placement', 'product']) {
  for (const url of ['https://cafe.naver.com/viral/100', 'https://cafe.naver.com/fixture/100?topic=바이럴', 'cafe.naver.com/viral/100']) {
    assert.notEqual(classifyShowroom({ [field]: url }).environment, 'viral', 'An article URL alone is not an explicit viral classification');
  }
}
expectClass({ platform: '미상', placement: 'antiviral campaign' }, 'unclassified', 'unknown');
for (const placement of ['네이버 바이럴', 'SBS-TV', 'CGV 커뮤니티 바이럴']) {
  expectClass({ platform: 'DV360', placement }, 'digital', 'unknown');
}

const articleA = proof({ media: '네이버 바이럴', placement: '커뮤니티 바이럴 · Fixture Café · A: [Club]',
  creativeName: 'Fixture topic · Original title · subtitle', previewUrl: 'https://cafe.naver.com/synthetic/100',
  periodStart: '2030-01-02', reportDate: '2030-01-21', verificationDate: '',
  evidence: { type: 'report_document_with_embedded_cafe_screenshot', articleUrl: 'https://cafe.naver.com/synthetic/101', reportedPlacementDate: '2030-01-03', reportDate: '2030-01-20', independentlyLiveVerified: false } });
const articleB = proof({ ...articleA, creativeName: 'Another topic · Another original title', periodStart: '2030-01-04', reportDate: '2030-01-22', verificationDate: '2030-01-23',
  evidence: { type: 'report_document_with_embedded_cafe_screenshot', articleUrl: 'https://cafe.naver.com/synthetic/102', reportedPlacementDate: '2030-01-05', reportDate: '2030-01-22', independentlyLiveVerified: false } });
deepFreeze(articleA); deepFreeze(articleB);
const articleBefore = JSON.stringify([articleA, articleB]);
const viralPlan = plan({ platform: '네이버 바이럴', placement: articleA.placement, product: '커뮤니티 바이럴', device: '' });
const viralMetric = metric({ platform: '네이버 바이럴', placement: articleA.placement });
const paidCafe = proof({ media: '네이버', placement: '카페 목록/댓글 네이티브 PAID 광고' });
const viralItems = buildShowroomItems([articleA, articleB, paidCafe], [viralPlan], [viralMetric]);
const viralItem = viralItems.find(item => item.environment === 'viral');
assert.equal(viralItems.length, 2);
assert.equal(viralItem.media, '네이버', 'Keep canonical media for exact join behavior');
assert.equal(viralItem.surface, 'community');
const equalCafePlacement = 'Synthetic shared café inventory';
const explicitViralSameCafe = proof({ media: '네이버 바이럴', placement: equalCafePlacement });
const paidSameCafe = proof({ media: '네이버', placement: equalCafePlacement });
const equalCafeItems = buildShowroomItems([explicitViralSameCafe, paidSameCafe], [], []);
assert.equal(equalCafeItems.length, 2, 'Canonical media and identical café labels never collapse paid and viral environments');
assert.strictEqual(equalCafeItems.find(item => item.environment === 'viral').proofs[0], explicitViralSameCafe);
assert.strictEqual(equalCafeItems.find(item => item.environment === 'digital').proofs[0], paidSameCafe);
assert.deepEqual(viralItem.proofs, [articleA, articleB]);
assert.strictEqual(viralItem.proofs[0], articleA); assert.strictEqual(viralItem.proofs[1], articleB);
assert.strictEqual(viralItem.plans[0], viralPlan); assert.strictEqual(viralItem.metrics[0], viralMetric);
assert.strictEqual(viralItems.find(item => item.environment === 'digital').proofs[0], paidCafe);
assert.deepEqual(viralPostInfo(articleA), {
  cafeName: 'Fixture Café · A: [Club]', topic: 'Fixture topic', title: 'Original title · subtitle',
  articleUrl: 'https://cafe.naver.com/synthetic/101', reportedPlacementDate: '2030-01-03', reportDate: '2030-01-20', verificationDate: '',
});
assert.deepEqual(viralPostInfo(articleB), {
  cafeName: 'Fixture Café · A: [Club]', topic: 'Another topic', title: 'Another original title',
  articleUrl: 'https://cafe.naver.com/synthetic/102', reportedPlacementDate: '2030-01-05', reportDate: '2030-01-22', verificationDate: '2030-01-23',
});
assert.equal(JSON.stringify([articleA, articleB]), articleBefore);
assert.deepEqual(Object.keys(viralPostInfo(articleA)).sort(), ['articleUrl', 'cafeName', 'reportDate', 'reportedPlacementDate', 'title', 'topic', 'verificationDate'].sort(), 'No fabricated content or current/live-verification claim');
const unknownArticle = proof({ ...articleA, placement: 'Fixture: Café · Name [A]', creativeName: 'Entire source title', periodStart: '', verificationDate: '', previewUrl: '',
  landingUrl: 'https://landing.example.invalid/', sourceDocumentUrl: 'https://private.example.invalid/source.pdf',
  mailUrl: 'https://mail.example.invalid/message', evidence: { independentlyLiveVerified: false } });
assert.deepEqual(viralPostInfo(unknownArticle), { cafeName: 'Fixture: Café · Name [A]', title: 'Entire source title', topic: '', articleUrl: '', reportedPlacementDate: '', reportDate: '2030-01-21', verificationDate: '' });
assert.equal(viralPostInfo(proof({ ...unknownArticle, creativeName: '', placement: '커뮤니티 바이럴' })).title, '');
assert.equal(viralPostInfo(proof({ ...unknownArticle, placement: '커뮤니티 바이럴' })).cafeName, '');
assert.equal(viralPostInfo(proof({ ...unknownArticle, periodStart: '2028-02-29' })).reportedPlacementDate, '', 'A campaign start is not a publication date');
assert.equal(viralPostInfo(proof({ ...unknownArticle, evidence: {reportedPlacementDate: '2028-02-29'} })).reportedPlacementDate, '2028-02-29');
for (const date of ['', 'unknown', '2030-02-29', '2030-04-31', '2030-13-01', '2030-00-01', '2030-01-00', '2030-1-01', '2030-01-01T00:00:00Z']) {
  const info = viralPostInfo(proof({ ...unknownArticle, periodStart: date, reportDate: date, verificationDate: date, evidence: { reportedPlacementDate: date } }));
  assert.equal(info.reportedPlacementDate, ''); assert.equal(info.reportDate, ''); assert.equal(info.verificationDate, '');
}
assert.equal(viralPostInfo(proof({ ...unknownArticle, periodStart: '2030-01-07', evidence: { reportedPlacementDate: '2030-01-08' } })).reportedPlacementDate, '2030-01-08');
assert.equal(viralPostInfo(proof({ ...unknownArticle, periodStart: '2030-01-07', evidence: {} })).reportedPlacementDate, '', 'Do not infer a missing posting date from periodStart');
for (const url of ['', 'not a URL', '//cafe.naver.com/synthetic/1', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,fixture', 'file:///fixture', 'blob:https://cafe.naver.com/fixture', 'https://user:password@cafe.naver.com/synthetic/1']) {
  assert.equal(viralPostInfo(proof({ ...unknownArticle, previewUrl: url, evidence: { articleUrl: url } })).articleUrl, '', 'Unsafe article URL must not leak via either source');
}
assert.equal(viralPostInfo(proof({ ...unknownArticle, previewUrl: 'https://cafe.naver.com/synthetic/103', evidence: {} })).articleUrl, 'https://cafe.naver.com/synthetic/103');
assert.equal(viralPostInfo(proof({ ...unknownArticle, previewUrl: 'https://cafe.naver.com/synthetic/104', evidence: { articleUrl: 'javascript:alert(1)' } })).articleUrl, 'https://cafe.naver.com/synthetic/104');

// Every retained record belongs to exactly one environment, without changing input ownership.
const environmentFixtures = [
  { media: '포커스미디어', placement: 'Synthetic elevator', environment: 'ooh' },
  { media: 'ENA', placement: 'Synthetic broadcast', environment: 'tv' },
  { media: '네이버', placement: 'Synthetic café native PAID', environment: 'digital' },
  { media: '네이버 바이럴', placement: '커뮤니티 바이럴 · Synthetic Café', environment: 'viral' },
  { media: 'Synthetic unknown publisher', placement: 'Synthetic unknown inventory', environment: 'unclassified' },
];
const ownership = deepFreeze({
  proofs: Array.from({ length: 82 }, (_, index) => { const f = environmentFixtures[index % environmentFixtures.length]; return proof({ media: f.media, placement: f.placement, creativeName: 'Synthetic creative ' + index }); }),
  plans: environmentFixtures.map(f => plan({ platform: f.media, product: f.placement, placement: f.placement, device: '' })),
  rows: environmentFixtures.map(f => metric({ platform: f.media, placement: f.placement })),
});
const ownershipBefore = JSON.stringify(ownership);
const ownershipItems = buildShowroomItems(ownership.proofs, ownership.plans, ownership.rows);
assert.equal(ownershipItems.length, 5);
for (const [field, sources] of [['proofs', ownership.proofs], ['plans', ownership.plans], ['metrics', ownership.rows]]) {
  for (const source of sources) {
    const owners = ownershipItems.filter(item => item[field].some(value => value === source));
    assert.equal(owners.length, 1); assert.equal(owners[0][field].filter(value => value === source).length, 1);
    assert.equal(owners[0].environment, environmentFixtures.find(f => f.placement === source.placement).environment);
  }
}
assert.equal(ownershipItems.flatMap(item => item.proofs).length, 82);
assert.equal(JSON.stringify(ownership), ownershipBefore);
assert.deepEqual(buildShowroomItems(ownership.proofs, ownership.plans, ownership.rows), ownershipItems);

console.log('Showroom regressions passed: viral metadata/URL/date isolation and all-environment ownership, environment/device classification, evidence-driven package children, single unallocated total, exact matching, unknown records, null/zero, source references, unchanged scopes and frozen inputs.');
