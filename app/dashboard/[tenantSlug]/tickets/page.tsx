import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { listTickets, type TicketStatus, type TicketPriority } from "@/lib/queries/tickets";
import { loadTeam } from "@/lib/actions/team";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { Pagination } from "@/components/ui/pagination";
import { clampPageSize } from "@/lib/pagination";
import { Card } from "@/components/ui/card";
import { TicketsTable } from "@/components/tickets/tickets-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    status?: string;
    priority?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { tenantSlug } = await params;
  const { status, priority, q, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  await requirePermission(tenant.id, "tickets", "read");
  const t = await getTranslations("tickets");

  const pageSize = clampPageSize(Number(pageSizeParam) || undefined);
  const page = Math.max(1, Number(pageParam) || 1);
  const statusFilter = (
    ["open", "in_progress", "waiting", "resolved", "closed"].includes(status ?? "") ? status : undefined
  ) as TicketStatus | undefined;
  const priorityFilter = (
    ["low", "medium", "high", "urgent"].includes(priority ?? "") ? priority : undefined
  ) as TicketPriority | undefined;
  const search = q?.trim() || undefined;

  const [{ rows: tickets, total }, team] = await Promise.all([
    listTickets(tenant.id, {
      status: statusFilter,
      priority: priorityFilter,
      search,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    }),
    loadTeam(tenant.id),
  ]);
  const members = team.members.map((m) => ({ user_id: m.user_id, email: m.email }));

  const STATUS_FILTERS = [
    { id: "all", label: t("filter_all") },
    { id: "open", label: t("status_open") },
    { id: "in_progress", label: t("status_in_progress") },
    { id: "waiting", label: t("status_waiting") },
    { id: "resolved", label: t("status_resolved") },
    { id: "closed", label: t("status_closed") },
  ];

  function hrefFor(next: { status?: string; priority?: string }): string {
    const sp = new URLSearchParams();
    const s = next.status ?? status;
    const p = next.priority ?? priority;
    if (s && s !== "all") sp.set("status", s);
    if (p && p !== "all") sp.set("priority", p);
    if (search) sp.set("q", search);
    const qs = sp.toString();
    return `/dashboard/${tenantSlug}/tickets${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <LifeBuoy className="size-7 text-primary" />
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
      </div>

      <div className="mb-3">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <div className="mb-4 flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
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
      </div>

      {tickets.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <LifeBuoy className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("empty_subtitle")}</p>
        </Card>
      ) : (
        <TicketsTable
          tenantId={tenant.id}
          tenantSlug={tenantSlug}
          tickets={tickets}
          members={members}
        />
      )}

      {total > 0 ? <Pagination total={total} defaultPageSize={50} className="mt-4" /> : null}
    </div>
  );
}
