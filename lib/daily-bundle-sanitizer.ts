import type { DailyBundlePreview } from "@/lib/daily-report-parser";

type ContextInput = {
  filename?: string;
  mailSubject?: string;
  mailBody?: string;
  mailDate?: string;
};

function inferContextYear(input: ContextInput) {
  const values = [input.filename, input.mailSubject, input.mailBody].filter(Boolean).join("\n");

  const explicit = values.match(/\b(20\d{2})\b/);
  if (explicit) return Number(explicit[1]);

  const compact = values.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (compact) return 2000 + Number(compact[1]);

  const korean = values.match(/(?:^|\D)(\d{2})\s*년\s*(?:0?[1-9]|1[0-2])\s*월/);
  if (korean) return 2000 + Number(korean[1]);

  if (input.mailDate) {
    const parsed = new Date(input.mailDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.getUTCFullYear();
  }

  return new Date().getFullYear();
}

function normalizeIsoDate(value: string | undefined, contextYear: number) {
  if (!value) return value || "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const year = Number(match[1]);
  if (year >= 1900 && year < 2000 && contextYear >= 2000) {
    return `${contextYear}-${match[2]}-${match[3]}`;
  }
  return value;
}

function isRawSheet(name: string | undefined) {
  return Boolean(name && /(?:^|[_\s-])raw(?:$|[_\s-])/i.test(name));
}

function isSummaryLabel(value: string | undefined) {
  if (!value) return false;
  return /^(?:kpi|result|achievement(?:\s*\(%\))?|grand\s*total|total|달성률|달성율)$/i.test(value.trim());
}

function numericGuaranteed(value: string | undefined) {
  const normalized = String(value || "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAchievement<T extends { guaranteed?: string; impressions: number; achievement?: number | null }>(row: T): T {
  const guaranteed = numericGuaranteed(row.guaranteed);
  if (!guaranteed) return row;
  const calculated = row.impressions / guaranteed * 100;
  const current = row.achievement;
  // Excel 퍼센트 원값이 1.07(=107%)처럼 들어와 ratio heuristic이 오해석되는 경우를 방지한다.
  // 보장노출수가 숫자로 명시된 지면은 원본 노출/보장노출 관계를 우선한다.
  if (current === null || current === undefined || Math.abs(current - calculated) > 0.5) {
    return { ...row, achievement: calculated };
  }
  return row;
}

export function sanitizeDailyBundle(bundle: DailyBundlePreview, input: ContextInput = {}): DailyBundlePreview {
  const contextYear = inferContextYear({ ...input, filename: input.filename || bundle.sourceFile });
  const placements = [...(bundle.placements || [])];
  const hasSummarySheet = placements.some((row) => /^summary$/i.test(row.sourceSheet || ""));
  const helperSheets = new Set<string>();

  if (hasSummarySheet) {
    for (const row of placements) {
      if (isSummaryLabel(row.placement)) helperSheets.add(row.sourceSheet || "");
    }
  }

  const removedSheets = new Set<string>();
  const cleanPlacements = placements.filter((row) => {
    const sheet = row.sourceSheet || "";
    const remove = isRawSheet(sheet) || isSummaryLabel(row.placement) || (hasSummarySheet && helperSheets.has(sheet) && !/^summary$/i.test(sheet));
    if (remove && sheet) removedSheets.add(sheet);
    return !remove;
  }).map(normalizeAchievement);

  const cleanDaily = (bundle.dailyPerformance || []).filter((row) => !isRawSheet(row.sourceSheet)).map((row) => ({
    ...row,
    date: normalizeIsoDate(row.date, contextYear),
  }));

  const cleanCreative = (bundle.creativeDailyPerformance || []).filter((row) => !isRawSheet(row.sourceSheet)).map((row) => ({
    ...row,
    date: normalizeIsoDate(row.date, contextYear),
  }));

  const cleanPlans = (bundle.mediaPlan || []).map((row) => ({
    ...row,
    periodStart: normalizeIsoDate(row.periodStart, contextYear),
    periodEnd: normalizeIsoDate(row.periodEnd, contextYear),
  }));

  const parsedSheets = Array.from(new Set(cleanPlacements.map((row) => row.sourceSheet).filter(Boolean)));
  const ignoredSheets = Array.from(new Set([...(bundle.ignoredSheets || []), ...removedSheets]));

  return {
    ...bundle,
    reportDate: normalizeIsoDate(bundle.reportDate, contextYear),
    campaignStart: normalizeIsoDate(bundle.campaignStart, contextYear),
    campaignEnd: normalizeIsoDate(bundle.campaignEnd, contextYear),
    placements: cleanPlacements,
    dailyPerformance: cleanDaily,
    creativeDailyPerformance: cleanCreative,
    mediaPlan: cleanPlans,
    parsedSheets,
    ignoredSheets,
  };
}
