import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * GET /api/stripe/connect/dashboard?tenant_id=<uuid>
 *
 * Mints a single-use **Express Dashboard** login link and redirects the tenant
 * there (balance, payouts, payout schedule, bank details, verification).
 *
 * Express connected accounts have NO standalone stripe.com login — sending the
 * tenant to dashboard.stripe.com just lands them on a generic login they can't
 * use. The platform must generate the link via accounts.createLoginLink, which
 * only works once onboarding is complete.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: "tenant_id inválido" }, { status: 400 });
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tRow } = await supabase
    .from("tenants")
    .select("stripe_account_id, slug")
    .eq("id", tenantId)
    .maybeSingle();
  const tenant = tRow as { stripe_account_id: string | null; slug: string | null } | null;
  const slug = tenant?.slug ?? "";

  if (!tenant?.stripe_account_id) {
    return errorRedirect("No hay una cuenta de Stripe conectada.", slug);
  }

  try {
    const stripe = getStripe();
    const link = await stripe.accounts.createLoginLink(tenant.stripe_account_id);
    return NextResponse.redirect(link.url, { status: 303 });
  } catch (e) {
    // Most common: account hasn't finished onboarding yet → send them back to
    // finish it instead of dead-ending on a Stripe error.
    const msg = e instanceof Error ? e.message : String(e);
    return errorRedirect(`No se pudo abrir el panel de Stripe: ${msg}`, slug);
  }
}

function errorRedirect(message: string, slug = ""): NextResponse {
  const dest = new URL(`${getAppUrl()}/dashboard/${slug}/settings/billing`);
  dest.searchParams.set("stripe_error", message.slice(0, 300));
  return NextResponse.redirect(dest.toString());
}
