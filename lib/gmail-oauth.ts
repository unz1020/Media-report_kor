import crypto from "node:crypto";

export const GMAIL_TOKEN_COOKIE = "media_report_gmail_token";
export const GMAIL_STATE_COOKIE = "media_report_gmail_state";
export const GMAIL_SCOPE = "openid email https://www.googleapis.com/auth/gmail.readonly";

export type GoogleTokenBundle = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type?: string;
  scope?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(requireEnv("GMAIL_TOKEN_SECRET")).digest();
}

export function encryptToken(bundle: GoogleTokenBundle) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(bundle), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string): GoogleTokenBundle {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid Gmail token cookie");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as GoogleTokenBundle;
}

export function buildGoogleAuthUrl(origin: string, state: string) {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, origin: string): Promise<GoogleTokenBundle> {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/gmail/callback`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
  const token = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
    token_type: token.token_type,
    scope: token.scope,
  };
}

export async function ensureFreshToken(bundle: GoogleTokenBundle): Promise<{ token: GoogleTokenBundle; refreshed: boolean }> {
  if (bundle.expires_at > Date.now() + 60_000) return { token: bundle, refreshed: false };
  if (!bundle.refresh_token) throw new Error("Gmail refresh token is missing. Reconnect Gmail.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: bundle.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${await response.text()}`);
  const token = await response.json() as { access_token: string; expires_in: number; token_type?: string; scope?: string };
  return {
    refreshed: true,
    token: {
      ...bundle,
      access_token: token.access_token,
      expires_at: Date.now() + token.expires_in * 1000,
      token_type: token.token_type || bundle.token_type,
      scope: token.scope || bundle.scope,
    },
  };
}

export function gmailCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}
