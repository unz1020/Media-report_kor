import { NextRequest, NextResponse } from "next/server";
import { decryptToken, GMAIL_TOKEN_COOKIE } from "@/lib/gmail-oauth";

export const runtime = "nodejs";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function GET(request: NextRequest) {
  const value = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!value) return NextResponse.json({ connected: false, hasGmailReadScope: false });

  try {
    const token = decryptToken(value);
    const scopes = (token.scope || "").split(/\s+/).filter(Boolean);
    const hasGmailReadScope = scopes.includes(GMAIL_READONLY_SCOPE);

    return NextResponse.json({
      connected: hasGmailReadScope,
      tokenPresent: true,
      hasGmailReadScope,
      scopes,
      expiresAt: token.expires_at,
    });
  } catch {
    return NextResponse.json({ connected: false, hasGmailReadScope: false });
  }
}
