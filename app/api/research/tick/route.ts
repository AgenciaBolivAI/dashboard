/**
 * Prospect auto-research tick (Phase B). An n8n cron POSTs here on a schedule
 * (~3 min); each call researches a bounded batch of QUEUED prospect_research rows
 * (enqueued by the inbound lead hooks), enforcing the per-tenant daily cap +
 * balance gate. Idempotent: only queued rows are claimed (atomically), so a
 * re-run soon after is a near no-op.
 *
 * Auth: Authorization: Bearer ${CCAVAI_WEBHOOK_SECRET} (shared internal secret).
 *
 * POST {}                       — tick all tenants
 * POST { "tenant_id": "..." }   — tick one tenant
 */
import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { runResearchTick } from "@/lib/prospect/engine";

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
    const summary = await runResearchTick({ tenantId: body.tenant_id?.trim() || undefined });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 },
    );
  }
}
