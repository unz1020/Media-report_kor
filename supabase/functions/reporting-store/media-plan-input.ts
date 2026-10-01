export type MediaMixRow = {
  rowId?: string;
  category?: string; proposalStatus?: string; scenario?: string; sourceCell?: string; sourceGroup?: string; sourceKey?: string; sourceNotes?: string;
  expectedViews?: number | null; expectedGrp?: number | null; expectedCprp?: number | null;
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
      const rowId = raw.rowId == null ? undefined : text(raw.rowId, 36);
      if (rowId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowId)) throw new Error("INVALID_MEDIA_MIX_ROW_ID");
      const proposalStatus = text(raw.proposalStatus, 30);
      if (proposalStatus && !["제안", "협의", "TBD", "확정", "부킹 완료"].includes(proposalStatus)) throw new Error("INVALID_PROPOSAL_STATUS");
      const provenance = { category: text(raw.category, 100), proposalStatus, scenario: text(raw.scenario, 500), sourceCell: text(raw.sourceCell, 100), sourceGroup: text(raw.sourceGroup, 500), sourceKey: text(raw.sourceKey, 4000), sourceNotes: text(raw.sourceNotes, 2000) };
      return { ...(rowId ? { rowId } : {}), ...Object.fromEntries(Object.entries(provenance).filter(([, v]) => v)), platform, product, placement: text(raw.placement, 150) || product,
        creativeName: text(raw.creativeName, 200), creativeType: text(raw.creativeType, 200), device: text(raw.device, 100),
        periodStart, periodEnd, budget: number(raw.budget), expectedImpressions: number(raw.expectedImpressions), expectedClicks: number(raw.expectedClicks),
        expectedViews: number(raw.expectedViews), expectedGrp: number(raw.expectedGrp), expectedCprp: number(raw.expectedCprp),
        target: text(raw.target, 2000), sourceSheet: text(raw.sourceSheet, 200) || "수동 입력", operationStatus: operationStatus as MediaMixRow["operationStatus"] };
    } catch (error) { throw new Error(`${index + 1}행: ${error instanceof Error ? error.message : "입력값을 확인해주세요."}`); }
  });
  const expectedUpdatedAt = input.expectedUpdatedAt == null ? null : text(input.expectedUpdatedAt, 50);
  if (expectedUpdatedAt && !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error("INVALID_MEDIA_MIX_VERSION");
  return { month, rows, expectedUpdatedAt, sourceFile: text(input.sourceFile, 300) || "직접 입력", changeMemo: text(input.changeMemo, 2000), sourceReview: normalizeSourceReview(input.sourceReview, month) };
}
type SourceReview = { summarySheet: string; summaryTotal: number | null; checks: string[]; inventory: Array<{ name: string; kind: string }>; groups: Array<{ id: string; label: string; included: boolean; selected: string; summaryRows: MediaMixRow[]; options: Array<{ id: string; label: string; warnings: string[]; rows: MediaMixRow[] }> }> };
function normalizeSourceReview(value: unknown, month: string): SourceReview | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SOURCE_REVIEW');
  const review = value as Record<string, unknown>;
  const array = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error('INVALID_SOURCE_REVIEW'); return v; };
  const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_SOURCE_REVIEW'); return v as Record<string, unknown>; };
  const messages = (v: unknown) => array(v, 250).map(item => text(item, 2000));
  let rowCount = 0;
  const normalizeRows = (v: unknown) => { const inputRows = array(v, 500); rowCount += inputRows.length; if (rowCount > 2000) throw new Error('INVALID_SOURCE_REVIEW_ROWS'); return normalizeMediaMix({ month, rows: inputRows }).rows; };
  const groups = array(review.groups, 100).map(item => {
    const g = object(item);
    const options = array(g.options, 12).map(item => { const o = object(item); return { id: text(o.id, 700), label: text(o.label, 700), warnings: messages(o.warnings), rows: normalizeRows(o.rows) }; });
    const selected = text(g.selected, 700);
    if (typeof g.included !== 'boolean' || selected && !options.some(o => o.id === selected)) throw new Error('INVALID_SOURCE_REVIEW_SELECTION');
    return { id: text(g.id, 500), label: text(g.label, 700), included: g.included, selected, summaryRows: normalizeRows(g.summaryRows), options };
  });
  return { summarySheet: text(review.summarySheet, 200), summaryTotal: number(review.summaryTotal), checks: messages(review.checks), inventory: array(review.inventory, 200).map(item => { const i = object(item); return { name: text(i.name, 200), kind: text(i.kind, 100) }; }), groups };
}
