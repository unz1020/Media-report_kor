function cleanLine(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function isForwardingMeta(line: string) {
  return /^(보낸사람|날짜|제목|받는사람|첨부\s*\d*개?|from:|sent:|to:|subject:|----------\s*전달된 메일)/i.test(line);
}

function isSignatureLine(line: string) {
  return /^(감사합니다|임홍모 드림|박운상|팀원\s*\/|팀장\s*\/|mediactive group|서울특별시|서울시|mobile\s|email\s)/i.test(line);
}

function splitCollapsedMail(value: string) {
  return value
    .replace(/\[Report Summary\]/gi, "\n[Report Summary]\n")
    .replace(/\[운영 현황\]/g, "\n[운영 현황]\n")
    .replace(/(?=▶\s*)/g, "\n")
    .replace(/(?=\d+\)\s*[^\d])/g, "\n")
    .replace(/(?=\*\s*(?:기간|매체)\s*:)/g, "\n")
    .replace(/(?=\*{0,2}[가-힣A-Za-z0-9_()\s]+\s*-\s*\d{1,2}\/\d{1,2})/g, "\n")
    .replace(/(?=<(?:호갱노노|직방|당근|키즈노트|틱톡|네이버|카카오|DV360|Display\s*&\s*Video\s*360|넷플릭스)[^>]*>)/gi, "\n")
    .replace(/(?=\s-\s*(?:목표|광고|9\/|전일|네이티브|총\s*노출|지면별|서비스|기획전|브랜딩|장바구니|9월\s*누적))/g, "\n");
}

function isUsefulOperationLine(line: string) {
  if (!line) return false;
  if (/^\[?(report summary|운영 현황)\]?$/i.test(line)) return false;
  if (/^\*\s*(기간|매체)\s*:/i.test(line)) return true;
  if (/^\d+\)\s*\S+/.test(line)) return true;
  if (/^[-*>▶]|^LL\s/i.test(line)) return true;
  if (/\d{1,2}\/\d{1,2}.*(라이브|live|등록|교체|수정|분리|운영|집행|상향|하향|전환|성과)/i.test(line)) return true;
  if (/목표|현재|누적|전일|성과|효율|보너스|라이브|집행|소재|노출|클릭|ctr|cpc|cpm|cpv|vtr|roas|전환|조회/i.test(line)) return true;
  return false;
}

function compactLine(line: string) {
  return line
    .replace(/\s*확인 부탁.*$/i, "")
    .replace(/\s*감사합니다.*$/i, "")
    .replace(/\s*임홍모.*$/i, "")
    .replace(/\s*박운상.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 메일 원문 자체는 Fact가 아니므로 숫자를 재계산하거나 새 결론을 만들지 않는다.
 * 다만 HTML 메일이 한 줄로 합쳐진 경우에도 운영/성과 문장을 분리해 읽기 좋은 단위로 저장한다.
 */
export function extractStructuredOperationNotes(mailBody: string) {
  const expanded = splitCollapsedMail(mailBody);
  const lines = expanded.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const operationIndex = lines.findIndex((line) => /^\[운영 현황\]$/i.test(line));
  const reportSummaryIndex = lines.findIndex((line) => /^\[Report Summary\]$/i.test(line));
  const start = operationIndex >= 0 ? operationIndex + 1 : reportSummaryIndex >= 0 ? reportSummaryIndex + 1 : 0;
  const result: string[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = compactLine(lines[i]);
    if (!line) continue;
    if (/^확인 부탁/i.test(line) || isSignatureLine(line)) break;
    if (isForwardingMeta(line)) continue;
    if (!isUsefulOperationLine(line)) continue;
    if (line.length > 420) {
      const chunks = splitCollapsedMail(line).split(/\r?\n/).map(compactLine).filter(Boolean);
      chunks.forEach((chunk) => {
        if (chunk.length >= 8 && isUsefulOperationLine(chunk) && !isSignatureLine(chunk)) result.push(chunk);
      });
    } else {
      result.push(line);
    }
  }

  return Array.from(new Set(result)).slice(0, 80);
}
