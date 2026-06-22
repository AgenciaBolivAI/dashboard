/**
 * Seat-billing tick. An n8n cron POSTs here daily; each call charges every
 * tenant the monthly US$5/seat fee (= 500 credits) for seats beyond the 2
 * included, drawing from the prepaid credit balance. Idempotent per calendar
 * month: a seat already charged this month (at invite time or by an earlier
 * tick) is not billed again, so running daily is safe.
 *
 * Auth: Authorization: Bearer ${CCAVAI_WEBHOOK_SECRET} (shared internal secret).
 *
 * POST {}                       — bill all tenants
 * POST { "tenant_id": "..." }   — bill one tenant
 */
import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { runSeatBillingTick } from "@/lib/billing/seats";

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
    // empty body = bill all tenants
  }

  try {
    const summary = await runSeatBillingTick({ tenantId: body.tenant_id?.trim() || undefined });
    // Don't leak per-tenant detail in the response; the ledger is the record.
    return NextResponse.json({
      ok: true,
      tenants: summary.tenants,
      seats_charged: summary.seatsCharged,
      credits_debited: summary.creditsDebited,
      insufficient: summary.insufficient,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "tick failed" },
      { status: 500 },
    );
  }
}
