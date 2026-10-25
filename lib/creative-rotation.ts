import type { CreativeDailyFact, MediaPlanFact } from './daily-report-parser';
import type { PublishedDataset } from './daily-report-store';
import type { PlacementProof } from './placement-proof';
import type { ReportingRow } from './reporting-data';
import { isPerformanceReferenceRow } from './performance-report';
import { canonicalMedia } from './media-normalization';
import { buildShowroomItems, showroomPlacementIdentity, type ShowroomEnvironment, type ShowroomSurface } from './placement-showroom';

export type CreativeRotationMetrics = {
  impressions: number | null; clicks: number | null; ctr: number | null;
  spend: number | null; views: number | null; conversions: number | null;
  cpc: number | null; cpm: number | null; cpv: number | null;
};
export type CreativeRotationSourceFact = CreativeDailyFact & { spend?: number | null; views?: number | null; conversions?: number | null };
/** Original owners are retained, not cloned or mutated. selected means counted once. */
export type CreativeRotationRow = {
  row: CreativeRotationSourceFact; dataset: PublishedDataset; datasetKey: string;
  family: string; sourceFamily: string; mapping: 'exact_name' | 'explicit_link' | 'unlinked' | 'mapping_conflict'; sourceFile: string; reportDate: string; publishedAt: string;
  sourceIndex: number; selected: boolean; conflict: boolean;
};
export type CreativeRotationEntry = {
  id: string; name: string; proofs: PlacementProof[]; plans: MediaPlanFact[];
  rows: CreativeRotationRow[]; metrics: CreativeRotationMetrics;
  firstPerformanceDate: string | null; lastPerformanceDate: string | null; lastReportDate: string | null;
  reportedDates: string[]; conflictDates: string[];
};
export type CreativeRotationGroup = {
  id: string; media: string; placement: string; environment: ShowroomEnvironment; surface: ShowroomSurface;
  creatives: CreativeRotationEntry[]; unlinkedPerformance: CreativeRotationEntry[];
  unnamedProofs: PlacementProof[]; unassignedPlans: MediaPlanFact[];
  ambiguousScope: boolean; placementMetrics: ReportingRow[];
};
export type CreativeRotationReport = {
  advertiser?: string; month?: string; startDate: string; endDate: string; groups: CreativeRotationGroup[]; sourceRowCount: number; conflictCount: number;
};
export type CreativeRotationInput = {
  datasets: PublishedDataset[]; proofs: PlacementProof[]; plans: MediaPlanFact[];
  advertiser?: string; month?: string; placementRows?: ReportingRow[]; startDate: string; endDate: string;
};
const clean = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const namedCreative = (value: string | undefined) => {
  const name = clean(value || '');
  return !!name && !['-', '—', 'n/a'].includes(name);
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function iso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const scope = (media: string, placement: string) => JSON.stringify([clean(canonicalMedia(media)), showroomPlacementIdentity(media, placement)]);
const nullable = (value: number) => Number.isFinite(value) ? value : null;
function referenceCost(owner: CreativeRotationRow): boolean {
  return isPerformanceReferenceRow(owner.row)
    || isPerformanceReferenceRow(owner.dataset as PublishedDataset & { sourceKind?: string })
    || isPerformanceReferenceRow(owner.dataset.bundle as PublishedDataset['bundle'] & { sourceKind?: string });
}
function metrics(rows: CreativeRotationRow[]): CreativeRotationMetrics {
  const selected = rows.filter(row => row.selected && !row.conflict);
  const facts = selected.map(owner => owner.row);
  const paid = selected.filter(owner => !referenceCost(owner)).map(owner => owner.row);
  function sum(field: 'impressions' | 'clicks' | 'spend' | 'views' | 'conversions') {
    const values = (field === 'spend' ? paid : facts).map(row => row[field]).filter(finite);
    return values.length ? nullable(values.reduce((a, b) => a + b, 0)) : null;
  }
  function ratio(numerator: 'clicks' | 'spend', denominator: 'impressions' | 'clicks' | 'views', multiplier = 1) {
    const paired = (numerator === 'spend' ? paid : facts).filter(row => finite(row[numerator]) && finite(row[denominator]));
    if (!paired.length) return null;
    const n = paired.reduce((a, row) => a + (row[numerator] as number), 0);
    const d = paired.reduce((a, row) => a + (row[denominator] as number), 0);
    return finite(n) && finite(d) && d > 0 ? nullable(n / d * multiplier) : null;
  }
  return { impressions: sum('impressions'), clicks: sum('clicks'), spend: sum('spend'), views: sum('views'),
    conversions: sum('conversions'), ctr: ratio('clicks', 'impressions', 100), cpc: ratio('spend', 'clicks'),
    cpm: ratio('spend', 'impressions', 1000), cpv: ratio('spend', 'views') };
}
function entry(group: CreativeRotationGroup, name: string, registered: boolean, forceUnlinked = false): CreativeRotationEntry {
  const identity = clean(name);
  const existing = (forceUnlinked ? group.unlinkedPerformance : [...group.creatives, ...group.unlinkedPerformance]).find(item => clean(item.name) === identity);
  if (existing) return existing;
  const item: CreativeRotationEntry = { id: group.id + (registered ? ':creative:' : ':performance:') + encodeURIComponent(identity), name,
    proofs: [], plans: [], rows: [], metrics: metrics([]), firstPerformanceDate: null, lastPerformanceDate: null,
    lastReportDate: null, reportedDates: [], conflictDates: [] };
  (registered ? group.creatives : group.unlinkedPerformance).push(item);
  return item;
}
/** Select snapshots, not cumulative sums. Any unresolved overlap withholds the whole identity/day. */
function resolve(item: CreativeRotationEntry): number {
  const days = new Map<string, CreativeRotationRow[]>();
  for (const owner of item.rows) {
    const rows = days.get(owner.row.date) || []; rows.push(owner); days.set(owner.row.date, rows);
  }
  for (const [date, owners] of days) {
    const families = new Map<string, CreativeRotationRow[]>();
    for (const owner of owners) {
      const rows = families.get(owner.family) || []; rows.push(owner); families.set(owner.family, rows);
    }
    const candidates: CreativeRotationRow[] = [];
    for (const rows of families.values()) {
      const published = (row: CreativeRotationRow) => finite(Date.parse(row.publishedAt)) ? Date.parse(row.publishedAt) : -Infinity;
      const latest = rows.reduce((a, b) => a.reportDate > b.reportDate || (a.reportDate === b.reportDate && published(a) >= published(b)) ? a : b);
      candidates.push(...rows.filter(row => row.reportDate === latest.reportDate && published(row) === published(latest)));
    }
    // Original sheet and placement identities cannot collapse just because metrics agree.
    const signatures = new Set(candidates.map(owner => JSON.stringify([
      clean(owner.row.platform), clean(owner.row.placement), clean(owner.row.sourceSheet || ''), clean(owner.row.creative || ''), referenceCost(owner),
      ...(['impressions', 'clicks', 'ctr', 'spend', 'views', 'conversions'] as const)
        .map(field => finite(owner.row[field]) ? owner.row[field] : null),
    ])));
    if (families.size > 1 || signatures.size > 1 || owners.some(owner => owner.mapping === 'mapping_conflict')) {
      item.conflictDates.push(date); for (const owner of owners) owner.conflict = true;
    } else if (candidates.length) candidates[0].selected = true;
  }
  item.reportedDates = [...days.keys()].sort(); item.conflictDates.sort();
  item.firstPerformanceDate = item.reportedDates[0] || null;
  item.lastPerformanceDate = item.reportedDates.at(-1) || null;
  item.lastReportDate = item.rows.map(row => row.reportDate).sort().at(-1) || null;
  item.metrics = metrics(item.rows);
  return item.conflictDates.length;
}

export function buildCreativeRotationReport(input: CreativeRotationInput): CreativeRotationReport {
  if (!iso(input.startDate) || !iso(input.endDate) || input.startDate > input.endDate) throw new Error('Valid ordered ISO calendar dates required');
  const groups: CreativeRotationGroup[] = [];
  const candidates = new Map<string, CreativeRotationGroup[]>();
  const proofOwners = input.proofs.filter(proof =>
    (input.advertiser === undefined || proof.advertiser === input.advertiser)
    && (input.month === undefined || proof.month === input.month));
  const datasetOwners = input.datasets.filter(dataset =>
    (input.advertiser === undefined || (dataset.advertiser === input.advertiser && dataset.bundle.advertiser === input.advertiser))
    && (input.month === undefined || dataset.month === input.month));
  const originals = buildShowroomItems(proofOwners, input.plans, input.placementRows || []);
  for (const inventory of originals) {
    const group: CreativeRotationGroup = { id: inventory.id, media: inventory.media, placement: inventory.title,
      environment: inventory.environment, surface: inventory.surface, creatives: [], unlinkedPerformance: [],
      unnamedProofs: [], unassignedPlans: [], ambiguousScope: false, placementMetrics: [] };
    groups.push(group);
    const identity = scope(group.media, group.placement);
    const existing = candidates.get(identity) || []; existing.push(group); candidates.set(identity, existing);
    for (const proof of inventory.proofs) {
      if (namedCreative(proof.creativeName)) entry(group, proof.creativeName!, true).proofs.push(proof);
      else group.unnamedProofs.push(proof);
    }
    for (const plan of inventory.plans) {
      if (namedCreative(plan.creativeName)) entry(group, plan.creativeName!, true).plans.push(plan);
      else group.unassignedPlans.push(plan);
    }
  }
  const sourceGroups = new Map<string, CreativeRotationGroup>();
  function target(media: string, placement: string): CreativeRotationGroup {
    const identity = scope(media, placement), matches = candidates.get(identity) || [];
    if (matches.length === 1) return matches[0];
    let group = sourceGroups.get(identity);
    if (!group) {
      group = { id: 'rotation:source:' + encodeURIComponent(identity), media: canonicalMedia(media), placement,
        environment: 'unclassified', surface: 'unknown', creatives: [], unlinkedPerformance: [], unnamedProofs: [],
        unassignedPlans: [], ambiguousScope: matches.length > 1, placementMetrics: [] };
      sourceGroups.set(identity, group); groups.push(group);
      if (matches.length > 1) for (const candidate of matches) candidate.ambiguousScope = true;
    }
    return group;
  }
  // Strictly rejoin placement metrics, not the showroom's display-only device fallback.
  for (const row of input.placementRows || []) target(row.platform, row.placement).placementMetrics.push(row);
  let sourceRowCount = 0, conflictCount = 0;
  for (const dataset of datasetOwners) {
    const reportDate = dataset.bundle.reportDate;
    if (!iso(reportDate)) continue;
    const suffix = dataset.key.match(/::(\d{4}-\d{2}-\d{2})$/);
    const familyKey = suffix && iso(suffix[1]) ? dataset.key.slice(0, -12) : dataset.key;
    const family = JSON.stringify([dataset.advertiser, dataset.month, familyKey]);
    (dataset.bundle.creativeDailyPerformance || []).forEach((row, sourceIndex) => {
      if (!iso(row.date) || row.date < input.startDate || row.date > input.endDate) return;
      sourceRowCount++;
      const group = target(row.platform, row.placement);
      // A blank creator is source-only, never a merged blank proof/plan.
      const links = group.creatives.filter(candidate => candidate.proofs.some(proof => {
        const link = (proof as PlacementProof & { performanceLink?: { sourceFamily: string; platform: string; placement: string; creative: string } }).performanceLink;
        return namedCreative(row.creative) && link && link.sourceFamily === familyKey && scope(link.platform, link.placement) === scope(row.platform, row.placement)
          && clean(link.creative) === clean(row.creative || '');
      }));
      const collision = links.length > 1;
      const exact = group.creatives.find(candidate => namedCreative(row.creative) && clean(candidate.name) === clean(row.creative || '') &&
        (candidate.plans.length > 0 || candidate.proofs.some(proof => !(proof as PlacementProof & { performanceLink?: unknown }).performanceLink)));
      const linked = !collision ? links[0] || exact : undefined;
      const item = linked || entry(group, row.creative || '', false, true);
      const mapping = collision ? 'mapping_conflict' : links.length === 1 ? 'explicit_link' : linked ? 'exact_name' : 'unlinked';
      if (collision) group.ambiguousScope = true;
      item.rows.push({ row, dataset, datasetKey: dataset.key, family, sourceFile: dataset.sourceFile,
        sourceFamily: familyKey, mapping, reportDate, publishedAt: dataset.publishedAt, sourceIndex, selected: false, conflict: false });
    });
  }
  for (const group of groups) for (const item of [...group.creatives, ...group.unlinkedPerformance]) conflictCount += resolve(item);
  return { advertiser: input.advertiser, month: input.month, startDate: input.startDate, endDate: input.endDate, groups, sourceRowCount, conflictCount };
}

/** All CSV exports are BOM-prefixed, quoted and spreadsheet-formula safe. */
function serializeCsv(lines: unknown[][]): string {
  function cell(value: unknown): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return '\ufeff' + lines.map(line => line.map(cell).join(',')).join('\r\n');
}
const list = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))].join(' | ');
function aeOperationReports(proofs: PlacementProof[]): string {
  return list(proofs.flatMap(proof => {
    const operation = proof.operation;
    return operation && iso(operation.asOf) && ['예정', '집행 중', '중단', '종료'].includes(operation.status)
      ? [`AE 원본 보고: ${operation.status} (${operation.asOf})${operation.note ? ' · ' + operation.note : ''}`] : [];
  }));
}
/** Client-facing report: exactly one row per creative entry; aggregate amounts appear ONCE.
 * Supplied calendar days only. Coverage/source statements never imply live delivery state.
 * Unnamed evidence and unassigned plans remain available in the model/audit, not fake creatives.
 */
export function creativeRotationCsv(report: CreativeRotationReport): string {
  const columns = ['scope_advertiser', 'scope_month', 'scope_start', 'scope_end', 'media', 'placement', 'environment', 'surface',
    'ambiguous_scope', 'registration', 'creative', 'row_mapping', 'reported_dates', 'counted_dates', 'conflict_dates',
    'first_performance_date', 'last_performance_date', 'last_report_date', 'reported_day_count', 'counted_day_count',
    'source_row_count', 'counted_row_count', 'source_files', 'proof_source_status', 'plan_source_status',
    'ae_operation_source_reports', 'proof_report_dates', 'proof_verification_dates', 'source_report_dates', 'source_periods',
    'impressions', 'clicks', 'ctr', 'paid_provided_spend', 'views', 'conversions', 'paid_provided_cpc', 'paid_provided_cpm', 'paid_provided_cpv',
    'impression_coverage_dates', 'click_coverage_dates', 'paid_spend_coverage_dates', 'view_coverage_dates', 'conversion_coverage_dates'];
  const lines: unknown[][] = [columns];
  for (const group of report.groups) {
    for (const [registration, items] of [['registered', group.creatives], ['unlinked_source_only', group.unlinkedPerformance]] as const) {
      for (const item of items) {
        const counted = item.rows.filter(owner => owner.selected && !owner.conflict);
        const dates = (rows: CreativeRotationRow[]) => [...new Set(rows.map(owner => owner.row.date))].sort();
        const coverage = (field: 'impressions' | 'clicks' | 'spend' | 'views' | 'conversions') => dates(counted.filter(owner =>
          finite(owner.row[field]) && (field !== 'spend' || !referenceCost(owner)))).join('|');
        const m = item.metrics;
        lines.push([report.advertiser, report.month, report.startDate, report.endDate, group.media, group.placement, group.environment,
          group.surface, group.ambiguousScope, registration, item.name, list(item.rows.map(owner => owner.mapping)),
          item.reportedDates.join('|'), dates(counted).join('|'), item.conflictDates.join('|'), item.firstPerformanceDate,
          item.lastPerformanceDate, item.lastReportDate, item.reportedDates.length, dates(counted).length, item.rows.length, counted.length,
          list([...item.proofs.map(proof => proof.sourceFile), ...item.rows.map(owner => owner.sourceFile)]),
          list(item.proofs.map(proof => proof.status)), list(item.plans.map(plan => plan.operationStatus || plan.proposalStatus)),
          aeOperationReports(item.proofs), list(item.proofs.map(proof => proof.reportDate)), list(item.proofs.map(proof => proof.verificationDate)),
          list(item.rows.map(owner => owner.reportDate)), list([...item.proofs, ...item.plans].map(owner =>
            owner.periodStart || owner.periodEnd ? `${owner.periodStart}~${owner.periodEnd}` : '')),
          m.impressions, m.clicks, m.ctr, m.spend, m.views, m.conversions, m.cpc, m.cpm, m.cpv,
          coverage('impressions'), coverage('clicks'), coverage('spend'), coverage('views'), coverage('conversions')]);
      }
    }
  }
  return serializeCsv(lines);
}

/** Optional raw-owner audit. NO aggregate metrics are repeated here. */
export function creativeRotationAuditCsv(report: CreativeRotationReport): string {
  const lines: unknown[][] = [['scope_advertiser', 'scope_month', 'scope_start', 'scope_end', 'media', 'placement', 'environment', 'surface',
    'ambiguous_scope', 'mapping', 'creative', 'source_type', 'source_status', 'ae_operation_source_report', 'source_report_date',
    'source_period_start', 'source_period_end', 'source_file', 'source_family', 'row_mapping', 'source_index', 'performance_date',
    'counted', 'conflict', 'reference_cost_excluded', 'raw_impressions', 'raw_clicks', 'raw_ctr', 'raw_spend', 'raw_views', 'raw_conversions']];
  function emit(group: CreativeRotationGroup, mapping: string, item?: CreativeRotationEntry,
    source?: PlacementProof | MediaPlanFact | CreativeRotationRow | ReportingRow, type = '') {
    const owner = type === 'performance' ? source as CreativeRotationRow : undefined;
    const proof = type === 'proof' ? source as PlacementProof : undefined;
    const plan = type === 'plan' ? source as MediaPlanFact : undefined;
    const placement = type === 'placement_metric' ? source as ReportingRow : undefined;
    const raw = owner?.row || placement;
    lines.push([report.advertiser, report.month, report.startDate, report.endDate, group.media, group.placement, group.environment,
      group.surface, group.ambiguousScope, mapping, item?.name, type, proof?.status || plan?.operationStatus || plan?.proposalStatus,
      proof ? aeOperationReports([proof]) : '', owner?.reportDate || proof?.reportDate || placement?.reportDate,
      proof?.periodStart || plan?.periodStart, proof?.periodEnd || plan?.periodEnd, owner?.sourceFile || proof?.sourceFile || placement?.sourceFile,
      owner?.sourceFamily, owner?.mapping, owner?.sourceIndex, owner?.row.date, owner?.selected, owner?.conflict,
      owner ? referenceCost(owner) : placement ? isPerformanceReferenceRow(placement) : undefined,
      raw?.impressions, raw?.clicks, raw?.ctr, raw?.spend, raw?.views, raw?.conversions]);
  }
  for (const group of report.groups) {
    for (const [mapping, items] of [['registered', group.creatives], ['unlinked_source_only', group.unlinkedPerformance]] as const) {
      for (const item of items) {
        for (const proof of item.proofs) emit(group, mapping, item, proof, 'proof');
        for (const plan of item.plans) emit(group, mapping, item, plan, 'plan');
        for (const owner of item.rows) emit(group, mapping, item, owner, 'performance');
      }
    }
    for (const proof of group.unnamedProofs) emit(group, 'unnamed_evidence', undefined, proof, 'proof');
    for (const plan of group.unassignedPlans) emit(group, 'unassigned_plan', undefined, plan, 'plan');
    for (const row of group.placementMetrics) emit(group, 'placement_only_not_allocated', undefined, row, 'placement_metric');
  }
  return serializeCsv(lines);
}
