"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Smartphone, ChevronDown, Loader2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSmsSettingsAction } from "@/lib/actions/sms-settings";
import type { SmsSettingsMasked } from "@/lib/marketing/sms";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function SmsSettingsCard({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: SmsSettingsMasked;
}) {
  const t = useTranslations("broadcasts");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [provider, setProvider] = useState(settings.provider);
  const [url, setUrl] = useState(settings.gateway_url);
  const [method, setMethod] = useState(settings.gateway_method);
  const [contentType, setContentType] = useState(settings.gateway_content_type);
  const [from, setFrom] = useState(settings.gateway_from);
  const [bodyTemplate, setBodyTemplate] = useState(settings.gateway_body_template);
  const [authHeader, setAuthHeader] = useState("");

  function save() {
    startTransition(async () => {
      const res = await saveSmsSettingsAction(tenantId, {
        provider,
        gateway_url: url.trim() || null,
        gateway_method: method,
        gateway_content_type: contentType,
        gateway_body_template: bodyTemplate.trim() || null,
        gateway_from: from.trim() || null,
        gateway_auth_header: authHeader.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? tc("error"));
        return;
      }
      toast.success(t("sms_saved"));
      setAuthHeader("");
      router.refresh();
    });
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 font-display font-semibold">
          <Smartphone className="size-4 text-muted-foreground" />
          {t("sms_title")}
          <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {provider === "twilio" ? t("sms_provider_twilio") : t("sms_provider_gateway")}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <CardContent className="border-t border-border pt-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t("sms_desc")}</p>

          {/* Provider toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["twilio", "http_gateway"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                  provider === p ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent",
                )}
              >
                {p === "twilio" ? t("sms_provider_twilio") : t("sms_provider_gateway")}
              </button>
            ))}
          </div>

          {provider === "twilio" ? (
            <p className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">{t("sms_twilio_note")}</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("sms_url")}</label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://pbx.example.com/api/sms" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("sms_method")}</label>
                  <select className={FIELD_CLASS} value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST")}>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("sms_content_type")}</label>
                  <select
                    className={FIELD_CLASS}
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as "json" | "form")}
                    disabled={method === "GET"}
                  >
                    <option value="json">JSON</option>
                    <option value="form">Form</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("sms_from")}</label>
                <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="+15551234567" />
              </div>
              {method === "POST" ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t("sms_body_template")}</label>
                  <textarea
                    className={cn(FIELD_CLASS, "h-auto min-h-[88px] font-mono text-xs")}
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    placeholder={'{"to":"{to}","from":"{from}","message":"{text}"}'}
                    maxLength={4000}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("sms_auth_header")}</label>
                <Input
                  value={authHeader}
                  onChange={(e) => setAuthHeader(e.target.value)}
                  placeholder={settings.has_auth_header ? t("sms_auth_ph_set") : t("sms_auth_ph_unset")}
                  autoComplete="off"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("sms_tokens_hint")}{" "}
                <code className="rounded bg-secondary px-1">{"{to}"}</code>{" "}
                <code className="rounded bg-secondary px-1">{"{from}"}</code>{" "}
                <code className="rounded bg-secondary px-1">{"{text}"}</code>
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {t("sms_save")}
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
