import { NextRequest, NextResponse } from "next/server";
import { TOOLS } from "@/lib/voice-tools";
import { debitCredits, refundCredits } from "@/lib/billing/credits";
import {
  computeTenantBearer,
  timingSafeEqualStr,
} from "@/lib/security/voice-bearer";

/**
 * Server Tool dispatcher for voice agents.
 *
 * URL: /api/voice/tool/{tool_name}?tenant={tenant_uuid}
 * Header: Authorization: Bearer <per-tenant HMAC bearer>
 * Body: tool-specific JSON (validated against the tool's Zod schema)
 *
 * Per-tenant agents bake the URL + bearer into their tools config at
 * creation time, so every inbound request already carries the tenant
 * scope. The route:
 *
 *  1. Resolves the tool from URL segment
 *  2. Extracts + validates the tenant query param (UUID shape)
 *  3. Verifies the bearer == HMAC-SHA256(tenant_id, VOICE_TOOL_SECRET).
 *     This makes each tenant's bearer uniquely derivable from the root
 *     secret. Compromise of one tenant's bearer ≠ compromise of others.
 *  4. (Legacy fallback) If the bearer matches the raw VOICE_TOOL_SECRET,
 *     also accepted — to allow rolling out without breaking existing
 *     ElevenLabs agents that haven't been re-synced yet. Logged as a
 *     deprecation so we can track + remove.
 *
 * Failures are returned as 200 + ok:false so the agent can speak the
 * user_facing_error naturally instead of receiving an opaque 4xx.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const tool = TOOLS[name];
  if (!tool) {
    return NextResponse.json(
      { ok: false, error: `unknown tool: ${name}` },
      { status: 404 },
    );
  }

  // Tenant first — its value gates the bearer verification
  const tenantId = req.nextUrl.searchParams.get("tenant");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json(
      { ok: false, error: "missing or invalid tenant query param" },
      { status: 400 },
    );
  }

  const rootSecret = process.env.VOICE_TOOL_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!rootSecret) {
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 500 });
  }

  // Primary check — per-tenant HMAC bearer
  const expectedTenantBearer = computeTenantBearer(tenantId, rootSecret);
  const isPerTenantBearer = timingSafeEqualStr(got, expectedTenantBearer);

  // Legacy fallback — raw VOICE_TOOL_SECRET (deprecated, log on use)
  const isLegacyBearer = !isPerTenantBearer && timingSafeEqualStr(got, rootSecret);

  if (!isPerTenantBearer && !isLegacyBearer) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (isLegacyBearer) {
    console.warn(
      `[voice tool ${name}] DEPRECATED: tenant=${tenantId} using legacy global bearer. Re-sync agent in ElevenLabs to use per-tenant HMAC bearer.`,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = tool.schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: `invalid arguments: ${issue?.message ?? "validation failed"}`,
        user_facing_error: "I had a problem with that. Let me try again.",
      },
      { status: 200 },
    );
  }

  // Credit gate — only for tools with a credit_action_key set. Free tools
  // (search_slots, get_business_info, lookup_customer_reservations,
  // capture_lead) skip this entirely. The actual voice MINUTE charge
  // is debited separately by the Rebecca/Sandra tick workflows.
  let creditsCharged = 0;
  const creditRef = `voice_tool:${name}:${Date.now()}`;
  if (tool.credit_action_key) {
    const debit = await debitCredits({
      tenantId,
      actionKey: tool.credit_action_key,
      units: tool.credit_units ?? 1,
      referenceId: creditRef,
      metadata: { tool: name },
    });
    if (!debit.ok) {
      console.warn(
        `[voice tool ${name}] credit gate refused tenant=${tenantId} reason=${debit.reason}`,
      );
      return NextResponse.json(
        {
          ok: false,
          error: debit.reason ?? "insufficient credits",
          user_facing_error:
            "I can't complete that booking right now — the business needs to top up. Let me take your details so they can follow up.",
        },
        { status: 200 },
      );
    }
    creditsCharged = debit.credits_debited;
  }

  // Refund the up-front charge when the action didn't actually happen — covers
  // BOTH a thrown handler AND a handler that returns { ok:false } on an expected
  // failure (slot taken, past time, no service). Otherwise the tenant loses
  // credits for a booking that never occurred.
  const refundCharge = async (reason: string) => {
    if (creditsCharged <= 0 || !tool.credit_action_key) return;
    await refundCredits({
      tenantId,
      credits: creditsCharged,
      actionKey: tool.credit_action_key,
      referenceId: `${creditRef}:refund`,
      metadata: { tool: name, reason },
    });
  };

  try {
    const result = await tool.handler(parsed.data, { tenantId });
    if (result && typeof result === "object" && (result as { ok?: unknown }).ok === false) {
      await refundCharge("handler_not_ok");
    }
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[voice tool ${name}] handler threw`, msg);
    await refundCharge("handler_error");
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        user_facing_error: "Something went wrong on our side. Please try again.",
      },
      { status: 200 },
    );
  }
}

