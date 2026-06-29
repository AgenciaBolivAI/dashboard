/**
 * Public marketing opt-out endpoint. NO auth — the token is an unguessable
 * marketing_messages id that resolves to (tenant, address). Two callers:
 *   - the /u/[token] confirm page (POST JSON { token })
 *   - mailbox providers' RFC 8058 one-click (POST to ?token=… with the body
 *     `List-Unsubscribe=One-Click`)
 *
 * Idempotent (suppression upsert). Always 200 with a neutral body so a token's
 * validity isn't probeable; an invalid/expired token is simply a no-op.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { recordUnsubscribe } from "@/lib/marketing/suppression";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_LIMIT_PER_MIN = 30;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  const svc = createServiceClient() as unknown as SupabaseClient;

  // token: query param (one-click) OR JSON body (confirm page).
  let token = new URL(req.url).searchParams.get("token") || "";
  let oneClick = true;
  if (!token) {
    try {
      const body = (await req.json()) as { token?: unknown };
      if (typeof body.token === "string") token = body.token;
      oneClick = false;
    } catch {
      /* no JSON body — leave token empty */
    }
  }
  token = token.trim();

  // Light per-IP rate limit (fail-open).
  try {
    const { data: rl } = await svc.rpc("api_rate_limit_hit", {
      p_key_id: `unsub:${clientIp(req)}`.slice(0, 200),
      p_limit: RATE_LIMIT_PER_MIN,
      p_window_seconds: 60,
    });
    const row = (Array.isArray(rl) ? rl[0] : rl) as { allowed?: boolean } | undefined;
    if (row && row.allowed === false) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }
  } catch {
    /* fail-open */
  }

  if (!UUID_RE.test(token)) {
    return NextResponse.json({ ok: true }); // neutral no-op
  }

  const { data } = await svc
    .from("marketing_messages")
    .select("id, tenant_id, to_address, channel")
    .eq("id", token)
    .maybeSingle();
  const m = data as { tenant_id: string; to_address: string; channel: string } | null;
  if (m) {
    await recordUnsubscribe({
      tenantId: m.tenant_id,
      address: m.to_address,
      channel: m.channel,
      source: oneClick ? "one_click" : "link",
      messageId: token,
    });
  }

  return NextResponse.json({ ok: true });
}
