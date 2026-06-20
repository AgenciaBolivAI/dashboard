import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getAppUrl } from "@/lib/stripe";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { grantLifetimeFromStripe, LIFETIME_PRICE_CENTS } from "@/lib/billing/lifetime";

export const runtime = "nodejs";

/**
 * Stripe success_url lands here after the Founding Member checkout. We verify
 * the session is paid + for this purpose, grant lifetime access immediately
 * (so the dashboard unlocks without waiting for the webhook — the webhook also
 * grants, idempotently), then send the user to their dashboard.
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
    return NextResponse.redirect(`${base}/dashboard?lifetime=error`);
  }

  const tenantId = session.metadata?.bolivai_tenant_id;
  // A 100%-off code makes amount_total $0; Stripe marks those
  // `no_payment_required` (not `paid`) — both mean the session is settled.
  const settled =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (session.metadata?.bolivai_purpose !== "lifetime_access" || !tenantId || !settled) {
    return NextResponse.redirect(`${base}/dashboard?lifetime=pending`);
  }

  const svc = createServiceClient();
  const { data: t } = await svc.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const slug = (t as { slug: string } | null)?.slug ?? "";

  const pi =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? sessionId;

  try {
    await grantLifetimeFromStripe({
      tenantId,
      paidCents: session.amount_total ?? LIFETIME_PRICE_CENTS,
      stripePaymentIntentId: pi,
    });
  } catch {
    // The webhook will retry — still send them in.
  }

  return NextResponse.redirect(`${base}/dashboard/${slug || ""}?lifetime=success`);
}
