import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

export default async function AdminUsagePage() {
  const svc = createServiceClient();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const periodStart = monthStart.toISOString().slice(0, 10);

  // Tenants + this-month usage in one shot
  const { data: tenants } = await svc
    .from("tenants")
    .select("id, slug, name, plan, status")
    .order("name");

  const ids = (tenants ?? []).map((t: { id: string }) => t.id);

  const { data: usage } = ids.length
    ? await svc
        .from("usage_metrics")
        .select("tenant_id, conversations_count, messages_count")
        .in("tenant_id", ids)
        .eq("period_start", periodStart)
    : { data: [] };

  const { data: convCounts } = ids.length
    ? await svc
        .from("conversations")
        .select("tenant_id")
        .in("tenant_id", ids)
        .gte("created_at", monthStart.toISOString())
    : { data: [] };

  const usageByTenant = new Map<
    string,
    { conversations: number; messages: number }
  >();
  for (const r of (usage ?? []) as Array<{
    tenant_id: string;
    conversations_count: number;
    messages_count: number;
  }>) {
    usageByTenant.set(r.tenant_id, {
      conversations: r.conversations_count ?? 0,
      messages: r.messages_count ?? 0,
    });
  }
  // Backfill conversations from raw count (the schema's bump trigger only
  // counts messages, not new conversations)
  const convoByTenant = new Map<string, number>();
  for (const r of (convCounts ?? []) as Array<{ tenant_id: string }>) {
    convoByTenant.set(r.tenant_id, (convoByTenant.get(r.tenant_id) ?? 0) + 1);
  }

  const totals = (tenants ?? []).reduce(
    (acc: { conversations: number; messages: number }, t: { id: string }) => {
      const u = usageByTenant.get(t.id) ?? { conversations: 0, messages: 0 };
      const c = convoByTenant.get(t.id) ?? 0;
      acc.conversations += c;
      acc.messages += u.messages;
      return acc;
    },
    { conversations: 0, messages: 0 },
  );

  const monthLabel = new Intl.DateTimeFormat("es", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          Uso por tenant
        </h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">
          {monthLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Stat label="Tenants activos" value={(tenants ?? []).filter((t: { status: string }) => t.status === "active").length} />
        <Stat label="Conversaciones (mes)" value={totals.conversations} />
        <Stat label="Mensajes (mes)" value={totals.messages} />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Conv. mes</TableHead>
              <TableHead className="text-right">Mensajes mes</TableHead>
              <TableHead className="w-48">% del cap</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tenants ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No hay tenants todavía.
                </TableCell>
              </TableRow>
            ) : (
              (tenants ?? []).map(
                (t: { id: string; slug: string; name: string; plan: string; status: string }) => {
                  const u = usageByTenant.get(t.id) ?? { conversations: 0, messages: 0 };
                  const conv = convoByTenant.get(t.id) ?? 0;
                  const plan = getPlan(t.plan);
                  const cap = plan.conversationsCap;
                  const pct = cap === -1 ? 0 : Math.min(100, Math.round((conv / cap) * 100));
                  const overCap = cap !== -1 && conv >= cap;

                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="font-medium hover:underline"
                        >
                          {t.name}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">
                          {t.slug}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{plan.name}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conv.toLocaleString("es")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {u.messages.toLocaleString("es")}
                      </TableCell>
                      <TableCell>
                        {cap === -1 ? (
                          <span className="text-xs text-muted-foreground">ilimitado</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div
                                className={cn(
                                  "h-full transition-all",
                                  overCap ? "bg-destructive" : pct > 80 ? "bg-yellow-500" : "bg-primary",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-xs tabular-nums w-10 text-right",
                                overCap && "text-destructive font-medium",
                              )}
                            >
                              {pct}%
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.status === "active" ? (
                          <Badge variant="success">Activo</Badge>
                        ) : t.status === "paused" ? (
                          <Badge variant="warning">Pausado</Badge>
                        ) : (
                          <Badge variant="muted">{t.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                },
              )
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold">
          {value.toLocaleString("es")}
        </p>
      </CardContent>
    </Card>
  );
}
