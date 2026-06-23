import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getAppUrl } from "@/lib/stripe";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { applyTopupFromStripe } from "@/lib/billing/credits";

export const runtime = "nodejs";

/**
 * Stripe success_url lands here after a credit top-up checkout. We verify the
 * session is paid + for this purpose, then apply the credits IMMEDIATELY
 * (idempotent on the payment intent — the webhook also applies). This is the
 * safety net that makes a paid top-up impossible to lose: top-ups are a charge
 * on the PLATFORM account, whose `checkout.session.completed` does not arrive at
 * a Connect-scoped webhook, so without this fallback the credits never land
 * (the symptom that lost a customer's $50). Mirrors the lifetime confirm route.
 */
export async function GET(req: NextRequest) {
  const base = getAppUrl();
  const sessionId = new URL(req.url).searchParams.get("session_id");
  await requireUser();
  if (!sessionId) return NextResponse.redirect(`${base}/dashboard`);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.redirect(`${base}/dashboard`);
  }

  const tenantId = session.metadata?.bolivai_tenant_id;
  if (session.metadata?.bolivai_purpose !== "credit_topup" || !tenantId) {
    return NextResponse.redirect(`${base}/dashboard`);
  }

  // The session names the tenant being credited — the signed-in user must
  // belong to it, so a replayed session_id can't drive an apply for a tenant
  // they're not a member of. (It's idempotent on the PI regardless.)
  await requireTenantAccess(tenantId);

  const svc = createServiceClient();
  const { data: t } = await svc.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const slug = (t as { slug: string } | null)?.slug ?? "";

  const paidCents = parseInt(session.metadata?.bolivai_paid_cents ?? "0", 10);
  const bonus = parseInt(session.metadata?.bolivai_bonus_credits ?? "0", 10);
  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Only apply once Stripe confirms the money settled.
  if (session.payment_status === "paid" && pi && paidCents > 0) {
    try {
      await applyTopupFromStripe({
        tenantId,
        paidCents,
        bonusCredits: bonus,
        stripePaymentIntentId: pi,
        stripeCheckoutSessionId: session.id,
      });
    } catch {
      // The webhook will retry — still send them to billing.
    }
    return NextResponse.redirect(`${base}/dashboard/${slug}/billing?topup=success`);
  }

  // Not settled yet on redirect (rare) — show pending; the webhook catches up.
  return NextResponse.redirect(`${base}/dashboard/${slug}/billing?topup=pending`);
}
