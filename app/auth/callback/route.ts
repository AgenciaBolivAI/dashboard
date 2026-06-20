import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TERMS_VERSION } from "@/lib/legal";

/**
 * OAuth + email-confirmation callback.
 * Supabase redirects users here with a `code` query param after social login
 * (Google/Facebook), email confirmation, or magic-link login. We exchange it
 * for a session, then route brand-new users (no tenant membership yet) to
 * /onboarding so they build their tenant — existing users go to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = await resolveDestination(next);
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}

/**
 * New OAuth users have no `dashboard_users` membership yet → send them to
 * /onboarding to create their tenant. Users with a membership (or BolivAI
 * staff) follow the requested `next`. Service client is fine here: the user
 * was just authenticated above and we only read their own rows.
 */
async function resolveDestination(next: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const svc = createServiceClient();
  const { count } = await svc
    .from("dashboard_users")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) > 0) return next;

  const { data: staff } = await svc
    .from("bolivai_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (staff) return next;

  // Brand-new social signup. The signup page shows a consent notice next to the
  // Google/Facebook buttons, so reaching here = acceptance. Record it (once) the
  // same way the password flow does, so consent is provable for every account.
  if (!user.user_metadata?.terms_accepted_at) {
    await svc.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      },
    });
  }

  return "/onboarding";
}
