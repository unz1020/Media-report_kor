import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";
import { parseDailyWorkbookBuffer } from "@/lib/server-daily-parser";

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
    const bundle = parseDailyWorkbookBuffer(bytes, payload.filename, payload.mailBody || "");
    const result = NextResponse.json({ bundle, sizeBytes: bytes.byteLength });
    if (refreshed) result.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return result;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to parse Gmail attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
