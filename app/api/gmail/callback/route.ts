import { NextRequest, NextResponse } from "next/server";
import {
  encryptToken,
  exchangeCodeForToken,
  GMAIL_STATE_COOKIE,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const storedState = request.cookies.get(GMAIL_STATE_COOKIE)?.value;

  if (error) return NextResponse.redirect(new URL(`/data-update?gmail=error&reason=${encodeURIComponent(error)}`, request.url));
  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/data-update?gmail=error&reason=invalid_state", request.url));
  }

  try {
    const token = await exchangeCodeForToken(code, request.nextUrl.origin);
    const response = NextResponse.redirect(new URL("/data-update?gmail=connected", request.url));
    response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    response.cookies.delete(GMAIL_STATE_COOKIE);
    return response;
  } catch (oauthError) {
    console.error(oauthError);
    return NextResponse.redirect(new URL("/data-update?gmail=error&reason=token_exchange", request.url));
  }
}
