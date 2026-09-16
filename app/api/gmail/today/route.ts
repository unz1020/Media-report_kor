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

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string) {
  return decodeEntities(value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return `${cleanLabel || "링크"} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
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

function currentKstDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function kstDayBounds(dateValue?: string) {
  let year: number;
  let month: number;
  let day: number;

  if (dateValue) {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("INVALID_DATE");
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) throw new Error("INVALID_DATE");
  } else {
    const current = currentKstDate();
    year = current.year;
    month = current.month;
    day = current.day;
  }

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

  const requestedDate = request.nextUrl.searchParams.get("date") || undefined;
  let bounds: ReturnType<typeof kstDayBounds>;
  try {
    bounds = kstDayBounds(requestedDate);
  } catch {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 선택해주세요." }, { status: 400 });
  }

  try {
    const current = decryptToken(cookie);
    const { token, refreshed } = await ensureFreshToken(current);
    const baseQuery = request.nextUrl.searchParams.get("q") || "자코모";
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
        .filter((part) => Boolean(part.filename?.toLowerCase().match(/\.(xlsx|xls|xlsb)$/) && part.body?.attachmentId))
        .map((part) => ({
          filename: part.filename || "daily.xlsx",
          attachmentId: part.body?.attachmentId || "",
          mimeType: part.mimeType,
        }));
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
    const message = error instanceof Error ? error.message : "Failed to read Gmail for selected date";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
