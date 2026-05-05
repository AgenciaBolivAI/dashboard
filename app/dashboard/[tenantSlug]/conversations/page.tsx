import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConversationStatusBadge } from "@/components/conversations/status-badge";
import { LiveListRefresher } from "@/components/conversations/live-list-refresher";
import { getTenantBySlug } from "@/lib/tenant";
import { listConversations } from "@/lib/queries/conversations";
import { formatRelative, cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "hitl", label: "Operador" },
  { id: "closed", label: "Cerradas" },
];

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

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <LiveListRefresher tenantId={tenant.id} />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Conversaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} {items.length === 1 ? "conversación" : "conversaciones"}
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
          <p className="font-medium">Sin conversaciones todavía</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cuando un cliente escriba a tu WhatsApp, aparecerá aquí.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Último mensaje</TableHead>
                <TableHead className="w-32">Estado</TableHead>
                <TableHead className="w-32">Hace</TableHead>
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
                        {c.user.name ?? "Sin nombre"}
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
                            {c.last_message.role === "user" ? "Cliente:" : "Bot:"}
                          </span>
                          {c.last_message.content}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Sin mensajes
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
