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
  insights: Record<string, PublishedInsight>;
};

function emptyState(): PublishedDailyState {
  return { datasets: {}, insights: {} };
}

export function dailyDatasetKey(bundle: DailyBundlePreview) {
  const month = (bundle.campaignStart || bundle.reportDate || "unknown").slice(0, 7);
  const stem = bundle.sourceFile
    .replace(/\.(xlsx?|csv)$/i, "")
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
    const parsed = JSON.parse(raw) as PublishedDailyState;
    return {
      datasets: parsed.datasets ?? {},
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

  state.datasets[datasetKey] = {
    key: datasetKey,
    advertiser: bundle.advertiser,
    month,
    sourceFile: bundle.sourceFile,
    mailSubject: meta.mailSubject || "",
    mailDate: meta.mailDate || "",
    publishedAt,
    bundle,
  };

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

export function publishedDatasetsFor(advertiser: string, month?: string) {
  const state = readPublishedDailyState();
  return Object.values(state.datasets).filter((item) =>
    item.advertiser === advertiser && (!month || item.month === month)
  );
}

export function publishedInsightsFor(advertiser: string, month?: string) {
  const state = readPublishedDailyState();
  return Object.values(state.insights)
    .filter((item) => item.advertiser === advertiser && (!month || item.reportDate.startsWith(month)))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}
