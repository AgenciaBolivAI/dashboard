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
export const FOUNDING_CAP = 10000;

/** The fee a tenant actually pays after their admin-set per-tenant discount. */
export function effectiveLifetimeCents(discountPct: number): number {
  const pct = Math.min(100, Math.max(0, Math.round(discountPct || 0)));
  return Math.round((LIFETIME_PRICE_CENTS * (100 - pct)) / 100);
}

/** How many tenants already hold lifetime access (for the "X of 10,000" copy). */
export async function getFoundingCount(): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("lifetime_access", true);
  return count ?? 0;
}

/**
 * Build the Founding Member checkout for a tenant. Applies the tenant's
 * per-tenant discount to the line-item amount, and optionally pre-applies a
 * resolved Stripe promotion code. Returns `{ free: true }` when the effective
 * price is $0 (100% discount) so the caller grants directly without a $0 Stripe
 * round-trip. A promotion code and the in-checkout code field are mutually
 * exclusive in Stripe, so we set one or the other.
 */
export type FoundingMember = {
  tenantId: string;
  name: string;
  slug: string;
  foundingNumber: number | null;
  code: string | null;
  paidCents: number | null;
  grantedAt: string | null;
};

/** Every tenant holding lifetime access, newest first — for the founders/usage report. */
export async function getFoundingMembers(): Promise<FoundingMember[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("tenants")
    .select(
      "id, name, slug, founding_member_number, lifetime_code, lifetime_paid_cents, lifetime_access_at",
    )
    .eq("lifetime_access", true)
    .order("lifetime_access_at", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    founding_member_number: number | null;
    lifetime_code: string | null;
    lifetime_paid_cents: number | null;
    lifetime_access_at: string | null;
  }>;
  return rows.map((t) => ({
    tenantId: t.id,
    name: t.name,
    slug: t.slug,
    foundingNumber: t.founding_member_number,
    code: t.lifetime_code,
    paidCents: t.lifetime_paid_cents,
    grantedAt: t.lifetime_access_at,
  }));
}

export async function createLifetimeCheckoutSession(input: {
  tenantId: string;
  tenantSlug: string;
  customerEmail?: string;
  discountPct?: number;
  promotionCodeId?: string | null;
  codeLabel?: string | null; // the user-entered code string, for usage reporting
}): Promise<{ url?: string; sessionId?: string; free?: boolean }> {
  const effective = effectiveLifetimeCents(input.discountPct ?? 0);
  if (effective <= 0) return { free: true };

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
          unit_amount: effective,
          product_data: {
            name: "BolivAI — Founding Member (lifetime access)",
            description:
              "One-time payment. Lifetime access to the BolivAI platform, price locked in forever.",
          },
        },
      },
    ],
    // A resolved promo code is pre-applied; otherwise let the user enter one on
    // Stripe's page (the two options can't be combined).
    ...(input.promotionCodeId
      ? { discounts: [{ promotion_code: input.promotionCodeId }] }
      : { allow_promotion_codes: true }),
    metadata: {
      bolivai_purpose: "lifetime_access",
      bolivai_tenant_id: input.tenantId,
      bolivai_paid_cents: String(effective),
      ...(input.codeLabel ? { bolivai_code: input.codeLabel.trim().toUpperCase() } : {}),
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
  code?: string | null; // redeemed discount code, for the usage report
}): Promise<{ ok: boolean; foundingNumber: number | null; wasAlready: boolean }> {
  const svc = createServiceClient();
  // Read the PI currently on record so we can tell an idempotent re-process of
  // the SAME payment (webhook + confirm-route) from a genuinely SECOND, distinct
  // payment (the founders fee charged twice on a checkout race).
  const { data: priorRow } = await svc
    .from("tenants")
    .select("lifetime_stripe_pi")
    .eq("id", input.tenantId)
    .maybeSingle();
  const priorPi = (priorRow as { lifetime_stripe_pi: string | null } | null)?.lifetime_stripe_pi ?? null;

  const { data, error } = await svc.rpc("grant_lifetime_access", {
    p_tenant_id: input.tenantId,
    p_paid_cents: input.paidCents,
    p_stripe_pi: input.stripePaymentIntentId,
  });
  if (error) throw new Error(error.message);
  // Attribute the redemption to the code used (best-effort, non-fatal).
  if (input.code) {
    await svc
      .from("tenants")
      .update({ lifetime_code: input.code })
      .eq("id", input.tenantId)
      .then(undefined, () => {});
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    ok: boolean;
    founding_number: number | null;
    was_already: boolean;
  } | null;
  const wasAlready = row?.was_already ?? false;

  // Duplicate-payment guard: the tenant ALREADY had lifetime access and this is
  // a DIFFERENT, real payment intent → the $40 founders fee was charged twice
  // (two checkout sessions paid before either confirmed). Refund this second
  // charge. Lifetime charges the PLATFORM account, so refund on the platform
  // client (no connected-account option). Same-PI re-processing is left alone.
  if (
    wasAlready &&
    input.paidCents > 0 &&
    input.stripePaymentIntentId &&
    input.stripePaymentIntentId !== priorPi
  ) {
    try {
      await getStripe().refunds.create({ payment_intent: input.stripePaymentIntentId });
    } catch {
      /* best-effort — a failed auto-refund still leaves the (idempotent) grant intact */
    }
  }

  return {
    ok: row?.ok ?? false,
    foundingNumber: row?.founding_number ?? null,
    wasAlready,
  };
}
