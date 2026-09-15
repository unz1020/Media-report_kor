import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectParts(part?: GmailPart): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts?.flatMap(collectParts) ?? [])];
}

function extractBody(payload?: GmailPart) {
  const parts = collectParts(payload);
  const plain = parts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  if (plain?.body?.data) return decodeBase64Url(plain.body.data).trim();
  const html = parts.find((part) => part.mimeType === "text/html" && part.body?.data);
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));
  return "";
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function kstDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: Math.floor(startMs / 1000),
    end: Math.floor((startMs + 24 * 60 * 60 * 1000) / 1000),
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

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  try {
    const current = decryptToken(cookie);
    const { token, refreshed } = await ensureFreshToken(current);
    const baseQuery = request.nextUrl.searchParams.get("q") || "has:attachment filename:xlsx";
    const bounds = kstDayBounds();
    const q = `${baseQuery} after:${bounds.start} before:${bounds.end}`;

    const list = await gmailJson<{ messages?: { id: string }[] }>(
      token.access_token,
      `messages?maxResults=50&q=${encodeURIComponent(q)}`,
    );

    const messages: Array<{
      id: string;
      subject: string;
      from: string;
      date: string;
      internalDate?: string;
      body: string;
      attachments: { filename: string; attachmentId: string; mimeType?: string }[];
    }> = [];

    for (const item of list.messages ?? []) {
      const message = await gmailJson<GmailMessage>(token.access_token, `messages/${item.id}?format=full`);
      const attachments = collectParts(message.payload)
        .filter((part) => Boolean(part.filename?.toLowerCase().match(/\.xlsx?$/) && part.body?.attachmentId))
        .map((part) => ({
          filename: part.filename || "daily.xlsx",
          attachmentId: part.body?.attachmentId || "",
          mimeType: part.mimeType,
        }));
      if (!attachments.length) continue;
      messages.push({
        id: message.id,
        subject: header(message, "Subject"),
        from: header(message, "From"),
        date: header(message, "Date"),
        internalDate: message.internalDate,
        body: extractBody(message.payload),
        attachments,
      });
    }

    messages.sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
    const response = NextResponse.json({ date: bounds.date, query: q, messages });
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to read today's Gmail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
