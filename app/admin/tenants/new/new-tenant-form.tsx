"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Sparkles, Plug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createTenantAction, type AdminState } from "@/lib/actions/admin";
import { TEMPLATES, GATEWAYS, getGateway } from "@/lib/templates";
import { cn } from "@/lib/utils";

const initial: AdminState = { error: null };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function NewTenantForm() {
  const [state, action, pending] = useActionState(createTenantAction, initial);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [gatewayId, setGatewayId] = useState<string>("evolution");
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, string>>({});

  const template = useMemo(
    () => TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0],
    [templateId],
  );
  const gateway = useMemo(() => getGateway(gatewayId), [gatewayId]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  // If the chosen template doesn't support the current gateway, reset
  useEffect(() => {
    if (!template.supportedGateways.includes(gatewayId as never)) {
      setGatewayId(template.supportedGateways[0]);
    }
  }, [template, gatewayId]);

  const gatewayConfigJson = useMemo(
    () => JSON.stringify(gatewayConfig),
    [gatewayConfig],
  );

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="workflow_template" value={templateId} />
      <input type="hidden" name="gateway" value={gatewayId} />
      <input type="hidden" name="gateway_config_json" value={gatewayConfigJson} />

      {/* ── Step 1: Template ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h3 className="font-display font-semibold">Tipo de agente</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            const disabled = t.status === "coming_soon";
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  "text-left rounded-lg border p-4 transition relative",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border bg-card",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-medium">{t.name}</p>
                  {disabled ? (
                    <Badge variant="muted" className="shrink-0">
                      Próximamente
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {t.description}
                </p>
                <div className="flex flex-wrap gap-1">
                  {t.features.map((f) => (
                    <Badge key={f.id} variant="outline" className="text-[10px]">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── Step 2: Gateway ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Plug className="size-4 text-primary" />
          <h3 className="font-display font-semibold">Canal de mensajería</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {GATEWAYS.map((g) => {
            const supported = template.supportedGateways.includes(g.id);
            const disabled = g.status === "coming_soon" || !supported;
            const active = g.id === gatewayId;
            return (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                onClick={() => setGatewayId(g.id)}
                className={cn(
                  "text-left rounded-lg border p-3 transition",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-border",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium">{g.name}</p>
                  {g.status === "coming_soon" ? (
                    <Badge variant="muted" className="text-[10px] shrink-0">
                      Pronto
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {g.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Step 3: Gateway config ──────────────────────────────── */}
      {gateway.configFields.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-display font-semibold">
            Configuración de {gateway.short}
          </h3>
          {gateway.configFields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`gw-${f.key}`}>
                {f.label}
                {f.required ? <span className="text-destructive ml-1">*</span> : null}
              </Label>
              <Input
                id={`gw-${f.key}`}
                type={f.type === "password" ? "password" : "text"}
                placeholder={f.placeholder}
                value={gatewayConfig[f.key] ?? ""}
                onChange={(e) =>
                  setGatewayConfig((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className={f.type === "password" ? "font-mono" : ""}
              />
              {f.description ? (
                <p className="text-xs text-muted-foreground">{f.description}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <Separator />

      {/* ── Step 4: Tenant details ───────────────────────────────── */}
      <section className="space-y-5">
        <h3 className="font-display font-semibold">Datos del negocio</h3>

        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugManual) setSlug(slugify(e.target.value));
            }}
            placeholder="Clínica Cervantes"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugManual(true);
            }}
            className="font-mono"
            placeholder="cervantes"
          />
          <p className="text-xs text-muted-foreground">
            URL: <code>/dashboard/{slug || "..."}/overview</code>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="industry">Industria (opcional)</Label>
          <Input
            id="industry"
            name="industry"
            placeholder={template.vertical}
          />
          <p className="text-xs text-muted-foreground">
            Si lo dejas vacío usaremos <code>{template.vertical}</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="language">Idioma</Label>
            <Input id="language" name="language" defaultValue="es" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <Input
              id="timezone"
              name="timezone"
              defaultValue="America/La_Paz"
              required
            />
          </div>
        </div>
      </section>

      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear tenant"}
      </Button>
    </form>
  );
}
