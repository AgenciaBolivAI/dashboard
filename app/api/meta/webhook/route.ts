import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature } from "@/lib/meta";
import { timingSafeEqual } from "@/lib/security/bearer";

export const runtime = "nodejs";

/**
 * Single Meta webhook endpoint for Messenger + Instagram (register this URL in
 * the Meta app). One endpoint, demuxed by entry id (page_id / ig id) →
 * tenant_channels.tenant_id, then forwarded to the n8n agent workflow which
 * runs the same tenant-scoped agent loop and replies via the Graph API.
 *
 * GET  → verification handshake.
 * POST → signature-checked message events. Always 200s fast (Meta requirement).
 */

// GET: subscribe handshake — echo hub.challenge when the verify token matches.
export async function GET(request: NextRequest) {
  const p = new URL(request.url).searchParams;
  const expected = process.env.META_VERIFY_TOKEN ?? "";
  if (
    p.get("hub.mode") === "subscribe" &&
    expected !== "" &&
    timingSafeEqual(p.get("hub.verify_token") ?? "", expected)
  ) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Bad signature", { status: 403 });
  }

  let body: { object?: string; entry?: MetaEntry[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed; nothing to do
  }

  // 'page' = Messenger, 'instagram' = Instagram DMs.
  const channel =
    body.object === "instagram" ? "instagram" : body.object === "page" ? "facebook_messenger" : null;
  if (!channel || !Array.isArray(body.entry)) return NextResponse.json({ ok: true });

  // AWAIT the forward. On Vercel, fire-and-forget work after the response is
  // frozen — the profile-name lookup latency was enough to kill the forward
  // before it ran, so inbound messages silently vanished. dispatch is bounded
  // (~2.5s lookup + a fast POST), well within Meta's webhook window.
  await dispatch(channel, body.entry).catch(() => {});
  return NextResponse.json({ ok: true });
}

type MetaMessaging = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
  postback?: { payload?: string; title?: string };
};
type MetaEntry = { id: string; time?: number; messaging?: MetaMessaging[] };

/**
 * Best-effort display name for a Messenger/IG sender. The page token can read
 * the name (+ IG username) of users who've messaged the page. Non-fatal: a
 * failure just leaves the name null (the inbox falls back to a generic label).
 */
async function fetchSenderProfile(
  senderId: string,
  pageToken: string,
): Promise<{ name: string | null; username: string | null }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${senderId}?fields=name,username&access_token=${encodeURIComponent(pageToken)}`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return { name: null, username: null };
    const j = (await res.json()) as { name?: string; username?: string };
    return { name: j.name ?? null, username: j.username ?? null };
  } catch {
    return { name: null, username: null };
  }
}

async function dispatch(channel: string, entries: MetaEntry[]) {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const agentUrl = process.env.META_AGENT_WEBHOOK_URL; // n8n IG/Messenger agent

  for (const entry of entries) {
    // entry.id is the page_id (Messenger) or ig user id (Instagram).
    const { data: ch } = await svc
      .from("tenant_channels")
      .select("tenant_id, config, status")
      .eq("channel", channel)
      .eq("external_id", entry.id)
      .maybeSingle();
    const row = ch as { tenant_id: string; config: Record<string, unknown>; status: string } | null;
    if (!row || row.status !== "active") continue; // unknown/paused channel → drop

    for (const m of entry.messaging ?? []) {
      // Ignore ECHOES — the account's OWN outgoing messages (the bot's Graph
      // replies + manual replies from the IG/FB app). Meta echoes them back
      // with the sender being the connected account itself (entry.id); treating
      // them as inbound spawns a self-conversation ("BolivAI") and can loop.
      if (m.message?.is_echo || m.sender?.id === entry.id) continue;
      const text = m.message?.text ?? m.postback?.payload;
      if (!m.sender?.id || !text) continue;

      const pageToken = (row.config?.page_access_token as string) ?? null;
      // Messages SEND through the FB page id for both channels — IG send via the
      // IG id fails with "(#3) capability". For Messenger page_id == external_id.
      const pageId = (row.config?.page_id as string) ?? entry.id;
      const profile = pageToken
        ? await fetchSenderProfile(m.sender.id, pageToken)
        : { name: null, username: null };

      const event = {
        tenant_id: row.tenant_id,
        channel,
        external_id: entry.id,
        page_id: pageId,
        page_access_token: pageToken,
        sender_id: m.sender.id,
        provider_message_id: m.message?.mid ?? null,
        text,
        name: profile.name,
        username: profile.username,
      };

      if (agentUrl) {
        await fetch(agentUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
          // Bound the forward so a hung n8n can't stall the handler past Meta's
          // response window (which would trigger retries / subscription disable).
          signal: AbortSignal.timeout(5000),
        }).catch(() => {});
      }
      // If META_AGENT_WEBHOOK_URL isn't set yet, the event is acknowledged and
      // dropped — the verification handshake + signature path still work, so the
      // Meta app can be configured before the n8n handler ships.
    }
  }
}
