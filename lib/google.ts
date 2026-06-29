import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
];

const REDIRECT_PATH = "/api/google/callback";

function clientId() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID!;
}
function clientSecret() {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
}
function redirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL}${REDIRECT_PATH}`;
}
function stateSecret() {
  // Reuse the service role key as HMAC secret — it's already long, random,
  // and never reaches the browser.
  return process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

// ─── State signing ───────────────────────────────────────────────────
export type StatePayload = {
  tenant_id: string;
  tenant_slug: string;
  nonce: string;
  exp: number;
};

export function signState(p: Omit<StatePayload, "nonce" | "exp">): string {
  const payload: StatePayload = {
    ...p,
    nonce: randomBytes(8).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + 600, // 10 min
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const [data, sig] = state.split(".");
  if (!data || !sig) return null;
  const expected = createHmac("sha256", stateSecret())
    .update(data)
    .digest("base64url");
  // Constant-time comparison (the signature is an HMAC over attacker-visible data).
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as StatePayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── OAuth URL ───────────────────────────────────────────────────────
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent", // force a refresh_token even on re-grants
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ─── Token endpoints ─────────────────────────────────────────────────
export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: "Bearer";
  id_token?: string;
};

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${t}`);
  }
  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<Omit<GoogleTokens, "refresh_token">> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${t}`);
  }
  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort revoke; don't throw on failure
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
  } catch {
    // ignore
  }
}

// ─── Lookup the signed-in user's email from id_token ─────────────────
// SECURITY: This decodes the id_token payload WITHOUT verifying its JWS
// signature. That is only safe because the token is obtained server-to-server
// from Google's token endpoint over TLS inside `exchangeCode` (a trusted
// channel) and the email is used for display/metadata only — never as an
// authz decision. DO NOT reuse this on an id_token that arrived from an
// untrusted source (e.g. a client request); verify the signature against
// Google's JWKS first, or it can be trivially forged.
export function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const [, payload] = idToken.split(".");
    const json = JSON.parse(Buffer.from(payload, "base64url").toString());
    return json.email ?? null;
  } catch {
    return null;
  }
}
