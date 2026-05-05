import { NextResponse, type NextRequest } from "next/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { buildAuthUrl, signState } from "@/lib/google";

/**
 * Initiates the Google OAuth flow for a tenant.
 * Caller: a logged-in admin clicking "Connect Google" in Settings →
 * Integraciones. We sign tenant_id into the state param so the callback
 * knows which tenant to attach the tokens to.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant_id");
  const tenantSlug = url.searchParams.get("tenant_slug");

  if (!tenantId || !tenantSlug) {
    return NextResponse.json(
      { error: "tenant_id and tenant_slug are required" },
      { status: 400 },
    );
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${tenantSlug}/settings/integrations?google_error=not_configured`,
    );
  }

  const state = signState({ tenant_id: tenantId, tenant_slug: tenantSlug });
  return NextResponse.redirect(buildAuthUrl(state));
}
