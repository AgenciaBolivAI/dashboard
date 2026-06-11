import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createServiceClient } from "@/lib/supabase/service";
import { TenantRowActions } from "@/components/admin/tenant-row-actions";

type AdminTenantRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  plan: string;
  status: string;
  workflow_template: string;
  gateway: string;
  gateway_config: Record<string, unknown> | null;
  language: string;
  created_at: string;
};

export default async function AdminIndex() {
  const t = await getTranslations("admin_tenants");
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id, slug, name, industry, plan, status, workflow_template, gateway, gateway_config, language, created_at")
    .order("created_at", { ascending: false });

  const rows = (tenants ?? []) as unknown as AdminTenantRow[];

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length === 1
              ? t("total_count_one", { count: rows.length })
              : t("total_count_other", { count: rows.length })}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/tenants/new">
            <Plus className="size-4" />
            {t("new_tenant")}
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_description")}
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/tenants/new">
              <Plus className="size-4" />
              {t("create_first")}
            </Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col_tenant")}</TableHead>
                <TableHead>{t("col_template")}</TableHead>
                <TableHead>{t("col_plan")}</TableHead>
                <TableHead>{t("col_status")}</TableHead>
                <TableHead>{t("col_channel")}</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {row.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.workflow_template}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.status === "active" ? (
                      <Badge variant="success">{t("status_active")}</Badge>
                    ) : row.status === "paused" ? (
                      <Badge variant="warning">{t("status_paused")}</Badge>
                    ) : (
                      <Badge variant="muted">{row.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="font-medium">{row.gateway}</span>
                    {row.gateway_config?.instance ? (
                      <span className="text-muted-foreground ml-1 font-mono">
                        · {String(row.gateway_config.instance)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <TenantRowActions
                      tenantId={row.id}
                      tenantSlug={row.slug}
                      status={row.status}
                    />
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
