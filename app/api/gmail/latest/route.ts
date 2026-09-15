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
    const q = request.nextUrl.searchParams.get("q") || "has:attachment filename:xlsx newer_than:30d";
    const list = await gmailJson<{ messages?: { id: string }[] }>(
      token.access_token,
      `messages?maxResults=10&q=${encodeURIComponent(q)}`,
    );

    if (!list.messages?.length) {
      const empty = NextResponse.json({ message: null, query: q });
      if (refreshed) empty.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
      return empty;
    }

    const candidates: GmailMessage[] = [];
    for (const item of list.messages.slice(0, 5)) {
      const message = await gmailJson<GmailMessage>(token.access_token, `messages/${item.id}?format=full`);
      candidates.push(message);
    }
    candidates.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));

    const selected = candidates.find((message) =>
      collectParts(message.payload).some((part) => Boolean(part.filename?.toLowerCase().match(/\.xlsx?$/) && part.body?.attachmentId)),
    );
    if (!selected) return NextResponse.json({ message: null, query: q, reason: "xlsx_attachment_not_found" });

    const attachment = collectParts(selected.payload).find((part) =>
      Boolean(part.filename?.toLowerCase().match(/\.xlsx?$/) && part.body?.attachmentId),
    );

    const response = NextResponse.json({
      query: q,
      message: {
        id: selected.id,
        subject: header(selected, "Subject"),
        from: header(selected, "From"),
        date: header(selected, "Date"),
        internalDate: selected.internalDate,
        body: extractBody(selected.payload),
        attachment: attachment ? {
          filename: attachment.filename,
          attachmentId: attachment.body?.attachmentId,
          mimeType: attachment.mimeType,
        } : null,
      },
    });
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to read Gmail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
