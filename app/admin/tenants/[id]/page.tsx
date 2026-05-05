import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createServiceClient } from "@/lib/supabase/service";
import { TenantAdminForm } from "@/components/admin/tenant-admin-form";
import { TenantDangerZone } from "@/components/admin/tenant-danger-zone";

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

  // Counts
  const [members, conversations, leads, services] = await Promise.all([
    svc.from("dashboard_users").select("user_id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
    svc.from("services").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
  ]);

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
