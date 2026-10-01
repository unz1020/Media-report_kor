import type { DailyBundlePreview } from "@/lib/daily-report-parser";
import { canonicalMedia } from "@/lib/media-normalization";

type ContextInput = {
  filename?: string;
  mailSubject?: string;
  mailBody?: string;
  mailDate?: string;
};

type ContextDate = {
  year: number;
  month: number | null;
  strong: boolean;
  forceYear: boolean;
};

function validMonth(value: number) {
  return value >= 1 && value <= 12 ? value : null;
}

function inferContextDate(input: ContextInput): ContextDate {
  const primary = [input.filename, input.mailSubject].filter(Boolean).join("\n");
  const all = [input.filename, input.mailSubject, input.mailBody].filter(Boolean).join("\n");

  // 파일명/메일 제목의 260916, 26년 9월은 해당 리포트 자체의 강한 날짜 문맥이다.
  const primaryKorean = primary.match(/(?:^|\D)(\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
  if (primaryKorean) {
    return { year: 2000 + Number(primaryKorean[1]), month: Number(primaryKorean[2]), strong: true, forceYear: true };
  }

  const primaryFull = primary.match(/\b(20\d{2})[-/.\s년]+(0?[1-9]|1[0-2])(?:[-/.\s월]|\b)/);
  if (primaryFull) {
    return { year: Number(primaryFull[1]), month: Number(primaryFull[2]), strong: true, forceYear: true };
  }

  const primaryCompact = primary.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (primaryCompact) {
    const namedMonth = primary.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*월/);
    return { year: 2000 + Number(primaryCompact[1]), month: namedMonth ? Number(namedMonth[1]) : Number(primaryCompact[2]), strong: true, forceYear: true };
  }

  const explicit = all.match(/\b(20\d{2})\b/);
  if (explicit) return { year: Number(explicit[1]), month: null, strong: true, forceYear: false };

  const compact = all.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (compact) return { year: 2000 + Number(compact[1]), month: Number(compact[2]), strong: true, forceYear: false };

  const korean = all.match(/(?:^|\D)(\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
  if (korean) return { year: 2000 + Number(korean[1]), month: Number(korean[2]), strong: true, forceYear: false };

  if (input.mailDate) {
    const parsed = new Date(input.mailDate);
    if (!Number.isNaN(parsed.getTime())) {
      return { year: parsed.getUTCFullYear(), month: validMonth(parsed.getUTCMonth() + 1), strong: false, forceYear: false };
    }
  }

  const now = new Date();
  return { year: now.getFullYear(), month: validMonth(now.getMonth() + 1), strong: false, forceYear: false };
}

function normalizeIsoDate(value: string | undefined, context: ContextDate) {
  if (!value) return value || "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const year = Number(match[1]);

  // Excel serial/date-format 오류로 1995, 2036처럼 문맥과 명백히 다른 연도가 들어오는 경우를 보정한다.
  // 파일명/메일 제목이 260916, 26년 9월처럼 리포트 자체를 특정하면 2025처럼 1년 차이도 파일 문맥을 우선한다.
  const legacyWrongYear = year >= 1900 && year < 2000 && context.year >= 2000;
  const strictMismatch = context.forceYear && year !== context.year;
  const contextMismatch = context.strong && Math.abs(year - context.year) >= 5;
  if (legacyWrongYear || strictMismatch || contextMismatch) {
    return `${context.year}-${match[2]}-${match[3]}`;
  }
  return value;
}

function inferredCampaignPeriod(bundle: DailyBundlePreview, context: ContextDate) {
  let campaignStart = normalizeIsoDate(bundle.campaignStart, context);
  let campaignEnd = normalizeIsoDate(bundle.campaignEnd, context);
  const reportDate = normalizeIsoDate(bundle.reportDate, context);
  // A next-month delivery suffix must not move already reported facts into the
  // next campaign month (e.g. September results delivered on October 1).
  if (bundle.placements?.length && /^\d{4}-\d{2}-\d{2}$/.test(reportDate) && campaignStart > reportDate) {
    const month = reportDate.slice(0, 7);
    campaignStart = `${month}-01`;
    const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    campaignEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  }
  if ((!campaignStart || !campaignEnd) && context.forceYear && context.month) {
    const month = String(context.month).padStart(2, "0");
    const lastDay = new Date(Date.UTC(context.year, context.month, 0)).getUTCDate();
    campaignStart ||= `${context.year}-${month}-01`;
    campaignEnd ||= `${context.year}-${month}-${String(lastDay).padStart(2, "0")}`;
  }
  return { campaignStart, campaignEnd };
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
  if (current === null || current === undefined || Math.abs(current - calculated) > 0.5) {
    return { ...row, achievement: calculated };
  }
  return row;
}

export function sanitizeDailyBundle(bundle: DailyBundlePreview, input: ContextInput = {}): DailyBundlePreview {
  const contextDate = inferContextDate({ ...input, filename: input.filename || bundle.sourceFile });
  const { campaignStart, campaignEnd } = inferredCampaignPeriod(bundle, contextDate);
  const placements = [...(bundle.placements || [])];
  const hasSummarySheet = placements.some((row) => /^summary$/i.test(row.sourceSheet || ""));
  const helperSheets = new Set<string>();

  if (hasSummarySheet) {
    for (const row of placements) {
      if (isSummaryLabel(row.placement)) helperSheets.add(row.sourceSheet || "");
    }
  }

  const removedSheets = new Set<string>();
  // Overall is the billed media total. Detail sheets are alternate breakdowns,
  // not additional campaigns (their clicks/costs may use different definitions).
  const overallMedia = new Set(placements.filter(row => /^overall$/i.test(row.sourceSheet)).map(row => canonicalMedia(row.platform)));
  const searchOverall = /카카오\s*검색광고/i.test(bundle.sourceFile)
    ? placements.find(row => /카카오\s*검색.*summary/i.test(row.sourceSheet) && row.placement === "전체")
    : undefined;
  const searchOverallIndex = searchOverall ? placements.indexOf(searchOverall) : -1;
  const cleanPlacements = placements.filter((row, index) => {
    const sheet = row.sourceSheet || "";
    const remove = (searchOverall && /카카오\s*검색.*summary/i.test(sheet) && index !== searchOverallIndex) ||
      (overallMedia.has(canonicalMedia(row.platform)) && !/^overall$/i.test(sheet)) ||
      isRawSheet(sheet) || isSummaryLabel(row.placement) || (hasSummarySheet && helperSheets.has(sheet) && !/^summary$/i.test(sheet));
    if (remove && sheet) removedSheets.add(sheet);
    return !remove;
  }).map(row => normalizeAchievement(row === searchOverall ? { ...row, platform: "카카오 검색광고", placement: "전체 검색광고" } : row));

  const cleanDaily = (bundle.dailyPerformance || []).filter((row) => !isRawSheet(row.sourceSheet)).map((row) => ({
    ...row,
    date: normalizeIsoDate(row.date, contextDate),
  })).filter((row) => (!campaignStart || row.date >= campaignStart) && (!bundle.reportDate || row.date <= normalizeIsoDate(bundle.reportDate, contextDate)));

  const cleanCreative = (bundle.creativeDailyPerformance || []).filter((row) => !isRawSheet(row.sourceSheet)).map((row) => ({
    ...row,
    date: normalizeIsoDate(row.date, contextDate),
  }));

  const cleanPlans = (bundle.mediaPlan || []).map((row) => ({
    ...row,
    periodStart: normalizeIsoDate(row.periodStart, contextDate),
    periodEnd: normalizeIsoDate(row.periodEnd, contextDate),
  }));

  const parsedSheets = Array.from(new Set(cleanPlacements.map((row) => row.sourceSheet).filter(Boolean)));
  const ignoredSheets = Array.from(new Set([...(bundle.ignoredSheets || []), ...removedSheets]));

  return {
    ...bundle,
    reportDate: normalizeIsoDate(bundle.reportDate, contextDate),
    campaignStart,
    campaignEnd,
    placements: cleanPlacements,
    dailyPerformance: cleanDaily,
    creativeDailyPerformance: cleanCreative,
    mediaPlan: cleanPlans,
    parsedSheets,
    ignoredSheets,
  };
}
