const PAGES = new Set(["overview", "performance", "schedule", "creative", "reports", "data-update", "team"]);
const WIDTHS = new Set([12, 15, 20, 30, 40, 60]);
export function layoutPage(value: unknown) {
  if (typeof value !== "string" || !PAGES.has(value)) throw new Error("INVALID_LAYOUT_PAGE");
  return value;
}
export function normalizeLayout(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_LAYOUT");
  const input = value as Record<string, unknown>;
  const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 180 && !/[\x00-\x1f<>]/.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
  if (input.version !== 1 || !Array.isArray(input.order) || input.order.length > 160 || input.order.some(id => !validId(id)) || new Set(input.order).size !== input.order.length) throw new Error("INVALID_LAYOUT");
  if (!input.widths || typeof input.widths !== "object" || Array.isArray(input.widths)) throw new Error("INVALID_LAYOUT");
  const order = input.order as string[];
  const entries = Object.entries(input.widths);
  if (entries.length > 160 || entries.some(([id, width]) => !validId(id) || !order.includes(id) || typeof width !== "number" || !WIDTHS.has(width))) throw new Error("INVALID_LAYOUT");
  return { version: 1, order: input.order as string[], widths: Object.fromEntries(entries) as Record<string, number> };
}
