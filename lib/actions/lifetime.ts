"use server";

import { redirect } from "next/navigation";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import { createLifetimeCheckoutSession } from "@/lib/billing/lifetime";

/**
 * Start the Founding Member checkout. Owner/admin only. Redirects the browser
 * to Stripe Checkout; on return, /api/billing/lifetime/confirm grants access.
 */
export async function startLifetimeCheckoutAction(
  tenantSlug: string,
): Promise<{ error: string }> {
  const user = await requireUser();
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id, { minRole: "admin" });

  if (tenant.lifetime_access) redirect(`/dashboard/${tenantSlug}`);

  const { url } = await createLifetimeCheckoutSession({
    tenantId: tenant.id,
    tenantSlug,
    customerEmail: user.email ?? undefined,
  });
  redirect(url);
}
