import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  verifyState,
  exchangeCode,
  getLongLivedUserToken,
  listPages,
  subscribePageToApp,
} from "@/lib/meta";

/**
 * Facebook Login callback. Verifies state, exchanges the code for a long-lived
 * user token, then for every Page the tenant granted: subscribes it to our
 * webhook and registers a `facebook_messenger` channel (+ an `instagram`
 * channel when a Professional IG account is linked). Page tokens are stored in
 * tenant_channels.config (RLS-protected, service-role only).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");

  const payload = state ? verifyState(state) : null;
  const back = (q: string) =>
    NextResponse.redirect(
      `${origin}/dashboard/${payload?.tenant_slug ?? ""}/settings/integrations?${q}`,
    );

  if (err) return back("meta=denied");
  if (!code || !payload) return NextResponse.redirect(`${origin}/dashboard?error=meta_state`);

  // The signed state proves the OAuth flow originated here, but not WHO is
  // completing it. Re-confirm the caller is still signed in and is an admin of
  // the tenant named in the state before attaching any channels (mirrors the
  // Google callback). Both helpers redirect on failure.
  await requireUser();
  await requireTenantAccess(payload.tenant_id, { minRole: "admin" });

  try {
    const shortToken = await exchangeCode(code);
    const userToken = await getLongLivedUserToken(shortToken).catch(() => shortToken);
    const pages = await listPages(userToken);

    if (pages.length === 0) return back("meta=no_pages");

    const svc = createServiceClient() as unknown as SupabaseClient;
    let connected = 0;
    let skipped = 0;

    // A (channel, external_id) is unique platform-wide. If that page/IG id is
    // already owned by a DIFFERENT tenant, refuse — never let one tenant's
    // connect flow reassign (and capture inbound routing for) another's channel.
    const ownedByOther = async (channel: string, externalId: string): Promise<boolean> => {
      const { data } = await svc
        .from("tenant_channels")
        .select("tenant_id")
        .eq("channel", channel)
        .eq("external_id", externalId)
        .maybeSingle();
      return !!data && (data as { tenant_id: string }).tenant_id !== payload.tenant_id;
    };

    for (const page of pages) {
      if (await ownedByOther("facebook_messenger", page.id)) {
        skipped++;
        continue;
      }

      try {
        await subscribePageToApp(page.id, page.access_token);
      } catch {
        // If subscribe fails (e.g. permissions still pending review) we still
        // store the channel so it activates once the app is approved.
      }

      await svc.from("tenant_channels").upsert(
        {
          tenant_id: payload.tenant_id,
          channel: "facebook_messenger",
          external_id: page.id,
          status: "active",
          config: {
            page_id: page.id,
            page_name: page.name,
            page_access_token: page.access_token,
          },
        },
        { onConflict: "channel,external_id" },
      );
      connected++;

      const ig = page.instagram_business_account;
      if (ig?.id && !(await ownedByOther("instagram", ig.id))) {
        await svc.from("tenant_channels").upsert(
          {
            tenant_id: payload.tenant_id,
            channel: "instagram",
            external_id: ig.id,
            status: "active",
            config: {
              ig_id: ig.id,
              ig_username: ig.username ?? null,
              page_id: page.id,
              page_access_token: page.access_token,
            },
          },
          { onConflict: "channel,external_id" },
        );
        connected++;
      }
    }

    return back(`meta=connected&count=${connected}${skipped ? `&skipped=${skipped}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "meta_error";
    return back(`meta=error&detail=${encodeURIComponent(msg.slice(0, 120))}`);
  }
}
