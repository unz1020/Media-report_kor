function cleanLine(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function isForwardingMeta(line: string) {
  return /^(보낸사람|날짜|제목|받는사람|첨부\s*\d*개?|from:|sent:|to:|subject:)/i.test(line);
}

function isSignatureLine(line: string) {
  return /^(감사합니다|임홍모 드림|박운상|팀원\s*\/|팀장\s*\/|mediactive group|서울특별시|서울시|mobile\s|email\s)/i.test(line);
}

function isUsefulOperationLine(line: string) {
  if (!line) return false;
  if (/^\[?(report summary|운영 현황)\]?$/i.test(line)) return false;
  if (/^\*\s*(기간|매체)\s*:/i.test(line)) return true;
  if (/^\d+\)\s*\S+/.test(line)) return true;
  if (/^[-*>]|^LL\s/i.test(line)) return true;
  if (/\d{1,2}\/\d{1,2}.*(라이브|live|등록|교체|수정|분리|운영|집행|상향|하향|전환|성과)/i.test(line)) return true;
  if (/목표|현재|누적|전일|성과|효율|보너스|라이브|집행|소재|노출|클릭|ctr|cpc|cpm|cpv|vtr|roas|전환|조회/i.test(line)) return true;
  return false;
}

/**
 * Keep the business structure of the Daily mail body instead of extracting
 * isolated KPI lines. The output is still text-only so it remains auditable
 * against the original mail and never becomes a second Fact source.
 */
export function extractStructuredOperationNotes(mailBody: string) {
  const lines = mailBody.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const operationIndex = lines.findIndex((line) => /^\[운영 현황\]$/i.test(line));
  const reportSummaryIndex = lines.findIndex((line) => /^\[Report Summary\]$/i.test(line));
  const start = operationIndex >= 0 ? operationIndex + 1 : reportSummaryIndex >= 0 ? reportSummaryIndex + 1 : 0;
  const result: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^확인 부탁/i.test(line) || isSignatureLine(line)) break;
    if (isForwardingMeta(line)) continue;
    if (isUsefulOperationLine(line)) result.push(line);
  }

  return Array.from(new Set(result)).slice(0, 80);
}
