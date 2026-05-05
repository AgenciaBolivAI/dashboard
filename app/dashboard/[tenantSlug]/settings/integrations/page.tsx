import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  PlugZap,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getTenantBySlug } from "@/lib/tenant";
import { getInstanceStatus } from "@/lib/evolution";
import { listWorkflows } from "@/lib/n8n";
import { getGateway, getTemplate } from "@/lib/templates";
import { createServiceClient } from "@/lib/supabase/service";
import { CopyField } from "./copy-field";
import { GatewayConfigForm } from "@/components/integrations/gateway-config-form";
import { GoogleConnection, type GoogleIntegration } from "@/components/integrations/google-connection";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const gateway = getGateway(tenant.gateway);
  const template = getTemplate(tenant.workflow_template);

  // Probe gateway-specific status (only Evolution implemented today)
  let gatewayStatus: { state: string; ok: boolean; error?: string } = {
    state: "unknown",
    ok: false,
  };
  if (tenant.gateway === "evolution") {
    const instance = (tenant.gateway_config?.instance as string | undefined) ?? null;
    if (instance) {
      try {
        const res = (await getInstanceStatus(instance)) as {
          instance?: { state?: string };
        };
        const state = res.instance?.state ?? "unknown";
        gatewayStatus = { state, ok: state === "open" };
      } catch (e) {
        gatewayStatus = {
          state: "error",
          ok: false,
          error: e instanceof Error ? e.message : "unreachable",
        };
      }
    } else {
      gatewayStatus = { state: "no_instance", ok: false };
    }
  }

  // Probe n8n
  let n8n: { ok: boolean; count: number; activeCount: number; error?: string } = {
    ok: false,
    count: 0,
    activeCount: 0,
  };
  try {
    const wfs = await listWorkflows();
    n8n = {
      ok: true,
      count: wfs.length,
      activeCount: wfs.filter((w) => w.active).length,
    };
  } catch (e) {
    n8n = {
      ok: false,
      count: 0,
      activeCount: 0,
      error: e instanceof Error ? e.message : "unreachable",
    };
  }

  const evolutionBaseUrl = process.env.EVOLUTION_BASE_URL;
  const n8nBaseUrl = process.env.N8N_BASE_URL;
  const webhookPath = tenant.gateway === "meta_whatsapp" ? "meta-webhook" : "evolution-webhook";
  const webhookUrl = n8nBaseUrl
    ? `${n8nBaseUrl.replace(/\/+$/, "")}/webhook/${webhookPath}`
    : null;

  // Per-tenant Google integration (only when the template needs it)
  const needsGoogle = template.requiredIntegrations?.includes("google") ?? false;
  let googleIntegration: GoogleIntegration | null = null;
  if (needsGoogle) {
    const svc = createServiceClient();
    const { data } = await svc
      .from("tenant_integrations")
      .select("access_token, refresh_token, scope, expires_at, metadata")
      .eq("tenant_id", tenant.id)
      .eq("provider", "google")
      .maybeSingle();
    googleIntegration = (data as GoogleIntegration | null) ?? null;
  }

  return (
    <div className="space-y-4">
      {/* Template + gateway summary */}
      <Card>
        <CardHeader>
          <CardTitle>Tipo de agente</CardTitle>
          <CardDescription>
            La plantilla determina qué herramientas tiene tu agente y qué puede
            hacer. Si quieres cambiar a otra plantilla, contacta a BolivAI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <Badge variant="default">{template.name}</Badge>
            <Badge variant="outline">{gateway.short}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {template.features.map((f) => (
              <Badge key={f.id} variant="muted" className="text-[10px]">
                {f.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gateway config form */}
      <Card>
        <CardHeader>
          <CardTitle>Canal de mensajería</CardTitle>
          <CardDescription>
            La capa que conecta tu WhatsApp con el agente. Cambia de canal o
            actualiza credenciales aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GatewayConfigForm
            tenantId={tenant.id}
            currentGateway={tenant.gateway}
            currentConfig={tenant.gateway_config ?? {}}
          />
        </CardContent>
      </Card>

      {/* Live gateway status */}
      {tenant.gateway === "evolution" ? (
        <Card>
          <CardHeader>
            <CardTitle>Estado de Evolution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row
              label="Estado"
              value={
                gatewayStatus.state === "open"
                  ? "Conectado"
                  : gatewayStatus.state === "no_instance"
                    ? "Sin instancia"
                    : gatewayStatus.state
              }
              badge={
                gatewayStatus.ok ? (
                  <Badge variant="success">
                    <CheckCircle2 className="size-3" />
                    OK
                  </Badge>
                ) : gatewayStatus.state === "no_instance" ? (
                  <Badge variant="muted">—</Badge>
                ) : (
                  <Badge variant="destructive">
                    <XCircle className="size-3" />
                    {gatewayStatus.state}
                  </Badge>
                )
              }
            />
            {evolutionBaseUrl ? (
              <a
                href={`${evolutionBaseUrl.replace(/\/+$/, "")}/manager`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                Abrir Evolution Manager
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* n8n */}
      <Card>
        <CardHeader>
          <CardTitle>n8n</CardTitle>
          <CardDescription>
            El motor de ejecución del agente. Cada conversación entra por un
            webhook y se procesa aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row
            label="Servidor"
            value={n8nBaseUrl ?? "—"}
            badge={
              n8n.ok ? (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="size-3" />
                  Sin conexión
                </Badge>
              )
            }
          />
          {n8n.ok ? (
            <Row
              label="Workflows"
              value={`${n8n.activeCount} activos · ${n8n.count} totales`}
            />
          ) : null}
          {n8n.error ? (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {n8n.error}
            </p>
          ) : null}

          {webhookUrl ? (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Webhook URL</p>
                <p className="text-xs text-muted-foreground">
                  {tenant.gateway === "evolution"
                    ? "Pega esto en Evolution Manager → Instance Settings → Webhooks. Activa el evento messages.upsert."
                    : tenant.gateway === "meta_whatsapp"
                      ? "Pega esto como Callback URL en Meta Business Manager → WhatsApp → Configuration → Webhook."
                      : "Webhook URL para tu gateway."}
                </p>
                <CopyField value={webhookUrl} />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {needsGoogle ? (
        <Card>
          <CardHeader>
            <CardTitle>Google Workspace</CardTitle>
            <CardDescription>
              Esta plantilla requiere acceso a tu Google Calendar, Sheets y
              Gmail. Conecta tu cuenta para que el agente cree eventos, guarde
              leads y envíe confirmaciones por email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleConnection
              tenantId={tenant.id}
              tenantSlug={tenantSlug}
              integration={googleIntegration}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Resumen de conexiones</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="flex items-center gap-2">
            <PlugZap className="size-4 text-muted-foreground" />
            WhatsApp → {gateway.short} → n8n → Supabase → este panel
            {needsGoogle ? <> · Google APIs</> : null}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value}</span>
        {badge}
      </div>
    </div>
  );
}
