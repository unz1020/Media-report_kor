import type { DailyBundlePreview } from "@/lib/daily-report-parser";

type ContextInput = {
  filename?: string;
  mailSubject?: string;
  mailBody?: string;
  mailDate?: string;
};

type ContextYear = {
  year: number;
  strong: boolean;
};

function inferContextYear(input: ContextInput): ContextYear {
  const values = [input.filename, input.mailSubject, input.mailBody].filter(Boolean).join("\n");

  const explicit = values.match(/\b(20\d{2})\b/);
  if (explicit) return { year: Number(explicit[1]), strong: true };

  const compact = values.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (compact) return { year: 2000 + Number(compact[1]), strong: true };

  const korean = values.match(/(?:^|\D)(\d{2})\s*년\s*(?:0?[1-9]|1[0-2])\s*월/);
  if (korean) return { year: 2000 + Number(korean[1]), strong: true };

  if (input.mailDate) {
    const parsed = new Date(input.mailDate);
    if (!Number.isNaN(parsed.getTime())) return { year: parsed.getUTCFullYear(), strong: false };
  }

  return { year: new Date().getFullYear(), strong: false };
}

function normalizeIsoDate(value: string | undefined, context: ContextYear) {
  if (!value) return value || "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const year = Number(match[1]);

  // 엑셀 serial/date-format 오류로 1995, 2036처럼 문맥과 명백히 다른 연도가 들어오는 경우가 있다.
  // 파일명/메일 제목에 260916, 26년 9월처럼 강한 연도 힌트가 있으면 큰 차이만 보정한다.
  const legacyWrongYear = year >= 1900 && year < 2000 && context.year >= 2000;
  const contextMismatch = context.strong && Math.abs(year - context.year) >= 5;
  if (legacyWrongYear || contextMismatch) {
    return `${context.year}-${match[2]}-${match[3]}`;
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
