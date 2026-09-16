import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";
import { parseDailyWorkbookBuffer } from "@/lib/server-daily-parser";
import { parseSupplementalDailyPerformance } from "@/lib/supplemental-daily-parser";
import { sanitizeDailyBundle } from "@/lib/daily-bundle-sanitizer";
import { extractStructuredOperationNotes } from "@/lib/mail-insight";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const payload = await request.json().catch(() => null) as {
    messageId?: string;
    attachmentId?: string;
    filename?: string;
    mailBody?: string;
  } | null;

  if (!payload?.messageId || !payload.attachmentId || !payload.filename) {
    return NextResponse.json({ error: "Missing Gmail attachment parameters" }, { status: 400 });
  }

  try {
    const current = decryptToken(cookie);
    const { token, refreshed } = await ensureFreshToken(current);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}/attachments/${encodeURIComponent(payload.attachmentId)}`,
      { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Gmail attachment API failed (${response.status}): ${await response.text()}`);
    const attachment = await response.json() as { data?: string };
    if (!attachment.data) throw new Error("Attachment payload is empty");

    const bytes = Buffer.from(attachment.data, "base64url");
    const mailBody = payload.mailBody || "";
    const parsedBundle = parseDailyWorkbookBuffer(bytes, payload.filename, mailBody);
    let bundle = sanitizeDailyBundle(parsedBundle, { filename: payload.filename, mailBody });

    // 일부 매체 XLSB는 내부 날짜 연도가 전년도처럼 저장되어 있다.
    // 보정된 기준일은 사용하되, 원본 캠페인 시작연도가 기준일과 다르면 supplemental 단계에서는
    // 시작일 필터를 잠시 비우고 읽은 뒤 최종 sanitizer에서 파일명/메일 문맥으로 연도와 월을 정규화한다.
    const parsedStartYear = parsedBundle.campaignStart?.slice(0, 4) || "";
    const reportYear = bundle.reportDate?.slice(0, 4) || "";
    const supplementalCampaignStart = parsedStartYear && parsedStartYear === reportYear
      ? parsedBundle.campaignStart
      : "";

    const supplementalDaily = parseSupplementalDailyPerformance(bytes, bundle.reportDate, supplementalCampaignStart);
    if (supplementalDaily.length) {
      bundle = sanitizeDailyBundle({
        ...bundle,
        dailyPerformance: [...(bundle.dailyPerformance || []), ...supplementalDaily],
      }, { filename: payload.filename, mailBody });
    }
    const structuredNotes = extractStructuredOperationNotes(mailBody);
    if (structuredNotes.length) bundle.operationNotes = structuredNotes;

    const result = NextResponse.json({ bundle, sizeBytes: bytes.byteLength });
    if (refreshed) result.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return result;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to parse Gmail attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
