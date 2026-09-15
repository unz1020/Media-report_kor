import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";
import { parseLookerPdf } from "@/lib/looker-pdf-parser";

export const runtime = "nodejs";

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
};

function collectParts(part?: GmailPart): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts?.flatMap(collectParts) ?? [])];
}
function decodeBase64Url(value?: string) {
  if (!value) return "";
  return Buffer.from(value, "base64url").toString("utf8");
}
function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function bodyText(payload?: GmailPart) {
  const parts = collectParts(payload);
  const plain = parts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);
  const html = parts.find((part) => part.mimeType === "text/html" && part.body?.data);
  return html?.body?.data ? stripHtml(decodeBase64Url(html.body.data)) : "";
}
function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function kstDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const year = get("year"), month = get("month"), day = get("day");
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: Math.floor(startMs / 1000),
    end: Math.floor((startMs + 86400000) / 1000),
  };
}
async function gmailJson<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gmail API failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}
function extractLookerUrl(text: string) {
  return text.match(/https?:\/\/(?:datastudio\.google\.com|lookerstudio\.google\.com)\/reporting\/[^\s)>"']+/i)?.[0] || "";
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const advertiser = request.nextUrl.searchParams.get("advertiser")?.trim() || "";
  const month = request.nextUrl.searchParams.get("month")?.trim() || "";
  const configuredUrl = request.nextUrl.searchParams.get("reportUrl")?.trim() || "";
  if (!advertiser || !month) return NextResponse.json({ error: "광고주와 조회 월이 필요합니다." }, { status: 400 });

  try {
    const current = decryptToken(cookie);
    const { token, refreshed } = await ensureFreshToken(current);
    const bounds = kstDayBounds();
    const q = `${advertiser} has:attachment filename:pdf after:${bounds.start} before:${bounds.end}`;
    const list = await gmailJson<{ messages?: { id: string }[] }>(token.access_token, `messages?maxResults=30&q=${encodeURIComponent(q)}`);

    const bundlesBySource = new Map<string, any>();
    const warnings: string[] = [];
    const mails: Array<{ id: string; subject: string; date: string; pdfCount: number }> = [];

    for (const item of list.messages ?? []) {
      const message = await gmailJson<GmailMessage>(token.access_token, `messages/${item.id}?format=full`);
      const body = bodyText(message.payload);
      const bodyUrl = extractLookerUrl(body);
      const reportUrl = configuredUrl || bodyUrl;
      const pdfParts = collectParts(message.payload).filter((part) => Boolean(part.filename?.toLowerCase().endsWith(".pdf") && part.body?.attachmentId));
      if (!pdfParts.length) continue;

      let accepted = 0;
      for (const part of pdfParts) {
        const attachment = await gmailJson<{ data?: string }>(token.access_token, `messages/${item.id}/attachments/${part.body?.attachmentId}`);
        if (!attachment.data) continue;
        const bytes = Buffer.from(attachment.data, "base64url");
        try {
          const parsed = await parseLookerPdf({
            buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            filename: part.filename || "report.pdf",
            advertiser,
            reportUrl: reportUrl || undefined,
            month,
          });
          warnings.push(...parsed.warnings);
          for (const bundle of parsed.bundles) {
            bundlesBySource.set(bundle.sourceId, bundle);
            accepted += 1;
          }
        } catch (error) {
          warnings.push(`${part.filename || "PDF"}: ${error instanceof Error ? error.message : "분석 실패"}`);
        }
      }
      if (accepted) mails.push({ id: item.id, subject: header(message, "Subject"), date: header(message, "Date"), pdfCount: pdfParts.length });
    }

    const result = NextResponse.json({
      date: bounds.date,
      query: q,
      reportUrl: configuredUrl || undefined,
      mails,
      bundles: [...bundlesBySource.values()],
      warnings: [...new Set(warnings)],
    });
    if (refreshed) result.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return result;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "오늘 Looker PDF를 불러오지 못했습니다." }, { status: 500 });
  }
}
