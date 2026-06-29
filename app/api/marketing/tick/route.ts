/**
 * Marketing execution tick (P2). An n8n cron POSTs here on a schedule (~1–2 min);
 * each call sends a bounded batch of every approved/running campaign's DUE queued
 * messages, debiting credits per confirmed send. Idempotent: only queued + due
 * rows are sent, so a re-run soon after is a near no-op.
 *
 * Auth: Authorization: Bearer ${CCAVAI_WEBHOOK_SECRET} (shared internal secret).
 *
 * POST {}                       — tick all tenants
 * POST { "tenant_id": "..." }   — tick one tenant
 */
import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { runMarketingTick } from "@/lib/marketing/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = tick all tenants
  }

  try {
    const summary = await runMarketingTick({ tenantId: body.tenant_id?.trim() || undefined });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 },
    );
  }
}
