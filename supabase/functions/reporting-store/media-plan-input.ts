export type MediaMixRow = {
  platform: string; product: string; placement: string; creativeName: string;
  creativeType: string; device: string; periodStart: string; periodEnd: string;
  budget: number | null; expectedImpressions: number | null; expectedClicks: number | null;
  target: string; sourceSheet: string; operationStatus: "예정" | "집행 중" | "중단" | "종료";
};
function text(value: unknown, max = 500) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new Error("INVALID_MEDIA_MIX_TEXT");
  return value.trim();
}
function number(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = typeof value === "string" ? Number(value.replace(/[,₩원\s]/g, "")) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0 || parsed > 1e15) throw new Error("INVALID_MEDIA_MIX_NUMBER");
  return parsed;
}
function date(value: unknown) {
  if (value == null || value === "") return "";
  const input = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString().slice(0, 10) !== input) throw new Error("INVALID_MEDIA_MIX_DATE");
  return input;
}
export function normalizeMediaMix(input: Record<string, unknown>) {
  const month = text(input.month, 7);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("INVALID_MEDIA_MIX_MONTH");
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 500) throw new Error("INVALID_MEDIA_MIX_ROWS");
  const monthStart = month + "-01";
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const rows: MediaMixRow[] = input.rows.map((raw: Record<string, unknown>, index) => {
    try {
      if (!raw || typeof raw !== "object") throw new Error("ROW");
      const platform = text(raw.platform, 100), product = text(raw.product, 150);
      if (!platform || !product) throw new Error("매체와 광고상품을 입력해주세요.");
      const periodStart = date(raw.periodStart), periodEnd = date(raw.periodEnd);
      if (Boolean(periodStart) !== Boolean(periodEnd)) throw new Error("시작일과 종료일을 함께 입력해주세요.");
      if (periodStart && (periodStart > periodEnd || periodStart > monthEnd || periodEnd < monthStart)) throw new Error("선택한 월에 포함되는 집행기간을 입력해주세요.");
      const operationStatus = raw.operationStatus || "예정";
      if (!["예정", "집행 중", "중단", "종료"].includes(String(operationStatus))) throw new Error("INVALID_MEDIA_MIX_STATUS");
      return { platform, product, placement: text(raw.placement, 150) || product,
        creativeName: text(raw.creativeName, 200), creativeType: text(raw.creativeType, 200), device: text(raw.device, 100),
        periodStart, periodEnd, budget: number(raw.budget), expectedImpressions: number(raw.expectedImpressions), expectedClicks: number(raw.expectedClicks),
        target: text(raw.target, 2000), sourceSheet: text(raw.sourceSheet, 200) || "수동 입력", operationStatus: operationStatus as MediaMixRow["operationStatus"] };
    } catch (error) { throw new Error(`${index + 1}행: ${error instanceof Error ? error.message : "입력값을 확인해주세요."}`); }
  });
  const expectedUpdatedAt = input.expectedUpdatedAt == null ? null : text(input.expectedUpdatedAt, 50);
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error("INVALID_MEDIA_MIX_VERSION");
  return { month, rows, expectedUpdatedAt, sourceFile: text(input.sourceFile, 300) || "직접 입력" };
}
