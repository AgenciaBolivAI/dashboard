import { NextResponse, type NextRequest } from "next/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import {
  exchangeCode,
  verifyState,
  decodeIdTokenEmail,
} from "@/lib/google";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Google redirects here after the user grants consent.
 * Validates state, exchanges code for tokens, persists into
 * tenant_integrations, then redirects back to the integrations page.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const base = process.env.NEXT_PUBLIC_APP_URL!;

  // Helper to build a redirect with an error or success flag
  function redirectTo(slug: string, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    return NextResponse.redirect(
      `${base}/dashboard/${slug}/settings/integrations?${qs}`,
    );
  }

  if (errorParam) {
    return NextResponse.redirect(`${base}/dashboard?google_error=${errorParam}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${base}/dashboard?google_error=missing_params`);
  }

  const verified = verifyState(state);
  if (!verified) {
    return NextResponse.redirect(`${base}/dashboard?google_error=invalid_state`);
  }

  // Re-confirm the user is still signed in and is an admin of this tenant
  await requireUser();
  await requireTenantAccess(verified.tenant_id, { minRole: "admin" });

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (e) {
    console.error("[google.callback] exchangeCode failed:", e);
    return redirectTo(verified.tenant_slug, { google_error: "exchange_failed" });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const grantedEmail = tokens.id_token ? decodeIdTokenEmail(tokens.id_token) : null;

  const svc = createServiceClient();
  const { error } = await svc.from("tenant_integrations").upsert(
    {
      tenant_id: verified.tenant_id,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      scope: tokens.scope,
      expires_at: expiresAt,
      metadata: {
        ...(grantedEmail ? { granted_email: grantedEmail } : {}),
      },
    },
    { onConflict: "tenant_id,provider" },
  );

  if (error) {
    console.error("[google.callback] upsert failed:", error);
    return redirectTo(verified.tenant_slug, { google_error: "save_failed" });
  }

  return redirectTo(verified.tenant_slug, { google: "connected" });
}
