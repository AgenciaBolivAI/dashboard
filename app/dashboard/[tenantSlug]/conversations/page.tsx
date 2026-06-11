import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagesSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConversationStatusBadge } from "@/components/conversations/status-badge";
import { LiveListRefresher } from "@/components/conversations/live-list-refresher";
import { getTenantBySlug } from "@/lib/tenant";
import { listConversations } from "@/lib/queries/conversations";
import { formatRelative, cn } from "@/lib/utils";

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const items = await listConversations(tenant.id, { status, limit: 100 });
  const t = await getTranslations("conversations");

  const FILTERS = [
    { id: "all", label: t("filter_all") },
    { id: "active", label: t("filter_active") },
    { id: "hitl", label: t("filter_hitl") },
    { id: "closed", label: t("filter_closed") },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <LiveListRefresher tenantId={tenant.id} />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length === 1
              ? t("count_one", { count: items.length })
              : t("count_other", { count: items.length })}
          </p>
        </div>
      </div>

      <div className="mb-4 flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = (status ?? "all") === f.id;
          const href =
            f.id === "all"
              ? `/dashboard/${tenantSlug}/conversations`
              : `/dashboard/${tenantSlug}/conversations?status=${f.id}`;
          return (
            <Link
              key={f.id}
              href={href}
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
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/dashboard/${tenantSlug}/conversations/${c.id}`}
                      className="block"
                    >
                      <div className="font-medium">
                        {c.user.name ?? t("no_name")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        +{c.user.whatsapp_number}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/${tenantSlug}/conversations/${c.id}`}
                      className="block max-w-md"
                    >
                      {c.last_message ? (
                        <p className="truncate text-sm">
                          <span
                            className={cn(
                              "mr-1 text-[10px] uppercase tracking-wider font-bold",
                              c.last_message.role === "user"
                                ? "text-muted-foreground"
                                : "text-primary",
                            )}
                          >
                            {c.last_message.role === "user"
                              ? t("role_customer")
                              : t("role_bot")}
                          </span>
                          {c.last_message.content}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          {t("no_messages")}
                        </p>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConversationStatusBadge
                      status={c.status}
                      hitl={c.hitl_taken_over}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelative(c.last_message_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
