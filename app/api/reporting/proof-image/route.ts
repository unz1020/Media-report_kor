import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

export const runtime = "nodejs";

const PROOF_IMAGE_EDGE_URL = "https://akxuvlzaldoygmetzrdq.supabase.co/functions/v1/placement-proof-image";

async function authenticatedToken(request: NextRequest) {
  const cookieValue = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookieValue) throw new Error("GMAIL_CONNECTION_REQUIRED");
  const stored = decryptToken(cookieValue);
  return ensureFreshToken(stored);
}

export async function GET(request: NextRequest) {
  try {
    const advertiser = request.nextUrl.searchParams.get("advertiser") || "";
    const path = request.nextUrl.searchParams.get("path") || "";
    if (!advertiser || !path) return NextResponse.json({ error: "INVALID_IMAGE_REQUEST" }, { status: 400 });

    const { token, refreshed } = await authenticatedToken(request);
    const edgeResponse = await fetch(PROOF_IMAGE_EDGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({ action: "signed_url", advertiser, path }),
      cache: "no-store",
    });
    const payload = await edgeResponse.json().catch(() => ({}));
    if (!edgeResponse.ok || !payload.signedUrl) {
      return NextResponse.json({ error: payload.error || "PROOF_IMAGE_NOT_AVAILABLE" }, { status: edgeResponse.status || 500 });
    }

    const response = NextResponse.redirect(payload.signedUrl, 302);
    response.headers.set("cache-control", "private, no-store");
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROOF_IMAGE_ERROR";
    return NextResponse.json({ error: message }, { status: message.includes("GMAIL") ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    const advertiser = String(incoming.get("advertiser") || "");
    const reportDate = String(incoming.get("reportDate") || "");
    const sourceFile = String(incoming.get("sourceFile") || "");

    if (!(file instanceof File) || !advertiser || !reportDate || !sourceFile) {
      return NextResponse.json({ error: "이미지와 게재 보고 정보가 필요합니다." }, { status: 400 });
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return NextResponse.json({ error: "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다." }, { status: 415 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "이미지는 8MB 이하로 업로드해주세요." }, { status: 413 });
    }

    const { token, refreshed } = await authenticatedToken(request);
    const form = new FormData();
    form.set("file", file, file.name);
    form.set("advertiser", advertiser);
    form.set("reportDate", reportDate);
    form.set("sourceFile", sourceFile);

    const edgeResponse = await fetch(PROOF_IMAGE_EDGE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token}` },
      body: form,
      cache: "no-store",
    });
    const payload = await edgeResponse.json().catch(() => ({}));
    const response = NextResponse.json(payload, { status: edgeResponse.status });
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROOF_IMAGE_UPLOAD_ERROR";
    return NextResponse.json({ error: message }, { status: message.includes("GMAIL") ? 401 : 500 });
  }
}
