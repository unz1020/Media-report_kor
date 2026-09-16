import * as XLSX from "xlsx";
import type { DailyPerformanceFact } from "@/lib/daily-report-parser";

type Matrix = unknown[][];

function text(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function key(value: unknown) { return text(value).replace(/[\s_\-\/()]/g, "").toLowerCase(); }
function optionalNum(value: unknown): number | null {
  const raw = text(value);
  if (!raw || raw === "-" || /^#/.test(raw)) return null;
  const parsed = Number(raw.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function ratioPercent(value: unknown): number | null {
  const parsed = optionalNum(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}
function asDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value) && value > 30000 && value < 70000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)).toISOString().slice(0, 10);
  }
  const raw = text(value);
  const full = raw.match(/(20\d{2})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  return "";
}
function rowsFor(book: XLSX.WorkBook, sheetName: string): Matrix {
  return XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false }) as Matrix;
}
function findIndex(row: unknown[], aliases: string[]) {
  const wanted = aliases.map(key);
  return row.findIndex((value) => wanted.includes(key(value)));
}
function metricColumn(row: unknown[], start: number, end: number, aliases: string[]) {
  const wanted = aliases.map(key);
  for (let i = start; i < end; i++) if (wanted.includes(key(row[i]))) return i;
  return -1;
}
function metricColumnPreferred(row: unknown[], start: number, end: number, aliases: string[]) {
  for (const alias of aliases) {
    const wanted = key(alias);
    for (let i = start; i < end; i++) if (key(row[i]) === wanted) return i;
  }
  return -1;
}
function inCampaign(date: string, campaignStart: string, reportDate: string) {
  if (!date) return false;
  if (campaignStart && date < campaignStart) return false;
  if (reportDate && date > reportDate) return false;
  return true;
}

function platformForSheet(sheetName: string) {
  if (/^GFA$/i.test(sheetName)) return "네이버 GFA";
  if (/^KAKAO$/i.test(sheetName)) return "카카오모먼트";
  if (/당근.*Total/i.test(sheetName)) return "당근";
  if (/키즈노트.*Total/i.test(sheetName)) return "키즈노트";
  if (/틱톡.*Total/i.test(sheetName)) return "틱톡";
  if (/애드부스트.*Total/i.test(sheetName)) return "애드부스트스크린";
  if (/카카오\s*검색.*일자별/i.test(sheetName)) return "카카오 검색광고";
  return sheetName.replace(/_Total.*$/i, "").trim();
}

function placementForGroup(sheetName: string, group: string) {
  if (/당근.*Total/i.test(sheetName)) return "당근마켓";
  if (/키즈노트.*Total/i.test(sheetName)) return "키즈노트";
  if (/틱톡.*Total/i.test(sheetName)) return "틱톡";
  if (/애드부스트.*Total/i.test(sheetName)) return group.replace(/^\(서비스지면\)/, "").trim();
  return group;
}

function shouldUseGroup(sheetName: string, group: string) {
  const normalized = key(group);
  if (/^(직방|호갱노노).*total/i.test(sheetName)) return false;
  if (/^GFA$/i.test(sheetName) || /^KAKAO$/i.test(sheetName)) return normalized !== "total";
  if (/당근.*Total/i.test(sheetName) || /키즈노트.*Total/i.test(sheetName)) return normalized === "total";
  if (/틱톡.*Total/i.test(sheetName)) return normalized !== "total";
  if (/애드부스트.*Total/i.test(sheetName)) return normalized !== "totaldooh커스텀패키지서비스제외";
  return false;
}

function findGroupedTable(rows: Matrix, sheetName: string) {
  const isGfaOrKakao = /^GFA$/i.test(sheetName) || /^KAKAO$/i.test(sheetName);
  const titleIndex = isGfaOrKakao
    ? rows.findIndex((row) => row.some((value) => /total\s*daily\s*report/i.test(text(value))))
    : -1;
  const searchStart = titleIndex >= 0 ? titleIndex + 1 : 0;
  const searchEnd = titleIndex >= 0 ? Math.min(rows.length, titleIndex + 5) : rows.length;

  for (let i = searchStart; i < searchEnd; i++) {
    const dateCol = findIndex(rows[i] ?? [], ["Date", "DATE", "날짜", "일자"]);
    if (dateCol < 0) continue;
    for (let j = i + 1; j <= Math.min(i + 3, rows.length - 1); j++) {
      if (findIndex(rows[j] ?? [], ["Impression", "Impressions", "노출", "노출수"]) >= 0) {
        return { groupRowIndex: i, metricRowIndex: j, dateCol };
      }
    }
  }
  return null;
}

function groupedDailyRows(sheetName: string, rows: Matrix, reportDate: string, campaignStart: string): DailyPerformanceFact[] {
  const result: DailyPerformanceFact[] = [];
  if (!/^GFA$/i.test(sheetName) && !/^KAKAO$/i.test(sheetName) && !/(당근|키즈노트|틱톡|애드부스트).*Total/i.test(sheetName)) return result;

  const table = findGroupedTable(rows, sheetName);
  if (!table) return result;
  const { groupRowIndex, metricRowIndex, dateCol } = table;
  const groupRow = rows[groupRowIndex] ?? [];
  const metricRow = rows[metricRowIndex] ?? [];
  const starts: number[] = [];
  for (let i = dateCol + 1; i < groupRow.length; i++) if (text(groupRow[i])) starts.push(i);
  const platform = platformForSheet(sheetName);

  starts.forEach((start, groupIndex) => {
    const group = text(groupRow[start]);
    if (!group || !shouldUseGroup(sheetName, group)) return;
    const end = starts[groupIndex + 1] ?? metricRow.length;
    const spendCol = metricColumn(metricRow, start, end, ["소진 금액", "소진금액", "Spent", "Spent(vat제외)", "Spent(vat포함)", "광고비", "비용"]);
    const impCol = metricColumn(metricRow, start, end, ["Impression", "Impressions", "노출", "노출수"]);
    const clickCol = metricColumn(metricRow, start, end, ["Click", "Clicks", "클릭", "클릭수", "Click(전체)"]);
    const ctrCol = metricColumn(metricRow, start, end, ["CTR", "CTR(%)"]);
    const cpcCol = metricColumn(metricRow, start, end, ["CPC"]);
    const cpmCol = metricColumn(metricRow, start, end, ["CPM"]);
    const cpvCol = metricColumn(metricRow, start, end, ["CPV"]);
    const viewsCol = metricColumnPreferred(metricRow, start, end, ["2초 영상 조회수", "시청 완료 수", "조회", "조회수", "재생", "썸네일 3초 재생수", "영상 조회수"]);
    const vtrCol = metricColumn(metricRow, start, end, ["VTR", "재생률", "재생률(2초 기준)"]);
    if (impCol < 0) return;

    for (let r = metricRowIndex + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const date = asDate(row[dateCol]);
      if (!inCampaign(date, campaignStart, reportDate)) continue;
      const impressions = optionalNum(row[impCol]);
      const spend = spendCol >= 0 ? optionalNum(row[spendCol]) : null;
      const clicks = clickCol >= 0 ? optionalNum(row[clickCol]) : null;
      const views = viewsCol >= 0 ? optionalNum(row[viewsCol]) : null;
      const ctr = ctrCol >= 0 ? ratioPercent(row[ctrCol]) : (impressions && clicks !== null ? clicks / impressions * 100 : null);
      const vtr = vtrCol >= 0 ? ratioPercent(row[vtrCol]) : null;
      if (impressions === null && spend === null && clicks === null && views === null) continue;
      result.push({
        date,
        platform,
        placement: placementForGroup(sheetName, group),
        spend,
        impressions: impressions ?? 0,
        clicks,
        views,
        ctr,
        cpm: cpmCol >= 0 ? optionalNum(row[cpmCol]) : null,
        cpc: cpcCol >= 0 ? optionalNum(row[cpcCol]) : null,
        cpv: cpvCol >= 0 ? optionalNum(row[cpvCol]) : null,
        vtr,
        sourceSheet: sheetName,
      });
    }
  });
  return result;
}

function flatDailyRows(sheetName: string, rows: Matrix, reportDate: string, campaignStart: string): DailyPerformanceFact[] {
  if (!/일자별|daily/i.test(sheetName)) return [];
  const headerRow = rows.findIndex((row) => {
    const date = findIndex(row, ["Date", "DATE", "날짜", "일자"]);
    const imp = findIndex(row, ["Impression", "Impressions", "노출", "노출수"]);
    return date >= 0 && imp >= 0;
  });
  if (headerRow < 0) return [];
  const header = rows[headerRow];
  const dateCol = findIndex(header, ["Date", "DATE", "날짜", "일자"]);
  const spendCol = findIndex(header, ["소진 금액", "소진금액", "Spent", "광고비", "비용"]);
  const impCol = findIndex(header, ["Impression", "Impressions", "노출", "노출수"]);
  const clickCol = findIndex(header, ["Click", "Clicks", "클릭", "클릭수"]);
  const ctrCol = findIndex(header, ["CTR", "CTR(%)", "클릭률"]);
  const cpcCol = findIndex(header, ["CPC"]), cpmCol = findIndex(header, ["CPM"]), cpvCol = findIndex(header, ["CPV"]);
  const viewsCol = findIndex(header, ["조회", "조회수", "시청 완료 수", "재생"]), vtrCol = findIndex(header, ["VTR", "재생률"]);
  const campaignCol = findIndex(header, ["캠페인", "캠페인명", "Campaign"]);
  const result: DailyPerformanceFact[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const date = asDate(row[dateCol]);
    if (!inCampaign(date, campaignStart, reportDate)) continue;
    const impressions = optionalNum(row[impCol]);
    if (impressions === null) continue;
    const clicks = clickCol >= 0 ? optionalNum(row[clickCol]) : null;
    result.push({
      date,
      platform: platformForSheet(sheetName),
      placement: campaignCol >= 0 && text(row[campaignCol]) ? text(row[campaignCol]) : "전체 검색광고",
      spend: spendCol >= 0 ? optionalNum(row[spendCol]) : null,
      impressions,
      clicks,
      views: viewsCol >= 0 ? optionalNum(row[viewsCol]) : null,
      ctr: ctrCol >= 0 ? ratioPercent(row[ctrCol]) : (impressions > 0 && clicks !== null ? clicks / impressions * 100 : null),
      cpm: cpmCol >= 0 ? optionalNum(row[cpmCol]) : null,
      cpc: cpcCol >= 0 ? optionalNum(row[cpcCol]) : null,
      cpv: cpvCol >= 0 ? optionalNum(row[cpvCol]) : null,
      vtr: vtrCol >= 0 ? ratioPercent(row[vtrCol]) : null,
      sourceSheet: sheetName,
    });
  }
  return result;
}

export function parseSupplementalDailyPerformance(buffer: Buffer, reportDate: string, campaignStart = ""): DailyPerformanceFact[] {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: false });
  const result: DailyPerformanceFact[] = [];
  for (const sheetName of book.SheetNames) {
    if (/^raw|media\s*mix|소재별|타게팅별/i.test(sheetName)) continue;
    const rows = rowsFor(book, sheetName);
    result.push(...groupedDailyRows(sheetName, rows, reportDate, campaignStart));
    result.push(...flatDailyRows(sheetName, rows, reportDate, campaignStart));
  }

  const seen = new Set<string>();
  return result.filter((row) => {
    const id = `${row.date}::${row.platform}::${row.placement}::${row.sourceSheet}`.toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
