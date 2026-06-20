"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import {
  createLifetimeCheckoutSession,
  effectiveLifetimeCents,
  grantLifetimeFromStripe,
} from "@/lib/billing/lifetime";
import { resolvePromotionCode } from "@/lib/billing/lifetime-codes";

/**
 * Start the Founding Member checkout. Owner/admin only. Honors the tenant's
 * admin-set per-tenant discount (100% → granted directly, no Stripe) and an
 * optional discount code (resolved to a Stripe promotion code, pre-applied).
 * Redirects the browser to Stripe; on return, /api/billing/lifetime/confirm
 * grants access.
 */
export async function startLifetimeCheckoutAction(
  tenantSlug: string,
  code?: string,
): Promise<{ error: string }> {
  const user = await requireUser();
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id, { minRole: "admin" });

  if (tenant.lifetime_access) redirect(`/dashboard/${tenantSlug}`);

  const discountPct = tenant.lifetime_discount_pct ?? 0;

  // A 100% per-tenant discount means no payment is due — grant directly.
  if (effectiveLifetimeCents(discountPct) <= 0) {
    await grantLifetimeFromStripe({
      tenantId: tenant.id,
      paidCents: 0,
      stripePaymentIntentId: "admin_discount_100",
    });
    revalidatePath("/dashboard", "layout");
    redirect(`/dashboard/${tenantSlug}?lifetime=success`);
  }

  // Optional code → resolve to a Stripe promotion code (pre-applied at checkout).
  let promotionCodeId: string | null = null;
  if (code && code.trim()) {
    const resolved = await resolvePromotionCode(code);
    if (!resolved) return { error: "invalid_code" };
    promotionCodeId = resolved.id;
  }

  const res = await createLifetimeCheckoutSession({
    tenantId: tenant.id,
    tenantSlug,
    customerEmail: user.email ?? undefined,
    discountPct,
    promotionCodeId,
    codeLabel: code?.trim() || null,
  });
  if (!res.url) return { error: "error" };
  redirect(res.url);
}
