import * as XLSX from "xlsx";
import type { DailyBundlePreview, MailMetricCheck, PlacementFact } from "@/lib/daily-report-parser";

type Matrix = unknown[][];

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function key(value: unknown) {
  return text(value).replace(/\s+/g, "").toLowerCase();
}

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(text(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | null {
  const raw = text(value);
  if (!raw || raw === "-" || raw === "#REF!" || raw === "#N/A") return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/[<>*_\-\/·]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
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
  const preferred = lines.filter((line) =>
    /전일|성과|보너스 집행|라이브|집행 기간|기간\s*:|매체\s*:|효율|상승|하락|예산|노출|클릭|CTR|전환/i.test(line)
  );
  return Array.from(new Set(preferred)).slice(0, 20);
}

function extractMailMetrics(mailBody: string) {
  const checks: Omit<MailMetricCheck, "status" | "matchedPlacement">[] = [];
  const regex = /<([^>]+)>[^\n]*?Impression:\s*([\d,]+)\s*\/\s*Clicks:\s*([\d,]+)\s*\/\s*CTR:\s*([\d.]+)%/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(mailBody))) {
    checks.push({
      placement: match[1].trim(),
      impressions: Number(match[2].replace(/,/g, "")),
      clicks: Number(match[3].replace(/,/g, "")),
      ctr: Number(match[4]),
    });
  }
  return checks;
}

function rowsFor(book: XLSX.WorkBook, sheetName: string): Matrix {
  return XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  }) as Matrix;
}

function nextNonEmpty(row: unknown[], start: number) {
  for (let i = start; i < row.length; i++) {
    if (text(row[i])) return row[i];
  }
  return "";
}

function workbookMeta(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  let advertiser = "";
  let campaignStart = "";
  let campaignEnd = "";
  let inferredYear = new Date().getFullYear();

  outer: for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    for (const row of rows.slice(0, 30)) {
      for (let i = 0; i < row.length; i++) {
        const label = key(row[i]);
        if (!advertiser && (label === "광고주" || label === "client")) {
          advertiser = text(nextNonEmpty(row, i + 1));
        }
        const explicit = asDate(row[i]);
        if (explicit) inferredYear = Number(explicit.slice(0, 4)) || inferredYear;
      }
    }
    if (advertiser) break outer;
  }

  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    for (const row of rows.slice(0, 40)) {
      for (let i = 0; i < row.length; i++) {
        const label = key(row[i]);
        if (label === "집행기간") {
          const start = asDate(nextNonEmpty(row, i + 1));
          const endCandidates = row.slice(i + 1).map(asDate).filter(Boolean);
          if (start) campaignStart = start;
          if (endCandidates.length) campaignEnd = endCandidates[endCandidates.length - 1];
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

function findIndex(row: unknown[], aliases: string[]) {
  const aliasKeys = aliases.map(key);
  return row.findIndex((value) => aliasKeys.includes(key(value)));
}

function parseAgencyTotals(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  const placements: PlacementFact[] = [];
  const parsedSheets = new Set<string>();

  for (const sheetName of book.SheetNames) {
    if (!/total/i.test(sheetName)) continue;
    const rows = matrices[sheetName] ?? [];
    const headerRow = rows.findIndex((row) => findIndex(row, ["매체"]) >= 0 && findIndex(row, ["지면"]) >= 0 && findIndex(row, ["A.Imps"]) >= 0);
    if (headerRow < 0) continue;
    const header = rows[headerRow];
    const mediaCol = findIndex(header, ["매체"]);
    const placementCol = findIndex(header, ["지면"]);
    const impCol = findIndex(header, ["A.Imps"]);
    const clickCol = findIndex(header, ["A.Clicks"]);
    const ctrCol = findIndex(header, ["CTR(%)", "CTR"]);
    const achievementCol = findIndex(header, ["달성률", "달성율"]);
    const guaranteedCol = findIndex(header, ["보장노출수"]);
    let platform = "";
    for (const row of rows.slice(0, headerRow)) {
      const label = findIndex(row, ["플랫폼"]);
      if (label >= 0) platform = text(nextNonEmpty(row, label + 1));
    }
    let carriedMedia = platform;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const media = mediaCol >= 0 ? text(row[mediaCol]) : "";
      const placement = placementCol >= 0 ? text(row[placementCol]) : "";
      if (/^total$/i.test(media) || /^total$/i.test(placement)) break;
      if (media) carriedMedia = media;
      if (!placement) continue;
      const impressions = num(row[impCol]);
      const clicks = num(row[clickCol]);
      const ctrRaw = ctrCol >= 0 ? optionalNum(row[ctrCol]) : null;
      const achievementRaw = achievementCol >= 0 ? optionalNum(row[achievementCol]) : null;
      placements.push({
        platform: platform || carriedMedia || media || sheetName,
        placement,
        achievement: achievementRaw === null ? null : achievementRaw * 100,
        guaranteed: guaranteedCol >= 0 ? text(row[guaranteedCol]) : "",
        impressions,
        clicks,
        ctr: ctrRaw === null ? null : ctrRaw * 100,
        sourceSheet: sheetName,
      });
    }
    if (placements.some((item) => item.sourceSheet === sheetName)) parsedSheets.add(sheetName);
  }
  return { placements, parsedSheets };
}

function parseSummaryMediaReport(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  const placements: PlacementFact[] = [];
  const parsedSheets = new Set<string>();
  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    const headerRow = rows.findIndex((row) =>
      findIndex(row, ["매체"]) >= 0 &&
      findIndex(row, ["지면"]) >= 0 &&
      findIndex(row, ["실 노출", "실노출"]) >= 0 &&
      findIndex(row, ["실클릭수", "실 클릭수"]) >= 0
    );
    if (headerRow < 0) continue;
    const header = rows[headerRow];
    const mediaCol = findIndex(header, ["매체"]);
    const placementCol = findIndex(header, ["지면"]);
    const impCol = findIndex(header, ["실 노출", "실노출"]);
    const clickCol = findIndex(header, ["실클릭수", "실 클릭수"]);
    const ctrCol = findIndex(header, ["CTR"]);
    const achievementCol = findIndex(header, ["노출달성률"]);
    const guaranteedCol = findIndex(header, ["예상노출수"]);
    let carriedMedia = "";
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const media = text(row[mediaCol]);
      const placement = text(row[placementCol]);
      if (/grandtotal/i.test(key(media)) || /grandtotal/i.test(key(placement))) break;
      if (media) carriedMedia = media;
      if (!placement) continue;
      const ctrRaw = optionalNum(row[ctrCol]);
      const achievementRaw = achievementCol >= 0 ? optionalNum(row[achievementCol]) : null;
      placements.push({
        platform: carriedMedia || media || sheetName,
        placement,
        achievement: achievementRaw === null ? null : achievementRaw * 100,
        guaranteed: guaranteedCol >= 0 ? text(row[guaranteedCol]) : "",
        impressions: num(row[impCol]),
        clicks: num(row[clickCol]),
        ctr: ctrRaw === null ? null : ctrRaw * 100,
        sourceSheet: sheetName,
      });
    }
    if (placements.some((item) => item.sourceSheet === sheetName)) parsedSheets.add(sheetName);
  }
  return { placements, parsedSheets };
}

function groupActualColumn(header: unknown[], subheader: unknown[], groupName: string, subName: string) {
  const start = findIndex(header, [groupName]);
  if (start < 0) return -1;
  let end = header.length;
  for (let i = start + 1; i < header.length; i++) {
    if (text(header[i])) { end = i; break; }
  }
  const target = key(subName);
  for (let i = start; i < end; i++) if (key(subheader[i]) === target) return i;
  return start;
}

function parseOverall(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  const placements: PlacementFact[] = [];
  const parsedSheets = new Set<string>();
  for (const sheetName of book.SheetNames) {
    if (!/overall/i.test(sheetName)) continue;
    const rows = matrices[sheetName] ?? [];
    const headerRow = rows.findIndex((row) => findIndex(row, ["Media"]) >= 0 && findIndex(row, ["Impressions"]) >= 0 && findIndex(row, ["Clicks"]) >= 0);
    if (headerRow < 0 || headerRow + 1 >= rows.length) continue;
    const header = rows[headerRow];
    const sub = rows[headerRow + 1];
    const mediaCol = findIndex(header, ["Media"]);
    const impCol = groupActualColumn(header, sub, "Impressions", "Actual");
    const guaranteedCol = groupActualColumn(header, sub, "Impressions", "Guaranteed");
    const clickCol = groupActualColumn(header, sub, "Clicks", "Actual");
    const ctrCol = groupActualColumn(header, sub, "CTR", "Actual");
    for (let r = headerRow + 2; r < rows.length; r++) {
      const row = rows[r];
      const media = text(row[mediaCol]);
      if (!media) continue;
      if (/^total$/i.test(media.replace(/\s+/g, ""))) break;
      const impressions = impCol >= 0 ? num(row[impCol]) : 0;
      const clicks = clickCol >= 0 ? num(row[clickCol]) : 0;
      const guaranteed = guaranteedCol >= 0 ? num(row[guaranteedCol]) : 0;
      const ctrRaw = ctrCol >= 0 ? optionalNum(row[ctrCol]) : null;
      placements.push({
        platform: media,
        placement: media,
        achievement: guaranteed > 0 ? impressions / guaranteed * 100 : null,
        guaranteed: guaranteed > 0 ? String(guaranteed) : "",
        impressions,
        clicks,
        ctr: ctrRaw === null ? (impressions > 0 ? clicks / impressions * 100 : null) : ctrRaw * 100,
        sourceSheet: sheetName,
      });
    }
    if (placements.length) parsedSheets.add(sheetName);
  }
  return { placements, parsedSheets };
}

function parseGeneric(book: XLSX.WorkBook, matrices: Record<string, Matrix>) {
  const placements: PlacementFact[] = [];
  const parsedSheets = new Set<string>();
  for (const sheetName of book.SheetNames) {
    const rows = matrices[sheetName] ?? [];
    const headerRow = rows.findIndex((row) => {
      const hasUnit = findIndex(row, ["매체", "Media", "플랫폼", "지면", "AD Type", "광고 상품"]) >= 0;
      const hasImp = findIndex(row, ["A.Imps", "실 노출", "노출수", "Impression", "Impressions"]) >= 0;
      const hasClick = findIndex(row, ["A.Clicks", "실클릭수", "클릭수", "Click", "Clicks", "Click(전체)"]) >= 0;
      return hasUnit && hasImp && hasClick;
    });
    if (headerRow < 0) continue;
    const header = rows[headerRow];
    const mediaCol = findIndex(header, ["매체", "Media", "플랫폼"]);
    const placementCol = findIndex(header, ["지면", "AD Type", "광고 상품"]);
    const impCol = findIndex(header, ["A.Imps", "실 노출", "노출수", "Impression", "Impressions"]);
    const clickCol = findIndex(header, ["A.Clicks", "실클릭수", "클릭수", "Click", "Clicks", "Click(전체)"]);
    const ctrCol = findIndex(header, ["CTR(%)", "CTR"]);
    let carriedMedia = "";
    let blankStreak = 0;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const media = mediaCol >= 0 ? text(row[mediaCol]) : "";
      const placement = placementCol >= 0 ? text(row[placementCol]) : "";
      const unit = placement || media;
      if (/^(total|subtotal|grandtotal)$/i.test(key(unit))) break;
      if (!unit) {
        blankStreak++;
        if (blankStreak >= 4 && placements.some((item) => item.sourceSheet === sheetName)) break;
        continue;
      }
      blankStreak = 0;
      if (media) carriedMedia = media;
      const impressions = num(row[impCol]);
      const clicks = num(row[clickCol]);
      if (!impressions && !clicks) continue;
      const ctrRaw = ctrCol >= 0 ? optionalNum(row[ctrCol]) : null;
      placements.push({
        platform: carriedMedia || media || sheetName,
        placement: placement || media || unit,
        achievement: null,
        guaranteed: "",
        impressions,
        clicks,
        ctr: ctrRaw === null ? (impressions > 0 ? clicks / impressions * 100 : null) : ctrRaw * 100,
        sourceSheet: sheetName,
      });
    }
    if (placements.some((item) => item.sourceSheet === sheetName)) parsedSheets.add(sheetName);
  }
  return { placements, parsedSheets };
}

function dedupeFacts(items: PlacementFact[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = `${key(item.platform)}::${normalizedPlacement(item.placement)}::${item.impressions}::${item.clicks}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function parseDailyWorkbookBuffer(buffer: Buffer, filename: string, mailBody: string): DailyBundlePreview {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false });
  const matrices: Record<string, Matrix> = {};
  for (const sheetName of book.SheetNames) matrices[sheetName] = rowsFor(book, sheetName);

  const meta = workbookMeta(book, matrices);
  const agency = parseAgencyTotals(book, matrices);
  const summary = parseSummaryMediaReport(book, matrices);
  const overall = parseOverall(book, matrices);
  let placements = dedupeFacts([...agency.placements, ...summary.placements, ...overall.placements]);
  const parsedSheets = new Set<string>([...agency.parsedSheets, ...summary.parsedSheets, ...overall.parsedSheets]);

  if (!placements.length) {
    const generic = parseGeneric(book, matrices);
    placements = dedupeFacts(generic.placements);
    for (const sheet of generic.parsedSheets) parsedSheets.add(sheet);
  }

  const year = Number(meta.campaignStart.slice(0, 4)) || meta.inferredYear;
  const reportDate = extractMailReportDate(mailBody, year) || meta.campaignStart;
  const mailMetrics = extractMailMetrics(mailBody);
  const mailChecks: MailMetricCheck[] = mailMetrics.map((metric) => {
    const target = normalizedPlacement(metric.placement);
    const candidate = placements.find((placement) => {
      const p = normalizedPlacement(placement.placement);
      return p === target || p.includes(target) || target.includes(p);
    });
    if (!candidate) return { ...metric, status: "unmatched" };
    const ctrDiff = candidate.ctr === null ? 999 : Math.abs(candidate.ctr - metric.ctr);
    const isMatch = candidate.impressions === metric.impressions && candidate.clicks === metric.clicks && ctrDiff <= 0.02;
    return { ...metric, status: isMatch ? "match" : "mismatch", matchedPlacement: candidate.placement };
  });

  return {
    advertiser: meta.advertiser || "미확인",
    reportDate,
    campaignStart: meta.campaignStart,
    campaignEnd: meta.campaignEnd,
    sourceFile: filename,
    parsedSheets: Array.from(parsedSheets),
    ignoredSheets: book.SheetNames.filter((name) => !parsedSheets.has(name)),
    placements,
    mailChecks,
    operationNotes: extractOperationNotes(mailBody),
    qa: {
      matchedMailMetrics: mailChecks.filter((item) => item.status === "match").length,
      mismatchedMailMetrics: mailChecks.filter((item) => item.status === "mismatch").length,
      unmatchedMailMetrics: mailChecks.filter((item) => item.status === "unmatched").length,
      ignoredSheetCount: book.SheetNames.filter((name) => !parsedSheets.has(name)).length,
    },
  };
}
