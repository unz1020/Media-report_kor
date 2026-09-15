import type { DailyBundlePreview, PlacementFact } from "@/lib/daily-report-parser";

export type LookerDailyFact = {
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

export type LookerBundle = DailyBundlePreview & {
  sourceId: string;
  sourceUrl?: string;
  sourceKind: "Data Studio PDF";
  dailyPerformance: LookerDailyFact[];
};

type TextItemLike = { str?: string; transform?: number[] };

function money(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function count(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function rate(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function isoDate(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function sourceReportId(url?: string) {
  return url?.match(/\/reporting\/([^/]+)/i)?.[1] || "uploaded-pdf";
}

function lineText(items: TextItemLike[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const text = (item.str || "").trim();
    if (!text) continue;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    const bucket = Math.round(y / 2) * 2;
    const row = rows.get(bucket) || [];
    row.push({ x, text });
    rows.set(bucket, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function extractPages(buffer: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages: string[][] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(lineText(content.items as TextItemLike[]));
  }
  return pages;
}

function parseDvDaily(lines: string[]) {
  const result: LookerDailyFact[] = [];
  const regex = /(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s+₩([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)%\s+₩([\d,]+)\s+₩([\d,]+)/;
  for (const line of lines) {
    const match = line.match(regex);
    if (!match) continue;
    result.push({
      date: isoDate(match[1], match[2], match[3]),
      platform: "Display & Video 360",
      placement: "CPC 캠페인",
      spend: money(match[4]),
      impressions: count(match[5]),
      clicks: count(match[6]),
      ctr: rate(match[7]),
      cpm: money(match[8]),
      cpc: money(match[9]),
      views: null,
      cpv: null,
      vtr: null,
    });
  }
  return result;
}

function parseNetflixDaily(lines: string[]) {
  const result: LookerDailyFact[] = [];
  const regex = /(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s+₩([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+₩([\d,]+)\s+₩([\d.]+)\s+₩([\d,]+)\s+([\d.]+)%\s+([\d.]+)%/;
  for (const line of lines) {
    const match = line.match(regex);
    if (!match) continue;
    result.push({
      date: isoDate(match[1], match[2], match[3]),
      platform: "Netflix",
      placement: "프로그래머틱 딜 캠페인",
      spend: money(match[4]),
      impressions: count(match[5]),
      views: count(match[6]),
      clicks: count(match[7]),
      cpm: money(match[8]),
      cpv: money(match[9]),
      cpc: money(match[10]),
      ctr: rate(match[11]),
      vtr: rate(match[12]),
    });
  }
  return result;
}

function findDvSummary(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/₩([\d,]+)\s+([\d,]+)\s+₩([\d,]+)\s+([\d,]+)\s+₩([\d,]+)\s+([\d.]+)%/);
    if (!match) continue;
    return { spend: money(match[1]), impressions: count(match[2]), cpm: money(match[3]), clicks: count(match[4]), cpc: money(match[5]), ctr: rate(match[6]) };
  }
  return null;
}

function findNetflixSummary(lines: string[]) {
  let headline: { spend: number | null; impressions: number; views: number } | null = null;
  let efficiency: { cpm: number | null; cpv: number | null; vtr: number | null } | null = null;
  for (const line of lines) {
    if (!headline) {
      const match = line.match(/₩([\d,]+)\s+([\d,]+)\s+([\d,]+)/);
      if (match) headline = { spend: money(match[1]), impressions: count(match[2]), views: count(match[3]) };
    }
    if (!efficiency) {
      const match = line.match(/₩([\d,]+)\s+₩([\d.]+)\s+([\d.]+)%/);
      if (match) efficiency = { cpm: money(match[1]), cpv: money(match[2]), vtr: rate(match[3]) };
    }
  }
  return headline ? { ...headline, ...(efficiency || { cpm: null, cpv: null, vtr: null }) } : null;
}

function campaignHeader(lines: string[], kind: "dv360" | "netflix") {
  const pattern = kind === "dv360"
    ? /(20\d{2})년\s*(\d{1,2})월\s*CPC\s*캠페인/
    : /(20\d{2})년\s*(\d{1,2})월\s*프로그래머틱\s*딜\s*캠페인/;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return { year: match[1], month: match[2].padStart(2, "0") };
  }
  return null;
}

function sumDaily(rows: LookerDailyFact[]) {
  return {
    spend: rows.reduce((sum, row) => sum + (row.spend || 0), 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    clicks: rows.reduce((sum, row) => sum + (row.clicks || 0), 0),
    views: rows.reduce((sum, row) => sum + (row.views || 0), 0),
  };
}

function reportDateFromDaily(rows: LookerDailyFact[], fallbackMonth: string) {
  return rows.map((row) => row.date).sort().at(-1) || `${fallbackMonth}-01`;
}

function qaWarnings(platform: string, summary: PlacementFact, daily: LookerDailyFact[]) {
  if (!daily.length) return [`${platform}: 일간 성과 행을 읽지 못했습니다.`];
  const sum = sumDaily(daily);
  const warnings: string[] = [];
  if (summary.spend !== null && summary.spend !== undefined && Math.round(summary.spend) !== Math.round(sum.spend)) warnings.push(`${platform}: 월 누적 집행액과 일간 합계가 ${Math.round(summary.spend - sum.spend).toLocaleString("ko-KR")}원 차이납니다.`);
  if (summary.impressions !== sum.impressions) warnings.push(`${platform}: 월 누적 노출과 일간 합계가 ${(summary.impressions - sum.impressions).toLocaleString("ko-KR")}회 차이납니다.`);
  const clicks = (summary as PlacementFact & { clicks?: number | null }).clicks;
  if (clicks !== null && clicks !== undefined && clicks !== sum.clicks) warnings.push(`${platform}: 월 누적 클릭과 일간 합계가 ${(clicks - sum.clicks).toLocaleString("ko-KR")}회 차이납니다.`);
  if (summary.views !== null && summary.views !== undefined && summary.views !== sum.views) warnings.push(`${platform}: 월 누적 시청완료와 일간 합계가 ${(summary.views - sum.views).toLocaleString("ko-KR")}회 차이납니다.`);
  return warnings;
}

export async function parseLookerPdf(input: { buffer: ArrayBuffer; filename: string; advertiser: string; reportUrl?: string; month?: string }) {
  const pages = await extractPages(input.buffer);
  const bundles: LookerBundle[] = [];
  const warnings: string[] = [];
  const reportId = sourceReportId(input.reportUrl);

  for (const lines of pages) {
    const joined = lines.join("\n");
    if (/자코모\s*캠페인\s*raw data/i.test(joined)) {
      if (/\d+\s*-\s*\d+\s*\/\s*\d+/.test(joined)) warnings.push("Raw Data 페이지는 PDF에서 페이지네이션되어 일부 행만 포함될 수 있어 Fact 합산에서 제외했습니다.");
      continue;
    }

    const dvHeader = campaignHeader(lines, "dv360");
    if (dvHeader) {
      const sourceMonth = `${dvHeader.year}-${dvHeader.month}`;
      if (input.month && input.month !== sourceMonth) continue;
      const summary = findDvSummary(lines);
      if (!summary) continue;
      const daily = parseDvDaily(lines).filter((row) => row.date.startsWith(sourceMonth));
      const placement: PlacementFact = {
        platform: "Display & Video 360",
        placement: `${dvHeader.year}년 ${Number(dvHeader.month)}월 CPC 캠페인`,
        achievement: null,
        guaranteed: "",
        spend: summary.spend,
        impressions: summary.impressions,
        clicks: summary.clicks,
        ctr: summary.ctr,
        cpm: summary.cpm,
        cpc: summary.cpc,
        views: null,
        vtr: null,
        conversions: null,
        cpv: null,
        sourceSheet: "DV360 월간 요약",
      };
      warnings.push(...qaWarnings("DV360", placement, daily));
      bundles.push({
        advertiser: input.advertiser,
        reportDate: reportDateFromDaily(daily, sourceMonth),
        campaignStart: `${sourceMonth}-01`,
        campaignEnd: `${sourceMonth}-${new Date(Number(dvHeader.year), Number(dvHeader.month), 0).getDate()}`,
        sourceFile: input.filename,
        sourceId: `looker:${reportId}:dv360:${sourceMonth}`,
        sourceUrl: input.reportUrl,
        sourceKind: "Data Studio PDF",
        parsedSheets: ["DV360 월간 요약", "DV360 일간 성과"],
        ignoredSheets: ["Raw Data PDF 페이지"],
        placements: [placement],
        dailyPerformance: daily,
        mailChecks: [],
        operationNotes: input.reportUrl ? [`원본 리포트: ${input.reportUrl}`] : [],
        qa: { matchedMailMetrics: 0, mismatchedMailMetrics: 0, unmatchedMailMetrics: 0, ignoredSheetCount: 1 },
      });
    }

    const netflixHeader = campaignHeader(lines, "netflix");
    if (netflixHeader) {
      const sourceMonth = `${netflixHeader.year}-${netflixHeader.month}`;
      if (input.month && input.month !== sourceMonth) continue;
      const summary = findNetflixSummary(lines);
      if (!summary) continue;
      const daily = parseNetflixDaily(lines).filter((row) => row.date.startsWith(sourceMonth));
      const placement: PlacementFact = {
        platform: "Netflix",
        placement: `${netflixHeader.year}년 ${Number(netflixHeader.month)}월 프로그래머틱 딜 캠페인`,
        achievement: null,
        guaranteed: "",
        spend: summary.spend,
        impressions: summary.impressions,
        clicks: 0,
        ctr: 0,
        cpm: summary.cpm,
        cpc: 0,
        views: summary.views,
        vtr: summary.vtr,
        conversions: null,
        cpv: summary.cpv,
        sourceSheet: "Netflix 월간 요약",
      };
      warnings.push(...qaWarnings("Netflix", placement, daily));
      bundles.push({
        advertiser: input.advertiser,
        reportDate: reportDateFromDaily(daily, sourceMonth),
        campaignStart: `${sourceMonth}-01`,
        campaignEnd: `${sourceMonth}-${new Date(Number(netflixHeader.year), Number(netflixHeader.month), 0).getDate()}`,
        sourceFile: input.filename,
        sourceId: `looker:${reportId}:netflix:${sourceMonth}`,
        sourceUrl: input.reportUrl,
        sourceKind: "Data Studio PDF",
        parsedSheets: ["Netflix 월간 요약", "Netflix 일간 성과"],
        ignoredSheets: ["Raw Data PDF 페이지"],
        placements: [placement],
        dailyPerformance: daily,
        mailChecks: [],
        operationNotes: input.reportUrl ? [`원본 리포트: ${input.reportUrl}`] : [],
        qa: { matchedMailMetrics: 0, mismatchedMailMetrics: 0, unmatchedMailMetrics: 0, ignoredSheetCount: 1 },
      });
    }
  }

  const uniqueWarnings = Array.from(new Set(warnings));
  return { bundles, warnings: uniqueWarnings, pageCount: pages.length };
}
