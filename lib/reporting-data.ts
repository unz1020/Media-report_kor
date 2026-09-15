import type { MediaPlanFact, PlacementFact } from "@/lib/daily-report-parser";
import type { PublishedDataset } from "@/lib/daily-report-store";
import { isOperationalPlacement } from "@/lib/media-normalization";

type DailyPerformanceFact = {
  date: string;
  platform: string;
  placement: string;
  spend: number | null;
  impressions: number;
  clicks: number | null;
  views: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpv: number | null;
  vtr: number | null;
};

export type DailyPerformanceRow = DailyPerformanceFact & {
  sourceFile: string;
  reportDate: string;
  sourceUrl?: string;
  sourceKind?: string;
};

export type ReportingRow = Omit<PlacementFact, "clicks"> & {
  clicks: number | null;
  sourceFile: string;
  reportDate: string;
  sourceUrl?: string;
  sourceKind?: string;
};

export function factIdentity(row: Pick<PlacementFact, "platform" | "placement" | "sourceSheet">) {
  return `${row.platform}::${row.placement}::${row.sourceSheet}`.toLowerCase();
}

function extendedBundle(dataset: PublishedDataset) {
  return dataset.bundle as typeof dataset.bundle & {
    sourceUrl?: string;
    sourceKind?: string;
    sourceId?: string;
    dailyPerformance?: DailyPerformanceFact[];
  };
}

export function rowsFromDatasets(datasets: PublishedDataset[]): ReportingRow[] {
  return datasets.flatMap((dataset) => {
    const bundle = extendedBundle(dataset);
    return bundle.placements
      .filter((row) => isOperationalPlacement(row.placement))
      .map((row) => ({
        ...row,
        clicks: (row as PlacementFact & { clicks?: number | null }).clicks ?? null,
        sourceFile: dataset.sourceFile,
        reportDate: dataset.bundle.reportDate,
        sourceUrl: bundle.sourceUrl,
        sourceKind: bundle.sourceKind,
      }));
  });
}

export function dailyPerformanceFromDatasets(datasets: PublishedDataset[], startDate?: string, endDate?: string): DailyPerformanceRow[] {
  const seen = new Set<string>();
  const result: DailyPerformanceRow[] = [];
  for (const dataset of datasets) {
    const bundle = extendedBundle(dataset);
    for (const row of bundle.dailyPerformance ?? []) {
      if (!isOperationalPlacement(row.placement)) continue;
      if (startDate && row.date < startDate) continue;
      if (endDate && row.date > endDate) continue;
      const id = `${row.date}::${row.platform}::${row.placement}::${dataset.sourceFile}`.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        ...row,
        sourceFile: dataset.sourceFile,
        reportDate: dataset.bundle.reportDate,
        sourceUrl: bundle.sourceUrl,
        sourceKind: bundle.sourceKind,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform, "ko") || a.placement.localeCompare(b.placement, "ko"));
}

export function mediaPlansFromDatasets(datasets: PublishedDataset[]): MediaPlanFact[] {
  const seen = new Set<string>();
  const result: MediaPlanFact[] = [];
  for (const dataset of datasets) {
    for (const item of dataset.bundle.mediaPlan ?? []) {
      const id = `${item.platform}::${item.product}::${item.periodStart}::${item.periodEnd}`.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(item);
    }
  }
  return result;
}

function subtractNumber(end: number | null | undefined, start: number | null | undefined) {
  if (end === null || end === undefined) return null;
  if (start === null || start === undefined) return end;
  return Math.max(0, end - start);
}

function rowsFromDailyPerformance(dataset: PublishedDataset, startDate: string, endDate: string): ReportingRow[] | null {
  const bundle = extendedBundle(dataset);
  const daily = (bundle.dailyPerformance ?? []).filter((row) => row.date >= startDate && row.date <= endDate && isOperationalPlacement(row.placement));
  if (!daily.length) return null;

  const groups = new Map<string, DailyPerformanceFact[]>();
  for (const item of daily) {
    const key = `${item.platform}::${item.placement}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.values()].map((items) => {
    const base = items[0];
    const spendValues = items.map((item) => item.spend).filter((value): value is number => typeof value === "number");
    const clickValues = items.map((item) => item.clicks).filter((value): value is number => typeof value === "number");
    const viewValues = items.map((item) => item.views).filter((value): value is number => typeof value === "number");
    const spend = spendValues.length ? spendValues.reduce((sum, value) => sum + value, 0) : null;
    const impressions = items.reduce((sum, item) => sum + item.impressions, 0);
    const clicks = clickValues.length ? clickValues.reduce((sum, value) => sum + value, 0) : null;
    const views = viewValues.length ? viewValues.reduce((sum, value) => sum + value, 0) : null;
    return {
      platform: base.platform,
      placement: base.placement,
      achievement: null,
      guaranteed: "",
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 && clicks !== null ? clicks / impressions * 100 : null,
      views,
      vtr: impressions > 0 && views !== null ? views / impressions * 100 : null,
      conversions: null,
      cpm: impressions > 0 && spend !== null ? spend / impressions * 1000 : null,
      cpc: clicks && clicks > 0 && spend !== null ? spend / clicks : clicks === 0 ? 0 : null,
      cpv: views && views > 0 && spend !== null ? spend / views : null,
      sourceSheet: "일간 성과",
      sourceFile: dataset.sourceFile,
      reportDate: dataset.bundle.reportDate,
      sourceUrl: bundle.sourceUrl,
      sourceKind: bundle.sourceKind,
    };
  });
}

export function periodRowsFromSnapshots(snapshots: PublishedDataset[], startDate: string, endDate: string) {
  const grouped = new Map<string, PublishedDataset[]>();
  for (const snapshot of snapshots) {
    const base = snapshot.key.replace(/::\d{4}-\d{2}-\d{2}$/, "");
    const list = grouped.get(base) ?? [];
    list.push(snapshot);
    grouped.set(base, list);
  }

  const rows: ReportingRow[] = [];
  let baselineComplete = true;
  for (const list of grouped.values()) {
    const sorted = [...list].sort((a, b) => a.bundle.reportDate.localeCompare(b.bundle.reportDate));
    const end = sorted.filter((item) => item.bundle.reportDate <= endDate).at(-1);
    if (!end) continue;

    const exactDailyRows = rowsFromDailyPerformance(end, startDate, endDate);
    if (exactDailyRows) {
      rows.push(...exactDailyRows);
      continue;
    }

    const baseline = sorted.filter((item) => item.bundle.reportDate < startDate).at(-1);
    if (startDate.slice(-2) !== "01" && !baseline) baselineComplete = false;
    const baselineMap = new Map((baseline?.bundle.placements ?? []).filter((row) => isOperationalPlacement(row.placement)).map((row) => [factIdentity(row), row]));
    const endBundle = extendedBundle(end);

    for (const endRow of end.bundle.placements) {
      if (!isOperationalPlacement(endRow.placement)) continue;
      const startRow = baselineMap.get(factIdentity(endRow));
      const endClicks = (endRow as PlacementFact & { clicks?: number | null }).clicks ?? null;
      const startClicks = (startRow as (PlacementFact & { clicks?: number | null }) | undefined)?.clicks ?? null;
      const impressions = subtractNumber(endRow.impressions, startRow?.impressions) ?? 0;
      const clicks = subtractNumber(endClicks, startClicks);
      const spend = subtractNumber(endRow.spend, startRow?.spend);
      const views = subtractNumber(endRow.views, startRow?.views);
      const conversions = subtractNumber(endRow.conversions, startRow?.conversions);
      rows.push({
        ...endRow,
        clicks,
        spend,
        impressions,
        views,
        conversions,
        ctr: impressions > 0 && clicks !== null ? clicks / impressions * 100 : null,
        sourceFile: end.sourceFile,
        reportDate: end.bundle.reportDate,
        sourceUrl: endBundle.sourceUrl,
        sourceKind: endBundle.sourceKind,
      });
    }
  }
  return { rows, baselineComplete };
}

export function summarizeRows(rows: ReportingRow[]) {
  const spendValues = rows.map((row) => row.spend).filter((value): value is number => typeof value === "number");
  const clickValues = rows.map((row) => row.clicks).filter((value): value is number => typeof value === "number");
  const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
  const clicks = clickValues.length ? clickValues.reduce((sum, value) => sum + value, 0) : null;
  const views = rows.reduce((sum, row) => sum + (row.views || 0), 0);
  const conversions = rows.reduce((sum, row) => sum + (row.conversions || 0), 0);
  return {
    spend: spendValues.length ? spendValues.reduce((sum, value) => sum + value, 0) : null,
    impressions,
    clicks,
    ctr: impressions && clicks !== null ? clicks / impressions * 100 : null,
    views: rows.some((row) => row.views !== null && row.views !== undefined) ? views : null,
    conversions: rows.some((row) => row.conversions !== null && row.conversions !== undefined) ? conversions : null,
    platformCount: new Set(rows.map((row) => row.platform).filter(Boolean)).size,
  };
}

export function formatKrw(value: number | null | undefined) {
  return value === null || value === undefined ? "데이터 없음" : `${Math.round(value).toLocaleString("ko-KR")}원`;
}
export function formatCount(value: number | null | undefined, unit = "회") {
  return value === null || value === undefined ? "데이터 없음" : `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
}
export function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "데이터 없음" : `${value.toFixed(2)}%`;
}
