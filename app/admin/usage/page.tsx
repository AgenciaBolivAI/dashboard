import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getActionBreakdown,
  getTenantPnlSummary,
  fmtUsd,
  fmtCents,
  fmtCredits,
  type PnlWindow,
} from "@/lib/queries/admin-pnl";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOWS: { id: PnlWindow; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "month", label: "Mes" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "all", label: "Total" },
];

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window: windowParam } = await searchParams;
  const windowKey: PnlWindow =
    (WINDOWS.find((w) => w.id === windowParam)?.id ?? "month");

  const [actions, tenants] = await Promise.all([
    getActionBreakdown(windowKey),
    getTenantPnlSummary(windowKey),
  ]);

  // Total margin across all actions for percentage share
  const totalMarginMicros = actions.reduce((a, x) => a + x.margin_micros, 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Uso & Costos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análisis detallado de qué acciones generan ingreso, qué nos cuestan,
            y qué tenants consumen más.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => {
            const active = w.id === windowKey;
            return (
              <Link
                key={w.id}
                href={`/admin/usage?window=${w.id}`}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {w.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Action breakdown — sortable, share-of-margin bar */}
      <Card className="mb-6">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Acciones por margen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ordenado por margen descendente. La barra visualiza el aporte al margen total.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Acción</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Ingreso</TableHead>
              <TableHead className="text-right">Costo API</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">Margen %</TableHead>
              <TableHead className="w-32">% del total</TableHead>
              <TableHead className="text-right">Tenants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  Sin uso registrado en esta ventana
                </TableCell>
              </TableRow>
            ) : (
              actions.map((a) => {
                const shareOfMargin = totalMarginMicros > 0 && a.margin_micros > 0
                  ? (a.margin_micros / totalMarginMicros) * 100
                  : 0;
                return (
                  <TableRow key={a.action_key}>
                    <TableCell className="font-mono text-xs">{a.action_key}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {a.units.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600">
                      {fmtCents(a.revenue_credits)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-600">
                      {fmtUsd(a.cost_micros)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm font-semibold",
                        a.margin_micros > 0 && "text-primary",
                        a.margin_micros < 0 && "text-destructive",
                      )}
                    >
                      {fmtUsd(a.margin_micros)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {a.margin_pct != null ? `${a.margin_pct}%` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${shareOfMargin.toFixed(1)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums w-10 text-right text-muted-foreground">
                          {shareOfMargin.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {a.unique_tenants}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Tenants — sorted by margin */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="font-semibold">Tenants por margen</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click en un tenant para ver detalle, ledger de transacciones e historial de recargas.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Ingreso</TableHead>
              <TableHead className="text-right">Uso</TableHead>
              <TableHead className="text-right">Costo API</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Última actividad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                  Sin tenants todavía
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
                <TableRow key={t.tenant_id}>
                  <TableCell>
                    <Link
                      href={`/admin/tenants/${t.tenant_id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">/{t.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtCents(t.balance_credits)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-600">
                    {t.revenue_cents > 0 ? fmtCents(t.revenue_cents) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {t.usage_credits > 0 ? fmtCredits(t.usage_credits) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-amber-600">
                    {t.cost_micros > 0 ? fmtUsd(t.cost_micros) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm font-semibold",
                      t.margin_micros > 0 && "text-primary",
                      t.margin_micros < 0 && "text-destructive",
                    )}
                  >
                    {t.margin_micros !== 0 ? fmtUsd(t.margin_micros) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {t.margin_pct != null ? `${t.margin_pct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {t.last_activity_at
                      ? new Date(t.last_activity_at).toLocaleString("es-BO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
