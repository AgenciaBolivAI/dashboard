import { createClient } from "@/lib/supabase/server";

/**
 * Aggregate counters used by the Overview KPI cards.
 * Counts are for the current calendar month in the tenant's timezone.
 */
export async function getTenantOverviewMetrics(tenantId: string) {
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const iso = monthStart.toISOString();

  const [convos, leads, reservations, usage] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", iso),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("created_at", iso),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "confirmed")
      .gte("start_at", iso),
    supabase
      .from("usage_metrics")
      .select("messages_count")
      .eq("tenant_id", tenantId)
      .eq("period_start", monthStart.toISOString().slice(0, 10))
      .maybeSingle(),
  ]);

  return {
    conversations: convos.count ?? 0,
    leads: leads.count ?? 0,
    reservations: reservations.count ?? 0,
    messages: (usage.data as { messages_count?: number } | null)?.messages_count ?? 0,
  };
}
