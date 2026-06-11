import Link from "next/link";
import { UserSearch, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { listCustomers } from "@/lib/queries/customers";
import { CustomersSearch } from "@/components/customers/customers-search";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; vip?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q, vip } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("customers");

  const customers = await listCustomers(tenant.id, {
    search: q?.trim() || undefined,
    vipOnly: vip === "1",
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("page_subtitle")}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <CustomersSearch initialValue={q ?? ""} />
        <Link
          href={`/dashboard/${tenantSlug}/customers${vip === "1" ? "" : "?vip=1"}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={
            "inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm border " +
            (vip === "1"
              ? "border-primary text-primary bg-primary/5"
              : "border-input text-muted-foreground hover:text-foreground")
          }
        >
          <Star className="size-4" />
          {t("vip_only")}
        </Link>
      </div>

      {customers.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <UserSearch className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_description")}
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">{t("col_name")}</th>
                  <th className="text-left px-4 py-3">{t("col_whatsapp")}</th>
                  <th className="text-right px-4 py-3">{t("col_reservations")}</th>
                  <th className="text-left px-4 py-3">{t("col_last_activity")}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border hover:bg-secondary/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/${tenantSlug}/customers/${c.id}`}
                        className="hover:underline font-medium inline-flex items-center gap-2"
                      >
                        {c.name ?? <span className="text-muted-foreground">{t("no_name")}</span>}
                        {c.is_vip ? (
                          <Badge variant="success" className="text-[10px]">
                            <Star className="size-3 mr-0.5" />
                            VIP
                          </Badge>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.whatsapp_number ? `+${c.whatsapp_number}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.reservations_count}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.last_seen_at
                        ? new Date(c.last_seen_at).toLocaleDateString("es")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
