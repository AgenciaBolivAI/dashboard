import Link from "next/link";
import { getTranslations } from "next-intl/server";
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

const WINDOW_IDS: PnlWindow[] = ["today", "7d", "month", "30d", "90d", "all"];

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const t = await getTranslations("admin_usage");
  const windows: { id: PnlWindow; label: string }[] = [
    { id: "today", label: t("window_today") },
    { id: "7d", label: t("window_7d") },
    { id: "month", label: t("window_month") },
    { id: "30d", label: t("window_30d") },
    { id: "90d", label: t("window_90d") },
    { id: "all", label: t("window_all") },
  ];

  const { window: windowParam } = await searchParams;
  const windowKey: PnlWindow =
    (WINDOW_IDS.find((id) => id === windowParam) ?? "month");

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
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("page_subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {windows.map((w) => {
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
          <h2 className="font-semibold">{t("actions_card_title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("actions_card_subtitle")}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_action")}</TableHead>
              <TableHead className="text-right">{t("col_units")}</TableHead>
              <TableHead className="text-right">{t("col_revenue")}</TableHead>
              <TableHead className="text-right">{t("col_api_cost")}</TableHead>
              <TableHead className="text-right">{t("col_margin")}</TableHead>
              <TableHead className="text-right">{t("col_margin_pct")}</TableHead>
              <TableHead className="w-32">{t("col_share_of_total")}</TableHead>
              <TableHead className="text-right">{t("col_tenants")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  {t("actions_empty")}
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
          <h2 className="font-semibold">{t("tenants_card_title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("tenants_card_subtitle")}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("col_tenant")}</TableHead>
              <TableHead>{t("col_status")}</TableHead>
              <TableHead className="text-right">{t("col_balance")}</TableHead>
              <TableHead className="text-right">{t("col_revenue")}</TableHead>
              <TableHead className="text-right">{t("col_usage")}</TableHead>
              <TableHead className="text-right">{t("col_api_cost")}</TableHead>
              <TableHead className="text-right">{t("col_margin")}</TableHead>
              <TableHead className="text-right">{t("col_pct")}</TableHead>
              <TableHead className="text-right">{t("col_last_activity")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                  {t("tenants_empty")}
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((tn) => (
                <TableRow key={tn.tenant_id}>
                  <TableCell>
                    <Link
                      href={`/admin/tenants/${tn.tenant_id}`}
                      className="font-medium hover:underline"
                    >
                      {tn.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">/{tn.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {tn.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtCents(tn.balance_credits)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-green-600">
                    {tn.revenue_cents > 0 ? fmtCents(tn.revenue_cents) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {tn.usage_credits > 0 ? fmtCredits(tn.usage_credits) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-amber-600">
                    {tn.cost_micros > 0 ? fmtUsd(tn.cost_micros) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm font-semibold",
                      tn.margin_micros > 0 && "text-primary",
                      tn.margin_micros < 0 && "text-destructive",
                    )}
                  >
                    {tn.margin_micros !== 0 ? fmtUsd(tn.margin_micros) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {tn.margin_pct != null ? `${tn.margin_pct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {tn.last_activity_at
                      ? new Date(tn.last_activity_at).toLocaleString("es-BO", {
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
