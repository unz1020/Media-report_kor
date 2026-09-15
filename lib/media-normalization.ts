import type { PlacementFact } from "@/lib/daily-report-parser";

const normalizeKey = (value: string) => value.toLowerCase().replace(/[\s_\-\/()·&.]/g, "");

const MEDIA_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "네이버", aliases: ["네이버", "네이버gfa", "gfa", "navergfa"] },
  { canonical: "카카오", aliases: ["카카오", "카카오모먼트", "카카오moment", "카카오키워드", "카카오검색광고", "kakao", "kakaomoment"] },
  { canonical: "당근", aliases: ["당근", "당근마켓", "karrot"] },
  { canonical: "애드부스트스크린", aliases: ["애드부스트", "애드부스트스크린", "애드부스트스크린(dooh)", "애드부스터", "애드부스터스크린"] },
  { canonical: "틱톡", aliases: ["틱톡", "tiktok"] },
  { canonical: "키즈노트", aliases: ["키즈노트", "kidsnote"] },
  { canonical: "호갱노노", aliases: ["호갱노노"] },
  { canonical: "직방", aliases: ["직방", "zigbang"] },
  { canonical: "넷플릭스", aliases: ["넷플릭스", "netflix"] },
  { canonical: "DV360", aliases: ["displayvideo360", "display&video360", "dv360"] },
];

export function canonicalMedia(value: string) {
  const key = normalizeKey(value || "");
  const hit = MEDIA_ALIASES.find((entry) => entry.aliases.some((alias) => key.includes(normalizeKey(alias)) || normalizeKey(alias).includes(key)));
  return hit?.canonical || value.trim() || "미확인";
}

export function canonicalProduct(mediaInput: string, placementInput: string, sourceSheet = "") {
  const media = canonicalMedia(mediaInput);
  const placement = placementInput.trim();
  const key = normalizeKey(`${placement} ${sourceSheet}`);

  if (media === "네이버") {
    if (key.includes("커뮤니케이션") || key.includes("커뮤ad")) return "커뮤니케이션 애드";
    if (key.includes("nda")) return "NDA";
    if (key.includes("메인")) return "네이버 메인";
  }
  if (media === "카카오") {
    if (key.includes("비즈보드")) return "비즈보드";
    if (key.includes("디스플레이")) return "디스플레이";
    if (key.includes("동영상")) return "동영상";
    if (key.includes("키워드") || key.includes("검색광고")) return "검색광고";
  }
  if (media === "당근") return "네이티브 피드 광고";
  if (media === "키즈노트") {
    if (key.includes("이벤트배너")) return "이벤트배너(서비스)";
    if (key.includes("메인배너")) return "메인배너";
  }
  if (media === "틱톡") return "도달 · Feed 영상";
  if (media === "애드부스트스크린") {
    if (key.includes("서비스") || key.includes("엘리베이터")) return "서비스 지면";
    return "DOOH 커스텀 패키지";
  }
  if (media === "호갱노노" || media === "직방") {
    return placement.replace(/\s*\((호갱노노|직방)\)\s*/g, "").replace(/\*?\(보너스\)/g, "").trim() || "기타";
  }
  return placement || sourceSheet || "기타";
}

export type NormalizedPlacement = PlacementFact & { media: string; product: string };

export function normalizePlacement(row: PlacementFact): NormalizedPlacement {
  return {
    ...row,
    media: canonicalMedia(row.platform),
    product: canonicalProduct(row.platform, row.placement, row.sourceSheet),
  };
}

export function normalizeInsightText(value: string) {
  return value
    .replace(/당근마켓/g, "당근")
    .replace(/애드부스트\s*스크린|애드부스트스크린|애드부스터스크린|애드부스터/g, "애드부스트스크린")
    .replace(/네이버\s*GFA|네이버GFA/g, "네이버")
    .replace(/카카오\s*모먼트|카카오모먼트/g, "카카오");
}
