import { canonicalMedia } from './media-normalization';
type MediaInput = { platform: string; product?: string; placement?: string; category?: string; tvChannelType?: string };
const clean = (value = "") => value.trim().replace(/[\s._()·-]/g, "").toUpperCase();
// Keep the stored broadcaster name and reporting keys intact; this is a display hierarchy.
export function mediaHierarchy(row: MediaInput) {
  const media = canonicalMedia(row.platform);
  const platform = clean(media), category = clean(row.category);
  const terrestrial = /^(KBS(?:1|2|1TV|2TV)?|MBC|SBS|EBS(?:1|2)?|지상파(?:TV)?|공중파(?:TV)?)$/.test(platform);
  const cable = /^(TVN|OCN|JTBC(?:2|4)?|MBN|TV조선|TVCHOSUN|채널A|CHANNELA|YTN|연합뉴스TV|MNET|ENA|케이블(?:TV)?|종편(?:TV)?)$/.test(platform);
  const excluded = /어드레서블|ADDRESSABLE|ADDR|애드부스트|버스|BUS|TVING|티빙|NETFLIX|넷플릭스/.test(platform);
  const isTv = !excluded && Boolean(row.tvChannelType || terrestrial || cable || ["TV", "지상파", "지상파TV", "케이블", "케이블TV", "종편"].includes(category) || platform === "TV");
  if (!isTv) return { category: media, subcategory: "", media, isTv: false };
  const detail = clean(`${row.product || ""} ${row.placement || ""}`);
  const subcategory = row.tvChannelType || (terrestrial || category.includes("지상파") || detail.includes("지상파") ? "지상파" : cable || category.includes("케이블") || category.includes("종편") || detail.includes("케이블") ? "케이블" : "분류 미지정");
  return { category: "TV", subcategory, media, isTv: true };
}
export function mediaPath(row: MediaInput) {
  const hierarchy = mediaHierarchy(row);
  return [...new Set([hierarchy.category, hierarchy.subcategory, hierarchy.media].filter(Boolean))].join(" › ");
}
