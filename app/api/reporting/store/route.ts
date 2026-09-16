import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  encryptToken,
  ensureFreshToken,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";
import { sanitizeDailyBundle } from "@/lib/daily-bundle-sanitizer";
import type { DailyBundlePreview } from "@/lib/daily-report-parser";

export const runtime = "nodejs";

const REPORTING_EDGE_URL = "https://akxuvlzaldoygmetzrdq.supabase.co/functions/v1/reporting-store";

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookieValue) {
    return NextResponse.json({ error: "GMAIL_CONNECTION_REQUIRED" }, { status: 401 });
  }

  try {
    const storedToken = decryptToken(cookieValue);
    const { token, refreshed } = await ensureFreshToken(storedToken);
    const body = await request.json();

    if (body?.action === "publish_bundle" && body.bundle) {
      body.bundle = sanitizeDailyBundle(body.bundle as DailyBundlePreview, {
        filename: body.bundle.sourceFile,
        mailSubject: body.mailSubject,
        mailDate: body.mailDate,
      });
      if (body.sourceType === "placement_proof") body.sourceType = "gmail_pdf";
    }

    const edgeResponse = await fetch(REPORTING_EDGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await edgeResponse.json().catch(() => ({ error: "REPORTING_STORE_INVALID_RESPONSE" }));
    const response = NextResponse.json(payload, { status: edgeResponse.status });
    if (refreshed) {
      response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "REPORTING_STORE_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
