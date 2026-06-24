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

// Core scopes for connecting a Page + linked Instagram and running the DM
// agents. These are valid as soon as the Messenger + Instagram products are
// added — usable on the app's own test assets while App Review is pending.
export const META_MESSAGING_SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "business_management",
  "instagram_basic",
  "instagram_manage_messages",
];

// Publishing scopes (native CCAVAI auto-post + manual publish). Facebook treats
// these as "Invalid Scopes" and rejects the ENTIRE OAuth dialog until the app
// is configured + approved for content publishing — so they're gated behind an
// env flag. Connecting messaging works today; flip META_ENABLE_PUBLISHING=1
// once the app is approved to start requesting them (no code change).
export const META_PUBLISHING_SCOPES = ["pages_manage_posts", "instagram_content_publish"];

const publishingEnabled = () =>
  process.env.META_ENABLE_PUBLISHING === "1" || process.env.META_ENABLE_PUBLISHING === "true";

/** The scope set to request in the connect dialog, given current app status. */
export function metaScopes(): string[] {
  return publishingEnabled()
    ? [...META_MESSAGING_SCOPES, ...META_PUBLISHING_SCOPES]
    : META_MESSAGING_SCOPES;
}

// Webhook message fields we subscribe each page to.
export const SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks", "message_reactions"];

// ─── OAuth (Facebook Login dialog) ──────────────────────────────────
export function buildMetaAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APP_ID(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: metaScopes().join(","),
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
 * Send a text reply. `externalId` MUST be the FB **page id** for both channels
 * — Messenger sends via the page, and Instagram messages also send via the
 * linked page id (sending via the IG user id returns "(#3) capability"). For
 * Messenger the page id == the channel external_id; for Instagram it's
 * `tenant_channels.config.page_id`. `recipientId` is the PSID / IGSID.
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

// ─── Publishing (Facebook Page + Instagram) ─────────────────────────
/**
 * Publish to a Facebook Page. With an image it's a photo post (the image must
 * be a public URL Meta can fetch); without, a plain text feed post. Uses the
 * Page access token. Returns the new post id + a permalink.
 */
export async function postToPage(args: {
  pageId: string;
  pageToken: string;
  message: string;
  imageUrl?: string | null;
}): Promise<{ id: string; url: string }> {
  const g = GRAPH();
  const endpoint = args.imageUrl ? "photos" : "feed";
  const body: Record<string, unknown> = args.imageUrl
    ? { url: args.imageUrl, caption: args.message, access_token: args.pageToken }
    : { message: args.message, access_token: args.pageToken };
  const res = await fetch(`https://graph.facebook.com/${g}/${args.pageId}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Facebook post failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { id: string; post_id?: string };
  const postId = j.post_id ?? j.id;
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}

/**
 * Publish a single image to an Instagram Business/Creator account. Two-step:
 * create a media container (image_url must be a PUBLIC JPEG), then publish it.
 */
export async function postToInstagram(args: {
  igId: string;
  pageToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ id: string; url: string }> {
  const g = GRAPH();
  const cr = await fetch(`https://graph.facebook.com/${g}/${args.igId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: args.imageUrl, caption: args.caption, access_token: args.pageToken }),
  });
  if (!cr.ok) throw new Error(`Instagram container failed: ${cr.status} ${await cr.text()}`);
  const containerId = ((await cr.json()) as { id: string }).id;

  // Instagram fetches + processes the image ASYNCHRONOUSLY after the container
  // is created. The container is not publishable until its status_code is
  // FINISHED — publishing too early returns code 9007 / subcode 2207027
  // ("The media is not ready for publishing, please wait for a moment"). Poll
  // until ready (typically 1–5s) before publishing.
  await waitForIgContainer(g, containerId, args.pageToken);

  const pub = await fetch(`https://graph.facebook.com/${g}/${args.igId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: args.pageToken }),
  });
  if (!pub.ok) throw new Error(`Instagram publish failed: ${pub.status} ${await pub.text()}`);
  const mediaId = ((await pub.json()) as { id: string }).id;

  let url = "https://www.instagram.com/";
  try {
    const pl = await fetch(
      `https://graph.facebook.com/${g}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(args.pageToken)}`,
    );
    if (pl.ok) url = ((await pl.json()) as { permalink?: string }).permalink ?? url;
  } catch {
    /* permalink is best-effort */
  }
  return { id: mediaId, url };
}

/**
 * Poll an Instagram media container until it has finished processing (status_code
 * FINISHED) so it's safe to publish. Throws on ERROR/EXPIRED or if it doesn't
 * become ready within the budget. ~1.5s × 20 ≈ 30s max — well under typical
 * processing time but generous for branded JPEGs.
 */
async function waitForIgContainer(
  g: string,
  containerId: string,
  token: string,
  opts: { tries?: number; delayMs?: number } = {},
): Promise<void> {
  const tries = opts.tries ?? 20;
  const delayMs = opts.delayMs ?? 1500;
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const res = await fetch(
      `https://graph.facebook.com/${g}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) continue; // transient read error — keep polling
    const j = (await res.json()) as { status_code?: string; status?: string };
    if (j.status_code === "FINISHED") return;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
      throw new Error(`Instagram container ${j.status_code}: ${j.status ?? "processing failed"}`);
    }
    // IN_PROGRESS / PUBLISHED(unexpected) → keep polling
  }
  throw new Error("Instagram container not ready after polling (timed out)");
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
