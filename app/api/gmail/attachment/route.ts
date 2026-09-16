import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

export const runtime = "nodejs";

function safeMime(value: string) {
  return /^(image\/(png|jpeg|webp)|application\/(pdf|vnd\.openxmlformats-officedocument\.presentationml\.presentation|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))$/i.test(value)
    ? value
    : "application/octet-stream";
}

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";
}

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const messageId = request.nextUrl.searchParams.get("messageId") || "";
  const attachmentId = request.nextUrl.searchParams.get("attachmentId") || "";
  const filename = safeFilename(request.nextUrl.searchParams.get("filename") || "attachment");
  const mimeType = safeMime(request.nextUrl.searchParams.get("mimeType") || "application/octet-stream");
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (!messageId || !attachmentId) return NextResponse.json({ error: "첨부파일 식별자가 필요합니다." }, { status: 400 });

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
        "content-type": mimeType,
        "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, max-age=300",
      },
    });
    if (refreshed) fileResponse.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return fileResponse;
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "첨부파일을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
