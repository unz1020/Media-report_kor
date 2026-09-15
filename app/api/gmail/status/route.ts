import { NextRequest, NextResponse } from "next/server";
import { decryptToken, GMAIL_TOKEN_COOKIE } from "@/lib/gmail-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const value = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!value) return NextResponse.json({ connected: false });
  try {
    const token = decryptToken(value);
    return NextResponse.json({ connected: true, expiresAt: token.expires_at });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
