import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Coins, DollarSign, TrendingDown, PiggyBank } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServiceClient } from "@/lib/supabase/service";
import { TenantAdminForm } from "@/components/admin/tenant-admin-form";
import { TenantDangerZone } from "@/components/admin/tenant-danger-zone";
import { EvolutionProvisioner } from "@/components/admin/evolution-provisioner";
import { Sparkline } from "@/components/admin/sparkline";
import { fmtUsd, fmtCents, fmtCredits, microsToDollars } from "@/lib/queries/admin-pnl";
import {
  getTenantActionBreakdown,
  getTenantRecentTransactions,
  getTenantTopups,
  getTenantDailyTimeseries,
} from "@/lib/queries/admin-tenant-pnl";
import { cn } from "@/lib/utils";

type AdminTenant = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  plan: string;
  status: string;
  workflow_template: string;
  gateway: string;
  gateway_config: Record<string, unknown>;
  language: string;
  timezone: string;
  custom_domain: string | null;
  created_at: string;
};

export default async function AdminTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const svc = createServiceClient();

  const { data: tenant } = await svc
    .from("tenants")
    .select(
      "id, slug, name, industry, plan, status, workflow_template, gateway, gateway_config, language, timezone, custom_domain, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!tenant) notFound();
  const t = tenant as AdminTenant;

  // Counts + P&L + timeseries — parallel for speed
  const [
    members,
    conversations,
    leads,
    services,
    creditAccount,
    actionBreakdown,
    recentTx,
    topups,
    timeseries,
  ] = await Promise.all([
    svc.from("dashboard_users").select("user_id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc
      .from("credit_accounts")
      .select("balance_credits, reserved_credits, lifetime_topped_up_cents, lifetime_spent_credits, low_balance_threshold, out_of_credits_at")
      .eq("tenant_id", t.id)
      .maybeSingle(),
    getTenantActionBreakdown(t.id, "30d"),
    getTenantRecentTransactions(t.id, 25),
    getTenantTopups(t.id, 10),
    getTenantDailyTimeseries(t.id, 30),
  ]);

  type CreditAcct = {
    balance_credits: number;
    reserved_credits: number;
    lifetime_topped_up_cents: number;
    lifetime_spent_credits: number;
    low_balance_threshold: number;
    out_of_credits_at: string | null;
  };
  const acct = (creditAccount.data ?? null) as CreditAcct | null;
  const totalRevenueMicros30d = actionBreakdown.reduce((s, a) => s + a.revenue_credits * 10000, 0);
  const totalCostMicros30d = actionBreakdown.reduce((s, a) => s + a.cost_micros, 0);
  const totalMarginMicros30d = totalRevenueMicros30d - totalCostMicros30d;
  const marginPct30d = totalRevenueMicros30d > 0
    ? Math.round((totalMarginMicros30d / totalRevenueMicros30d) * 1000) / 10
    : null;
  const usageDailyMicros = timeseries.map((d) => d.cost_micros);
  const revenueDailyCents = timeseries.map((d) => d.revenue_cents);
  const marginDailyMicros = timeseries.map((d) => d.margin_micros);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/admin">
          <ArrowLeft className="size-4" />
          Volver
        </Link>
      </Button>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-display font-extrabold tracking-tight">
              {t.name}
            </h1>
            {t.status === "active" ? (
              <Badge variant="success">Activo</Badge>
            ) : t.status === "paused" ? (
              <Badge variant="warning">Pausado</Badge>
            ) : (
              <Badge variant="muted">{t.status}</Badge>
            )}
            <Badge variant="outline">{t.plan}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{t.slug}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/${t.slug}/overview`}>
            <ExternalLink className="size-4" />
            Ver como tenant
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Miembros" value={members.count ?? 0} />
        <StatCard label="Conversaciones" value={conversations.count ?? 0} />
        <StatCard label="Leads" value={leads.count ?? 0} />
        <StatCard label="Servicios" value={services.count ?? 0} />
      </div>

      {/* ── P&L SECTION ──────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="size-5 text-primary" />
            Económicos del tenant
          </CardTitle>
          <CardDescription>
            Balance actual, recargas, uso de créditos, costo API y margen — últimos 30 días.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MoneyKpi
              icon={Coins}
              label="Balance"
              value={fmtCents(acct?.balance_credits ?? 0)}
              subtitle={
                acct
                  ? `${(acct.balance_credits ?? 0).toLocaleString()} créditos${
                      acct.reserved_credits > 0
                        ? ` · ${acct.reserved_credits} reservados`
                        : ""
                    }`
                  : "Sin cuenta de créditos"
              }
              color={
                acct && acct.balance_credits - acct.reserved_credits <= 0
                  ? "text-destructive"
                  : acct && acct.balance_credits - acct.reserved_credits <= (acct.low_balance_threshold ?? 500)
                    ? "text-amber-600"
                    : "text-foreground"
              }
            />
            <MoneyKpi
              icon={DollarSign}
              label="Ingreso 30d"
              value={fmtCents(revenueDailyCents.reduce((a, b) => a + b, 0))}
              subtitle={`Total acumulado: ${fmtCents(acct?.lifetime_topped_up_cents ?? 0)}`}
              color="text-green-600"
            />
            <MoneyKpi
              icon={TrendingDown}
              label="Costo API 30d"
              value={fmtUsd(totalCostMicros30d)}
              subtitle={`${actionBreakdown.length} acciones distintas`}
              color="text-amber-600"
            />
            <MoneyKpi
              icon={PiggyBank}
              label="Margen 30d"
              value={fmtUsd(totalMarginMicros30d)}
              subtitle={marginPct30d != null ? `${marginPct30d}% margen` : "—"}
              color={totalMarginMicros30d >= 0 ? "text-primary" : "text-destructive"}
            />
          </div>

          {/* Sparklines */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t">
            <SparkBlock label="Ingreso diario" points={revenueDailyCents} color="text-green-600" />
            <SparkBlock label="Costo diario" points={usageDailyMicros.map(microsToDollars)} color="text-amber-600" />
            <SparkBlock label="Margen diario" points={marginDailyMicros.map(microsToDollars)} color="text-primary" />
          </div>
        </CardContent>
      </Card>

      {/* ── ACTION BREAKDOWN ──────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Acciones (últimos 30 días)</CardTitle>
          <CardDescription>
            En qué gasta este tenant sus créditos y cuánto nos cuesta.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Acción</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Ingreso</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actionBreakdown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Sin uso en los últimos 30 días
                </TableCell>
              </TableRow>
            ) : (
              actionBreakdown.map((a) => (
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── TOP-UP HISTORY ────────────────────────────────────────── */}
      {topups.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Recargas</CardTitle>
            <CardDescription>Historial de top-ups vía Stripe.</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead className="text-right">Balance después</TableHead>
                <TableHead>Stripe PI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topups.map((tu, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tu.created_at).toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-600">
                    {fmtCents(tu.paid_cents)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{tu.base_credits.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {tu.bonus_credits > 0 ? `+${tu.bonus_credits.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtCents(tu.balance_after)}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {tu.stripe_pi_id ? `${tu.stripe_pi_id.slice(0, 14)}…` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── RECENT TRANSACTIONS ──────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Movimientos recientes</CardTitle>
          <CardDescription>Últimas 25 transacciones del ledger.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead className="text-right">Δ créditos</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Ref.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentTx.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Sin movimientos
                </TableCell>
              </TableRow>
            ) : (
              recentTx.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {tx.action_key ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm tabular-nums",
                      tx.credits_delta > 0 && "text-green-600",
                      tx.credits_delta < 0 && "text-destructive",
                    )}
                  >
                    {tx.credits_delta > 0 ? "+" : ""}
                    {tx.credits_delta.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{tx.balance_after.toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {tx.reference_id ? `${tx.reference_id.slice(0, 18)}…` : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── EVOLUTION PROVISIONING ───────────────────────────────── */}
      {t.gateway === "evolution" && (
        <div className="mb-6">
          <EvolutionProvisioner
            tenantId={t.id}
            tenantStatus={t.status}
            currentInstance={
              t.gateway_config && typeof t.gateway_config === "object" && "instance" in t.gateway_config
                ? String((t.gateway_config as { instance?: unknown }).instance ?? "") || null
                : null
            }
          />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Configuración</CardTitle>
          <CardDescription>
            Edita cualquier campo. Cambios se aplican inmediatamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantAdminForm tenant={t} />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de peligro</CardTitle>
          <CardDescription>
            Eliminar el tenant borra TODAS sus conversaciones, leads, servicios,
            personal, calendario, conocimiento y miembros. Es irreversible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantDangerZone id={t.id} slug={t.slug} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
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

function MoneyKpi({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("size-3.5", color)} />
        <span>{label}</span>
      </div>
      <p className={cn("text-xl font-display font-bold", color)}>{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
    </div>
  );
}

function SparkBlock({ label, points, color }: { label: string; points: number[]; color: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className={color}>
        <Sparkline points={points} width={260} height={36} ariaLabel={label} />
      </div>
    </div>
  );
}
