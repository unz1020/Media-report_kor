export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export function safeHttpUrl(value: string) {
  if (!value.trim()) return "";
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("http 또는 https URL을 입력해주세요.");
  }
  return url.toString();
}

export function landingWithUtm(landingUrl: string, utm: Record<string, string> = {}) {
  if (!landingUrl.trim()) {
    if (Object.values(utm).some(value => value.trim())) throw new Error("UTM을 사용하려면 랜딩 URL을 입력해주세요.");
    return "";
  }
  const url = new URL(safeHttpUrl(landingUrl));
  for (const key of UTM_KEYS) {
    if (utm[key]?.trim()) url.searchParams.set(key, utm[key].trim());
  }
  return url.toString();
}
