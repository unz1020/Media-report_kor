import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildGoogleAuthUrl, GMAIL_STATE_COOKIE } from "@/lib/gmail-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const state = crypto.randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(buildGoogleAuthUrl(request.nextUrl.origin, state));
    response.cookies.set(GMAIL_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail OAuth configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
