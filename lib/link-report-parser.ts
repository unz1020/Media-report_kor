import type { DailyBundlePreview, PlacementFact } from "@/lib/daily-report-parser";

type LinkedPlacementFact = Omit<PlacementFact, "clicks"> & { clicks: number | null };
export type LinkedReportBundle = DailyBundlePreview & {
  sourceUrl: string;
  sourceKind: "link-report";
  placements: LinkedPlacementFact[];
};

function numberFrom(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function reportDateFrom(body: string, fallbackDate: string) {
  const year = Number(fallbackDate.slice(0, 4)) || new Date().getFullYear();
  const match = body.match(/(?:\*\s*)?(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?[, ]*데일리\s*리포트\s*업데이트\s*기준/i)
    || body.match(/(?:\*\s*)?(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?자/i)
    || body.match(/(?:기준|업데이트)[^\n]{0,24}?(\d{1,2})\/(\d{1,2})/i);
  if (!match) return fallbackDate;
  return `${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function lookerUrl(body: string) {
  return body.match(/https:\/\/datastudio\.google\.com\/reporting\/[A-Za-z0-9\-_/]+/)?.[0]
    || body.match(/https:\/\/lookerstudio\.google\.com\/reporting\/[A-Za-z0-9\-_/]+/)?.[0]
    || "";
}

function section(body: string, heading: RegExp, nextHeading?: RegExp) {
  const start = body.search(heading);
  if (start < 0) return "";
  const tail = body.slice(start);
  if (!nextHeading) return tail;
  const match = tail.slice(1).search(nextHeading);
  return match < 0 ? tail : tail.slice(0, match + 1);
}

function metric(text: string, regex: RegExp) {
  return numberFrom(text.match(regex)?.[1]);
}

function explicitNotes(body: string, sourceUrl: string) {
  const notes = Array.from(new Set(
    body.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => /기준|원활|우수|진행 중|성과|효율|목표 대비/i.test(line))
  )).slice(0, 19);
  return [`원본 리포트: ${sourceUrl}`, ...notes];
}

export function parseLinkedReportMail(body: string, advertiser: string, fallbackDate: string): LinkedReportBundle | null {
  const sourceUrl = lookerUrl(body);
  if (!sourceUrl) return null;

  const placements: LinkedPlacementFact[] = [];
  const dv = section(body, /▶\s*Display\s*&\s*Video\s*360/i, /▶\s*넷플릭스/i);
  if (dv) {
    const impressions = metric(dv, /광고\s*노출수\s*\(목표\s*:\s*[\d,]+\)\s*:\s*([\d,]+)/i);
    const guaranteed = dv.match(/광고\s*노출수\s*\(목표\s*:\s*([\d,]+)\)/i)?.[1]?.replace(/,/g, "") || "";
    const achievement = metric(dv, /광고\s*노출수[^\n]*?달성률\s*:\s*([\d.]+)%/i);
    const clicks = metric(dv, /클릭수\s*\(목표\s*:\s*[\d,]+\)\s*:\s*([\d,]+)/i);
    const ctr = metric(dv, /CTR\s*\(목표\s*:\s*[\d.]+%\)\s*:\s*([\d.]+)%/i);
    const cpm = metric(dv, /CPM\s*\(목표\s*:\s*[\d,]+원\)\s*:\s*([\d,.]+)원/i);
    const cpc = metric(dv, /CPC\s*\(목표\s*:\s*[\d,]+원\)\s*:\s*([\d,.]+)원/i);
    if (impressions !== null) {
      placements.push({
        platform: "Display & Video 360",
        placement: "DV360",
        achievement,
        guaranteed,
        spend: null,
        impressions,
        clicks,
        ctr,
        cpc,
        cpm,
        sourceSheet: "Looker Studio · Mail Summary",
      });
    }
  }

  const netflix = section(body, /▶\s*넷플릭스/i);
  if (netflix) {
    const impressions = metric(netflix, /광고\s*노출수\s*\(목표\s*:\s*[\d,]+\)\s*:\s*([\d,]+)/i);
    const guaranteed = netflix.match(/광고\s*노출수\s*\(목표\s*:\s*([\d,]+)\)/i)?.[1]?.replace(/,/g, "") || "";
    const achievement = metric(netflix, /광고\s*노출수[^\n]*?달성률\s*:\s*([\d.]+)%/i);
    const views = metric(netflix, /시청\s*완료\s*수\s*:\s*([\d,]+)/i);
    const cpv = metric(netflix, /CPV\s*:\s*([\d,.]+)원/i);
    const vtr = metric(netflix, /VTR\s*:\s*([\d.]+)%/i);
    const cpm = metric(netflix, /CPM\s*\(목표\s*:\s*[\d,]+원\)\s*:\s*([\d,.]+)원/i);
    if (impressions !== null) {
      placements.push({
        platform: "Netflix",
        placement: "Netflix",
        achievement,
        guaranteed,
        spend: null,
        impressions,
        clicks: null,
        ctr: null,
        views,
        vtr,
        cpm,
        cpv,
        sourceSheet: "Looker Studio · Mail Summary",
      });
    }
  }

  if (!placements.length) return null;
  const reportDate = reportDateFrom(body, fallbackDate);
  return {
    advertiser,
    reportDate,
    campaignStart: `${reportDate.slice(0, 7)}-01`,
    campaignEnd: "",
    sourceFile: "Looker Studio · DV360 & Netflix",
    sourceUrl,
    sourceKind: "link-report",
    parsedSheets: ["Looker Studio · Mail Summary"],
    ignoredSheets: [],
    placements,
    mediaPlan: [],
    planSourceSheets: [],
    mailChecks: [],
    operationNotes: explicitNotes(body, sourceUrl),
    qa: { matchedMailMetrics: 0, mismatchedMailMetrics: 0, unmatchedMailMetrics: 0, ignoredSheetCount: 0 },
  } as LinkedReportBundle;
}
