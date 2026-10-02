import { safeHttpUrl } from "./placement-urls";
export function creativePreview(value = "") {
  let url: URL;
  try { const safe = safeHttpUrl(value); if (!safe) return null; url = new URL(safe); } catch { return null; }
  const host = url.hostname.toLowerCase();
  let id = "";
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be", "www.youtu.be"].includes(host)) {
    id = host.endsWith("youtu.be") ? url.pathname.split("/")[1] || "" : url.pathname === "/watch" ? url.searchParams.get("v") || "" : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1] || "";
    if (/^[\w-]{11}$/.test(id)) return { url: url.toString(), provider: "유튜브", embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&playsinline=1`, portrait: url.pathname.startsWith("/shorts/") };
  }
  if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)) {
    id = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/)?.[1] || url.pathname.match(/^\/player\/v1\/(\d+)\/?$/)?.[1] || "";
    if (/^\d{7,25}$/.test(id)) return { url: url.toString(), provider: "틱톡", embedUrl: `https://www.tiktok.com/player/v1/${id}?autoplay=0&controls=1`, portrait: true };
  }
  return { url: url.toString(), provider: "링크", embedUrl: "", portrait: false };
}
