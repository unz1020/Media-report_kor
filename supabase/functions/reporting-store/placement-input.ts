const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
function text(input: Record<string, unknown>, key: string, max = 200) {
  const value = String(input[key] || "").trim();
  if (value.length > max) throw new Error("입력 내용이 너무 깁니다: " + key);
  return value;
}
function date(value: string) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime()) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("날짜를 확인해주세요.");
  }
  return value;
}
function url(value: string) {
  if (!value) return "";
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("http 또는 https URL을 입력해주세요.");
  return parsed.toString();
}
export function normalizePlacementInput(input: Record<string, unknown>) {
  const month = text(input, "month", 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("조회 월을 확인해주세요.");
  const media = text(input, "media", 120);
  const placement = text(input, "placement");
  if (!media || !placement) throw new Error("매체와 게재지면을 입력해주세요.");
  const status = text(input, "status", 20) || "사전 세팅";
  if (!["사전 세팅", "게재 확인", "확인 필요"].includes(status)) throw new Error("세팅 상태를 확인해주세요.");
  const verificationDate = date(text(input, "verificationDate", 10));
  if (status === "게재 확인" && !verificationDate) throw new Error("게재 확인일을 입력해주세요.");
  const periodStart = date(text(input, "periodStart", 10));
  const periodEnd = date(text(input, "periodEnd", 10));
  if (periodStart && periodEnd && periodStart > periodEnd) throw new Error("운영 종료일을 확인해주세요.");
  const utmInput = input.utm && typeof input.utm === "object" && !Array.isArray(input.utm) ? input.utm as Record<string, unknown> : {};
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = text(utmInput, key, 500);
    if (value) utm[key] = value;
  }
  const landingUrl = url(text(input, "landingUrl", 4000));
  if (!landingUrl && Object.keys(utm).length) throw new Error("UTM을 사용하려면 랜딩 URL을 입력해주세요.");
  return { month, media, placement, creativeName: text(input, "creativeName"),
    campaignName: text(input, "campaignName"), periodStart, periodEnd, status, verificationDate,
    previewUrl: url(text(input, "previewUrl", 4000)), landingUrl, utm };
}
