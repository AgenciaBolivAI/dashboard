import Link from "next/link";
import { ConversationRow } from "@/components/conversations/conversation-row";
import { getTranslations } from "next-intl/server";
import { MessagesSquare, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConversationStatusBadge } from "@/components/conversations/status-badge";
import { LiveListRefresher } from "@/components/conversations/live-list-refresher";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { Pagination } from "@/components/ui/pagination";
import { getTenantBySlug } from "@/lib/tenant";
import { listConversations, countConversations } from "@/lib/queries/conversations";
import { clampPageSize } from "@/lib/pagination";
import { formatRelative, cn } from "@/lib/utils";

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string; channel?: string; q?: string; page?: string; pageSize?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status, channel, q, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  const search = q?.trim() || undefined;
  const pageSize = clampPageSize(Number(pageSizeParam), 50);
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listConversations(tenant.id, { status, channel, search, limit: pageSize, offset }),
    countConversations(tenant.id, { status, channel, search }),
  ]);
  const t = await getTranslations("conversations");

  const FILTERS = [
    { id: "all", label: t("filter_all") },
    { id: "active", label: t("filter_active") },
    { id: "hitl", label: t("filter_hitl") },
    { id: "closed", label: t("filter_closed") },
  ];

  const CHANNEL_FILTERS = [
    { id: "all", label: t("channel_all") },
    { id: "whatsapp", label: t("channel_whatsapp") },
    { id: "instagram", label: t("channel_instagram") },
    { id: "facebook_messenger", label: t("channel_messenger") },
  ];

  // Build an href that flips one filter while preserving the other (status +
  // channel are orthogonal) and the active search. Changing a filter resets
  // pagination (we simply omit page).
  function buildHref(next: { status?: string; channel?: string }): string {
    const s = next.status ?? status;
    const c = next.channel ?? channel;
    const sp = new URLSearchParams();
    if (s && s !== "all") sp.set("status", s);
    if (c && c !== "all") sp.set("channel", c);
    if (search) sp.set("q", search);
    const qs = sp.toString();
    return `/dashboard/${tenantSlug}/conversations${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <LiveListRefresher tenantId={tenant.id} />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total === 1
              ? t("count_one", { count: total })
              : t("count_other", { count: total })}
          </p>
        </div>
        <Button asChild variant="outline">
          <a
            href={`/api/conversations/export?tenantSlug=${tenantSlug}${
              status && status !== "all" ? `&status=${status}` : ""
            }${channel && channel !== "all" ? `&channel=${channel}` : ""}${
              search ? `&q=${encodeURIComponent(search)}` : ""
            }`}
          >
            <Download className="size-4" />
            {t("export_csv")}
          </a>
        </Button>
      </div>

      <div className="mb-3">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <div className="mb-3 flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = (status ?? "all") === f.id;
          return (
            <Link
              key={f.id}
              href={buildHref({ status: f.id })}
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

      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">
          {t("channel_label")}
        </span>
        {CHANNEL_FILTERS.map((f) => {
          const active = (channel ?? "all") === f.id;
          return (
            <Link
              key={f.id}
              href={buildHref({ channel: f.id })}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition",
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

      {items.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <MessagesSquare className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("empty_description")}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col_customer")}</TableHead>
                  <TableHead>{t("col_last_message")}</TableHead>
                  <TableHead className="w-32">{t("col_status")}</TableHead>
                  <TableHead className="w-32">{t("col_ago")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <ConversationRow
                    key={c.id}
                    tenantSlug={tenantSlug}
                    item={c}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {total > 0 ? <Pagination total={total} defaultPageSize={50} className="mt-4" /> : null}
    </div>
  );
}
