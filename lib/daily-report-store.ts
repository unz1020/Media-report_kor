import type { DailyBundlePreview } from "@/lib/daily-report-parser";

const STORAGE_KEY = "media-report-daily-v1";

export type PublishedDataset = {
  key: string;
  advertiser: string;
  month: string;
  sourceFile: string;
  mailSubject: string;
  mailDate: string;
  publishedAt: string;
  bundle: DailyBundlePreview;
};

export type PublishedInsight = {
  key: string;
  advertiser: string;
  reportDate: string;
  datasetKey: string;
  mailSubject: string;
  mailDate: string;
  notes: string[];
  publishedAt: string;
};

export type PublishedDailyState = {
  datasets: Record<string, PublishedDataset>;
  snapshots: Record<string, PublishedDataset>;
  insights: Record<string, PublishedInsight>;
};

function emptyState(): PublishedDailyState {
  return { datasets: {}, snapshots: {}, insights: {} };
}

export function dailyDatasetKey(bundle: DailyBundlePreview) {
  const month = (bundle.campaignStart || bundle.reportDate || "unknown").slice(0, 7);
  const extended = bundle as DailyBundlePreview & { sourceId?: string };
  if (extended.sourceId) return `${bundle.advertiser}::${month}::${extended.sourceId.toLowerCase()}`;
  const stem = bundle.sourceFile
    .replace(/\.(xlsx|xls|xlsb|csv|pdf)$/i, "")
    .replace(/[_\- ]?(?:20)?\d{6,8}$/i, "")
    .replace(/[_\- ]?\d{4}$/i, "")
    .trim()
    .toLowerCase();
  return `${bundle.advertiser}::${month}::${stem || "daily"}`;
}

export function readPublishedDailyState(): PublishedDailyState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PublishedDailyState>;
    return {
      datasets: parsed.datasets ?? {},
      snapshots: parsed.snapshots ?? {},
      insights: parsed.insights ?? {},
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: PublishedDailyState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("media-report-daily-updated"));
}

export function publishDailyBundle(
  bundle: DailyBundlePreview,
  meta: { mailSubject?: string; mailDate?: string } = {},
) {
  if (typeof window === "undefined") return;
  const state = readPublishedDailyState();
  const datasetKey = dailyDatasetKey(bundle);
  const month = (bundle.campaignStart || bundle.reportDate || "unknown").slice(0, 7);
  const publishedAt = new Date().toISOString();
  const dataset: PublishedDataset = {
    key: datasetKey,
    advertiser: bundle.advertiser,
    month,
    sourceFile: bundle.sourceFile,
    mailSubject: meta.mailSubject || "",
    mailDate: meta.mailDate || "",
    publishedAt,
    bundle,
  };

  state.datasets[datasetKey] = dataset;

  const snapshotKey = `${datasetKey}::${bundle.reportDate || publishedAt.slice(0, 10)}`;
  state.snapshots[snapshotKey] = { ...dataset, key: snapshotKey };

  const insightKey = `${bundle.advertiser}::${bundle.reportDate}::${datasetKey}`;
  state.insights[insightKey] = {
    key: insightKey,
    advertiser: bundle.advertiser,
    reportDate: bundle.reportDate,
    datasetKey,
    mailSubject: meta.mailSubject || "",
    mailDate: meta.mailDate || "",
    notes: bundle.operationNotes,
    publishedAt,
  };

  writeState(state);
}

export function publishDailyBundles(
  items: Array<{ bundle: DailyBundlePreview; mailSubject?: string; mailDate?: string }>,
) {
  items.forEach((item) => publishDailyBundle(item.bundle, item));
}

export function publishMailOnlyInsight(input: {
  advertiser: string;
  reportDate: string;
  mailSubject: string;
  mailDate?: string;
  notes: string[];
}) {
  if (typeof window === "undefined") return;
  const state = readPublishedDailyState();
  const publishedAt = new Date().toISOString();
  const key = `${input.advertiser}::${input.reportDate}::mail::${input.mailSubject.toLowerCase()}`;
  state.insights[key] = {
    key,
    advertiser: input.advertiser,
    reportDate: input.reportDate,
    datasetKey: "mail-only",
    mailSubject: input.mailSubject,
    mailDate: input.mailDate || "",
    notes: input.notes,
    publishedAt,
  };
  writeState(state);
}

export function publishedDatasetsFor(advertiser: string, month?: string) {
  const state = readPublishedDailyState();
  return Object.values(state.datasets).filter((item) =>
    item.advertiser === advertiser && (!month || item.month === month)
  );
}

export function publishedSnapshotsFor(advertiser: string, month?: string) {
  const state = readPublishedDailyState();
  return Object.values(state.snapshots)
    .filter((item) => item.advertiser === advertiser && (!month || item.month === month))
    .sort((a, b) => (a.bundle.reportDate || "").localeCompare(b.bundle.reportDate || ""));
}

export function publishedInsightsFor(advertiser: string, month?: string) {
  const state = readPublishedDailyState();
  return Object.values(state.insights)
    .filter((item) => item.advertiser === advertiser && (!month || item.reportDate.startsWith(month)))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}
