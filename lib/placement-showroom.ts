import type { PlacementProof } from './placement-proof';
import type { MediaPlanFact } from './daily-report-parser';
import type { ReportingRow } from './reporting-data';
import { canonicalMedia } from './media-normalization';
import { safeHttpUrl } from './placement-urls';

export type ShowroomEnvironment = 'ooh' | 'tv' | 'digital' | 'viral' | 'unclassified';
export type ShowroomSurface = 'outdoor' | 'cinema' | 'elevator' | 'transit' | 'broadcast' | 'ott' | 'community' | 'mobile' | 'desktop' | 'mixed' | 'unknown';
export type ShowroomItem = {
  id: string;
  environment: ShowroomEnvironment;
  surface: ShowroomSurface;
  media: string;
  title: string;
  packageName?: string;
  locationLabel: string;
  proofs: PlacementProof[];
  plans: MediaPlanFact[];
  metrics: ReportingRow[];
  service: boolean;
  evidencePages?: number[];
  evidenceDate?: string;
};
type ClassificationInput = { platform?: string; media?: string; placement?: string; product?: string; category?: string; device?: string; location?: string; serviceType?: string };
type Classification = { environment: ShowroomEnvironment; surface: ShowroomSurface };
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
// Preserve qualifiers (PC/MO, service, site, etc.). Do not use fuzzy substring matching.
const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const compact = (value: string) => key(value).replace(/[._()·\-/]/g, '');
const classified = (environment: ShowroomEnvironment, surface: ShowroomSurface): Classification => ({ environment, surface });

function deviceSurface(row: ClassificationInput): ShowroomSurface {
  const tokens = `${row.device || ''} ${row.placement || ''} ${row.product || ''}`;
  const mobile = /(?:^|[^a-z0-9])(?:mo|mobile)(?:$|[^a-z0-9])|모바일/i.test(tokens);
  const desktop = /(?:^|[^a-z0-9])(?:pc|desktop)(?:$|[^a-z0-9])|데스크[톱탑]/i.test(tokens);
  if (mobile && desktop) return 'mixed';
  // Explicit mixed/unknown device declarations outrank a single incidental token.
  if (/mixed|혼합|공통|전체|all\s*devices/i.test(row.device || '')) return 'mixed';
  if (mobile) return 'mobile';
  if (desktop) return 'desktop';
  return 'unknown';
}

export function classifyShowroom(row: ClassificationInput): Classification {
  const identity = row.platform || row.media || '';
  const media = canonicalMedia(identity);
  const name = compact(identity), canonical = compact(media);
  const detail = `${row.placement || ''} ${row.product || ''} ${row.location || ''}`;
  const category = compact(row.category || '');
  // Buying platforms are not the broadcasters whose names happen to appear in a placement.
  if (media === 'DV360') return classified('digital', deviceSurface(row));
  // Inspect the original fields: canonicalMedia intentionally folds 네이버 바이럴 into 네이버.
  // Café URLs and ordinary café/native inventory are not evidence of a viral placement.
  const viral = [row.media, row.platform, row.category, row.placement, row.product]
    .some(value => {
      const label = text(value);
      if (/^(?:https?:\/\/|(?:www\.)?cafe\.naver\.com\/)\S+$/i.test(label)) return false;
      return /바이럴|(?:^|[^a-z0-9])viral(?:$|[^a-z0-9])/i.test(label);
    });
  if (viral) return classified('viral', 'community');
  if (['넷플릭스', '티빙'].includes(media)) return classified('tv', 'ott');
  if (/서울버스|seoulbustv/i.test(name)) return classified('ooh', 'transit');
  if (/포커스미디어|focusmedia|타운보드|townboard|미디어믿|엘리베이터|elevator/i.test(name)) return classified('ooh', 'elevator');
  if (/여의12|여의도12|yeoui12|그로스스텔라|growthstella|올이즈웰/i.test(name)) return classified('ooh', 'outdoor');
  const oohMedia = media === '애드부스트스크린' || /gs넷비전|gsnetvision|advoostscreen/i.test(name);
  // Transit inventory can contain a cinema operator's name and the word TV.
  if (/서울버스|버스\s*내|버스내|지하철|전철|호선|seoulbus|transit/i.test(`${identity} ${detail}`)) return classified('ooh', 'transit');
  if (/엘리베이터|elevator|아파트\s*(?:미디어|스크린|tv)/i.test(detail)) return classified('ooh', 'elevator');
  if (/^(?:KBS(?:[12]|[12]TV)?|MBC|SBS(?:TV)?|EBS[12]?|TVN(?:STORY|SRORY|DRAMA|SPORTS)?|JTBC[24]?|MBN|TV조선|채널A|YTN|연합뉴스TV|MNET|OCN|ENA|E채널|ECHANNEL|KBSN스포츠|KBSNSPORTS|어드레서블TV|ADDRESSABLETV|ADDRTV|TV)$/i.test(name) || canonical === '어드레서블tv') return classified('tv', 'broadcast');
  // Cinema is physical inventory only, not a vague video/TV format.
  if (/CGV|메가박스|롯데시네마|cinema|상영관|극장/i.test(`${identity} ${detail}`)) return classified('ooh', 'cinema');
  if (/옥외|전광판|빌보드|outdoor|MNME[- ]?LIVE|GV[- ]?LIVE|J[- ]?LIVE/i.test(detail)) return classified('ooh', 'outdoor');
  if (oohMedia || /^(ooh|dooh|옥외)$/.test(category)) return classified('ooh', 'unknown');
  const digital = ['유튜브', '네이버', '카카오', '당근', '틱톡', '키즈노트', '호갱노노', '직방'].includes(media)
    || /마미톡|meta|메타|facebook|instagram|구글|google|네트워크|network|gdn|크리테오|criteo|모비온|mobon/i.test(name)
    || /^(digital|디지털|온라인|sa|da|sns|검색|검색광고|디스플레이)$/.test(category);
  if (digital) return classified('digital', deviceSurface(row));
  if (/^(tv|지상파|케이블|방송|종편)$/.test(category)) return classified('tv', 'broadcast');
  return classified('unclassified', 'unknown');
}

const PACKAGE_MEDIA = '애드부스트스크린';
const PACKAGE_KEY = '@package';
function placementKey(media: string, placement: string): string {
  let normalized = key(placement);
  if (["호갱노노", "직방"].includes(media)) {
    const suffix = "(" + key(media) + ")";
    if (normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length);
    if (media === "호갱노노") normalized = ({"피드(커뮤니티)":"커뮤니티스토리피드", "피드(네이티브)":"네이티브피드형"} as Record<string,string>)[normalized] || normalized;
  }
  // Audited inventory identifiers only. Never strip arbitrary site/address qualifiers.
  if (media === PACKAGE_MEDIA) {
    const inventory = compact(placement);
    const aliases: Array<[string, string[]]> = [
      ['@site:mnme-live', ['대형전광판mnmelive', '을지로mnmelive', 'mnmelive']],
      ['@site:gv-live', ['대형전광판gvlive', '테헤란로gvlive', 'gvlive']],
      ['@site:j-live', ['대형전광판jlive', '종각jlive', 'jlive']],
      ['@site:cgv-gold', ['cgvscreengold', 'cgvgold상영관', 'cgvgold']],
    ];
    const alias = aliases.find(([, labels]) => labels.includes(inventory));
    if (alias) return alias[0];
  }
  // These exact labels denote the same package, never a specific child site.
  if (media === PACKAGE_MEDIA && [
    '애드부스트', '애드부스트스크린', '애드부스터', '애드부스터스크린',
    'advoost', 'advoostscreen', 'advoostscreen커스텀패키지',
    '애드부스트스크린커스텀패키지', 'dooh커스텀패키지', '패키지합계',
  ].includes(normalized)) return PACKAGE_KEY;
  return normalized;
}
function isService(row: ClassificationInput & { service?: unknown }): boolean {
  return (canonicalMedia(row.platform || row.media || '') === PACKAGE_MEDIA && compact(row.placement || '') === '미디어믿아파트엘리베이터') || row.service === true || /서비스|보너스|무상|\bservice\b|\bbonus\b/i.test(row.serviceType || '') || /서비스지면|\(서비스\)|\(보너스\)|^(?:서비스|보너스|무상)\s/.test(`${row.placement || ''} ${row.product || ''}`);
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function sourcePhotos(proof: PlacementProof): Record<string, unknown>[] {
  const evidence = object((proof as PlacementProof & { evidence?: unknown }).evidence);
  return Array.isArray(evidence?.sourcePhotos) ? evidence.sourcePhotos.flatMap(value => {
    const photo = object(value);
    return photo && text(photo.site) ? [photo] : [];
  }) : [];
}


function isoDate(value: unknown): string {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

/** Reported article metadata only. No article fetching, inferred content, or live-verification claim. */
export function viralPostInfo(proof: PlacementProof): {
  cafeName: string; title: string; topic: string; articleUrl: string;
  reportedPlacementDate: string; reportDate: string; verificationDate: string;
} {
  const evidence = object((proof as PlacementProof & { evidence?: unknown }).evidence);
  // Remove a known showroom label only, preserving punctuation inside the café's actual name.
  const cafeName = text(proof.placement)
    .replace(/^(?:커뮤니티\s*바이럴|네이버\s*바이럴|바이럴|viral)(?:\s*·\s*|$)/i, '').trim();
  const creative = text(proof.creativeName);
  // Only the original-report importer declares this legacy category/title encoding.
  // Arbitrary manually registered creative names, including middle dots, remain intact.
  const legacyReportName = evidence?.type === 'report_document_with_embedded_cafe_screenshot'
    && evidence?.creativeNameBasis === '원본 게재표의 분류와 게시글 제목'
    && evidence?.verifiedFromOriginalReport === true;
  const separator = legacyReportName ? creative.indexOf(' · ') : -1;
  const topic = text(evidence?.topic) || (separator >= 0 ? creative.slice(0, separator).trim() : '');
  const title = text(evidence?.articleTitle) || (separator >= 0 ? creative.slice(separator + 3).trim() : creative);
  let articleUrl = '';
  // Never fall back to landing, mail, attachment, or private source-document URLs.
  for (const candidate of [text(evidence?.articleUrl), text(proof.previewUrl)]) {
    try { articleUrl = safeHttpUrl(candidate); } catch { continue; }
    if (articleUrl) break;
  }
  return {
    cafeName, title, topic, articleUrl,
    // A campaign period is not evidence of the article publication date.
    reportedPlacementDate: isoDate(evidence?.reportedPlacementDate),
    reportDate: isoDate(evidence?.reportDate) || isoDate(proof.reportDate),
    verificationDate: isoDate(proof.verificationDate),
  };
}

/** Pure display projection. No filtering by campaign/month/date, writes, or source deduplication.
 * Callers supply their selected scope. Shared proof references are evidence, not extra campaigns.
 * Package totals are kept separate; this module never allocates budgets or reported counts.
 */
export function buildShowroomItems(proofs: PlacementProof[], plans: MediaPlanFact[], rows: ReportingRow[]): ShowroomItem[] {
  const items: ShowroomItem[] = [];
  const identities = new Map<ShowroomItem, string>();
  const evidenceDates = new Map<ShowroomItem, Set<string>>();
  function obtain(mediaInput: string, placement: string, classification: Classification, location = '', packageName?: string): ShowroomItem {
    const media = canonicalMedia(mediaInput);
    const normalized = placementKey(media, placement);
    const aggregate = media === PACKAGE_MEDIA && normalized === PACKAGE_KEY;
    const physical = aggregate ? classified('ooh', 'unknown') : classification;
    const identity = JSON.stringify([key(media), normalized, physical.environment, physical.surface]);
    let item = items.find(candidate => identities.get(candidate) === identity);
    if (!item) {
      item = { id: `showroom:${encodeURIComponent(identity)}`, ...physical, media,
        title: aggregate ? '패키지 합계' : placement || '미확인 지면',
        ...(packageName ? { packageName } : {}), locationLabel: location || (aggregate ? '패키지 전체' : placement || '위치 미확인'),
        proofs: [], plans: [], metrics: [], service: false };
      items.push(item);
      identities.set(item, identity);
    }
    if (location && item.locationLabel === item.title) item.locationLabel = location;
    return item;
  }
  function addEvidence(item: ShowroomItem, photo: Record<string, unknown>) {
    const page = photo.page;
    if (typeof page === 'number' && Number.isInteger(page) && page > 0) {
      item.evidencePages = [...new Set([...(item.evidencePages || []), page])].sort((a, b) => a - b);
    }
    const date = text(photo.photoDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const dates = evidenceDates.get(item) || new Set<string>();
      dates.add(date); evidenceDates.set(item, dates);
      // Do not imply a single capture date if the site has several.
      item.evidenceDate = dates.size === 1 ? date : undefined;
    }
  }
  for (const proof of proofs) {
    const photos = canonicalMedia(proof.media) === PACKAGE_MEDIA ? sourcePhotos(proof) : [];
    if (photos.length) {
      // Repeated photo pages of one site are one child; each child points at the SAME proof.
      const children = new Set<ShowroomItem>();
      for (const photo of photos) {
        const site = text(photo.site).replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, '').trim();
        const serviceType = text(photo.serviceType);
        const classification = classifyShowroom({ media: proof.media, placement: site, serviceType });
        const child = obtain(proof.media, site, classification, site, proof.placement);
        addEvidence(child, photo);
        child.service ||= isService({ placement: site, serviceType, service: photo.service }) || isService(proof);
        children.add(child);
      }
      for (const child of children) child.proofs.push(proof);
    } else {
      const item = obtain(proof.media, proof.placement, classifyShowroom(proof), proof.location);
      item.proofs.push(proof); item.service ||= isService(proof);
    }
  }
  // Exact canonical placement and environment first. An unknown surface may join ONE
  // compatible exact placement, never broadcast a parent total over several child sites.
  function match(row: ClassificationInput): ShowroomItem {
    const media = canonicalMedia(row.platform || row.media || '');
    const placement = row.placement || row.product || '';
    const normalized = placementKey(media, placement);
    const classification = classifyShowroom(row);
    const exact = items.filter(item => key(item.media) === key(media) && placementKey(media, item.title) === normalized);
    const physical = exact.find(item => item.environment === classification.environment && item.surface === classification.surface);
    if (physical && normalized !== PACKAGE_KEY) return physical;
    if (normalized !== PACKAGE_KEY && classification.surface === 'unknown') {
      const compatible = exact.filter(item => item.environment === classification.environment);
      if (compatible.length === 1) return compatible[0];
    }
    return obtain(media, placement, classification, row.location || '');
  }
  for (const plan of plans) {
    const item = match(plan); item.plans.push(plan); item.service ||= isService(plan);
  }
  for (const row of rows) {
    const item = match(row); item.metrics.push(row); item.service ||= isService(row);
    if (item.media === PACKAGE_MEDIA && placementKey(item.media, row.placement) !== PACKAGE_KEY && !item.packageName) {
      const names = [...new Set(items.map(candidate => candidate.packageName).filter((value): value is string => Boolean(value)))];
      if (names.length === 1) item.packageName = names[0];
    }
  }
  return items;
}

/** Page references belong to a proof document, never to the merged item globally. */
export function showroomEvidenceFor(item?: ShowroomItem, proof?: PlacementProof): { pages: number[]; date?: string } {
  if (!item || !proof) return { pages: [] };
  const photos = canonicalMedia(proof.media) === PACKAGE_MEDIA ? sourcePhotos(proof) : [];
  if (!photos.length) return { pages: [], date: proof.verificationDate || undefined };
  const relevant = photos.filter(photo => {
    const site = text(photo.site).replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/, '').trim();
    return placementKey(item.media, site) === placementKey(item.media, item.title);
  });
  const pages = [...new Set(relevant.map(photo => photo.page).filter((page): page is number => typeof page === 'number' && Number.isInteger(page) && page > 0))].sort((a,b) => a-b);
  const dates = [...new Set(relevant.map(photo => text(photo.photoDate)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))];
  return { pages, date: dates.length === 1 ? dates[0] : undefined };
}
