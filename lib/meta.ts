import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Reuse the generic HMAC state signer (tenant_id/tenant_slug/nonce/exp) from the
// Google integration — same shape, same SUPABASE_SERVICE_ROLE_KEY secret.
export { signState, verifyState, type StatePayload } from "@/lib/google";

/**
 * Meta Graph API helpers for connecting a tenant's Facebook Page + linked
 * Instagram Professional account, subscribing them to our webhook, and sending
 * replies. Uses the SAME Meta app that powers Facebook login (App ID/Secret in
 * env). Server-only.
 */

const GRAPH = () => process.env.META_GRAPH_VERSION || "v21.0";
const APP_ID = () => process.env.META_APP_ID!;
const APP_SECRET = () => process.env.META_APP_SECRET!;
const REDIRECT_PATH = "/api/meta/callback";
const redirectUri = () => `${process.env.NEXT_PUBLIC_APP_URL}${REDIRECT_PATH}`;

// Advanced-Access permissions for Page + Instagram messaging. Granted via App
// Review; usable for the app's own test pages while review is pending.
export const META_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "business_management",
  "instagram_basic",
  "instagram_manage_messages",
];

// Webhook message fields we subscribe each page to.
export const SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_reactions"];

// ─── OAuth (Facebook Login dialog) ──────────────────────────────────
export function buildMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APP_ID(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: META_SCOPES.join(","),
    state,
  });
  return `https://www.facebook.com/${GRAPH()}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH()}/oauth/access_token`);
  url.searchParams.set("client_id", APP_ID());
  url.searchParams.set("client_secret", APP_SECRET());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code", code);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta code exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

export async function getLongLivedUserToken(shortToken: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", APP_ID());
  url.searchParams.set("client_secret", APP_SECRET());
  url.searchParams.set("fb_exchange_token", shortToken);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta long-lived exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

// ─── Pages + linked Instagram ───────────────────────────────────────
export type MetaPage = {
  id: string;
  name: string;
  access_token: string; // long-lived page token (when user token is long-lived)
  instagram_business_account?: { id: string; username?: string };
};

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const url = new URL(`https://graph.facebook.com/${GRAPH()}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("access_token", userToken);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta /me/accounts failed: ${res.status} ${await res.text()}`);
  return ((await res.json()).data ?? []) as MetaPage[];
}

/** Subscribe a page to our app's webhook so we receive its messages. */
export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`https://graph.facebook.com/${GRAPH()}/${pageId}/subscribed_apps`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      subscribed_fields: SUBSCRIBED_FIELDS.join(","),
      access_token: pageToken,
    }),
  });
  if (!res.ok) throw new Error(`Meta subscribe failed for ${pageId}: ${res.status} ${await res.text()}`);
}

/**
 * Send a text reply. `externalId` is the page_id (Messenger) or ig user id
 * (Instagram); `recipientId` is the PSID / IGSID. Page token authorizes both.
 */
export async function sendMessage(args: {
  externalId: string;
  pageToken: string;
  recipientId: string;
  text: string;
}): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH()}/${args.externalId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: args.recipientId },
      messaging_type: "RESPONSE",
      message: { text: args.text },
      access_token: args.pageToken,
    }),
  });
  if (!res.ok) throw new Error(`Meta send failed: ${res.status} ${await res.text()}`);
}

// ─── Webhook signature (X-Hub-Signature-256) ────────────────────────
/** Constant-time verify of Meta's payload signature against the app secret. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", APP_SECRET()).update(rawBody, "utf8").digest("hex");
  const got = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
