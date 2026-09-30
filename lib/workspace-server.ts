import { NextRequest, NextResponse } from "next/server";
import { decryptToken, encryptToken, ensureFreshToken, GMAIL_TOKEN_COOKIE, gmailCookieOptions } from "./gmail-oauth";

const TEAM_URL = "https://akxuvlzaldoygmetzrdq.supabase.co/functions/v1/workspace-team";

export async function workspaceRequest(request: NextRequest, body: Record<string, unknown>) {
  const cookie = request.cookies.get(GMAIL_TOKEN_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "GOOGLE_AUTH_REQUIRED" }, { status: 401 });
  try {
    const { token, refreshed } = await ensureFreshToken(decryptToken(cookie));
    const remote = await fetch(TEAM_URL, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
      body: JSON.stringify(body), cache: "no-store",
    });
    const payload = await remote.json().catch(() => ({ error: "WORKSPACE_UNAVAILABLE" }));
    const response = NextResponse.json(payload, { status: remote.status, headers: { "cache-control": "private, no-store" } });
    if (refreshed) response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "WORKSPACE_UNAVAILABLE" }, { status: 503 });
  }
}
