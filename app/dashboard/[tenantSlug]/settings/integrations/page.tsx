import {
  AlertTriangle,
  CheckCircle2,
  Instagram,
  PlugZap,
  XCircle,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getTenantBySlug } from "@/lib/tenant";
import { getInstanceStatus } from "@/lib/evolution";
import { listWorkflows } from "@/lib/n8n";
import { getGateway, getTemplate } from "@/lib/templates";
import { createServiceClient } from "@/lib/supabase/service";
import { getTranslations } from "next-intl/server";
import { CopyField } from "./copy-field";
import { GatewayConfigForm } from "@/components/integrations/gateway-config-form";
import { GoogleConnection, type GoogleIntegration } from "@/components/integrations/google-connection";
import { WhatsAppConnect } from "@/components/whatsapp/whatsapp-connect";
import { EmailSenderCard } from "@/components/integrations/email-sender-card";
import { getTenantEmailStatus } from "@/lib/email/send";

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
  const t = await getTranslations("settings_integrations");

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

  // Connected Instagram / Messenger channels (tenant_channels — not yet in the
  // generated DB types, so use a loosely-typed client).
  const svcChannels = createServiceClient() as unknown as SupabaseClient;
  const { data: metaRows } = await svcChannels
    .from("tenant_channels")
    .select("channel, external_id, config, status")
    .eq("tenant_id", tenant.id)
    .in("channel", ["instagram", "facebook_messenger"]);
  const metaChannels = (metaRows ?? []) as {
    channel: string;
    external_id: string;
    config: Record<string, unknown>;
    status: string;
  }[];

  // Email sender state (which address BOLIV sends customer emails from)
  const emailStatus = await getTenantEmailStatus(tenant.id);

  return (
    <div className="space-y-4">
      {/* Template + gateway summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t("agent_type_title")}</CardTitle>
          <CardDescription>
            {t("agent_type_description")}
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
          <CardTitle>{t("gateway_title")}</CardTitle>
          <CardDescription>
            {t("gateway_description")}
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
            <CardTitle>{t("evolution_status_title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row
              label={t("status_label")}
              value={
                gatewayStatus.state === "open"
                  ? t("status_connected")
                  : gatewayStatus.state === "no_instance"
                    ? t("status_no_instance")
                    : gatewayStatus.state
              }
              badge={
                gatewayStatus.ok ? (
                  <Badge variant="success">
                    <CheckCircle2 className="size-3" />
                    {t("badge_ok")}
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
            {/* Self-serve connect: provision instance + scan QR, no admin needed */}
            <Separator />
            <WhatsAppConnect tenantId={tenant.id} initialState={gatewayStatus.state} />
          </CardContent>
        </Card>
      ) : null}

      {/* Instagram + Messenger channels */}
      <Card>
        <CardHeader>
          <CardTitle>{t("meta_title")}</CardTitle>
          <CardDescription>{t("meta_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metaChannels.length > 0 ? (
            <div className="space-y-2">
              {metaChannels.map((c) => (
                <Row
                  key={`${c.channel}:${c.external_id}`}
                  label={
                    c.channel === "instagram"
                      ? t("meta_channel_instagram")
                      : t("meta_channel_messenger")
                  }
                  value={
                    (c.config?.ig_username as string) ||
                    (c.config?.page_name as string) ||
                    c.external_id
                  }
                  badge={
                    <Badge variant={c.status === "active" ? "success" : "muted"}>
                      {c.status === "active" ? t("meta_status_active") : t("meta_status_paused")}
                    </Badge>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("meta_none")}</p>
          )}
          <Button asChild>
            <a href={`/api/meta/connect?tenant=${tenantSlug}`}>
              <Instagram className="size-4" />
              {metaChannels.length > 0 ? t("meta_reconnect_btn") : t("meta_connect_btn")}
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">{t("meta_pending_note")}</p>
        </CardContent>
      </Card>

      {/* n8n */}
      <Card>
        <CardHeader>
          <CardTitle>{t("n8n_title")}</CardTitle>
          <CardDescription>
            {t("n8n_description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row
            label={t("server_label")}
            value={n8nBaseUrl ?? "—"}
            badge={
              n8n.ok ? (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" />
                  {t("status_connected")}
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="size-3" />
                  {t("status_disconnected")}
                </Badge>
              )
            }
          />
          {n8n.ok ? (
            <Row
              label={t("workflows_label")}
              value={t("workflows_value", { active: n8n.activeCount, total: n8n.count })}
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
                <p className="text-sm font-medium">{t("webhook_url_label")}</p>
                <p className="text-xs text-muted-foreground">
                  {tenant.gateway === "evolution"
                    ? t("webhook_hint_evolution")
                    : tenant.gateway === "meta_whatsapp"
                      ? t("webhook_hint_meta")
                      : t("webhook_hint_generic")}
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
            <CardTitle>{t("google_title")}</CardTitle>
            <CardDescription>
              {t("google_description")}
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

      {/* Email sender — BOLIV sends customer emails from the tenant's OWN email */}
      <Card>
        <CardHeader>
          <CardTitle>{t("email_title")}</CardTitle>
          <CardDescription>{t("email_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailSenderCard tenantId={tenant.id} status={emailStatus} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("summary_title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="flex items-center gap-2">
            <PlugZap className="size-4 text-muted-foreground" />
            {t("summary_chain", { gateway: gateway.short })}
            {needsGoogle ? <> {t("summary_chain_google_suffix")}</> : null}
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
