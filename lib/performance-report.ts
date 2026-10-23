import type { ReportingRow, DailyPerformanceRow, CreativeDailyRow } from './reporting-data';
import type { MediaPlanFact } from './daily-report-parser';
import { canonicalMedia } from './media-normalization';
import { classifyShowroom } from './placement-showroom';

export type ReportKind = 'digital' | 'video' | 'broadcast' | 'ooh' | 'other';
export type ReportMetrics = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  views: number | null;
  conversions: number | null;
  cpc: number | null;
  cpm: number | null;
  cpv: number | null;
  rowCount: number;
  spendRowCount: number;
  clickRowCount: number;
  viewRowCount: number;
};
export type MediaPerformanceReport = {
  name: string;
  kind: ReportKind;
  rows: ReportingRow[];
  dailyRows: DailyPerformanceRow[];
  creativeRows?: CreativeDailyRow[];
  plans: MediaPlanFact[];
  metrics: ReportMetrics;
  reportDate: string | null;
  dailyThrough: string | null;
  creativeThrough?: string | null;
  sourceCount: number;
};

type Input = {
  rows: ReportingRow[];
  dailyRows: DailyPerformanceRow[];
  creativeRows?: CreativeDailyRow[];
  plans: MediaPlanFact[];
  startDate: string;
  endDate: string;
  baselineComplete: boolean;
};
type MetricKey = 'spend' | 'impressions' | 'clicks' | 'views' | 'conversions';
type ReferenceLabels = {
  placement?: string;
  sourceKind?: string;
  service?: unknown;
  serviceType?: unknown;
  spendLabel?: unknown;
  product?: unknown;
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// These rows remain visible as original evidence, but their reference costs are
// not paid spend. Never interpret a general source note mentioning service as a flag.
export function isPerformanceReferenceRow(row: ReferenceLabels): boolean {
  const labels = row;
  if (labels.service === true || row.sourceKind === 'showroom_breakdown') return true;
  const text = [row.placement, labels.product, labels.serviceType, labels.spendLabel]
    .filter((value): value is string => typeof value === 'string').join(' ');
  return /서비스\s*(?:지면|비용|참고)|\((?:서비스|보너스|무상)\)|(?:^|\s)(?:서비스|보너스|무상)(?:\s|$)|\b(?:service|bonus|reference\s*(?:cost|spend)|cost\s*reference)\b|참고\s*(?:비용|금액)|비용\s*참고/i.test(text);
}

function sum(rows: readonly ReportingRow[], key: MetricKey): number | null {
  let total = 0, count = 0;
  for (const row of rows) {
    const value = row[key];
    if (finite(value)) { total += value; count++; }
  }
  return count && finite(total) ? total : null;
}

// Every rate uses its own paired population, not the independently available
// headline totals and never supplied row rates. CTR is percentage, CPM per 1,000.
function pairedRate(rows: readonly ReportingRow[], numerator: MetricKey, denominator: MetricKey, scale = 1): number | null {
  let top = 0, bottom = 0, count = 0;
  for (const row of rows) {
    const a = row[numerator], b = row[denominator];
    if (finite(a) && finite(b)) { top += a; bottom += b; count++; }
  }
  const result = top / bottom * scale;
  return count && finite(top) && finite(bottom) && bottom > 0 && finite(result) ? result : null;
}

function metricsFor(rows: ReportingRow[], baselineComplete: boolean): ReportMetrics {
  const paid = rows.filter(row => !isPerformanceReferenceRow(row));
  const period = (value: number | null) => baselineComplete ? value : null;
  return {
    spend: period(sum(paid, 'spend')),
    impressions: period(sum(rows, 'impressions')),
    clicks: period(sum(rows, 'clicks')),
    ctr: period(pairedRate(rows, 'clicks', 'impressions', 100)),
    views: period(sum(rows, 'views')),
    conversions: period(sum(rows, 'conversions')),
    cpc: period(pairedRate(paid, 'spend', 'clicks')),
    cpm: period(pairedRate(paid, 'spend', 'impressions', 1000)),
    cpv: period(pairedRate(paid, 'spend', 'views')),
    rowCount: rows.length,
    spendRowCount: paid.filter(row => finite(row.spend)).length,
    clickRowCount: rows.filter(row => finite(row.clicks)).length,
    viewRowCount: rows.filter(row => finite(row.views)).length,
  };
}

function kindFor(name: string, records: Array<ReportingRow | DailyPerformanceRow | MediaPlanFact>): ReportKind {
  // Classify the buying channel first; creative titles/CTR are not objectives.
  const channel = classifyShowroom({ platform: name });
  if (channel.environment === 'ooh') return 'ooh';
  if (channel.surface === 'broadcast') return 'broadcast';
  if (channel.surface === 'ott' || ['유튜브', '틱톡'].includes(name)) return 'video';
  if (channel.environment === 'digital') return 'digital';
  // Explicit inventory/category metadata can classify otherwise unknown channels.
  const classes = records.map(row => classifyShowroom(row));
  if (classes.some(item => item.environment === 'ooh')) return 'ooh';
  if (classes.some(item => item.surface === 'broadcast')) return 'broadcast';
  if (classes.some(item => item.surface === 'ott')) return 'video';
  if (classes.some(item => item.environment === 'digital')) return 'digital';
  return 'other';
}

function latest(values: Array<string | null>): string | null {
  let result: string | null = null;
  for (const value of values) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    const parsed = new Date(value + 'T00:00:00Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value && (!result || value > result)) result = value;
  }
  return result;
}

/** Read-only projection. Period rows are already caller-scoped. Daily facts are
 * retained separately, never added to those rows or used as a cumulative fallback.
 * Creative daily facts are separately scoped source evidence, never actual totals.
 * Plan budgets/dates never become actuals, allocations, pacing or achievement.
 * Coverage counters describe supplied evidence even when baseline is incomplete.
 */
export function buildPerformanceReport(input: Input) {
  const groups = new Map<string, { rows: ReportingRow[]; dailyRows: DailyPerformanceRow[]; creativeRows: CreativeDailyRow[]; plans: MediaPlanFact[] }>();
  const obtain = (platform: string) => {
    const name = canonicalMedia(platform);
    let group = groups.get(name);
    if (!group) { group = { rows: [], dailyRows: [], creativeRows: [], plans: [] }; groups.set(name, group); }
    return group;
  };
  for (const row of input.rows) obtain(row.platform).rows.push(row);
  for (const row of input.dailyRows) {
    if (row.date >= input.startDate && row.date <= input.endDate) obtain(row.platform).dailyRows.push(row);
  }
  for (const row of input.creativeRows ?? []) {
    if (row.date >= input.startDate && row.date <= input.endDate) obtain(row.platform).creativeRows.push(row);
  }
  for (const plan of input.plans) obtain(plan.platform).plans.push(plan);
  const media: MediaPerformanceReport[] = Array.from(groups, ([name, group]) => ({
    name,
    kind: kindFor(name, [...group.rows, ...group.dailyRows, ...group.plans]),
    ...group,
    metrics: metricsFor(group.rows, input.baselineComplete),
    reportDate: latest([...group.rows, ...group.dailyRows, ...group.creativeRows].map(row => row.reportDate)),
    dailyThrough: latest(group.dailyRows.map(row => row.date)),
    creativeThrough: latest(group.creativeRows.map(row => row.date)),
    sourceCount: new Set([...group.rows, ...group.dailyRows, ...group.creativeRows].map(row => row.sourceFile).filter(Boolean)).size,
  }));
  const paid = input.rows.filter(row => !isPerformanceReferenceRow(row));
  // Video is online video/OTT inventory, not a campaign objective. Digital
  // delivery totals include digital + video channels, never TV broadcast or OOH.
  const digital = media.filter(item => item.kind === 'digital' || item.kind === 'video').flatMap(item => item.rows);
  const video = media.filter(item => item.kind === 'video');
  const period = (value: number | null) => input.baselineComplete ? value : null;
  return {
    media,
    totals: {
      reportedSpend: period(sum(paid, 'spend')),
      spendMediaCount: media.filter(item => item.metrics.spendRowCount > 0).length,
      metricMediaCount: media.filter(item => item.rows.some(row =>
        (['impressions', 'clicks', 'views', 'conversions'] as const).some(key => finite(row[key])) || (!isPerformanceReferenceRow(row) && finite(row.spend)),
      )).length,
      digitalImpressions: period(sum(digital, 'impressions')),
      digitalClicks: period(sum(digital, 'clicks')),
      digitalCtr: period(pairedRate(digital, 'clicks', 'impressions', 100)),
      videoViews: period(sum(video.flatMap(item => item.rows), 'views')),
      videoMediaCount: video.filter(item => item.metrics.viewRowCount > 0).length,
      excludedReferenceRows: input.rows.filter(isPerformanceReferenceRow).length,
    },
    latestReportDate: latest(media.map(item => item.reportDate)),
    latestDailyDate: latest(media.map(item => item.dailyThrough)),
    planOnlyCount: media.filter(item => item.plans.length > 0 && !item.rows.length && !item.dailyRows.length && !item.creativeRows?.length).length,
    baselineComplete: input.baselineComplete,
  };
}
