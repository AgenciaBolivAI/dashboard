/**
 * Founding Member lifetime access — a one-time $40 payment unlocks the platform
 * for life (no monthly fees). Usage stays pay-as-you-go credits on top.
 *
 * Mirrors the credit top-up flow (lib/billing/credits.ts): a Stripe Checkout in
 * `payment` mode, confirmed on return (/api/billing/lifetime/confirm) AND via
 * the Stripe webhook (idempotent). The grant_lifetime_access RPC assigns the
 * next founding-member number atomically.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe, getAppUrl } from "@/lib/stripe";

export const LIFETIME_PRICE_CENTS = 4000; // $40
export const FOUNDING_CAP = 5000;

/** How many tenants already hold lifetime access (for the "X of 5,000" copy). */
export async function getFoundingCount(): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("lifetime_access", true);
  return count ?? 0;
}

export async function createLifetimeCheckoutSession(input: {
  tenantId: string;
  tenantSlug: string;
  customerEmail?: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const base = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: LIFETIME_PRICE_CENTS,
          product_data: {
            name: "BolivAI — Founding Member (lifetime access)",
            description:
              "One-time payment. Lifetime access to the BolivAI platform, price locked in forever.",
          },
        },
      },
    ],
    metadata: {
      bolivai_purpose: "lifetime_access",
      bolivai_tenant_id: input.tenantId,
      bolivai_paid_cents: String(LIFETIME_PRICE_CENTS),
    },
    payment_intent_data: {
      metadata: { bolivai_purpose: "lifetime_access", bolivai_tenant_id: input.tenantId },
    },
    success_url: `${base}/api/billing/lifetime/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard/${input.tenantSlug}?lifetime=canceled`,
  });

  return { url: session.url!, sessionId: session.id };
}

/** Apply a paid lifetime checkout. Idempotent on the tenant already being granted. */
export async function grantLifetimeFromStripe(input: {
  tenantId: string;
  paidCents: number;
  stripePaymentIntentId: string;
}): Promise<{ ok: boolean; foundingNumber: number | null; wasAlready: boolean }> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("grant_lifetime_access", {
    p_tenant_id: input.tenantId,
    p_paid_cents: input.paidCents,
    p_stripe_pi: input.stripePaymentIntentId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean;
    founding_number: number | null;
    was_already: boolean;
  } | null;
  return {
    ok: row?.ok ?? false,
    foundingNumber: row?.founding_number ?? null,
    wasAlready: row?.was_already ?? false,
  };
}
