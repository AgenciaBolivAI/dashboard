import { NextResponse, type NextRequest } from "next/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/tenant";
import { signState, buildMetaAuthUrl } from "@/lib/meta";

/**
 * Start the self-serve "Connect Instagram & Messenger" flow. Admin-only.
 * Signs tenant context into the OAuth `state`, then redirects the tenant to
 * the Facebook Login dialog. They grant their Page(s) + linked IG; control
 * returns to /api/meta/callback.
 */
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get("tenant");
  if (!slug) return NextResponse.redirect(new URL("/dashboard", request.url));

  await requireUser();
  const tenant = await getTenantBySlug(slug);
  await requireTenantAccess(tenant.id, { minRole: "admin" });

  const state = signState({ tenant_id: tenant.id, tenant_slug: tenant.slug });
  return NextResponse.redirect(buildMetaAuthUrl(state));
}
