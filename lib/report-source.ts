import type { DailyBundlePreview } from "@/lib/daily-report-parser";

/** Release suffixes change between daily and final exports; campaign names do not. */
export function reportSourceStem(filename: string) {
  let stem = filename.normalize("NFKC").replace(/\.(xlsx|xls|xlsb|csv|pdf)$/i, "").trim().toLowerCase();
  let previous = "";
  while (stem !== previous) {
    previous = stem;
    stem = stem.replace(/[\s_-]+(?:final|최종|최종본|마감본|(?:20)?\d{6,8}|\d{4})$/i, "").trim();
  }
  return stem.replace(/[\s_-]+/g, " ").trim() || "daily";
}

export function performanceMailQuery(advertiser: string) {
  return `${advertiser} {subject:"데일리 리포트" subject:"Daily Report" subject:"Addr.TV" subject:"Addressable" subject:"어드레서블"}`;
}

export function isAddressableTv(filename: string) {
  return /addr[.\s_-]*tv|addressable[\s_-]*tv|어드레서블\s*tv/i.test(filename);
}

export function tvSupportingFiles<T extends { filename: string }>(attachments: T[]) {
  const summary = attachments.find(item => isAddressableTv(item.filename) && !/raw\s*data/i.test(item.filename));
  return summary ? attachments.filter(item => isAddressableTv(item.filename) && /raw\s*data/i.test(item.filename)) : [];
}

export function enrichTvDaily(summary: DailyBundlePreview, supporting: DailyBundlePreview[]) {
  const seen = new Set<string>();
  const rows = supporting.flatMap(bundle => bundle.dailyPerformance || []).filter(row => {
    const id = `${row.date}::${row.platform}::${row.placement}`;
    if (seen.has(id) || row.date < summary.campaignStart || row.date > summary.reportDate) return false;
    seen.add(id); return true;
  });
  for (const placement of summary.placements) {
    const matched = rows.filter(row => row.placement === placement.placement);
    if (matched.length && matched.reduce((sum, row) => sum + row.impressions, 0) !== placement.impressions) {
      throw new Error(`TV ${placement.placement} 월 누적 노출과 일별 합계가 다릅니다. 원본 확인이 필요합니다.`);
    }
  }
  return { ...summary, dailyPerformance: rows, supportingFiles: supporting.map(bundle => bundle.sourceFile) };
}
