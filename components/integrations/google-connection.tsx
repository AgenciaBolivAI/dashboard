"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CheckCircle2, RefreshCcw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  disconnectGoogleAction,
  refreshGoogleTokenAction,
  updateGoogleMetadataAction,
  type IntegrationState,
} from "@/lib/actions/integrations";

const initial: IntegrationState = { error: null };

export type GoogleIntegration = {
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown>;
};

export function GoogleConnection({
  tenantId,
  tenantSlug,
  integration,
}: {
  tenantId: string;
  tenantSlug: string;
  integration: GoogleIntegration | null;
}) {
  const t = useTranslations("settings_integrations");
  const locale = useLocale();
  const connected = !!integration?.access_token;
  const expiresAt = integration?.expires_at ? new Date(integration.expires_at) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const grantedEmail = (integration?.metadata?.granted_email as string | undefined) ?? null;

  const [state, action, pending] = useActionState(
    updateGoogleMetadataAction,
    initial,
  );
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("google_config_saved"));
  }, [state, t]);

  function handleDisconnect() {
    if (!confirm(t("confirm_disconnect_google")))
      return;
    startBusy(async () => {
      const res = await disconnectGoogleAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("google_disconnected"));
    });
  }

  function handleRefresh() {
    startBusy(async () => {
      const res = await refreshGoogleTokenAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("token_refreshed"));
    });
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("google_connect_intro")}
        </p>
        <Button asChild>
          <a
            href={`/api/google/connect?tenant_id=${tenantId}&tenant_slug=${tenantSlug}`}
          >
            <GoogleIcon />
            {t("google_connect_btn")}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("google_connect_hint")}
        </p>
      </div>
    );
  }

  const md = integration!.metadata ?? {};
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={isExpired ? "warning" : "success"}>
              {isExpired ? (
                <>
                  <AlertTriangle className="size-3" /> {t("token_expired")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3" /> {t("connected")}
                </>
              )}
            </Badge>
            {grantedEmail ? (
              <span className="text-sm text-muted-foreground">{grantedEmail}</span>
            ) : null}
          </div>
          {expiresAt ? (
            <p className="text-xs text-muted-foreground mt-1">
              {t("expires_at", { date: expiresAt.toLocaleString(locale) })}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={busy}
          >
            <RefreshCcw className="size-4" />
            {t("refresh")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            disabled={busy}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {t("disconnect")}
          </Button>
        </div>
      </div>

      <Separator />

      <form action={action} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />

        <div className="space-y-2">
          <Label htmlFor="calendar_id">{t("calendar_id_label")}</Label>
          <Input
            id="calendar_id"
            name="calendar_id"
            defaultValue={(md.calendar_id as string | undefined) ?? "primary"}
            placeholder="primary"
          />
          <p className="text-xs text-muted-foreground">
            {t.rich("calendar_id_hint", {
              code1: () => <code>primary</code>,
              code2: () => <code className="font-mono">…@group.calendar.google.com</code>,
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="spreadsheet_id">{t("spreadsheet_id_label")}</Label>
            <Input
              id="spreadsheet_id"
              name="spreadsheet_id"
              defaultValue={(md.spreadsheet_id as string | undefined) ?? ""}
              placeholder="1AbC..."
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t.rich("spreadsheet_id_hint", {
                code: () => <code>{"spreadsheets/d/<ID>/edit"}</code>,
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sheet_range">{t("field_sheet_range")}</Label>
            <Input
              id="sheet_range"
              name="sheet_range"
              defaultValue={(md.sheet_range as string | undefined) ?? "Leads!A:F"}
              placeholder="Leads!A:F"
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sender_email">{t("field_sender_email")}</Label>
          <Input
            id="sender_email"
            name="sender_email"
            type="email"
            defaultValue={(md.sender_email as string | undefined) ?? grantedEmail ?? ""}
            placeholder="hola@tucliente.com"
          />
          <p className="text-xs text-muted-foreground">
            {t("sender_email_hint")}
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? t("google_saving") : t("google_save_config")}
        </Button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
