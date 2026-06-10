/**
 * Credit-based usage billing — server-side helpers.
 *
 * The dashboard + agents talk to credits through this module so the
 * pricing/bonus tier logic lives in one place. The DB RPCs
 * (debit_credits, reserve_credits, release_credits, credit_topup,
 * tenant_balance) are the atomic source of truth.
 *
 * Bonus tier policy: every $ tier above $50 carries a percentage of free
 * bonus credits applied at top-up time. Cash booked = face value; bonus
 * credits come from gross margin. Tunable here without a code deploy
 * required elsewhere.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { getStripe, getAppUrl } from "@/lib/stripe";
import {
  MIN_TOPUP_CENTS,
  MAX_TOPUP_CENTS,
  TOPUP_PRESETS,
  calculateBonusCredits,
} from "./pricing";

// Re-export so existing imports from "@/lib/billing/credits" keep working,
// but client components should now prefer "@/lib/billing/pricing" directly.
export { MIN_TOPUP_CENTS, MAX_TOPUP_CENTS, TOPUP_PRESETS, calculateBonusCredits };

export type CreditBalance = {
  balance_credits: number;
  reserved_credits: number;
  available_credits: number;
  lifetime_topped_up_cents: number;
  lifetime_spent_credits: number;
  low_balance_threshold: number;
  out_of_credits_at: string | null;
  is_low: boolean;
  is_zero: boolean;
};

export type CreditTransaction = {
  id: string;
  tenant_id: string;
  type: "top_up" | "usage" | "reservation" | "release" | "refund" | "bonus" | "reversal" | "manual_adjust";
  credits_delta: number;
  balance_after: number;
  action_key: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Server-side: read a tenant's current balance snapshot via the RPC. */
export async function getBalance(tenantId: string): Promise<CreditBalance | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("tenant_balance", { p_tenant_id: tenantId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CreditBalance | null;
}

/** Service-role version for use in API routes (no user session). */
export async function getBalanceWithService(tenantId: string): Promise<CreditBalance | null> {
  const svc = createServiceClient();
  const { data } = await svc.rpc("tenant_balance", { p_tenant_id: tenantId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CreditBalance | null;
}

export async function listTransactions(
  tenantId: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_transactions")
    .select("id, tenant_id, type, credits_delta, balance_after, action_key, reference_id, metadata, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CreditTransaction[];
}

/**
 * Atomically debit credits for an action. Returns {ok:false} if the
 * tenant doesn't have enough — caller MUST refuse the action when false.
 *
 * Use the service client because agents (n8n, voice webhooks) call this
 * without a user session.
 */
export async function debitCredits(input: {
  tenantId: string;
  actionKey: string;
  units?: number;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  balance_after: number;
  credits_debited: number;
  reason: string | null;
}> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("debit_credits", {
    p_tenant_id: input.tenantId,
    p_action_key: input.actionKey,
    p_units: input.units ?? 1,
    p_reference_id: input.referenceId ?? undefined,
    p_metadata: (input.metadata ?? {}) as Record<string, never>,
  });
  if (error) {
    return { ok: false, balance_after: 0, credits_debited: 0, reason: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? { ok: false, balance_after: 0, credits_debited: 0, reason: "no row" }) as {
    ok: boolean;
    balance_after: number;
    credits_debited: number;
    reason: string | null;
  };
}

export async function reserveCredits(input: {
  tenantId: string;
  actionKey: string;
  units?: number;
  referenceId?: string;
}): Promise<{
  ok: boolean;
  reservation_id: string | null;
  balance_after: number;
  reserved_after: number;
  reason: string | null;
}> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("reserve_credits", {
    p_tenant_id: input.tenantId,
    p_action_key: input.actionKey,
    p_units: input.units ?? 1,
    p_reference_id: input.referenceId ?? undefined,
  });
  if (error) {
    return {
      ok: false,
      reservation_id: null,
      balance_after: 0,
      reserved_after: 0,
      reason: error.message,
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as {
    ok: boolean;
    reservation_id: string | null;
    balance_after: number;
    reserved_after: number;
    reason: string | null;
  };
}

export async function releaseCredits(input: {
  tenantId: string;
  reservationId: string;
  actionKey: string;
  units: number;
}): Promise<{
  ok: boolean;
  balance_after: number;
  credits_charged: number;
  reason: string | null;
}> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("release_credits", {
    p_tenant_id: input.tenantId,
    p_reservation_id: input.reservationId,
    p_action_key: input.actionKey,
    p_units: input.units,
  });
  if (error) {
    return { ok: false, balance_after: 0, credits_charged: 0, reason: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as {
    ok: boolean;
    balance_after: number;
    credits_charged: number;
    reason: string | null;
  };
}

/**
 * Create a Stripe Checkout session for a credit top-up. Dynamic prices
 * (no pre-created products needed). The webhook handler reads the
 * session metadata after payment to credit the tenant.
 */
export async function createTopupCheckoutSession(input: {
  tenantId: string;
  paidCents: number;
  customerEmail?: string;
  tenantSlug: string;
}): Promise<{ url: string; sessionId: string }> {
  if (input.paidCents < MIN_TOPUP_CENTS) {
    throw new Error(`Mínimo de recarga es $${MIN_TOPUP_CENTS / 100}`);
  }
  if (input.paidCents > MAX_TOPUP_CENTS) {
    throw new Error(`Máximo de recarga es $${MAX_TOPUP_CENTS / 100} por transacción`);
  }

  const bonus = calculateBonusCredits(input.paidCents);
  const stripe = getStripe();
  const base = getAppUrl();

  // Pre-provision the credit_accounts row + stripe_customer if missing so
  // the webhook always finds the tenant and we can attach the customer
  // for future auto-refill.
  const svc = createServiceClient();
  const { data: acct } = await svc
    .from("credit_accounts")
    .select("stripe_customer_id")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  let customerId = (acct as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId && input.customerEmail) {
    const cust = await stripe.customers.create({
      email: input.customerEmail,
      metadata: { tenant_id: input.tenantId, tenant_slug: input.tenantSlug },
    });
    customerId = cust.id;
    await svc
      .from("credit_accounts")
      .upsert(
        { tenant_id: input.tenantId, stripe_customer_id: customerId },
        { onConflict: "tenant_id" },
      );
  }

  const bonusLabel = bonus > 0 ? ` (+${bonus} créditos bono)` : "";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.paidCents,
          product_data: {
            name: `Recarga BolivAI — ${input.paidCents / 100} USD${bonusLabel}`,
            description:
              bonus > 0
                ? `${input.paidCents} créditos + ${bonus} bono = ${input.paidCents + bonus} créditos totales.`
                : `${input.paidCents} créditos.`,
          },
        },
      },
    ],
    metadata: {
      bolivai_purpose: "credit_topup",
      bolivai_tenant_id: input.tenantId,
      bolivai_tenant_slug: input.tenantSlug,
      bolivai_paid_cents: String(input.paidCents),
      bolivai_bonus_credits: String(bonus),
    },
    payment_intent_data: {
      metadata: {
        bolivai_purpose: "credit_topup",
        bolivai_tenant_id: input.tenantId,
        bolivai_paid_cents: String(input.paidCents),
        bolivai_bonus_credits: String(bonus),
      },
      // Save the card so we can offer auto-refill later
      setup_future_usage: customerId ? "off_session" : undefined,
    },
    success_url: `${base}/dashboard/${input.tenantSlug}/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/dashboard/${input.tenantSlug}/billing?topup=canceled`,
  });

  return { url: session.url!, sessionId: session.id };
}

/**
 * Apply a successful Stripe checkout to the tenant's balance. Idempotent
 * on the Stripe payment intent id. Called from the webhook handler.
 */
export async function applyTopupFromStripe(input: {
  tenantId: string;
  paidCents: number;
  bonusCredits: number;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId: string;
}): Promise<{ newBalance: number; creditsAdded: number; wasIdempotent: boolean }> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("credit_topup", {
    p_tenant_id: input.tenantId,
    p_paid_cents: input.paidCents,
    p_bonus_credits: input.bonusCredits,
    p_stripe_pi_id: input.stripePaymentIntentId,
    p_metadata: { stripe_checkout_session_id: input.stripeCheckoutSessionId },
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    newBalance: (row as { new_balance: number }).new_balance,
    creditsAdded: (row as { credits_added: number }).credits_added,
    wasIdempotent: (row as { was_idempotent: boolean }).was_idempotent,
  };
}
