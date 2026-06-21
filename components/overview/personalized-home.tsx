import Link from "next/link";
import { ListTodo, CalendarClock, Sparkles, ArrowRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyOpenTasks } from "@/lib/queries/tasks";
import { listRecommendations } from "@/lib/queries/ai-recommendations";
import { RecommendationCards } from "@/components/overview/recommendation-cards";
import { cn } from "@/lib/utils";

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-red-500",
};

async function getTodayReservations(tenantId: string) {
  const supabase = await createClient();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86400_000);
  const { data } = await supabase
    .from("reservations")
    .select("id, customer_name, start_at, status")
    .eq("tenant_id", tenantId)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .neq("status", "cancelled")
    .order("start_at", { ascending: true })
    .limit(6);
  return (data ?? []) as { id: string; customer_name: string | null; start_at: string; status: string }[];
}

/**
 * The per-user "Today" strip on top of the shared overview: My Tasks, Today's
 * Events, and the AI recommendation cards. This is the personalization layer
 * (each user sees their own tasks) above the unified team analytics below.
 */
export async function PersonalizedHome({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const t = await getTranslations("overview");
  const locale = await getLocale();
  const user = await getUser();

  const [myTasks, events, recs] = await Promise.all([
    user ? getMyOpenTasks(tenantId, user.id, 5) : Promise.resolve([]),
    getTodayReservations(tenantId),
    listRecommendations(tenantId, 4),
  ]);

  const base = `/dashboard/${tenantSlug}`;
  const timeFmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mb-6 space-y-3">
      {recs.length > 0 ? (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            {t("home_recommendations")}
          </h2>
          <RecommendationCards tenantId={tenantId} recommendations={recs} />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {/* My Tasks */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-display font-bold flex items-center gap-1.5">
                <ListTodo className="size-4 text-primary" />
                {t("home_my_tasks")}
              </h2>
              <Link href={`${base}/tasks`} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                {t("home_view_all")}
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">{t("home_no_tasks")}</p>
            ) : (
              <ul className="space-y-1.5">
                {myTasks.map((task) => {
                  const overdue = task.due_at && new Date(task.due_at) < new Date();
                  return (
                    <li key={task.id} className="flex items-center gap-2 text-sm">
                      <span className={cn("size-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.due_at ? (
                        <span className={cn("text-xs", overdue ? "text-red-600" : "text-muted-foreground")}>
                          {new Date(task.due_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Today's Events */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-display font-bold flex items-center gap-1.5">
                <CalendarClock className="size-4 text-primary" />
                {t("home_today_events")}
              </h2>
              <Link href={`${base}/calendar`} className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                {t("home_view_all")}
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">{t("home_no_events")}</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2 text-sm">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{timeFmt(ev.start_at)}</span>
                    <span className="flex-1 truncate">{ev.customer_name || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
