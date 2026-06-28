import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type NotificationInput = {
  type?: string;
  title: string;
  body?: string | null;
  href?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Create a tenant notification from app-side code (service client → bypasses
 * RLS). Bookings are created by the `reservations` DB trigger; use this for
 * other app events (low credits, integration errors, etc.). Never throws —
 * a notification is a side effect and must not break the caller.
 */
export async function notifyTenant(tenantId: string, n: NotificationInput): Promise<void> {
  try {
    const svc = createServiceClient() as unknown as SupabaseClient;
    await svc.from("notifications").insert({
      tenant_id: tenantId,
      type: n.type ?? "system",
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
      meta: n.meta ?? {},
    } as never);
  } catch {
    /* swallow — best-effort */
  }
}
