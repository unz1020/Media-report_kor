import type { MediaPlanFact } from "./daily-report-parser";
import { canonicalMedia, canonicalProduct } from "./media-normalization";
export function scheduleProduct(plan: MediaPlanFact) {
  const media = canonicalMedia(plan.platform), text = `${plan.platform} ${plan.product}`;
  if (media === "네이버" && /gfa|피드|카탈로그|애드부스트/i.test(text)) return "GFA";
  return canonicalProduct(plan.platform,plan.product || plan.placement,plan.sourceSheet);
}
export function monthBounds(month: string) {
  const [year,m] = month.split("-").map(Number);
  return { start: month+"-01", end: new Date(Date.UTC(year,m,0)).toISOString().slice(0,10), days: new Date(Date.UTC(year,m,0)).getUTCDate(), offset: new Date(Date.UTC(year,m-1,1)).getUTCDay() };
}
export function planOverlapsMonth(plan: MediaPlanFact, month: string) {
  if (!plan.periodStart || !plan.periodEnd) return true;
  const {start,end} = monthBounds(month);
  return plan.periodStart <= end && plan.periodEnd >= start;
}
export function planOnDate(plan: MediaPlanFact, date: string) {
  return Boolean(plan.periodStart && plan.periodEnd && plan.periodStart <= date && plan.periodEnd >= date);
}
export function productKey(plan: MediaPlanFact) { return `${canonicalMedia(plan.platform)}::${scheduleProduct(plan)}`; }
