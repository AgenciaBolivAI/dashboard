"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

// The `notifications` table post-dates the generated DB types; treat the
// client as untyped for these queries (same pattern as the meta webhook).
async function nClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/** Recent notifications + accurate unread count for the header bell. */
export async function getNotifications(
  tenantId: string,
): Promise<{ items: NotificationRow[]; unread: number }> {
  await requireUser();
  await requireTenantAccess(tenantId);
  const supabase = await nClient();

  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, href, meta, read_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("read_at", null),
  ]);

  return { items: (data ?? []) as NotificationRow[], unread: count ?? 0 };
}

export async function markNotificationRead(tenantId: string, id: string): Promise<void> {
  await requireUser();
  await requireTenantAccess(tenantId);
  const supabase = await nClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("read_at", null);
}

export async function markAllNotificationsRead(tenantId: string): Promise<void> {
  await requireUser();
  await requireTenantAccess(tenantId);
  const supabase = await nClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("read_at", null);
}
