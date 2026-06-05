import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getStripe, getAppUrl } from "@/lib/stripe";

/**
 * GET /api/stripe/connect/callback?code=...&state=...
 *
 * Stripe redirects here after Express onboarding. We:
 *   1. Verify the state matches the cookie (CSRF guard)
 *   2. Exchange code -> stripe_user_id via oauth.token
 *   3. Fetch the Account so we can mirror charges_enabled / country / etc.
 *   4. Update the tenants row
 *   5. Redirect back to Settings -> Facturación with a success param
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const cookieStore = await cookies();
  const cookie = cookieStore.get("stripe_connect_state")?.value;
  cookieStore.delete("stripe_connect_state");

  if (!cookie) {
    return errorRedirect("Sesión expirada — vuelve a intentar.");
  }
  const [tenantId, expectedState] = cookie.split(":");
  if (!tenantId || !expectedState) {
    return errorRedirect("Estado inválido");
  }

  if (error) {
    return errorRedirect(`Stripe rechazó la conexión: ${error}`, tenantId);
  }
  if (!code || !state || state !== expectedState) {
    return errorRedirect("CSRF mismatch", tenantId);
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const stripe = getStripe();
  let stripeUserId: string;
  try {
    const token = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });
    if (!token.stripe_user_id) {
      return errorRedirect("Stripe no devolvió un account id", tenantId);
    }
    stripeUserId = token.stripe_user_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorRedirect(`oauth.token falló: ${msg}`, tenantId);
  }

  let account;
  try {
    account = await stripe.accounts.retrieve(stripeUserId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return errorRedirect(`accounts.retrieve falló: ${msg}`, tenantId);
  }

  const supabase = await createClient();
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
  if (dbError) {
    return errorRedirect(`No se pudo guardar la conexión: ${dbError.message}`, tenantId);
  }

  // Look up the slug so we can redirect to a friendly URL.
  const { data: slugRow } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = (slugRow as { slug?: string } | null)?.slug ?? "";

  const dest = new URL(`${getAppUrl()}/dashboard/${slug}/settings/billing`);
  dest.searchParams.set("connected", "1");
  return NextResponse.redirect(dest.toString());
}

function errorRedirect(message: string, tenantId?: string): NextResponse {
  const dest = new URL(`${getAppUrl()}/dashboard${tenantId ? "" : ""}`);
  // We don't know the slug from tenant_id alone without a DB hit, so we
  // fall back to a generic flash on the dashboard root.
  dest.pathname = tenantId ? "/dashboard" : "/dashboard";
  dest.searchParams.set("stripe_error", message);
  return NextResponse.redirect(dest.toString());
}
