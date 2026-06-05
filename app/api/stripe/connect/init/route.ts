import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { STRIPE_CONNECT_CLIENT_ID, getAppUrl } from "@/lib/stripe";

/**
 * GET /api/stripe/connect/init?tenant_id=<uuid>
 *
 * Starts the Stripe Connect Express OAuth flow. We generate a CSRF state
 * token, stash it in an httpOnly cookie + the URL, and 302 the tenant to
 * Stripe's authorization page. Stripe redirects back to /callback with
 * ?code + ?state which we verify against the cookie.
 */
export async function GET(req: NextRequest) {
  if (!STRIPE_CONNECT_CLIENT_ID) {
    return NextResponse.json(
      { error: "Stripe Connect no está configurado en el servidor" },
      { status: 500 },
    );
  }

  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: "tenant_id inválido" }, { status: 400 });
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const state = crypto.randomBytes(24).toString("hex");
  const cookieValue = `${tenantId}:${state}`;

  const cookieStore = await cookies();
  cookieStore.set("stripe_connect_state", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15, // 15 minutes is plenty
  });

  const redirectUri = `${getAppUrl()}/api/stripe/connect/callback`;
  const url = new URL("https://connect.stripe.com/express/oauth/authorize");
  url.searchParams.set("client_id", STRIPE_CONNECT_CLIENT_ID);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("suggested_capabilities[]", "transfers");

  return NextResponse.redirect(url.toString());
}
