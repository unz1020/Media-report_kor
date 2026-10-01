import * as XLSX from "xlsx";
import type { DailyBundlePreview, DailyPerformanceFact, PlacementFact } from "@/lib/daily-report-parser";
import { isAddressableTv } from "@/lib/report-source";

const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numeric = (value: unknown): number | null => {
  if (value === "" || value == null || text(value) === "-") return null;
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
function date(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const m = text(value).match(/^(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}
function period(value: unknown, year: number) {
  const m = text(value).match(/(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})/);
  return m ? [ `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`, `${year}-${m[3].padStart(2, "0")}-${m[4].padStart(2, "0")}` ] : [];
}
function fact(carrier: string, sheet: string, impressions: number, guaranteed: number | null, spend: number | null): PlacementFact {
  return { platform: "어드레서블TV", placement: carrier, sourceSheet: sheet, impressions, guaranteed: guaranteed == null ? "" : String(guaranteed),
    achievement: guaranteed ? impressions / guaranteed * 100 : null, spend, clicks: null, ctr: null, views: null, vtr: null,
    cpc: null, cpm: spend == null || !impressions ? null : spend / impressions * 1000, cpv: null };
}

/** Only campaign totals are additive. Weekly, creative, reach and channel tables are breakdowns. */
export function parseAddressableTvWorkbook(book: XLSX.WorkBook, filename: string, mailBody: string): DailyBundlePreview | null {
  if (!isAddressableTv(filename)) return null;
  const matrices = Object.fromEntries(book.SheetNames.map(name => [name, XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false })]));
  const year = Number(filename.match(/(?:^|\D)(\d{2})\d{4}(?:\D|$)/)?.[1] || new Date().getFullYear() % 100) + 2000;
  const placements: PlacementFact[] = [];
  const dailyPerformance: DailyPerformanceFact[] = [];
  let campaignStart = "", campaignEnd = "", reportDate = "";
  const parsedSheets: string[] = [];
  const summary = matrices.Summary;
  if (summary) {
    const start = summary.findIndex(row => row.some(v => /누적\s*data|누적\s*데이터/i.test(text(v))));
    if (start < 0) throw new Error("TV 보고서의 월 누적 표를 찾지 못했습니다. 주차별 표를 누적 성과로 합산하지 않습니다.");
    let carrier = "";
    for (const row of summary.slice(start + 1)) {
      const media = text(row[1]);
      if (/^LG\s*U\+$/i.test(media)) carrier = "LG U+";
      if (/^SKB$/i.test(media)) carrier = "SKB";
      const dates = period(row[4], year);
      campaignStart ||= dates[0] || ""; campaignEnd ||= dates[1] || "";
      if (/^total$/i.test(media) && carrier && numeric(row[6]) !== null) {
        placements.push(fact(carrier, "Summary", numeric(row[6])!, numeric(row[5]), numeric(row[10])));
        carrier = "";
      }
    }
    parsedSheets.push("Summary");
  } else if (matrices["집행요약"]) {
    const rows = matrices["집행요약"];
    const headerIndex = rows.findIndex(row => row.includes("예산") && row.includes("보장량") && row.includes("달성량"));
    if (headerIndex < 0) throw new Error("TV 원본 보고서의 캠페인 집행요약을 찾지 못했습니다.");
    const header = rows[headerIndex], values = rows[headerIndex + 1];
    const value = (label: string) => values?.[header.indexOf(label)];
    const carrier = /^SKB[_\s]/i.test(filename) ? "SKB" : /^LGU\+?[_\s]/i.test(filename) ? "LG U+" : "";
    if (!carrier) throw new Error("TV 원본 보고서의 통신사를 확인할 수 없습니다.");
    campaignStart = date(value("시작일")); campaignEnd = date(value("종료일"));
    const reported = rows.flat().map(text).find(value => /보고\s*기간/.test(value))?.match(/(20\d{2}[-/.]\d{2}[-/.]\d{2})\s*~\s*(20\d{2}[-/.]\d{2}[-/.]\d{2})/);
    reportDate = reported ? date(reported[2]) : "";
    if (!reportDate) throw new Error("TV 원본 보고서의 보고 기간을 확인할 수 없습니다.");
    const impressions = numeric(value("달성량"));
    if (impressions === null) throw new Error("TV 캠페인 노출량이 비어 있습니다.");
    placements.push(fact(carrier, "집행요약", impressions, numeric(value("보장량")), numeric(value("예산"))));
    parsedSheets.push("집행요약");
    const daily = matrices["일별"] || [];
    const datesIndex = daily.findIndex(row => row.filter(v => date(v)).length > 1);
    if (datesIndex >= 0) {
      const dateHeader = daily[datesIndex];
      const values = daily.slice(datesIndex + 1).find(row => row.includes("유효노출수"));
      if (values) dateHeader.forEach((cell, col) => {
        const day = date(cell), impressions = numeric(values[col]);
        if (!day || impressions === null || day < campaignStart || day > reportDate) return;
        dailyPerformance.push({ date: day, platform: "어드레서블TV", placement: carrier, sourceSheet: "일별", impressions,
          spend: null, clicks: null, ctr: null, views: null, vtr: null, cpc: null, cpm: null, cpv: null });
      });
      if (dailyPerformance.length) parsedSheets.push("일별");
    }
  }
  if (!placements.length || !campaignStart || !campaignEnd) throw new Error("TV 캠페인 기간 또는 누적 성과를 확인할 수 없습니다.");
  const ignoredSheets = book.SheetNames.filter(name => !parsedSheets.includes(name));
  return { advertiser: /교원웰스|웰스/.test(filename + mailBody) ? "교원웰스" : /자코모/.test(filename + mailBody) ? "자코모" : "미확인",
    reportDate: reportDate || campaignEnd, campaignStart, campaignEnd, sourceFile: filename, placements, dailyPerformance, parsedSheets, ignoredSheets,
    creativeDailyPerformance: [], mediaPlan: [], mailChecks: [], operationNotes: [],
    qa: { matchedMailMetrics: 0, mismatchedMailMetrics: 0, unmatchedMailMetrics: 0, ignoredSheetCount: ignoredSheets.length } };
}
