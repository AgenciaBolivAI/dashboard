import { createClient } from "@/lib/supabase/server";
import { countMyOpenTasks } from "@/lib/queries/tasks";

/**
 * BOLIV's operating snapshot — the live numbers behind the proactive opening
 * ("Your agents handled 47 conversations overnight, 3 leads are waiting…").
 * Tenant-level for agent activity; user-level for "your" open tasks.
 */
export type BolivBriefing = {
  conversations24h: number;
  leadsWaiting: number;
  tasksDue: number;
  eventsToday: number;
  recommendations: number;
};

export async function getBolivBriefing(
  tenantId: string,
  userId: string | null,
): Promise<BolivBriefing> {
  const supabase = await createClient();
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86400_000);

  // "Your" tasks when a user is known; otherwise all open tenant tasks.
  const tasksPromise: PromiseLike<number> = userId
    ? countMyOpenTasks(tenantId, userId)
    : supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .then((r) => r.count ?? 0);

  const [convos, leads, events, recs, tasks] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("last_message_at", since24h),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "new"),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString()),
    supabase
      .from("ai_recommendations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "new"),
    tasksPromise,
  ]);

  return {
    conversations24h: convos.count ?? 0,
    leadsWaiting: leads.count ?? 0,
    eventsToday: events.count ?? 0,
    recommendations: recs.count ?? 0,
    tasksDue: tasks,
  };
}
