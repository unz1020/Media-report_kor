import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const messageId = request.nextUrl.searchParams.get("messageId");
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  const filename = request.nextUrl.searchParams.get("filename") || "daily-report.xlsx";
  if (!messageId || !attachmentId) return NextResponse.json({ error: "Missing attachment parameters" }, { status: 400 });

  try {
    const current = decryptToken(cookie);
    const { token, refreshed } = await ensureFreshToken(current);
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Gmail attachment API failed (${response.status}): ${await response.text()}`);
    const payload = await response.json() as { data?: string };
    if (!payload.data) throw new Error("Attachment payload is empty");
    const bytes = Buffer.from(payload.data, "base64url");
    const fileResponse = new NextResponse(bytes, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
    if (refreshed) fileResponse.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return fileResponse;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to download Gmail attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
