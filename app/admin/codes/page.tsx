import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listLifetimeCodes } from "@/lib/billing/lifetime-codes";
import { getFoundingMembers, type FoundingMember } from "@/lib/billing/lifetime";
import { LifetimeCodesManager } from "@/components/admin/lifetime-codes-manager";

// Codes live in Stripe — always fetch fresh so redemption counts are current.
export const dynamic = "force-dynamic";

const usd = (cents: number | null) => (cents != null ? `$${(cents / 100).toFixed(2)}` : "—");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

type SourceT = (key: string, vars?: Record<string, string | number>) => string;

function source(
  m: FoundingMember,
  t: SourceT,
): { label: string; variant: "default" | "success" | "warning" | "muted" } {
  if (m.code) return { label: t("source_code", { code: m.code }), variant: "default" };
  if (m.paidCents === 0) return { label: t("source_free"), variant: "warning" };
  if (m.paidCents != null && m.paidCents < 4000) return { label: t("source_discount"), variant: "muted" };
  return { label: t("source_direct"), variant: "success" };
}

export default async function AdminCodesPage() {
  // Access is gated by the /admin layout (requireBolivAIAdmin).
  const t = await getTranslations("admin_codes");
  const [codes, founders] = await Promise.all([listLifetimeCodes(), getFoundingMembers()]);

  // Roll up founders by redeemed code (our DB attribution).
  const byCode = new Map<string, { count: number; revenue: number }>();
  let revenue = 0;
  let viaCode = 0;
  let free = 0;
  for (const m of founders) {
    revenue += m.paidCents ?? 0;
    if (m.code) {
      viaCode++;
      const b = byCode.get(m.code) ?? { count: 0, revenue: 0 };
      b.count++;
      b.revenue += m.paidCents ?? 0;
      byCode.set(m.code, b);
    }
    if ((m.paidCents ?? 0) === 0) free++;
  }
  const codeRollup = [...byCode.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-display font-extrabold tracking-tight">{t("page_title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("page_description")}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("stat_founding_members")} value={founders.length.toLocaleString()} />
        <Stat label={t("stat_access_revenue")} value={usd(revenue)} />
        <Stat label={t("stat_via_code")} value={viaCode.toLocaleString()} />
        <Stat label={t("stat_free")} value={free.toLocaleString()} />
      </div>

      <LifetimeCodesManager codes={codes} />

      {/* Per-code usage rollup */}
      <Card className="p-5">
        <h2 className="mb-3 font-display font-semibold">{t("usage_by_code_title")}</h2>
        {codeRollup.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("usage_by_code_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">{t("col_code")}</th>
                  <th>{t("col_redemptions")}</th>
                  <th>{t("col_revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {codeRollup.map((c) => (
                  <tr key={c.code} className="border-b border-border/60">
                    <td className="py-2 font-mono font-medium">{c.code}</td>
                    <td className="tabular-nums">{c.count}</td>
                    <td className="tabular-nums">{usd(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("usage_by_code_footer")}
        </p>
      </Card>

      {/* Founders ledger */}
      <Card className="p-5">
        <h2 className="mb-3 font-display font-semibold">{t("founders_title")}</h2>
        {founders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("founders_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">#</th>
                  <th>{t("col_tenant")}</th>
                  <th>{t("col_source")}</th>
                  <th>{t("col_paid")}</th>
                  <th>{t("col_date")}</th>
                </tr>
              </thead>
              <tbody>
                {founders.map((m) => {
                  const s = source(m, t);
                  return (
                    <tr key={m.tenantId} className="border-b border-border/60">
                      <td className="py-2 tabular-nums text-muted-foreground">{m.foundingNumber ?? "—"}</td>
                      <td>
                        <Link href={`/admin/tenants/${m.tenantId}`} className="font-medium hover:underline">
                          {m.name}
                        </Link>
                      </td>
                      <td>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="tabular-nums">{usd(m.paidCents)}</td>
                      <td className="text-muted-foreground">{day(m.grantedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </Card>
  );
}
