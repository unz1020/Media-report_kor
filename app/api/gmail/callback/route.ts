import { NextRequest, NextResponse } from "next/server";
import {
  encryptToken,
  exchangeCodeForToken,
  GMAIL_STATE_COOKIE,
  GMAIL_TOKEN_COOKIE,
  gmailCookieOptions,
} from "@/lib/gmail-oauth";

export const runtime = "nodejs";

type FailureReason = "invalid_state" | "oauth_denied" | "oauth_error" | "token_exchange" | "workspace_unavailable" | "google_identity" | "access_denied" | "session_encryption";

function failedCallback(request: NextRequest, reason: FailureReason) {
  // Only fixed categories: upstream exceptions may contain credentials or user data.
  console.error(`gmail_callback_failed:${reason}`);
  const destination = reason === "access_denied"
    ? "/overview?access=denied"
    : `/data-update?gmail=error&reason=${reason}`;
  const response = NextResponse.redirect(new URL(destination, request.url));
  // A failed Gmail reconnect must not log out an existing workspace session.
  if (reason === "access_denied") response.cookies.delete(GMAIL_TOKEN_COOKIE);
  response.cookies.delete(GMAIL_STATE_COOKIE);
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceSession(value: unknown) {
  if (!isRecord(value) || "error" in value || !isRecord(value.user)) return false;
  const { user, advertisers, months } = value;
  // Check the session contract, not a client-maintained identity/membership allowlist.
  // A registered user may legitimately have no advertiser access yet.
  return typeof user.email === "string" && user.email.length > 0
    && typeof user.role === "string" && user.role.length > 0
    && (user.display_name === null || typeof user.display_name === "string")
    && Array.isArray(advertisers) && advertisers.every(item => isRecord(item)
      && typeof item.id === "string" && typeof item.name === "string" && typeof item.slug === "string"
      && ["owner", "editor", "viewer"].includes(String(item.accessLevel)))
    && Array.isArray(months) && months.every(month => typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const storedState = request.cookies.get(GMAIL_STATE_COOKIE)?.value;

  if (!state || !storedState || state !== storedState) return failedCallback(request, "invalid_state");
  if (error) return failedCallback(request, error === "access_denied" ? "oauth_denied" : "oauth_error");
  if (!code) return failedCallback(request, "invalid_state");

  let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    token = await exchangeCodeForToken(code, request.nextUrl.origin);
    if (!token || typeof token.access_token !== "string" || !token.access_token
      || !Number.isFinite(token.expires_at) || token.expires_at <= 0
      || (token.refresh_token !== undefined && typeof token.refresh_token !== "string")) {
      return failedCallback(request, "token_exchange");
    }
  } catch {
    return failedCallback(request, "token_exchange");
  }

  try {
    // This service verifies Google identity and active DB membership server-side.
    const accessResponse = await fetch("https://akxuvlzaldoygmetzrdq.supabase.co/functions/v1/workspace-team", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token.access_token}` },
      body: JSON.stringify({ action: "session" }), cache: "no-store",
    });
    if (accessResponse.status === 401) return failedCallback(request, "google_identity");
    if (accessResponse.status === 403) return failedCallback(request, "access_denied");
    if (!accessResponse.ok) return failedCallback(request, "workspace_unavailable");
    // Even HTTP 200 must contain the expected session, not an error/HTML payload.
    if (!isWorkspaceSession(await accessResponse.json())) return failedCallback(request, "workspace_unavailable");
  } catch {
    return failedCallback(request, "workspace_unavailable");
  }

  try {
    const response = NextResponse.redirect(new URL("/data-update?gmail=connected", request.url));
    response.cookies.set(GMAIL_TOKEN_COOKIE, encryptToken(token), gmailCookieOptions());
    response.cookies.delete(GMAIL_STATE_COOKIE);
    return response;
  } catch {
    return failedCallback(request, "session_encryption");
  }
}
