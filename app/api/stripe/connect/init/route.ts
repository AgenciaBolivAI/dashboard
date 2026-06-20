import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe, getAppUrl, isConnectExpressSupported } from "@/lib/stripe";

/**
 * GET /api/stripe/connect/init?tenant_id=<uuid>
 *
 * Starts Stripe Connect onboarding via the **Accounts API + Account Links**
 * (hosted onboarding). The old Express *OAuth* flow
 * (connect.stripe.com/express/oauth/...) is gated by Stripe for new platforms
 * and returns "Cannot onboard via express oauth due to gated access" — this
 * replaces it.
 *
 * Flow: create (once) an Express connected account for the tenant, persist its
 * id, then create a short-lived account link and 303 the tenant to Stripe's
 * hosted onboarding. Stripe returns them to /callback (the link's return_url).
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: "tenant_id inválido" }, { status: 400 });
  }

  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tRow } = await supabase
    .from("tenants")
    .select("stripe_account_id, address_country, name, legal_name, slug")
    .eq("id", tenantId)
    .maybeSingle();
  const tenant = tRow as {
    stripe_account_id: string | null;
    address_country: string | null;
    name: string | null;
    legal_name: string | null;
    slug: string | null;
  } | null;
  const slug = tenant?.slug ?? "";

  try {
    const stripe = getStripe();
    let accountId = tenant?.stripe_account_id ?? null;

    // Create the connected account once, then reuse it on the account-link
    // refresh hop / repeat visits (never create duplicates).
    if (!accountId) {
      // Country is fixed at creation and can't change later, so only set it
      // when we have a Connect-supported code; otherwise let Stripe default to
      // the platform country and collect the rest during onboarding.
      const country =
        tenant?.address_country && isConnectExpressSupported(tenant.address_country)
          ? tenant.address_country.toUpperCase()
          : undefined;

      const account = await stripe.accounts.create({
        type: "express",
        ...(country ? { country } : {}),
        ...(user.email ? { email: user.email } : {}),
        // Direct charges on the connected account + a platform application fee
        // need both card_payments and transfers.
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { tenant_id: tenantId },
      });
      accountId = account.id;

      const { error: dbError } = await supabase
        .from("tenants")
        .update({
          stripe_account_id: account.id,
          stripe_account_country: account.country ?? null,
          stripe_charges_enabled: account.charges_enabled ?? false,
          stripe_payouts_enabled: account.payouts_enabled ?? false,
          stripe_account_updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
      if (dbError) throw new Error(`No se pudo guardar la cuenta: ${dbError.message}`);
    }

    const base = getAppUrl();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}/api/stripe/connect/init?tenant_id=${tenantId}`,
      return_url: `${base}/api/stripe/connect/callback?tenant_id=${tenantId}`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(link.url, { status: 303 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const dest = new URL(`${getAppUrl()}/dashboard/${slug}/settings/billing`);
    dest.searchParams.set("stripe_error", msg.slice(0, 300));
    return NextResponse.redirect(dest.toString(), { status: 303 });
  }
}
