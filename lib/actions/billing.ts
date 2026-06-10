"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import {
  createTopupCheckoutSession,
  MIN_TOPUP_CENTS,
  MAX_TOPUP_CENTS,
} from "@/lib/billing/credits";

export type BillingState = {
  error: string | null;
  success?: boolean;
};

const businessProfileSchema = z.object({
  tenant_id: z.string().uuid(),
  legal_name: z.string().trim().max(200).optional().transform((v) => v || null),
  tax_id: z.string().trim().max(50).optional().transform((v) => v || null),
  address_line1: z.string().trim().max(200).optional().transform((v) => v || null),
  address_line2: z.string().trim().max(200).optional().transform((v) => v || null),
  address_city: z.string().trim().max(100).optional().transform((v) => v || null),
  address_state: z.string().trim().max(100).optional().transform((v) => v || null),
  address_postal_code: z.string().trim().max(20).optional().transform((v) => v || null),
  address_country: z
    .string()
    .trim()
    .length(2, "Usa el código ISO de 2 letras (ej. US, MX, ES)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v.toUpperCase() : null)),
  invoice_footer: z.string().trim().max(1000).optional().transform((v) => v || null),
  invoice_default_currency: z
    .string()
    .trim()
    .length(3)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : "USD")),
});

export async function updateBusinessProfileAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const parsed = businessProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  await requireUser();
  await requireTenantAccess(data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      legal_name: data.legal_name,
      tax_id: data.tax_id,
      address_line1: data.address_line1,
      address_line2: data.address_line2,
      address_city: data.address_city,
      address_state: data.address_state,
      address_postal_code: data.address_postal_code,
      address_country: data.address_country,
      invoice_footer: data.invoice_footer,
      invoice_default_currency: data.invoice_default_currency,
    })
    .eq("id", data.tenant_id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ── Credit top-ups ────────────────────────────────────────────────────

const topupSchema = z.object({
  cents: z.coerce
    .number()
    .int()
    .min(MIN_TOPUP_CENTS, `Mínimo $${MIN_TOPUP_CENTS / 100}`)
    .max(MAX_TOPUP_CENTS, `Máximo $${MAX_TOPUP_CENTS / 100} por transacción`),
});

/**
 * Server action: open a Stripe Checkout session for a credit top-up.
 * The client redirects to the returned URL; on payment success the
 * Stripe webhook calls credit_topup() RPC + the user lands back on
 * /billing?topup=success.
 */
export async function startTopupAction(
  tenantId: string,
  tenantSlug: string,
  cents: number,
): Promise<{ error: string | null; url?: string | null }> {
  const parsed = topupSchema.safeParse({ cents });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Monto inválido" };
  }

  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  try {
    const { url } = await createTopupCheckoutSession({
      tenantId,
      paidCents: parsed.data.cents,
      customerEmail: user.email ?? undefined,
      tenantSlug,
    });
    return { error: null, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo crear la sesión de pago";
    return { error: msg };
  }
}

/**
 * Disconnect a tenant's Stripe Connect account. Doesn't delete the
 * Stripe account itself (that requires going to Stripe directly) — just
 * forgets the linkage on our side so the tenant can reconnect.
 */
export async function disconnectStripeAction(
  tenantId: string,
): Promise<BillingState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();

  // Pull current acct_id so we can attempt to revoke the OAuth grant.
  const { data: row } = await supabase
    .from("tenants")
    .select("stripe_account_id")
    .eq("id", tenantId)
    .maybeSingle();

  const stripeAccountId = (row as { stripe_account_id?: string } | null)?.stripe_account_id;
  if (stripeAccountId) {
    try {
      const stripe = getStripe();
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
        stripe_user_id: stripeAccountId,
      });
    } catch {
      // Soft-fail: even if Stripe rejects (already deauthorized, etc), clear locally.
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      stripe_account_id: null,
      stripe_account_country: null,
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_account_updated_at: null,
    })
    .eq("id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
