import * as XLSX from "xlsx";
import type {
  CreativeDailyFact,
  DailyBundlePreview,
  DailyPerformanceFact,
  MailMetricCheck,
  MediaPlanFact,
  PlacementFact,
} from "@/lib/daily-report-parser";

type Matrix = unknown[][];

function text(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function key(value: unknown) { return text(value).replace(/\s+/g, "").toLowerCase(); }
function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function optionalNum(value: unknown): number | null {
  const raw = text(value);
  if (!raw || raw === "-" || raw === "#REF!" || raw === "#N/A" || raw === "#VALUE!") return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function asDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value) && value > 30000 && value < 70000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)).toISOString().slice(0, 10);
  }
  const raw = text(value);
  const match = raw.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
function parsePeriodText(value: unknown, year: number) {
  const raw = text(value);
  const match = raw.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[~\-–]\s*(\d{1,2})\s*[/.]\s*(\d{1,2})/);
  if (!match) return { start: "", end: "" };
  return {
    start: `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`,
    end: `${year}-${match[3].padStart(2, "0")}-${match[4].padStart(2, "0")}`,
  };
}
function normalizedPlacement(value: string) {
  return value.replace(/\([^)]*\)/g, "").replace(/[<>*_\-\/·]/g, "").replace(/\s+/g, "").toLowerCase();
}
function rowsFor(book: XLSX.WorkBook, sheetName: string): Matrix {
  return XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false }) as Matrix;
}
function findIndex(row: unknown[], aliases: string[]) {
  const aliasesNormalized = aliases.map(key);
  return row.findIndex((value) => aliasesNormalized.includes(key(value)));
}
function nextNonEmpty(row: unknown[], start: number) {
  for (let i = start; i < row.length; i++) if (text(row[i])) return row[i];
  return "";
}
function valueAt(row: unknown[], index: number) { return index >= 0 ? row[index] : ""; }
function ratioPercent(value: unknown) {
  const parsed = optionalNum(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function extractMailReportDate(mailBody: string, year: number) {
  const patterns = [
    /(?:\*\s*)?(\d{1,2})\/(\d{1,2})\([^)]*\)자/,
    /(?:기준|업데이트)[^\n]{0,24}?(\d{1,2})\/(\d{1,2})/,
    /(\d{1,2})\/(\d{1,2})자/,
  ];
  for (const pattern of patterns) {
    const match = mailBody.match(pattern);
    if (match) return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return "";
}
function extractOperationNotes(mailBody: string) {
  const lines = mailBody.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const mediaPattern = /(호갱노노|직방|당근(?:마켓)?|키즈노트|틱톡|애드부스트\s*스크린|애드부스트스크린|네이버(?:\s*GFA)?|카카오(?:\s*모먼트)?)/i;
  let currentMedia = "";
  const notes: string[] = [];

  for (const line of lines) {
    const section = line.match(/^<\s*(호갱노노|직방|당근(?:마켓)?|키즈노트|틱톡|애드부스트\s*스크린|애드부스트스크린|네이버(?:\s*GFA)?|카카오(?:\s*모먼트)?)\s*>$/i)
      || line.match(/^\d+\)\s*(호갱노노|직방|당근(?:마켓)?|키즈노트|틱톡|애드부스트\s*스크린|애드부스트스크린|네이버(?:\s*GFA)?|카카오(?:\s*모먼트)?)/i);
    if (section) currentMedia = section[1];

    const useful = /전일|집행 결과|보너스 집행|라이브 시작|집행 기간|기간\s*:|매체\s*:|효율|상승|하락|예산|보장 노출수|Impression|Clicks|CTR|전환|일일 통합 성과 데이터/i.test(line);
    if (!useful) continue;

    const hasMedia = mediaPattern.test(line);
    notes.push(currentMedia && !hasMedia ? `[${currentMedia}] ${line}` : line);
  }
  return Array.from(new Set(notes)).slice(0, 40);
}
function extractMailMetrics(mailBody: string) {
  const checks: Omit<MailMetricCheck, "status" | "matchedPlacement">[] = [];
  const regex = /<([^>]+)>[^\n]*?Impression:\s*([\d,]+)\s*\/\s*Clicks:\s*([\d,]+)\s*\/\s*CTR:\s*([\d.]+)%/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(mailBody))) checks.push({ placement: match[1].trim(), impressions: Number(match[2].replace(/,/g, "")), clicks: Number(match[3].replace(/,/g, "")), ctr: Number(match[4]) });
  return checks;
}

function workbookMeta(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  let advertiser = "";
  let campaignStart = "";
  let campaignEnd = "";
  let inferredYear = new Date().getFullYear();
  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    for (const row of rows.slice(0, 35)) {
      for (let i = 0; i < row.length; i++) {
        const label = key(row[i]);
        if (!advertiser && (label === "광고주" || label === "client")) advertiser = text(nextNonEmpty(row, i + 1));
        const explicit = asDate(row[i]);
        if (explicit) inferredYear = Number(explicit.slice(0, 4)) || inferredYear;
      }
    }
  }
  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    for (const row of rows.slice(0, 40)) {
      for (let i = 0; i < row.length; i++) {
        const label = key(row[i]);
        if (label === "집행기간") {
          const dates = row.slice(i + 1).map(asDate).filter(Boolean);
          campaignStart ||= dates[0] || "";
          campaignEnd ||= dates.at(-1) || "";
        }
        if ((!campaignStart || !campaignEnd) && (label === "기간" || label === "period")) {
          const period = parsePeriodText(nextNonEmpty(row, i + 1), inferredYear);
          campaignStart ||= period.start;
          campaignEnd ||= period.end;
        }
      }
    }
  }
  return { advertiser, campaignStart, campaignEnd, inferredYear };
}

function sheetPlatform(rows: Matrix, sheetName: string) {
  for (const row of rows.slice(0, 25)) {
    const index = findIndex(row, ["플랫폼", "Platform"]);
    if (index >= 0) {
      const value = text(nextNonEmpty(row, index + 1));
      if (value) return value;
    }
  }
  return sheetName.split(/[_-]/)[0] || sheetName;
}

function placementFromColumns(input: {
  row: unknown[]; platform: string; placement: string; sheetName: string;
  spendCol?: number; impCol?: number; clickCol?: number; ctrCol?: number; viewsCol?: number; vtrCol?: number; convCol?: number;
  cpcCol?: number; cpmCol?: number; cpvCol?: number; achievementCol?: number; guaranteedCol?: number;
}): PlacementFact {
  const { row } = input;
  const impressions = input.impCol !== undefined && input.impCol >= 0 ? num(row[input.impCol]) : 0;
  const clicks = input.clickCol !== undefined && input.clickCol >= 0 ? num(row[input.clickCol]) : 0;
  const ctr = input.ctrCol !== undefined && input.ctrCol >= 0 ? ratioPercent(row[input.ctrCol]) : (impressions ? clicks / impressions * 100 : null);
  return {
    platform: input.platform,
    placement: input.placement,
    achievement: input.achievementCol !== undefined && input.achievementCol >= 0 ? ratioPercent(row[input.achievementCol]) : null,
    guaranteed: input.guaranteedCol !== undefined && input.guaranteedCol >= 0 ? text(row[input.guaranteedCol]) : "",
    spend: input.spendCol !== undefined && input.spendCol >= 0 ? optionalNum(row[input.spendCol]) : null,
    impressions,
    clicks,
    ctr,
    views: input.viewsCol !== undefined && input.viewsCol >= 0 ? optionalNum(row[input.viewsCol]) : null,
    vtr: input.vtrCol !== undefined && input.vtrCol >= 0 ? ratioPercent(row[input.vtrCol]) : null,
    conversions: input.convCol !== undefined && input.convCol >= 0 ? optionalNum(row[input.convCol]) : null,
    cpc: input.cpcCol !== undefined && input.cpcCol >= 0 ? optionalNum(row[input.cpcCol]) : null,
    cpm: input.cpmCol !== undefined && input.cpmCol >= 0 ? optionalNum(row[input.cpmCol]) : null,
    cpv: input.cpvCol !== undefined && input.cpvCol >= 0 ? optionalNum(row[input.cpvCol]) : null,
    sourceSheet: input.sheetName,
  };
}

function parseSummaryMediaReport(sheetName: string, rows: Matrix): PlacementFact[] {
  const headerRow = rows.findIndex((row) => findIndex(row, ["매체"]) >= 0 && findIndex(row, ["지면"]) >= 0 && findIndex(row, ["실 노출", "실노출"]) >= 0);
  if (headerRow < 0) return [];
  const header = rows[headerRow];
  const mediaCol = findIndex(header, ["매체"]), placementCol = findIndex(header, ["지면"]);
  const spendCol = findIndex(header, ["소진 금액", "소진금액", "광고비", "Spent", "Spend"]);
  const impCol = findIndex(header, ["실 노출", "실노출", "노출", "노출수"]);
  const clickCol = findIndex(header, ["실클릭수", "실 클릭수", "클릭", "클릭수"]);
  const ctrCol = findIndex(header, ["CTR", "CTR(%)"]), cpcCol = findIndex(header, ["CPC"]), cpmCol = findIndex(header, ["CPM"]);
  const guaranteedCol = findIndex(header, ["예상노출수", "보장노출수"]), achievementCol = findIndex(header, ["노출달성률", "달성률", "달성율"]);
  const result: PlacementFact[] = [];
  let carriedMedia = "";
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const media = text(row[mediaCol]), placement = text(row[placementCol]);
    if (/grandtotal|^total$/i.test(key(media)) || /grandtotal|^total$/i.test(key(placement))) break;
    if (media) carriedMedia = media;
    if (!placement) continue;
    result.push(placementFromColumns({ row, platform: carriedMedia || media || sheetName, placement, sheetName, spendCol, impCol, clickCol, ctrCol, cpcCol, cpmCol, guaranteedCol, achievementCol }));
  }
  return result;
}

function parseAgencyTotal(sheetName: string, rows: Matrix): PlacementFact[] {
  if (!/total/i.test(sheetName)) return [];
  const headerRow = rows.findIndex((row) => findIndex(row, ["매체"]) >= 0 && findIndex(row, ["지면"]) >= 0 && findIndex(row, ["A.Imps"]) >= 0);
  if (headerRow < 0) return [];
  const header = rows[headerRow];
  const mediaCol = findIndex(header, ["매체"]), placementCol = findIndex(header, ["지면"]);
  const spendCol = findIndex(header, ["A.Cost", "A.Spend", "소진금액", "소진 금액", "광고비", "Spent", "Spend"]);
  const impCol = findIndex(header, ["A.Imps"]), clickCol = findIndex(header, ["A.Clicks"]), ctrCol = findIndex(header, ["CTR(%)", "CTR"]);
  const viewsCol = findIndex(header, ["Views", "조회수"]), vtrCol = findIndex(header, ["VTR", "VTR(%)"]), convCol = findIndex(header, ["Conversions", "전환", "전환수"]);
  const cpcCol = findIndex(header, ["CPC"]), cpmCol = findIndex(header, ["CPM"]), cpvCol = findIndex(header, ["CPV"]);
  const achievementCol = findIndex(header, ["달성률", "달성율"]), guaranteedCol = findIndex(header, ["보장노출수"]);
  let platform = "";
  for (const row of rows.slice(0, headerRow)) {
    const label = findIndex(row, ["플랫폼"]); if (label >= 0) platform = text(nextNonEmpty(row, label + 1));
  }
  const result: PlacementFact[] = []; let carriedMedia = platform;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r], media = text(row[mediaCol]), placement = text(row[placementCol]);
    if (/^total$/i.test(media) || /^total$/i.test(placement)) break;
    if (media) carriedMedia = media;
    if (!placement) continue;
    result.push(placementFromColumns({ row, platform: platform || carriedMedia || media || sheetName, placement, sheetName, spendCol, impCol, clickCol, ctrCol, viewsCol, vtrCol, convCol, cpcCol, cpmCol, cpvCol, achievementCol, guaranteedCol }));
  }
  return result;
}

function groupActualColumn(header: unknown[], sub: unknown[], groupName: string, subName: string) {
  const start = findIndex(header, [groupName]);
  if (start < 0) return -1;
  let end = header.length;
  for (let i = start + 1; i < header.length; i++) if (text(header[i])) { end = i; break; }
  for (let i = start; i < end; i++) if (key(sub[i]) === key(subName)) return i;
  return -1;
}
function findSubColumn(sub: unknown[], aliases: string[]) { return findIndex(sub, aliases); }
function parseOverall(sheetName: string, rows: Matrix): PlacementFact[] {
  if (!/overall/i.test(sheetName)) return [];
  const headerRow = rows.findIndex((row) => findIndex(row, ["Media"]) >= 0 && findIndex(row, ["Impressions"]) >= 0);
  if (headerRow < 0 || headerRow + 1 >= rows.length) return [];
  const header = rows[headerRow], sub = rows[headerRow + 1];
  const mediaCol = findIndex(header, ["Media"]);
  const spendCol = findSubColumn(sub, ["Spent"]);
  const impCol = groupActualColumn(header, sub, "Impressions", "Actual");
  const guaranteedCol = groupActualColumn(header, sub, "Impressions", "Guaranteed");
  const clickCol = groupActualColumn(header, sub, "Clicks", "Actual");
  const ctrCol = groupActualColumn(header, sub, "CTR", "Actual");
  const viewsCol = groupActualColumn(header, sub, "Views", "Actual");
  const vtrCol = groupActualColumn(header, sub, "VTR", "Actual");
  const cpvCol = findIndex(header, ["CPV"]), cpcCol = findIndex(header, ["CPC"]), cpmCol = findIndex(header, ["CPM"]);
  const result: PlacementFact[] = [];
  for (let r = headerRow + 2; r < rows.length; r++) {
    const row = rows[r], media = text(row[mediaCol]);
    if (!media) continue;
    if (/^total$/i.test(media.replace(/\s+/g, ""))) break;
    const guaranteed = guaranteedCol >= 0 ? num(row[guaranteedCol]) : 0;
    const fact = placementFromColumns({ row, platform: media, placement: media, sheetName, spendCol, impCol, clickCol, ctrCol, viewsCol, vtrCol, cpvCol, cpcCol, cpmCol });
    fact.guaranteed = guaranteed > 0 ? String(guaranteed) : "";
    fact.achievement = guaranteed > 0 ? fact.impressions / guaranteed * 100 : null;
    result.push(fact);
  }
  return result;
}

function parseGenericMetricTable(sheetName: string, rows: Matrix): PlacementFact[] {
  const headerRow = rows.findIndex((row) => {
    const hasName = findIndex(row, ["지면", "광고 상품", "AD Type", "소재명"]) >= 0;
    const hasMetric = findIndex(row, ["Impression", "Impressions", "노출", "노출수", "실 노출", "A.Imps"]) >= 0;
    return hasName && hasMetric;
  });
  if (headerRow < 0) return [];
  const header = rows[headerRow];
  const mediaCol = findIndex(header, ["매체", "Media", "플랫폼"]);
  const placementCol = findIndex(header, ["지면", "광고 상품", "AD Type", "소재명"]);
  const spendCol = findIndex(header, ["Spent", "Spend", "광고비", "소진금액", "소진 금액", "비용"]);
  const impCol = findIndex(header, ["Impression", "Impressions", "노출", "노출수", "실 노출", "A.Imps"]);
  const clickCol = findIndex(header, ["Click", "Clicks", "클릭", "클릭수", "실클릭수", "A.Clicks"]);
  const ctrCol = findIndex(header, ["CTR", "CTR(%)"]), viewsCol = findIndex(header, ["Views", "조회수", "재생"]), vtrCol = findIndex(header, ["VTR", "재생률"]);
  const cpcCol = findIndex(header, ["CPC"]), cpmCol = findIndex(header, ["CPM"]), cpvCol = findIndex(header, ["CPV"]), convCol = findIndex(header, ["전환", "전환수", "Conversions"]);
  const result: PlacementFact[] = []; let carriedMedia = "";
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r], media = mediaCol >= 0 ? text(row[mediaCol]) : "", placement = text(row[placementCol]);
    if (/^total$|grandtotal/i.test(key(media)) || /^total$|grandtotal/i.test(key(placement))) break;
    if (media) carriedMedia = media;
    if (!placement || /^\d{4}[-/.]/.test(placement)) continue;
    result.push(placementFromColumns({ row, platform: carriedMedia || media || sheetName.replace(/_Total.*/i, ""), placement, sheetName, spendCol, impCol, clickCol, ctrCol, viewsCol, vtrCol, cpcCol, cpmCol, cpvCol, convCol }));
  }
  return result;
}

function metricColumn(row: unknown[], start: number, end: number, aliases: string[]) {
  const wanted = aliases.map(key);
  for (let i = start; i < end; i++) if (wanted.includes(key(row[i]))) return i;
  return -1;
}

function parseAgencyDailyPerformance(sheetName: string, rows: Matrix, reportDate: string) {
  const result: DailyPerformanceFact[] = [];
  if (!/total/i.test(sheetName) || /소재별|타게팅별/i.test(sheetName)) return result;
  const titleRow = rows.findIndex((row) => row.some((value) => /일별\s*통합\s*성과\s*데이터/i.test(text(value))));
  if (titleRow < 0 || titleRow + 3 >= rows.length) return result;

  const groupRow = rows[titleRow + 1] ?? [];
  const metricRow = rows[titleRow + 2] ?? [];
  const dateCol = findIndex(groupRow, ["Date", "일자", "날짜"]);
  if (dateCol < 0) return result;

  const starts: number[] = [];
  for (let i = dateCol + 1; i < groupRow.length; i++) {
    const label = text(groupRow[i]);
    if (label && key(label) !== "total") starts.push(i);
  }
  const platform = sheetPlatform(rows, sheetName);

  starts.forEach((start, groupIndex) => {
    const end = starts[groupIndex + 1] ?? metricRow.length;
    const placement = text(groupRow[start]);
    const impCol = metricColumn(metricRow, start, end, ["Impression", "Impressions", "A.Imps", "노출", "노출수"]);
    const clickCol = metricColumn(metricRow, start, end, ["Click", "Clicks", "A.Clicks", "클릭", "클릭수"]);
    const ctrCol = metricColumn(metricRow, start, end, ["CTR", "CTR(%)"]);
    if (!placement || impCol < 0) return;

    for (let r = titleRow + 4; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const date = asDate(row[dateCol]);
      if (!date || (reportDate && date > reportDate)) continue;
      const impressionsRaw = optionalNum(valueAt(row, impCol));
      const clicksRaw = clickCol >= 0 ? optionalNum(valueAt(row, clickCol)) : null;
      const ctrRaw = ctrCol >= 0 ? ratioPercent(valueAt(row, ctrCol)) : null;
      if (impressionsRaw === null && clicksRaw === null && ctrRaw === null) continue;
      const impressions = impressionsRaw ?? 0;
      result.push({
        date,
        platform,
        placement,
        spend: null,
        impressions,
        clicks: clicksRaw,
        views: null,
        ctr: ctrRaw ?? (impressions > 0 && clicksRaw !== null ? clicksRaw / impressions * 100 : null),
        cpm: null,
        cpc: null,
        cpv: null,
        vtr: null,
        sourceSheet: sheetName,
      });
    }
  });
  return result;
}

function parseCreativeDailyPerformance(sheetName: string, rows: Matrix, reportDate: string) {
  const result: CreativeDailyFact[] = [];
  if (!/소재별/i.test(sheetName)) return result;
  const titleRow = rows.findIndex((row) => row.some((value) => /일별\s*통합\s*성과\s*데이터/i.test(text(value))));
  if (titleRow < 0 || titleRow + 3 >= rows.length) return result;

  const creativeRow = rows[titleRow] ?? [];
  const groupRow = rows[titleRow + 1] ?? [];
  const metricRow = rows[titleRow + 2] ?? [];
  const dateCol = findIndex(groupRow, ["Date", "일자", "날짜"]);
  if (dateCol < 0) return result;

  const starts: number[] = [];
  for (let i = dateCol + 1; i < creativeRow.length; i++) {
    const label = text(creativeRow[i]);
    if (label && !/일별\s*통합\s*성과\s*데이터/i.test(label)) starts.push(i);
  }
  const platform = sheetPlatform(rows, sheetName);

  starts.forEach((start, groupIndex) => {
    const end = starts[groupIndex + 1] ?? metricRow.length;
    const creative = text(creativeRow[start]);
    const placement = text(groupRow[start]);
    const impCol = metricColumn(metricRow, start, end, ["Impression", "Impressions", "A.Imps", "노출", "노출수"]);
    const clickCol = metricColumn(metricRow, start, end, ["Click", "Clicks", "A.Clicks", "클릭", "클릭수"]);
    const ctrCol = metricColumn(metricRow, start, end, ["CTR", "CTR(%)"]);
    if (!creative || !placement || impCol < 0) return;

    for (let r = titleRow + 4; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const date = asDate(row[dateCol]);
      if (!date || (reportDate && date > reportDate)) continue;
      const impressionsRaw = optionalNum(valueAt(row, impCol));
      const clicksRaw = clickCol >= 0 ? optionalNum(valueAt(row, clickCol)) : null;
      const ctrRaw = ctrCol >= 0 ? ratioPercent(valueAt(row, ctrCol)) : null;
      if (impressionsRaw === null && clicksRaw === null && ctrRaw === null) continue;
      const impressions = impressionsRaw ?? 0;
      result.push({
        date,
        platform,
        placement,
        creative,
        impressions,
        clicks: clicksRaw,
        ctr: ctrRaw ?? (impressions > 0 && clicksRaw !== null ? clicksRaw / impressions * 100 : null),
        sourceSheet: sheetName,
      });
    }
  });
  return result;
}

function parseMediaPlans(book: XLSX.WorkBook, matrices: Record<string, Matrix>, year: number) {
  const plans: MediaPlanFact[] = []; const sourceSheets = new Set<string>();
  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    const headerRow = rows.findIndex((row) => findIndex(row, ["매체"]) >= 0 && findIndex(row, ["광고 상품", "광고상품"]) >= 0 && findIndex(row, ["일정"]) >= 0);
    if (headerRow < 0) continue;
    const header = rows[headerRow];
    const mediaCol = findIndex(header, ["매체"]), productCol = findIndex(header, ["광고 상품", "광고상품"]), deviceCol = findIndex(header, ["기기", "Device"]);
    const creativeCol = findIndex(header, ["소재"]), periodCol = findIndex(header, ["일정"]), targetCol = findIndex(header, ["타겟팅"]);
    const budgetCol = findIndex(header, ["Budget (VAT별도)", "Budget", "예산"]), impCol = findIndex(header, ["Expect Imps", "예상 노출수", "보장 노출수 / 예상 노출수"]), clickCol = findIndex(header, ["Expect Clicks", "예상 클릭수"]);
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r], media = text(row[mediaCol]), product = text(row[productCol]);
      if (/subtotal|^total$/i.test(key(media)) || /subtotal|^total$/i.test(key(product))) break;
      if (!media && !product) continue;
      const period = parsePeriodText(valueAt(row, periodCol), year);
      plans.push({ platform: media || sheetName.replace(/^Media Mix[_\s-]*/i, ""), product, placement: product, device: text(valueAt(row, deviceCol)), creativeType: text(valueAt(row, creativeCol)), periodStart: period.start, periodEnd: period.end, budget: budgetCol >= 0 ? optionalNum(row[budgetCol]) : null, expectedImpressions: impCol >= 0 ? optionalNum(row[impCol]) : null, expectedClicks: clickCol >= 0 ? optionalNum(row[clickCol]) : null, target: text(valueAt(row, targetCol)), sourceSheet: sheetName });
    }
    if (plans.some((plan) => plan.sourceSheet === sheetName)) sourceSheets.add(sheetName);
  }
  return { plans, sourceSheets };
}

export function parseDailyWorkbookBuffer(buffer: Buffer, filename: string, mailBody: string): DailyBundlePreview {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false });
  const matrices: Record<string, Matrix> = {};
  for (const sheetName of book.SheetNames) matrices[sheetName] = rowsFor(book, sheetName);
  const meta = workbookMeta(book, matrices);
  const year = Number((meta.campaignStart || `${meta.inferredYear}`).slice(0, 4)) || meta.inferredYear;
  const reportDate = extractMailReportDate(mailBody, year) || meta.campaignStart || "";

  const placements: PlacementFact[] = [];
  const parsedSheets = new Set<string>();
  const dailyPerformance: DailyPerformanceFact[] = [];
  const creativeDailyPerformance: CreativeDailyFact[] = [];
  const dailySourceSheets = new Set<string>();
  const creativeSourceSheets = new Set<string>();

  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    if (/^raw/i.test(sheetName) || /media\s*mix/i.test(sheetName) || /_[A-Z]$/i.test(sheetName)) continue;

    const daily = parseAgencyDailyPerformance(sheetName, rows, reportDate);
    if (daily.length) {
      dailyPerformance.push(...daily);
      dailySourceSheets.add(sheetName);
    }
    const creative = parseCreativeDailyPerformance(sheetName, rows, reportDate);
    if (creative.length) {
      creativeDailyPerformance.push(...creative);
      creativeSourceSheets.add(sheetName);
    }

    if (/소재별|타게팅별/i.test(sheetName)) continue;
    const parsers = [parseSummaryMediaReport, parseAgencyTotal, parseOverall, parseGenericMetricTable];
    for (const parser of parsers) {
      const result = parser(sheetName, rows);
      if (result.length) { placements.push(...result); parsedSheets.add(sheetName); break; }
    }
  }

  const plan = parseMediaPlans(book, matrices, meta.inferredYear);
  const mailMetrics = extractMailMetrics(mailBody);
  const mailChecks: MailMetricCheck[] = mailMetrics.map((metric) => {
    const wanted = normalizedPlacement(metric.placement);
    const candidate = placements.find((placement) => {
      const current = normalizedPlacement(placement.placement);
      return current === wanted || current.includes(wanted) || wanted.includes(current);
    });
    if (!candidate) return { ...metric, status: "unmatched" };
    const ctrDiff = candidate.ctr === null ? 999 : Math.abs(candidate.ctr - metric.ctr);
    const status = candidate.impressions === metric.impressions && candidate.clicks === metric.clicks && ctrDiff <= 0.01 ? "match" : "mismatch";
    return { ...metric, status, matchedPlacement: candidate.placement };
  });
  const usedSheets = new Set([...parsedSheets, ...dailySourceSheets, ...creativeSourceSheets, ...plan.sourceSheets]);

  return {
    advertiser: meta.advertiser || (/교원웰스|웰스/i.test(filename + mailBody) ? "교원웰스" : /자코모/i.test(filename + mailBody) ? "자코모" : "미확인"),
    reportDate,
    campaignStart: meta.campaignStart,
    campaignEnd: meta.campaignEnd,
    sourceFile: filename,
    parsedSheets: [...parsedSheets],
    ignoredSheets: book.SheetNames.filter((name) => !usedSheets.has(name)),
    placements,
    dailyPerformance,
    creativeDailyPerformance,
    mediaPlan: plan.plans,
    planSourceSheets: [...plan.sourceSheets],
    mailChecks,
    operationNotes: extractOperationNotes(mailBody),
    qa: {
      matchedMailMetrics: mailChecks.filter((item) => item.status === "match").length,
      mismatchedMailMetrics: mailChecks.filter((item) => item.status === "mismatch").length,
      unmatchedMailMetrics: mailChecks.filter((item) => item.status === "unmatched").length,
      ignoredSheetCount: book.SheetNames.filter((name) => !usedSheets.has(name)).length,
    },
  };
}