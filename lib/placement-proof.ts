export type PlacementProofAttachment = {
  filename: string;
  attachmentId: string;
  mimeType?: string;
  kind: "image" | "report" | "other";
};

export type PlacementProof = {
  key?: string;
  advertiser: string;
  month: string;
  reportDate: string;
  verificationDate: string;
  media: string;
  placement: string;
  campaignName: string;
  serviceType: string;
  periodStart: string;
  periodEnd: string;
  location: string;
  airingTime: string;
  dailyFrequency: number | null;
  durationSec: number | null;
  budgetReference: number | null;
  status: "게재 확인" | "확인 필요";
  messageId: string;
  mailSubject: string;
  mailDate: string;
  sourceFile: string;
  sourceSummary: string;
  attachments: PlacementProofAttachment[];
  manualImagePath?: string;
  publishedAt?: string;
};

type PlacementProofInput = {
  advertiser?: string;
  messageId: string;
  subject: string;
  body: string;
  mailDate: string;
  selectedDate?: string;
  attachments: Array<{ filename: string; attachmentId: string; mimeType?: string }>;
  pdfText?: string;
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function yearFromContext(input: PlacementProofInput) {
  const joined = `${input.subject}\n${input.body}\n${input.selectedDate || ""}`;
  const full = joined.match(/\b(20\d{2})\b/);
  if (full) return Number(full[1]);
  const compact = joined.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (compact) return 2000 + Number(compact[1]);
  const korean = joined.match(/(?:^|\D)(\d{2})\s*년\s*(\d{1,2})\s*월/);
  if (korean) return 2000 + Number(korean[1]);
  const parsed = new Date(input.mailDate);
  return Number.isNaN(parsed.getTime()) ? new Date().getFullYear() : parsed.getFullYear();
}

function reportDateFromContext(input: PlacementProofInput, year: number) {
  const compact = input.subject.match(/(?:^|\D)(\d{2})(0[1-9]|1[0-2])([0-3]\d)(?:\D|$)/);
  if (compact) return `${2000 + Number(compact[1])}-${compact[2]}-${compact[3]}`;
  const selected = input.selectedDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? input.selectedDate : "";
  if (selected) return selected;
  const parsed = new Date(input.mailDate);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return `${year}-01-01`;
}

function periodFromText(value: string, reportDate: string) {
  const year = Number(reportDate.slice(0, 4));
  const reportMonth = Number(reportDate.slice(5, 7));
  const withBothMonths = value.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\([^)]*\))?\s*[~\-–]\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (withBothMonths) {
    return {
      start: `${year}-${withBothMonths[1].padStart(2, "0")}-${withBothMonths[2].padStart(2, "0")}`,
      end: `${year}-${withBothMonths[3].padStart(2, "0")}-${withBothMonths[4].padStart(2, "0")}`,
    };
  }
  const compactEnd = value.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\([^)]*\))?\s*[~\-–]\s*(\d{1,2})(?:\([^)]*\))?/);
  if (compactEnd) {
    const month = Number(compactEnd[1]) || reportMonth;
    return {
      start: `${year}-${String(month).padStart(2, "0")}-${compactEnd[2].padStart(2, "0")}`,
      end: `${year}-${String(month).padStart(2, "0")}-${compactEnd[3].padStart(2, "0")}`,
    };
  }
  return { start: "", end: "" };
}

function mediaAndBudget(body: string) {
  const line = body.split(/\r?\n/).find((item) => /만원\s*\)?\s*집행/.test(item)) || body;
  const budgetMatch = line.match(/\((\d[\d,.]*)\s*만원\)/);
  const budgetReference = budgetMatch ? Math.round(Number(budgetMatch[1].replace(/,/g, "")) * 10000) : null;
  if (!budgetMatch) return { media: "미확인", budgetReference };
  const before = clean(line.slice(0, budgetMatch.index || 0))
    .replace(/<[^>]+>/g, " ")
    .replace(/\d{2,4}\s*년\s*\d{1,2}\s*월/g, " ")
    .replace(/서비스\s*노출|집행에\s*대한/gi, " ");
  const tokens = clean(before).split(" ");
  const media = tokens.slice(-3).join(" ").replace(/^월\s+/, "").trim() || "미확인";
  return { media, budgetReference };
}

function placementFromText(subject: string, body: string) {
  const fromBody = body.match(/집행\s*건인\s*([^(*\n]+?)(?=\s*\(|\s*게첨|\s*게재|\n)/);
  if (fromBody?.[1]) return clean(fromBody[1]);
  const fromSubject = subject.match(/(?:게첨|게재)\s*보고서[_\s-]*([^_\n]+?)(?:[_\s-]*전달|[_\s-]*\d{6}|$)/i)
    || subject.match(/서비스\s*노출\s*(?:게첨|게재)\s*보고서[_\s-]*([^_\n]+)/i);
  if (fromSubject?.[1]) return clean(fromSubject[1]);
  const ipark = `${subject}\n${body}`.match(/아이파크\s*싱크월/i);
  return ipark ? "아이파크 싱크월" : "미확인";
}

function detailsFromPdf(pdfText: string, reportDate: string) {
  const normalized = pdfText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const verification = normalized.match(/게첨\s*현황\s*\(\s*(\d{1,2})\.(\d{1,2})\s*기준\s*\)/i);
  const year = reportDate.slice(0, 4);
  const verificationDate = verification ? `${year}-${verification[1].padStart(2, "0")}-${verification[2].padStart(2, "0")}` : "";
  const time = normalized.match(/(\d{2}:\d{2})\s*[~\-]\s*(\d{2}:\d{2})/);
  const frequency = normalized.match(/총\s*횟수\s*\(\s*1일\s*기준\s*\)\s*([\d,]+)\s*회/i);
  const duration = normalized.match(/(?:^|\n)\s*\d+\s+자코모\s+(\d{1,3})(?:\s|$)/m) || normalized.match(/자코모\s+(\d{1,3})\s+(?:\d+|SIEK|유니클로|$)/);
  const location = normalized.match(/(용산역\s*3층\s*메인\s*서버)/i);
  const campaignName = /브랜드\s*홍보/i.test(normalized) ? "브랜드 홍보" : "";
  return {
    verificationDate,
    airingTime: time ? `${time[1]}~${time[2]}` : "",
    dailyFrequency: frequency ? Number(frequency[1].replace(/,/g, "")) : null,
    durationSec: duration ? Number(duration[1]) : null,
    location: location ? clean(location[1]) : "",
    campaignName,
  };
}

function attachmentKind(filename: string): PlacementProofAttachment["kind"] {
  if (/\.(png|jpe?g|webp)$/i.test(filename)) return "image";
  if (/\.(pdf|pptx?)$/i.test(filename)) return "report";
  return "other";
}

export function buildPlacementProof(input: PlacementProofInput): PlacementProof {
  const year = yearFromContext(input);
  const reportDate = reportDateFromContext(input, year);
  const period = periodFromText(`${input.subject}\n${input.body}\n${input.pdfText || ""}`, reportDate);
  const { media, budgetReference } = mediaAndBudget(input.body);
  const pdf = detailsFromPdf(input.pdfText || "", reportDate);
  const placement = placementFromText(input.subject, input.body);
  const sourceFile = input.attachments.find((item) => /\.pdf$/i.test(item.filename))?.filename
    || input.attachments.find((item) => /\.pptx?$/i.test(item.filename))?.filename
    || `[mail] ${input.subject}`;
  const attachments = input.attachments.map((item) => ({ ...item, kind: attachmentKind(item.filename) }));
  const advertiser = input.advertiser || (/자코모/i.test(`${input.subject}\n${input.body}`) ? "자코모" : "미확인");
  const serviceType = /서비스\s*노출/i.test(`${input.subject}\n${input.body}`) ? "서비스 노출" : "게재 보고";
  const verificationDate = pdf.verificationDate || period.start || reportDate;
  const status = placement !== "미확인" && period.start ? "게재 확인" : "확인 필요";
  const sourceSummary = [
    media !== "미확인" ? `${media} 집행 연계` : "",
    serviceType,
    period.start && period.end ? `${period.start}~${period.end}` : "",
    pdf.location,
    pdf.dailyFrequency ? `1일 ${pdf.dailyFrequency.toLocaleString("ko-KR")}회` : "",
  ].filter(Boolean).join(" · ");

  return {
    advertiser,
    month: (period.start || reportDate).slice(0, 7),
    reportDate,
    verificationDate,
    media,
    placement,
    campaignName: pdf.campaignName || "",
    serviceType,
    periodStart: period.start,
    periodEnd: period.end,
    location: pdf.location,
    airingTime: pdf.airingTime,
    dailyFrequency: pdf.dailyFrequency,
    durationSec: pdf.durationSec,
    budgetReference,
    status,
    messageId: input.messageId,
    mailSubject: input.subject,
    mailDate: input.mailDate,
    sourceFile,
    sourceSummary,
    attachments,
  };
}
