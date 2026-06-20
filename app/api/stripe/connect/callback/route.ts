import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * GET /api/stripe/connect/callback?tenant_id=<uuid>
 *
 * The `return_url` of the onboarding Account Link. There is no OAuth `code` to
 * exchange anymore — the connected account already exists (created in /init).
 * We just re-read the account to mirror charges_enabled / payouts_enabled /
 * country, then send the tenant back to Settings → Facturación.
 *
 * Onboarding may still be "in review" here (charges_enabled = false); the
 * Stripe `account.updated` webhook keeps the flags fresh after the fact.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return errorRedirect("tenant_id inválido");
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
    return errorRedirect("No hay una cuenta de Stripe para conectar.", slug);
  }

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(tenant.stripe_account_id);
    const { error: dbError } = await supabase
      .from("tenants")
      .update({
        stripe_account_country: account.country ?? null,
        stripe_charges_enabled: account.charges_enabled ?? false,
        stripe_payouts_enabled: account.payouts_enabled ?? false,
        stripe_account_updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (dbError) {
      return errorRedirect(`No se pudo guardar la conexión: ${dbError.message}`, slug);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorRedirect(`No se pudo verificar la cuenta: ${msg}`, slug);
  }

  const dest = new URL(`${getAppUrl()}/dashboard/${slug}/settings/billing`);
  dest.searchParams.set("connected", "1");
  return NextResponse.redirect(dest.toString());
}

function errorRedirect(message: string, slug = ""): NextResponse {
  const dest = new URL(`${getAppUrl()}/dashboard/${slug}/settings/billing`);
  dest.searchParams.set("stripe_error", message.slice(0, 300));
  return NextResponse.redirect(dest.toString());
}
