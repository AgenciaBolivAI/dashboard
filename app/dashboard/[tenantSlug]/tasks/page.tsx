import Link from "next/link";
import { ListTodo } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { getUser } from "@/lib/auth";
import { listTasks, type TaskStatus } from "@/lib/queries/tasks";
import { loadTeam } from "@/lib/actions/team";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { Pagination } from "@/components/ui/pagination";
import { clampPageSize } from "@/lib/pagination";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string; q?: string; mine?: string; page?: string; pageSize?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status, q, mine, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("tasks");
  const user = await getUser();

  const pageSize = clampPageSize(Number(pageSizeParam) || undefined);
  const page = Math.max(1, Number(pageParam) || 1);
  const statusFilter = (status === "open" || status === "done" ? status : undefined) as
    | TaskStatus
    | undefined;
  const search = q?.trim() || undefined;

  const [{ rows: tasks, total }, team] = await Promise.all([
    listTasks(tenant.id, {
      status: statusFilter,
      assigneeUserId: mine === "1" && user ? user.id : undefined,
      search,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    loadTeam(tenant.id),
  ]);

  const members = team.members.map((m) => ({ user_id: m.user_id, email: m.email }));

  const FILTERS = [
    { id: "all", label: t("filter_all") },
    { id: "open", label: t("filter_open") },
    { id: "done", label: t("filter_done") },
  ];

  function hrefFor(next: { status?: string; mine?: string }): string {
    const sp = new URLSearchParams();
    const s = next.status ?? status;
    const m = next.mine ?? mine;
    if (s && s !== "all") sp.set("status", s);
    if (m === "1") sp.set("mine", "1");
    if (search) sp.set("q", search);
    const qs = sp.toString();
    return `/dashboard/${tenantSlug}/tasks${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <ListTodo className="size-7 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>

      <div className="mb-3">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <div className="mb-4 flex gap-1.5 flex-wrap items-center">
        {FILTERS.map((f) => {
          const active = (status ?? "all") === f.id;
          return (
            <Link
              key={f.id}
              href={hrefFor({ status: f.id })}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" />
        <Link
          href={hrefFor({ mine: mine === "1" ? undefined : "1" })}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition",
            mine === "1"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
          )}
        >
          {t("filter_mine")}
        </Link>
      </div>

      <TasksManager
        tenantId={tenant.id}
        tasks={tasks}
        members={members}
        currentUserId={user?.id ?? null}
      />

      {total > 0 ? <Pagination total={total} defaultPageSize={50} className="mt-4" /> : null}
    </div>
  );
}
