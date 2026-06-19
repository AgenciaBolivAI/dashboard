import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyWebhookSignature } from "@/lib/meta";

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
  if (
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === process.env.META_VERIFY_TOKEN
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

  // Resolve + forward without blocking the 200 (Meta retries on slow/non-200).
  void dispatch(channel, body.entry).catch(() => {});
  return NextResponse.json({ ok: true });
}

type MetaMessaging = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string };
  postback?: { payload?: string; title?: string };
};
type MetaEntry = { id: string; time?: number; messaging?: MetaMessaging[] };

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
      const text = m.message?.text ?? m.postback?.payload;
      if (!m.sender?.id || !text) continue;

      const event = {
        tenant_id: row.tenant_id,
        channel,
        external_id: entry.id,
        page_access_token: (row.config?.page_access_token as string) ?? null,
        sender_id: m.sender.id,
        provider_message_id: m.message?.mid ?? null,
        text,
      };

      if (agentUrl) {
        await fetch(agentUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        }).catch(() => {});
      }
      // If META_AGENT_WEBHOOK_URL isn't set yet, the event is acknowledged and
      // dropped — the verification handshake + signature path still work, so the
      // Meta app can be configured before the n8n handler ships.
    }
  }
}
