import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";
import { buildPlacementProof } from "@/lib/placement-proof";

export const runtime = "nodejs";

type AttachmentInput = { filename: string; attachmentId: string; mimeType?: string };

type TextItemLike = { str?: string; transform?: number[] };

function lineText(items: TextItemLike[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const value = (item.str || "").trim();
    if (!value) continue;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    const bucket = Math.round(y / 2) * 2;
    const row = rows.get(bucket) || [];
    row.push({ x, text: value });
    rows.set(bucket, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(lineText(content.items as TextItemLike[]).join("\n"));
  }
  return pages.join("\n\n");
}

async function readGmailAttachment(accessToken: string, messageId: string, attachmentId: string) {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Gmail attachment API failed (${response.status}): ${await response.text()}`);
  const payload = await response.json() as { data?: string };
  if (!payload.data) throw new Error("첨부파일 데이터가 비어 있습니다.");
  return Buffer.from(payload.data, "base64url");
}

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookieValue) return NextResponse.json({ error: "Gmail is not connected" }, { status: 401 });

  const input = await request.json().catch(() => null) as {
    advertiser?: string;
    messageId?: string;
    subject?: string;
    body?: string;
    mailDate?: string;
    selectedDate?: string;
    attachments?: AttachmentInput[];
  } | null;

  if (!input?.messageId || !input.subject) {
    return NextResponse.json({ error: "게재 보고서 메일 정보가 부족합니다." }, { status: 400 });
  }

  try {
    const storedToken = decryptToken(cookieValue);
    const { token, refreshed } = await ensureFreshToken(storedToken);
    const attachments = input.attachments || [];
    const pdfAttachment = attachments.find((item) => /\.pdf$/i.test(item.filename) && item.attachmentId);
    let pdfText = "";
    let pdfWarning = "";
    if (pdfAttachment) {
      try {
        const bytes = await readGmailAttachment(token.access_token, input.messageId, pdfAttachment.attachmentId);
        pdfText = await extractPdfText(bytes);
      } catch (error) {
        pdfWarning = error instanceof Error ? error.message : "PDF 상세정보 분석 실패";
      }
    }

    const proof = buildPlacementProof({
      advertiser: input.advertiser,
      messageId: input.messageId,
      subject: input.subject,
      body: input.body || "",
      mailDate: input.mailDate || "",
      selectedDate: input.selectedDate,
      attachments,
      pdfText,
    });

    const response = NextResponse.json({ proof, pdfParsed: Boolean(pdfText), warning: pdfWarning });
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "게재 보고서 분석에 실패했습니다." }, { status: 500 });
  }
}
