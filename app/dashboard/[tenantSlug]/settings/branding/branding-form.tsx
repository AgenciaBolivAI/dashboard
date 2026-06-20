"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  updateBrandingAction,
  uploadLogoAction,
  removeLogoAction,
  type BrandingState,
} from "@/lib/actions/branding";

const initial: BrandingState = { error: null };

export function BrandingForm({
  tenant,
}: {
  tenant: {
    id: string;
    logo_url: string | null;
    primary_color: string;
    accent_color: string;
    custom_domain: string | null;
  };
}) {
  const t = useTranslations("settings_branding");
  const [state, action, pending] = useActionState(updateBrandingAction, initial);
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url);
  const [primary, setPrimary] = useState(tenant.primary_color);
  const [accent, setAccent] = useState(tenant.accent_color);
  const [uploading, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_saved"));
  }, [state, t]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("tenant_id", tenant.id);
    fd.set("logo", file);
    startUpload(async () => {
      const res = await uploadLogoAction(fd);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("logo_uploaded"));
        if (res.logoUrl) setLogoUrl(res.logoUrl);
      }
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function handleRemove() {
    if (!confirm(t("confirm_remove_logo"))) return;
    startRemove(async () => {
      const res = await removeLogoAction(tenant.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("logo_removed"));
        setLogoUrl(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Logo */}
      <section className="space-y-3">
        <Label>{t("logo_label")}</Label>
        <div className="flex items-center gap-4">
          <div className="size-20 rounded-md border border-border bg-secondary flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={t("logo_alt")} className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-muted-foreground">{t("no_logo")}</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" />
              {uploading ? t("uploading") : t("upload_new")}
            </Button>
            {logoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={handleRemove}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
                {t("remove")}
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("logo_hint")}
        </p>
      </section>

      <Separator />

      {/* Colors + domain (single form) */}
      <form action={action} className="space-y-5">
        <input type="hidden" name="tenant_id" value={tenant.id} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label={t("field_primary_color")}
            name="primary_color"
            value={primary}
            onChange={setPrimary}
          />
          <ColorField
            label={t("field_accent_color")}
            name="accent_color"
            value={accent}
            onChange={setAccent}
          />
        </div>

        <div className="rounded-md border border-border bg-secondary/40 p-4">
          <p className="text-xs text-muted-foreground mb-2">{t("preview")}</p>
          <div className="flex items-center gap-2">
            <div
              className="px-4 py-2 rounded-md font-display font-semibold text-sm"
              style={{ backgroundColor: primary, color: "#000" }}
            >
              {t("preview_primary_button")}
            </div>
            <div
              className="px-4 py-2 rounded-md text-sm"
              style={{ backgroundColor: accent + "30", color: accent }}
            >
              {t("preview_accent")}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom_domain">{t("field_custom_domain")}</Label>
          <Input
            id="custom_domain"
            name="custom_domain"
            placeholder="panel.tucliente.com"
            defaultValue={tenant.custom_domain ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {t("custom_domain_hint")}
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save_changes")}
        </Button>
      </form>

      {tenant.custom_domain ? (
        <DnsInstructions domain={tenant.custom_domain} />
      ) : null}
    </div>
  );
}

function DnsInstructions({ domain }: { domain: string }) {
  const t = useTranslations("settings_branding");
  const isApex = domain.split(".").length === 2; // e.g. "cervantes.com"
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-5 space-y-3">
      <h3 className="font-display font-semibold text-sm">
        {t.rich("dns_activate", {
          domain: () => <code className="font-mono">{domain}</code>,
        })}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("dns_intro")}
      </p>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          {t("dns_step1")}
        </p>
        <pre className="rounded-md bg-background border border-border p-3 text-xs font-mono overflow-x-auto">
          {isApex
            ? `Type: A
Host: @
Value: 76.76.21.21`
            : `Type: CNAME
Host: ${domain.split(".")[0]}
Value: cname.vercel-dns.com`}
        </pre>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {isApex ? t("dns_apex_note") : t("dns_subdomain_note")}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          {t("dns_step2")}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t.rich("dns_step2_body", {
            code: () => <code>bolivai-dashboard</code>,
            strong: (chunks) => <strong>{chunks}</strong>,
            domain: () => <code className="font-mono">{domain}</code>,
          })}
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground italic pt-2 border-t border-border">
        {t.rich("dns_footer", {
          url: () => <code className="font-mono">https://{domain}</code>,
        })}
      </p>
    </div>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("settings_branding");
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-md border border-input bg-background cursor-pointer"
          aria-label={t("color_picker_aria", { label })}
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}
