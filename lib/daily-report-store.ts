import type { DailyBundlePreview } from "@/lib/daily-report-parser";

const LEGACY_STORAGE_KEY = "media-report-daily-v1";

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

type RemoteImport = {
  id: string;
  report_date: string;
  source_file?: string | null;
  mail_subject?: string | null;
  mail_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { bundle?: DailyBundlePreview } | null;
};

type RemoteInsight = {
  id: string;
  import_id?: string | null;
  report_date: string;
  subject?: string | null;
  notes?: unknown;
  created_at?: string | null;
};

type RemoteStatePayload = {
  imports?: RemoteImport[];
  insights?: RemoteInsight[];
};

function emptyState(): PublishedDailyState {
  return { datasets: {}, snapshots: {}, insights: {} };
}

let stateCache: PublishedDailyState = emptyState();

function dispatchUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("media-report-daily-updated"));
}

function dispatchSync(state: "loading" | "saving" | "ready" | "error", error = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("media-report-daily-sync", { detail: { state, error } }));
}

async function requestRemote(body: Record<string, unknown>) {
  const response = await fetch("/api/reporting/store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error === "GMAIL_CONNECTION_REQUIRED"
      ? "Supabase 동기화를 위해 Gmail 연결이 필요합니다."
      : payload?.error || "Supabase 보고서 저장소 요청에 실패했습니다.";
    throw new Error(message);
  }
  return payload;
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

function datasetFromBundle(
  bundle: DailyBundlePreview,
  meta: { mailSubject?: string; mailDate?: string; publishedAt?: string } = {},
): PublishedDataset {
  const key = dailyDatasetKey(bundle);
  const month = (bundle.campaignStart || bundle.reportDate || "unknown").slice(0, 7);
  return {
    key,
    advertiser: bundle.advertiser,
    month,
    sourceFile: bundle.sourceFile,
    mailSubject: meta.mailSubject || "",
    mailDate: meta.mailDate || "",
    publishedAt: meta.publishedAt || new Date().toISOString(),
    bundle,
  };
}

function stageBundle(
  bundle: DailyBundlePreview,
  meta: { mailSubject?: string; mailDate?: string } = {},
) {
  const dataset = datasetFromBundle(bundle, meta);
  const current = stateCache.datasets[dataset.key];
  if (!current || (current.bundle.reportDate || "") <= (bundle.reportDate || "")) {
    stateCache.datasets[dataset.key] = dataset;
  }
  const snapshotKey = `${dataset.key}::${bundle.reportDate || dataset.publishedAt.slice(0, 10)}`;
  stateCache.snapshots[snapshotKey] = { ...dataset, key: snapshotKey };
  if (bundle.operationNotes?.length) {
    const insightKey = `${bundle.advertiser}::${bundle.reportDate}::${dataset.key}`;
    stateCache.insights[insightKey] = {
      key: insightKey,
      advertiser: bundle.advertiser,
      reportDate: bundle.reportDate,
      datasetKey: dataset.key,
      mailSubject: meta.mailSubject || "",
      mailDate: meta.mailDate || "",
      notes: bundle.operationNotes,
      publishedAt: dataset.publishedAt,
    };
  }
}

function stateFromRemote(payload: RemoteStatePayload) {
  const next = emptyState();
  const importDatasetKey = new Map<string, string>();
  const importMailDate = new Map<string, string>();

  for (const item of payload.imports ?? []) {
    const bundle = item.metadata?.bundle;
    if (!bundle) continue;
    const dataset = datasetFromBundle(bundle, {
      mailSubject: item.mail_subject || "",
      mailDate: item.mail_date || "",
      publishedAt: item.updated_at || item.created_at || new Date().toISOString(),
    });
    importDatasetKey.set(item.id, dataset.key);
    importMailDate.set(item.id, item.mail_date || "");

    const current = next.datasets[dataset.key];
    if (!current || (current.bundle.reportDate || "") <= (dataset.bundle.reportDate || "")) {
      next.datasets[dataset.key] = dataset;
    }

    const snapshotKey = `${dataset.key}::${bundle.reportDate || item.report_date}`;
    next.snapshots[snapshotKey] = { ...dataset, key: snapshotKey };
  }

  for (const item of payload.insights ?? []) {
    const datasetKey = item.import_id ? importDatasetKey.get(item.import_id) || "mail-only" : "mail-only";
    const notes = Array.isArray(item.notes) ? item.notes.map((value) => String(value)) : [];
    next.insights[`remote::${item.id}`] = {
      key: `remote::${item.id}`,
      advertiser: "",
      reportDate: item.report_date,
      datasetKey,
      mailSubject: item.subject || "",
      mailDate: item.import_id ? importMailDate.get(item.import_id) || "" : "",
      notes,
      publishedAt: item.created_at || new Date().toISOString(),
    };
  }

  for (const insight of Object.values(next.insights)) {
    const dataset = insight.datasetKey !== "mail-only" ? next.datasets[insight.datasetKey] : undefined;
    insight.advertiser = dataset?.advertiser || "";
  }
  return next;
}

export function readPublishedDailyState(): PublishedDailyState {
  return stateCache;
}

export async function hydratePublishedDailyState(advertiser: string, month: string) {
  if (typeof window === "undefined") return;
  dispatchSync("loading");
  try {
    const payload = await requestRemote({ action: "load_state", advertiser, month }) as RemoteStatePayload;
    stateCache = stateFromRemote(payload);
    // Report data no longer uses browser localStorage. Remove only the legacy report cache.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    dispatchUpdated();
    dispatchSync("ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase 동기화 실패";
    dispatchSync("error", message);
    throw error;
  }
}

export function publishDailyBundle(
  bundle: DailyBundlePreview,
  meta: { mailSubject?: string; mailDate?: string; sourceType?: string } = {},
) {
  publishDailyBundles([{ bundle, ...meta }]);
}

export function publishDailyBundles(
  items: Array<{ bundle: DailyBundlePreview; mailSubject?: string; mailDate?: string; sourceType?: string }>,
) {
  if (typeof window === "undefined" || !items.length) return;
  items.forEach((item) => stageBundle(item.bundle, item));
  dispatchUpdated();
  dispatchSync("saving");

  void (async () => {
    try {
      for (const item of items) {
        await requestRemote({
          action: "publish_bundle",
          bundle: item.bundle,
          mailSubject: item.mailSubject || "",
          mailDate: item.mailDate || "",
          sourceType: item.sourceType || (item.mailSubject === "직접 업로드" ? "manual_excel" : "gmail_excel"),
        });
      }
      const first = items[0].bundle;
      const month = (first.campaignStart || first.reportDate || "").slice(0, 7);
      if (month) await hydratePublishedDailyState(first.advertiser, month);
      else dispatchSync("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase 저장 실패";
      dispatchSync("error", message);
      console.error("Failed to persist Daily report to Supabase", error);
    }
  })();
}

export function publishMailOnlyInsight(input: {
  advertiser: string;
  reportDate: string;
  mailSubject: string;
  mailDate?: string;
  notes: string[];
}) {
  if (typeof window === "undefined") return;
  const publishedAt = new Date().toISOString();
  const key = `${input.advertiser}::${input.reportDate}::mail::${input.mailSubject.toLowerCase()}`;
  stateCache.insights[key] = {
    key,
    advertiser: input.advertiser,
    reportDate: input.reportDate,
    datasetKey: "mail-only",
    mailSubject: input.mailSubject,
    mailDate: input.mailDate || "",
    notes: input.notes,
    publishedAt,
  };
  dispatchUpdated();
  dispatchSync("saving");

  void (async () => {
    try {
      await requestRemote({ action: "publish_mail_only", input });
      const month = input.reportDate.slice(0, 7);
      if (month) await hydratePublishedDailyState(input.advertiser, month);
      else dispatchSync("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase 저장 실패";
      dispatchSync("error", message);
      console.error("Failed to persist mail insight to Supabase", error);
    }
  })();
}

export function publishedDatasetsFor(advertiser: string, month?: string) {
  return Object.values(stateCache.datasets).filter((item) =>
    item.advertiser === advertiser && (!month || item.month === month)
  );
}

export function publishedSnapshotsFor(advertiser: string, month?: string) {
  return Object.values(stateCache.snapshots)
    .filter((item) => item.advertiser === advertiser && (!month || item.month === month))
    .sort((a, b) => (a.bundle.reportDate || "").localeCompare(b.bundle.reportDate || ""));
}

export function publishedInsightsFor(advertiser: string, month?: string) {
  return Object.values(stateCache.insights)
    .filter((item) => item.advertiser === advertiser && (!month || item.reportDate.startsWith(month)))
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}
