import type { MediaPerformanceReport } from './performance-report';
import type { DailyPerformanceRow } from './reporting-data';

export type PerformanceChange = {
  media: string;
  date: string;
  previousDate: string;
  metric: 'clicks' | 'views';
  current: number;
  previous: number;
  percent: number;
};

// ISO date-only input, round-tripped to reject normalized dates such as Feb 30.
// Explicit UTC parsing keeps calendar adjacency independent of local time/DST.
function calendarDate(value: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time;
}

function identity(row: DailyPerformanceRow): string {
  // No canonical/fuzzy identity and no import filename/date: a newly imported
  // report can legitimately supply both historical calendar days.
  return JSON.stringify([row.platform, row.placement, row.sourceSheet]);
}

function sameCoverage(current: DailyPerformanceRow[], previous: DailyPerformanceRow[]): boolean {
  if (current.length !== previous.length) return false;
  const multiplicity = new Map<string, number>();
  for (const row of previous) {
    const key = identity(row);
    multiplicity.set(key, (multiplicity.get(key) ?? 0) + 1);
  }
  for (const row of current) {
    const key = identity(row);
    const count = multiplicity.get(key) ?? 0;
    if (!count) return false;
    multiplicity.set(key, count - 1);
  }
  return true;
}

function completeTotal(rows: DailyPerformanceRow[], metric: PerformanceChange['metric']): number | null {
  let total = 0;
  for (const row of rows) {
    const value = row[metric];
    // Unknowns never become zero; every original row (including duplicates)
    // must supply the selected metric. Real zero is valid.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    total += value;
    if (!Number.isFinite(total)) return null;
  }
  return total;
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Descriptive source-day deltas only, not actions, optimization, unique reach,
 * or an assessment of outcomes. The caller already scopes dailyRows. No date
 * filling, cross-media totals, filtering out missing metrics, or input writes.
 */
export function buildPerformanceChanges(media: MediaPerformanceReport[]): PerformanceChange[] {
  const changes: PerformanceChange[] = [];
  for (const item of media) {
    if (item.kind !== 'digital' && item.kind !== 'video') continue;
    if (!item.dailyRows.length) continue;
    // A malformed supplied date could hide the latest source day. Conservatively
    // suppress this media instead of silently falling back to older evidence.
    if (item.dailyRows.some(row => calendarDate(row.date) === null)) continue;
    let date = item.dailyRows[0].date;
    for (const row of item.dailyRows) if (row.date > date) date = row.date;
    const time = calendarDate(date)!;
    const previousDate = new Date(time - 86_400_000).toISOString().slice(0, 10);
    if (calendarDate(previousDate) === null) continue;
    const currentRows = item.dailyRows.filter(row => row.date === date);
    const previousRows = item.dailyRows.filter(row => row.date === previousDate);
    if (!previousRows.length || !sameCoverage(currentRows, previousRows)) continue;
    // Any supplied view value selects views for video, including zero/invalid
    // values. Partial views must suppress, not quietly become click comparisons.
    const metric: PerformanceChange['metric'] = item.kind === 'video'
      && [...currentRows, ...previousRows].some(row => row.views !== null && row.views !== undefined)
      ? 'views' : 'clicks';
    const current = completeTotal(currentRows, metric);
    const previous = completeTotal(previousRows, metric);
    if (current === null || previous === null || previous <= 0 || current === previous) continue;
    const percent = (current - previous) / previous * 100;
    if (!Number.isFinite(percent)) continue;
    changes.push({ media: item.name, date, previousDate, metric, current, previous, percent });
  }
  return changes.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent)
    || compareText(a.media, b.media)
    || compareText(a.date, b.date)
    || compareText(a.metric, b.metric)
    || a.current - b.current
    || a.previous - b.previous).slice(0, 3);
}
