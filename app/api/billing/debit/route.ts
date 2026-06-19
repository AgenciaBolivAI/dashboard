/**
 * Credit debit endpoint — used by n8n workflows + any non-route caller
 * that can't import lib/billing/credits.ts directly.
 *
 * Three operations on this one route, selected by ?op=:
 *   POST /api/billing/debit?op=debit     atomic debit (default)
 *   POST /api/billing/debit?op=reserve   hold credits for in-flight job
 *   POST /api/billing/debit?op=release   settle a reservation
 *
 * Body (debit):
 *   { tenant_id, action_key, units?, reference_id?, metadata? }
 *
 * Body (reserve):
 *   { tenant_id, action_key, units?, reference_id? }
 *
 * Body (release):
 *   { tenant_id, reservation_id, action_key, units }
 *
 * Auth: Bearer token in Authorization header matching CCAVAI_WEBHOOK_SECRET
 * (reused — same internal-trust boundary). All callers are first-party
 * (n8n workflows, our own server routes); no public exposure intended.
 *
 * Always returns HTTP 200 with a JSON body so n8n's IF nodes can branch
 * on result.ok without dealing with HTTP-level errors. Auth failures are
 * the only exception (401).
 */
import { NextResponse } from "next/server";
import { debitCredits, reserveCredits, releaseCredits } from "@/lib/billing/credits";
import { checkBearer } from "@/lib/security/bearer";

export const runtime = "nodejs";

function unauthorized() {
  return new NextResponse("Unauthorized", { status: 401 });
}

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return unauthorized();
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 200 },
    );
  }

  const url = new URL(req.url);
  const op = url.searchParams.get("op") ?? "debit";

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, reason: "tenant_id is required" },
      { status: 200 },
    );
  }

  try {
    if (op === "debit") {
      const actionKey = typeof body.action_key === "string" ? body.action_key : null;
      if (!actionKey) {
        return NextResponse.json(
          { ok: false, reason: "action_key is required" },
          { status: 200 },
        );
      }
      const result = await debitCredits({
        tenantId,
        actionKey,
        units: typeof body.units === "number" ? body.units : 1,
        referenceId: typeof body.reference_id === "string" ? body.reference_id : null,
        metadata:
          body.metadata && typeof body.metadata === "object"
            ? (body.metadata as Record<string, unknown>)
            : {},
        // Optional: when n8n forwards the employee who triggered a dashboard
        // action, the spend is attributed + their budget is enforced as a
        // hard cap. Omitted for customer/agent-driven spend → tenant pool.
        actorUserId: typeof body.actor_user_id === "string" ? body.actor_user_id : null,
      });
      return NextResponse.json(result);
    }
    if (op === "reserve") {
      const actionKey = typeof body.action_key === "string" ? body.action_key : null;
      if (!actionKey) {
        return NextResponse.json(
          { ok: false, reason: "action_key is required" },
          { status: 200 },
        );
      }
      const result = await reserveCredits({
        tenantId,
        actionKey,
        units: typeof body.units === "number" ? body.units : 1,
        referenceId: typeof body.reference_id === "string" ? body.reference_id : undefined,
      });
      return NextResponse.json(result);
    }
    if (op === "release") {
      const reservationId = typeof body.reservation_id === "string" ? body.reservation_id : null;
      const actionKey = typeof body.action_key === "string" ? body.action_key : null;
      const units = typeof body.units === "number" ? body.units : null;
      if (!reservationId || !actionKey || !(units !== null && units > 0)) {
        return NextResponse.json(
          { ok: false, reason: "reservation_id, action_key, and units are required" },
          { status: 200 },
        );
      }
      const result = await releaseCredits({
        tenantId,
        reservationId,
        actionKey,
        units,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { ok: false, reason: `Unknown op: ${op}` },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    return NextResponse.json({ ok: false, reason: msg }, { status: 200 });
  }
}
