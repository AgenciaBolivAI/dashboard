import Link from "next/link";
import { Plus } from "lucide-react";
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
  const svc = createServiceClient();
  const { data: tenants } = await svc
    .from("tenants")
    .select("id, slug, name, industry, plan, status, workflow_template, gateway, gateway_config, language, created_at")
    .order("created_at", { ascending: false });

  const rows = (tenants ?? []) as AdminTenantRow[];

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Tenants
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {rows.length} {rows.length === 1 ? "tenant" : "tenants"} en total
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/tenants/new">
            <Plus className="size-4" />
            Nuevo tenant
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <p className="font-medium">Aún no hay tenants</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Crea el primero para empezar a vender el servicio. Cada tenant es
            un cliente con su propio agente, prompt y datos.
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/tenants/new">
              <Plus className="size-4" />
              Crear primero
            </Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plantilla</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {t.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.workflow_template}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t.plan}</Badge>
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
                  <TableCell className="text-xs">
                    <span className="font-medium">{t.gateway}</span>
                    {t.gateway_config?.instance ? (
                      <span className="text-muted-foreground ml-1 font-mono">
                        · {String(t.gateway_config.instance)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <TenantRowActions
                      tenantId={t.id}
                      tenantSlug={t.slug}
                      status={t.status}
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
