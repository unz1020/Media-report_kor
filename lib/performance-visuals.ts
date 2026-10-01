import { canonicalMedia } from "./media-normalization";
export type MetricFact = { impressions: number; clicks?: number | null; spend?: number | null };
export type MetricSummary = { impressions: number; clicks: number | null; ctr: number | null; spend: number | null };
export type MetricKey = keyof MetricSummary;
export type ComparisonMetric = { key: string; label: string; metrics: MetricSummary };
export function metricSummary(rows: MetricFact[]): MetricSummary {
  const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  const impressions = rows.reduce((sum, row) => sum + (valid(row.impressions) ? row.impressions : 0), 0);
  const clickRows = rows.filter(row => valid(row.clicks));
  const clicks = clickRows.length ? clickRows.reduce((sum, row) => sum + row.clicks!, 0) : null;
  const clickableImpressions = clickRows.reduce((sum, row) => sum + row.impressions, 0);
  const spendRows = rows.filter(row => valid(row.spend));
  return { impressions, clicks, ctr: clicks !== null && clickableImpressions > 0 ? clicks / clickableImpressions * 100 : null,
    spend: spendRows.length ? spendRows.reduce((sum, row) => sum + row.spend!, 0) : null };
}
export function placementMetricKey(row: { platform: string; placement: string }) {
  return `${canonicalMedia(row.platform)}::${row.placement.trim()}`;
}
export function comparisonMetrics<T extends MetricFact>(rows: T[], identity: (row: T) => string, label: (row: T) => string): ComparisonMetric[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const id = identity(row); const list = groups.get(id) || []; list.push(row); groups.set(id,list); }
  return [...groups].map(([key, values]) => ({ key, label: label(values[0]), metrics: metricSummary(values) }));
}
export function dailyMetricSeries<T extends MetricFact & { date: string }>(rows: T[], startDate: string, endDate: string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) { if (row.date < startDate || row.date > endDate) continue; const list=groups.get(row.date)||[]; list.push(row); groups.set(row.date,list); }
  const result: Array<{ date: string; metrics: MetricSummary | null }> = [];
  const current = new Date(startDate + "T00:00:00Z"), end = new Date(endDate + "T00:00:00Z");
  if (!Number.isFinite(current.getTime()) || !Number.isFinite(end.getTime())) return result;
  for (let count=0; current<=end && count<366; count++,current.setUTCDate(current.getUTCDate()+1)) {
    const date=current.toISOString().slice(0,10), values=groups.get(date);
    result.push({ date, metrics: values?.length ? metricSummary(values) : null });
  }
  return result;
}
export function displayMetric(value: number | null | undefined, metric: MetricKey) {
  if (value == null || !Number.isFinite(value)) return "—";
  return metric === "ctr" ? `${value.toFixed(2)}%` : `${Math.round(value).toLocaleString("ko-KR")}${metric === "spend" ? "원" : ""}`;
}
