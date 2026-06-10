import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Users,
  AlertTriangle,
  Activity,
} from "lucide-react";
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
  getPlatformPnl,
  getPlatformDailyTimeseries,
  getTenantPnlSummary,
  getActionBreakdown,
  fmtUsd,
  fmtCents,
  fmtCredits,
  type PnlWindow,
} from "@/lib/queries/admin-pnl";
import { Sparkline } from "@/components/admin/sparkline";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOWS: { id: PnlWindow; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "all", label: "Total" },
];

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const { window: windowParam } = await searchParams;
  const windowKey: PnlWindow =
    (WINDOWS.find((w) => w.id === windowParam)?.id ?? "month");

  const [pnl, timeseries, topTenants, actions] = await Promise.all([
    getPlatformPnl(windowKey),
    getPlatformDailyTimeseries(30),
    getTenantPnlSummary(windowKey),
    getActionBreakdown(windowKey),
  ]);

  const dailyRevenue = timeseries.map((d) => d.revenue_cents);
  const dailyCost = timeseries.map((d) => d.cost_micros / 1_000_000);
  const dailyMargin = timeseries.map((d) => d.margin_micros / 1_000_000);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Resumen de plataforma
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ingresos, uso, costos de API y margen de toda la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => {
            const active = w.id === windowKey;
            return (
              <Link
                key={w.id}
                href={`/admin/overview?window=${w.id}`}
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

      {/* KPI Cards — 3 rows of context */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={DollarSign}
          label="Ingresos"
          value={fmtCents(pnl?.topup_cents ?? 0)}
          subtitle="Recargas de tenants"
          color="text-green-600"
        />
        <KpiCard
          icon={TrendingDown}
          label="Costos API"
          value={fmtUsd(pnl?.cost_micros ?? 0)}
          subtitle="OpenAI · ElevenLabs · Twilio · Apollo · Instantly"
          color="text-amber-600"
        />
        <KpiCard
          icon={PiggyBank}
          label="Margen bruto"
          value={fmtUsd(pnl?.margin_micros ?? 0)}
          subtitle={pnl?.margin_pct != null ? `${pnl.margin_pct}% margen` : "—"}
          color="text-primary"
        />
        <KpiCard
          icon={TrendingUp}
          label="Uso (créditos)"
          value={fmtCredits(pnl?.usage_credits ?? 0)}
          subtitle={`Valor = ${fmtCents((pnl?.usage_credits ?? 0))}`}
          color="text-purple-600"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard
          icon={Users}
          label="Tenants activos"
          value={String(pnl?.active_tenants ?? 0)}
          subtitle={`${pnl?.total_tenants ?? 0} en total`}
          color="text-cyan-600"
        />
        <KpiCard
          icon={Activity}
          label="Con saldo bajo"
          value={String(pnl?.tenants_low_balance ?? 0)}
          subtitle="Riesgo de pausa pronto"
          color="text-amber-600"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Sin créditos"
          value={String(pnl?.tenants_at_zero ?? 0)}
          subtitle="Agentes pausados"
          color="text-destructive"
        />
        <KpiCard
          icon={DollarSign}
          label="ARPU (mes)"
          value={
            (pnl?.active_tenants ?? 0) > 0
              ? fmtCents((pnl!.topup_cents ?? 0) / (pnl!.active_tenants || 1))
              : "—"
          }
          subtitle="Promedio por tenant activo"
          color="text-foreground"
        />
      </div>

      {/* Sparklines for last 30 days */}
      <Card className="p-5 mb-6">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Últimos 30 días
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SparkBlock
            label="Ingresos diarios"
            value={fmtCents(timeseries.reduce((a, d) => a + d.revenue_cents, 0))}
            points={dailyRevenue}
            color="text-green-600"
          />
          <SparkBlock
            label="Costo diario"
            value={fmtUsd(timeseries.reduce((a, d) => a + d.cost_micros, 0))}
            points={dailyCost}
            color="text-amber-600"
          />
          <SparkBlock
            label="Margen diario"
            value={fmtUsd(timeseries.reduce((a, d) => a + d.margin_micros, 0))}
            points={dailyMargin}
            color="text-primary"
          />
        </div>
      </Card>

      {/* Top tenants by margin */}
      <Card className="mb-6">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Tenants por margen</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordenados por margen bruto (ingresos − costos API)
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver todos →
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Ingreso</TableHead>
              <TableHead className="text-right">Uso</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topTenants.slice(0, 8).map((t) => (
              <TableRow key={t.tenant_id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <Link
                      href={`/admin/tenants/${t.tenant_id}`}
                      className="hover:underline"
                    >
                      /{t.slug}
                    </Link>
                    {" · "}
                    <Badge variant="outline" className="text-[10px] py-0">
                      {t.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmtCents(t.balance_credits)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-green-600">
                  {t.revenue_cents > 0 ? fmtCents(t.revenue_cents) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {t.usage_credits > 0 ? fmtCents(t.usage_credits) : "—"}
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
              </TableRow>
            ))}
            {topTenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Sin actividad en esta ventana
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Action breakdown */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Por tipo de acción</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dónde gana / pierde la plataforma por cada tipo de operación
            </p>
          </div>
          <Link
            href="/admin/usage"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Ver detalles →
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Acción</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Ingreso</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Tenants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.slice(0, 12).map((a) => (
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
                <TableCell className="text-right text-xs text-muted-foreground">
                  {a.unique_tenants}
                </TableCell>
              </TableRow>
            ))}
            {actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Sin uso en esta ventana
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("size-3.5", color)} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-display font-bold", color)}>{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </Card>
  );
}

function SparkBlock({
  label,
  value,
  points,
  color,
}: {
  label: string;
  value: string;
  points: number[];
  color: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-xl font-display font-bold mt-0.5", color)}>{value}</p>
      <div className={cn("mt-2", color)}>
        <Sparkline points={points} width={300} height={40} ariaLabel={label} />
      </div>
    </div>
  );
}
