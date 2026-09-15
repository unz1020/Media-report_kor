export type PlacementFact = {
  platform: string;
  placement: string;
  achievement: number | null;
  guaranteed: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  sourceSheet: string;
};

export type MailMetricCheck = {
  placement: string;
  impressions: number;
  clicks: number;
  ctr: number;
  status: "match" | "mismatch" | "unmatched";
  matchedPlacement?: string;
};

export type DailyBundlePreview = {
  advertiser: string;
  reportDate: string;
  campaignStart: string;
  campaignEnd: string;
  sourceFile: string;
  parsedSheets: string[];
  ignoredSheets: string[];
  placements: PlacementFact[];
  mailChecks: MailMetricCheck[];
  operationNotes: string[];
  qa: {
    matchedMailMetrics: number;
    mismatchedMailMetrics: number;
    unmatchedMailMetrics: number;
    ignoredSheetCount: number;
  };
};

function normalized(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedPlacement(value: string) {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/[<>*_\-\/·]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || normalized(value) === "" || normalized(value) === "-") return null;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = normalized(value);
  const m = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function extractMailReportDate(mailBody: string, year: number) {
  const patterns = [
    /(?:\*\s*)?(\d{1,2})\/(\d{1,2})\([^)]*\)자/,
    /(?:기준|업데이트)[^\n]{0,24}?(\d{1,2})\/(\d{1,2})/,
  ];
  for (const pattern of patterns) {
    const match = mailBody.match(pattern);
    if (match) return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return "";
}

function extractOperationNotes(mailBody: string) {
  const lines = mailBody.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const notes = lines.filter((line) =>
    /보너스 집행|라이브 시작|집행 기간|기간\s*:|매체\s*:/.test(line)
  );
  return Array.from(new Set(notes)).slice(0, 12);
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

export async function parseDailyWorkbook(file: File, mailBody: string): Promise<DailyBundlePreview> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer as ArrayBuffer);

  const placements: PlacementFact[] = [];
  const parsedSheets: string[] = [];
  const ignoredSheets: string[] = [];
  let advertiser = "";
  let campaignStart = "";
  let campaignEnd = "";

  workbook.worksheets.forEach((sheet) => {
    const sheetName = sheet.name;
    const isSummarySheet = /_Total_/i.test(sheetName) || /Total_/i.test(sheetName);
    if (!isSummarySheet || /^Raw/i.test(sheetName)) {
      ignoredSheets.push(sheetName);
      return;
    }

    let platform = "";
    let headerRowNumber = -1;
    const headerIndex: Record<string, number> = {};

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const texts: string[] = [];
      for (let col = 1; col <= Math.max(row.cellCount, 8); col++) texts[col] = normalized(row.getCell(col).text || row.getCell(col).value);

      const advertiserIndex = texts.findIndex((value) => value === "광고주");
      if (advertiserIndex > 0 && !advertiser) advertiser = normalized(row.getCell(advertiserIndex + 1).text || row.getCell(advertiserIndex + 1).value);

      const platformIndex = texts.findIndex((value) => value === "플랫폼");
      if (platformIndex > 0) platform = normalized(row.getCell(platformIndex + 1).text || row.getCell(platformIndex + 1).value);

      const periodIndex = texts.findIndex((value) => value === "집행 기간");
      if (periodIndex > 0 && !campaignStart) {
        campaignStart = dateText(row.getCell(periodIndex + 1).value || row.getCell(periodIndex + 1).text);
        campaignEnd = dateText(row.getCell(periodIndex + 3).value || row.getCell(periodIndex + 3).text);
      }

      if (texts.includes("매체") && texts.includes("지면") && texts.some((value) => value === "A.Imps")) {
        headerRowNumber = rowNumber;
        texts.forEach((value, index) => {
          if (value) headerIndex[value] = index;
        });
      }
    });

    if (headerRowNumber < 0) {
      ignoredSheets.push(sheetName);
      return;
    }

    parsedSheets.push(sheetName);
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const media = normalized(row.getCell(headerIndex["매체"] || 1).text || row.getCell(headerIndex["매체"] || 1).value);
      const placement = normalized(row.getCell(headerIndex["지면"] || 1).text || row.getCell(headerIndex["지면"] || 1).value);
      if (media === "Total" || placement === "Total") break;
      if (!placement) continue;

      const impressions = numberValue(row.getCell(headerIndex["A.Imps"] || 1).value ?? row.getCell(headerIndex["A.Imps"] || 1).text);
      const clicks = numberValue(row.getCell(headerIndex["A.Clicks"] || 1).value ?? row.getCell(headerIndex["A.Clicks"] || 1).text);
      const ctrRaw = optionalNumber(row.getCell(headerIndex["CTR(%)"] || 1).value ?? row.getCell(headerIndex["CTR(%)"] || 1).text);
      const achievementRaw = optionalNumber(row.getCell(headerIndex["달성률"] || headerIndex["달성율"] || 1).value ?? row.getCell(headerIndex["달성률"] || headerIndex["달성율"] || 1).text);
      const guaranteed = normalized(row.getCell(headerIndex["보장노출수"] || 1).text || row.getCell(headerIndex["보장노출수"] || 1).value);

      placements.push({
        platform: platform || media,
        placement,
        achievement: achievementRaw === null ? null : achievementRaw * 100,
        guaranteed,
        impressions,
        clicks,
        ctr: ctrRaw === null ? null : ctrRaw * 100,
        sourceSheet: sheetName,
      });
    }
  });

  const year = Number(campaignStart.slice(0, 4)) || new Date().getFullYear();
  const reportDate = extractMailReportDate(mailBody, year) || campaignStart;
  const mailMetrics = extractMailMetrics(mailBody);
  const mailChecks: MailMetricCheck[] = mailMetrics.map((metric) => {
    const key = normalizedPlacement(metric.placement);
    const candidate = placements.find((placement) => {
      const p = normalizedPlacement(placement.placement);
      return p === key || p.includes(key) || key.includes(p);
    });
    if (!candidate) return { ...metric, status: "unmatched" };
    const ctrDiff = candidate.ctr === null ? 999 : Math.abs(candidate.ctr - metric.ctr);
    const isMatch = candidate.impressions === metric.impressions && candidate.clicks === metric.clicks && ctrDiff <= 0.01;
    return { ...metric, status: isMatch ? "match" : "mismatch", matchedPlacement: candidate.placement };
  });

  return {
    advertiser: advertiser || "미확인",
    reportDate,
    campaignStart,
    campaignEnd,
    sourceFile: file.name,
    parsedSheets,
    ignoredSheets,
    placements,
    mailChecks,
    operationNotes: extractOperationNotes(mailBody),
    qa: {
      matchedMailMetrics: mailChecks.filter((item) => item.status === "match").length,
      mismatchedMailMetrics: mailChecks.filter((item) => item.status === "mismatch").length,
      unmatchedMailMetrics: mailChecks.filter((item) => item.status === "unmatched").length,
      ignoredSheetCount: ignoredSheets.length,
    },
  };
}
