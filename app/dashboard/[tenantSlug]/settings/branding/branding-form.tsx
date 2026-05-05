"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
  const [state, action, pending] = useActionState(updateBrandingAction, initial);
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url);
  const [primary, setPrimary] = useState(tenant.primary_color);
  const [accent, setAccent] = useState(tenant.accent_color);
  const [uploading, startUpload] = useTransition();
  const [removing, startRemove] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Marca actualizada");
  }, [state]);

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
        toast.success("Logo subido");
        if (res.logoUrl) setLogoUrl(res.logoUrl);
      }
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function handleRemove() {
    if (!confirm("¿Quitar el logo actual?")) return;
    startRemove(async () => {
      const res = await removeLogoAction(tenant.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Logo eliminado");
        setLogoUrl(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Logo */}
      <section className="space-y-3">
        <Label>Logo</Label>
        <div className="flex items-center gap-4">
          <div className="size-20 rounded-md border border-border bg-secondary flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-muted-foreground">Sin logo</span>
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
              {uploading ? "Subiendo…" : "Subir nuevo"}
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
                Quitar
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
          PNG, JPG, WebP o SVG · máx 5 MB · cuadrado recomendado.
        </p>
      </section>

      <Separator />

      {/* Colors + domain (single form) */}
      <form action={action} className="space-y-5">
        <input type="hidden" name="tenant_id" value={tenant.id} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label="Color primario"
            name="primary_color"
            value={primary}
            onChange={setPrimary}
          />
          <ColorField
            label="Color de acento"
            name="accent_color"
            value={accent}
            onChange={setAccent}
          />
        </div>

        <div className="rounded-md border border-border bg-secondary/40 p-4">
          <p className="text-xs text-muted-foreground mb-2">Vista previa</p>
          <div className="flex items-center gap-2">
            <div
              className="px-4 py-2 rounded-md font-display font-semibold text-sm"
              style={{ backgroundColor: primary, color: "#000" }}
            >
              Botón primario
            </div>
            <div
              className="px-4 py-2 rounded-md text-sm"
              style={{ backgroundColor: accent + "30", color: accent }}
            >
              Acento
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom_domain">Dominio personalizado</Label>
          <Input
            id="custom_domain"
            name="custom_domain"
            placeholder="panel.tucliente.com"
            defaultValue={tenant.custom_domain ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            Subdominio bajo el que tu equipo accederá al panel.
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      {tenant.custom_domain ? (
        <DnsInstructions domain={tenant.custom_domain} />
      ) : null}
    </div>
  );
}

function DnsInstructions({ domain }: { domain: string }) {
  const isApex = domain.split(".").length === 2; // e.g. "cervantes.com"
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-5 space-y-3">
      <h3 className="font-display font-semibold text-sm">
        Activar <code className="font-mono">{domain}</code>
      </h3>
      <p className="text-xs text-muted-foreground">
        Para que el panel responda en tu dominio, configura DNS y añádelo al
        proyecto en Vercel. Dos pasos:
      </p>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          1. Registro DNS
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
          {isApex
            ? "Apex (raíz) requiere un registro A que apunta a la IP de Vercel."
            : "Subdominios usan CNAME al endpoint de Vercel."}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          2. Añadir el dominio en Vercel
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          En el dashboard de Vercel del proyecto <code>bolivai-dashboard</code>{" "}
          → <strong>Settings → Domains</strong> → pega{" "}
          <code className="font-mono">{domain}</code> y verifica. Vercel emite
          el certificado SSL automáticamente cuando el DNS resuelve.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground italic pt-2 border-t border-border">
        Una vez verificado, accede al panel desde{" "}
        <code className="font-mono">https://{domain}</code>.
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
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-md border border-input bg-background cursor-pointer"
          aria-label={`${label} picker`}
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
