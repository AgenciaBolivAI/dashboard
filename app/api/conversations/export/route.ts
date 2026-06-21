import { NextResponse, type NextRequest } from "next/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { listConversations } from "@/lib/queries/conversations";
import { toCsv, csvHeaders } from "@/lib/csv";

/**
 * CSV export of a tenant's conversations, honoring the inbox filters
 * (status, channel, search `q`). Pulls a wide window via the same query the
 * page uses, so the export reflects exactly what's filtered on screen.
 */
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  const items = await listConversations(tenant.id, {
    status: searchParams.get("status") ?? undefined,
    channel: searchParams.get("channel") ?? undefined,
    search: searchParams.get("q") ?? undefined,
    limit: 10_000,
  });

  const rows = items.map((c) => [
    c.user?.name ?? "",
    c.user?.whatsapp_number ?? c.user?.channel_user_id ?? "",
    c.channel,
    c.hitl_taken_over ? "hitl" : c.status,
    c.last_message_at,
    c.last_message?.content ?? "",
  ]);

  const csv = toCsv(
    ["customer", "contact", "channel", "status", "last_message_at", "last_message"],
    rows,
  );
  const filename = `conversations-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: csvHeaders(filename) });
}
