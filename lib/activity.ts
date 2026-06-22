import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Record a dashboard user's activity for today (UTC). One row per (user, day);
 * `last_seen_at` is bumped on every navigation, `hits` is left intact (we only
 * need distinct-users-per-day for DAU/WAU/MAU). Best-effort: this is called
 * from a layout render, so it must NEVER throw into the page — failures are
 * swallowed. Days are keyed in UTC to stay consistent with the read side.
 */
export async function recordActivity(
  userId: string,
  tenantId: string | null,
): Promise<void> {
  try {
    const now = new Date();
    const day = now.toISOString().slice(0, 10); // UTC date (YYYY-MM-DD)
    // user_activity isn't in the generated DB types yet — loosely-typed client.
    const svc = createServiceClient() as unknown as SupabaseClient;
    await svc.from("user_activity").upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        day,
        last_seen_at: now.toISOString(),
      },
      { onConflict: "user_id,day" },
    );
  } catch (e) {
    // Activity tracking must never break a page render — but log for observability
    // so a systemic failure (e.g. RLS regression) doesn't silently zero the metrics.
    console.warn("[activity] recordActivity failed", userId, e instanceof Error ? e.message : e);
  }
}
