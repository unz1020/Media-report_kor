import { NextResponse } from "next/server";
import { GMAIL_TOKEN_COOKIE } from "@/lib/gmail-oauth";

export async function POST() {
  const response = NextResponse.json({ connected: false });
  response.cookies.set(GMAIL_TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
