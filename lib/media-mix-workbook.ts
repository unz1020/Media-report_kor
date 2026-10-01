import * as XLSX from "xlsx";
import type { MediaPlanFact } from "./daily-report-parser";

const key = (value: unknown) => String(value ?? "").toLowerCase().replace(/[\s_()·%\-]/g, "");
function date(value: unknown, month: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const decoded = XLSX.SSF.parse_date_code(value);
    return decoded ? `${decoded.y}-${String(decoded.m).padStart(2,"0")}-${String(decoded.d).padStart(2,"0")}` : "";
  }
  const input = String(value ?? "").trim();
  const full = input.match(/^(20\d{2})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})/);
  if (full) return `${full[1]}-${full[2].padStart(2,"0")}-${full[3].padStart(2,"0")}`;
  const short = input.match(/^(\d{1,2})[-/.월\s]+(\d{1,2})/);
  return short ? `${month.slice(0,4)}-${short[1].padStart(2,"0")}-${short[2].padStart(2,"0")}` : "";
}
function numeric(value: unknown) {
  if (value == null || value === "" || value === "-") return null;
  const parsed = Number(String(value).replace(/[,₩원\s]/g,""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`숫자 셀을 확인해주세요: ${String(value)}`);
  return parsed;
}
export function parseMediaMixWorkbook(bytes: ArrayBuffer, month: string) {
  const book = XLSX.read(bytes, { type: "array", cellDates: true });
  const plans: MediaPlanFact[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: true });
    const headerIndex = matrix.findIndex(row => row.some(v => /^(매체|플랫폼|대분류|media)$/.test(key(v))) && row.some(v => /^(광고상품|상품|중분류|product)$/.test(key(v))));
    if (headerIndex < 0) continue;
    const header = matrix[headerIndex].map(key);
    const column = (pattern: RegExp) => header.findIndex(v => pattern.test(v));
    const media = column(/^(매체|플랫폼|대분류|media)$/), product = column(/^(광고상품|상품|중분류|product)$/);
    const get = (row: unknown[], pattern: RegExp) => row[column(pattern)];
    // Text merges inherit labels; numeric merges keep a single budget/KPI value.
    for (const merge of sheet["!merges"] ?? []) {
      if (merge.s.r <= headerIndex) continue;
      for (let c=merge.s.c;c<=merge.e.c;c++) {
        if (/budget|예산|노출|imps|clicks|클릭/.test(header[c] ?? "")) continue;
        for (let r=merge.s.r;r<=merge.e.r;r++) if (matrix[r]) matrix[r][c] = matrix[merge.s.r]?.[merge.s.c] ?? "";
      }
    }
    for (const row of matrix.slice(headerIndex + 1)) {
      const platform = String(row[media] ?? "").trim(), adProduct = String(row[product] ?? "").trim();
      if ((!platform && !adProduct) || /^(?:sub\s*total|grand\s*total|total|합계|소계|총계)$/i.test(platform) || /^(?:sub\s*total|total|합계|소계|총계)$/i.test(adProduct)) continue;
      let start = date(get(row,/^(시작일|집행시작|start)$/), month), end = date(get(row,/^(종료일|집행종료|end)$/), month);
      const period = String(get(row,/^(일정|기간|집행기간|period)$/) ?? "");
      if (!start && !end && period) {
        const parts = period.split(/\s*[~～–—]\s*|\s+-\s+/);
        if (parts.length === 2) { start = date(parts[0],month); end = date(parts[1],month); }
        if (!start || !end) throw new Error(`${name}: 집행기간을 시작일·종료일로 입력해주세요 (${period}).`);
      }
      plans.push({ platform, product: adProduct, placement: String(get(row,/^(지면|게재지면|placement)$/) ?? "").trim() || adProduct,
        creativeName: String(get(row,/^(소재명|소분류|creativename)$/) ?? "").trim(),
        creativeType: String(get(row,/^(소재|소재유형|소재형태|creativetype)$/) ?? "").trim(),
        device: String(get(row,/^(기기|device)$/) ?? "").trim(), periodStart: start, periodEnd: end,
        budget: numeric(get(row,/예산|budget/)), expectedImpressions: numeric(get(row,/예상노출|보장노출|expectimps/)), expectedClicks: numeric(get(row,/예상클릭|expectclicks/)),
        target: String(get(row,/^(타겟팅|타겟|target)$/) ?? "").trim(), sourceSheet: name,
        operationStatus: (String(get(row,/^(집행상태|상태|status)$/) ?? "").trim() || "예정") as MediaPlanFact["operationStatus"] });
    }
  }
  if (!plans.length) throw new Error("매체·광고상품 헤더가 있는 시트를 찾지 못했습니다. 입력 양식을 사용하거나 직접 입력해주세요.");
  return plans;
}
export function downloadMediaMixTemplate() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["매체","광고상품","소재명","지면","시작일","종료일","예산","예상 노출수","예상 클릭수","기기","소재유형","타겟팅","집행상태"]]), "미디어믹스");
  XLSX.writeFile(book, "미디어믹스_입력양식.xlsx");
}
