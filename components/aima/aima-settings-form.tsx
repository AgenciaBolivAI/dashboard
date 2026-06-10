"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Play,
  StopCircle,
  Globe,
  Mail,
  Target,
  Sparkles,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateAimaSettingsAction,
  triggerAimaScrapeAction,
  abortAimaScrapeAction,
} from "@/lib/actions/aima";
import type { AimaSettings } from "@/lib/queries/aima";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS = [
  { id: "google_maps", label: "Google Maps" },
  { id: "yellow_pages", label: "Yellow Pages" },
  { id: "web_directory", label: "Web directorios" },
  { id: "apollo", label: "Apollo" },
] as const;

const VERTICAL_PRESETS = [
  { id: "dental_clinic",        emoji: "🦷", label: "Dental" },
  { id: "physiotherapy_clinic", emoji: "🩺", label: "Fisio" },
  { id: "real_estate",          emoji: "🏠", label: "Inmobiliaria" },
  { id: "fitness_studio",       emoji: "💪", label: "Fitness" },
  { id: "aesthetic_clinic",     emoji: "✨", label: "Estética" },
  { id: "chiropractor",         emoji: "🦴", label: "Quiropráctico" },
  { id: "veterinary_clinic",    emoji: "🐶", label: "Veterinaria" },
  { id: "restaurant",           emoji: "🍽️", label: "Restaurante" },
  { id: "spa_wellness",         emoji: "🧖", label: "Spa" },
  { id: "beauty_salon",         emoji: "💇", label: "Belleza" },
  { id: "law_firm",             emoji: "⚖️", label: "Abogados" },
  { id: "accounting_firm",      emoji: "📊", label: "Contadores" },
] as const;

const GEO_PRESETS = [
  "Ciudad de México", "Bogotá", "Buenos Aires", "Santiago Chile", "Lima Perú",
  "La Paz Bolivia", "Caracas", "Quito", "São Paulo", "Asunción", "Montevideo",
  "Miami FL", "Houston TX", "New York", "Los Angeles", "Chicago",
  "Madrid", "Barcelona", "Lisboa", "London",
];

export function AimaSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: AimaSettings;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();

  const [scraperEnabled, setScraperEnabled] = useState(settings.scraper_enabled);
  const [scraperSources, setScraperSources] = useState(settings.scraper_sources);
  const [scraperMax, setScraperMax] = useState(settings.scraper_max_per_run);
  const [scraperProxy, setScraperProxy] = useState(settings.scraper_proxy_url ?? "");
  const [scraperProxyToken, setScraperProxyToken] = useState(settings.scraper_proxy_token ?? "");

  const [apolloEnabled, setApolloEnabled] = useState(settings.apollo_enabled);
  const [apolloKey, setApolloKey] = useState(settings.apollo_api_key ?? "");

  const [coldEmailEnabled, setColdEmailEnabled] = useState(settings.cold_email_enabled);
  const [instantlyKey, setInstantlyKey] = useState(settings.instantly_api_key ?? "");
  const [instantlyCampaign, setInstantlyCampaign] = useState(
    settings.instantly_campaign_id ?? "",
  );
  const [coldEmailCap, setColdEmailCap] = useState(settings.cold_email_daily_cap);

  const [verticals, setVerticals] = useState<string[]>(settings.target_verticals);
  const [geographies, setGeographies] = useState<string[]>(settings.target_geographies);
  const [newCity, setNewCity] = useState("");

  function toggleSource(id: typeof SOURCE_OPTIONS[number]["id"]) {
    setScraperSources((cur) =>
      cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id],
    );
  }

  function handleSave() {
    startSave(async () => {
      const res = await updateAimaSettingsAction(tenantId, {
        scraper_enabled: scraperEnabled,
        scraper_sources: scraperSources as ("google_maps" | "yellow_pages" | "web_directory" | "apollo")[],
        scraper_max_per_run: scraperMax,
        scraper_proxy_url: scraperProxy.trim() || null,
        scraper_proxy_token: scraperProxyToken.trim() || null,
        apollo_enabled: apolloEnabled,
        apollo_api_key: apolloKey.trim() || null,
        cold_email_enabled: coldEmailEnabled,
        instantly_api_key: instantlyKey.trim() || null,
        instantly_campaign_id: instantlyCampaign.trim() || null,
        cold_email_daily_cap: coldEmailCap,
        target_verticals: verticals,
        target_geographies: geographies,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Ajustes guardados");
      router.refresh();
    });
  }

  function handleStart() {
    startAct(async () => {
      const res = await triggerAimaScrapeAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("AIMA arrancando — los leads aparecerán en /leads.");
      router.refresh();
    });
  }

  function handleStop() {
    if (!confirm("¿Detener AIMA ahora? Los runs en curso se marcarán como abortados.")) return;
    startAct(async () => {
      const res = await abortAimaScrapeAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("AIMA detenida");
      setScraperEnabled(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Big controls */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Globe className="size-5 text-violet-500" />
              Scraper de leads
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Busca dueños de negocios en Yellow Pages, Google Maps, y la web
              abierta. Toggle abajo para activarlo + botón para empezar ahora.
            </p>
          </div>
          <ToggleButton
            on={scraperEnabled}
            onChange={setScraperEnabled}
            label={scraperEnabled ? "ON" : "OFF"}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {SOURCE_OPTIONS.map((s) => {
            const active = scraperSources.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSource(s.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Máximo por run</Label>
            <Input
              type="number"
              min={10}
              max={5000}
              value={scraperMax}
              onChange={(e) => setScraperMax(parseInt(e.target.value || "0", 10))}
              className="w-32"
            />
          </div>
          <div className="flex-1 space-y-1 min-w-[200px]">
            <Label className="text-xs">Proxy URL (opcional)</Label>
            <Input
              type="url"
              value={scraperProxy}
              onChange={(e) => setScraperProxy(e.target.value)}
              placeholder="https://brightdata… o tu proxy"
            />
          </div>
          <div className="flex-1 space-y-1 min-w-[200px]">
            <Label className="text-xs">Proxy token</Label>
            <Input
              type="password"
              value={scraperProxyToken}
              onChange={(e) => setScraperProxyToken(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={handleStart}
            disabled={acting || !scraperEnabled}
            className="gap-1.5"
          >
            {acting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Empezar ahora
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStop}
            disabled={acting}
            className="gap-1.5"
          >
            <StopCircle className="size-4" />
            Detener
          </Button>
        </div>
      </Card>

      {/* Apollo fallback */}
      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              Apollo (alternativa pagada)
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Si no quieres usar el scraper DIY hoy, activa Apollo y los leads
              vendrán de su API.
            </p>
          </div>
          <ToggleButton on={apolloEnabled} onChange={setApolloEnabled} label={apolloEnabled ? "ON" : "OFF"} />
        </div>
        <div className="space-y-1 pt-2">
          <Label className="text-xs">Apollo API key</Label>
          <Input
            type="password"
            value={apolloKey}
            onChange={(e) => setApolloKey(e.target.value)}
            placeholder="apk_…"
          />
        </div>
      </Card>

      {/* Cold email */}
      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Mail className="size-5 text-emerald-500" />
              Cold email vía Instantly
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Los nuevos leads se mandan a una campaña de Instantly.ai. Cuando
              alguien responde, el lead pasa a Sandra para una llamada.
            </p>
          </div>
          <ToggleButton on={coldEmailEnabled} onChange={setColdEmailEnabled} label={coldEmailEnabled ? "ON" : "OFF"} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Instantly API key</Label>
            <Input
              type="password"
              value={instantlyKey}
              onChange={(e) => setInstantlyKey(e.target.value)}
              placeholder="•••"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Campaign ID</Label>
            <Input
              value={instantlyCampaign}
              onChange={(e) => setInstantlyCampaign(e.target.value)}
              placeholder="cmp_…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Límite diario</Label>
            <Input
              type="number"
              min={1}
              max={2000}
              value={coldEmailCap}
              onChange={(e) => setColdEmailCap(parseInt(e.target.value || "0", 10))}
              className="w-32"
            />
          </div>
        </div>
      </Card>

      {/* Targeting */}
      <Card className="p-6 space-y-5">
        <h2 className="text-lg font-display font-semibold flex items-center gap-2">
          <Target className="size-5 text-rose-500" />
          A quién buscar
        </h2>

        {/* Verticals as chip multi-select from preset list */}
        <div className="space-y-2">
          <Label className="text-xs">Verticales ({verticals.length} seleccionadas)</Label>
          <div className="flex flex-wrap gap-1.5">
            {VERTICAL_PRESETS.map((v) => {
              const on = verticals.includes(v.id);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() =>
                    setVerticals((cur) =>
                      cur.includes(v.id) ? cur.filter((x) => x !== v.id) : [...cur, v.id],
                    )
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center gap-1",
                    on
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-rose-500/30",
                  )}
                >
                  <span>{v.emoji}</span>
                  {v.label}
                </button>
              );
            })}
          </div>
          {verticals.filter((v) => !VERTICAL_PRESETS.some((p) => p.id === v)).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Verticales personalizadas:{" "}
              {verticals
                .filter((v) => !VERTICAL_PRESETS.some((p) => p.id === v))
                .map((v) => (
                  <code key={v} className="ml-1 px-1.5 py-0.5 rounded bg-secondary">
                    {v}
                  </code>
                ))}
            </p>
          )}
        </div>

        {/* Cities as removable chips + add-new input */}
        <div className="space-y-2">
          <Label className="text-xs">Geografías ({geographies.length})</Label>
          {geographies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {geographies.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-secondary border border-border"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => setGeographies((cur) => cur.filter((x) => x !== c))}
                    className="text-muted-foreground hover:text-destructive transition"
                    aria-label={`Eliminar ${c}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Input
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = newCity.trim();
                  if (v && !geographies.includes(v)) {
                    setGeographies((cur) => [...cur, v]);
                  }
                  setNewCity("");
                }
              }}
              placeholder="Ciudad nueva, ej. Asunción"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const v = newCity.trim();
                if (v && !geographies.includes(v)) {
                  setGeographies((cur) => [...cur, v]);
                }
                setNewCity("");
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          {GEO_PRESETS.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Sugeridas:</p>
              <div className="flex flex-wrap gap-1.5">
                {GEO_PRESETS.filter((g) => !geographies.includes(g)).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGeographies((cur) => [...cur, g])}
                    className="px-2.5 py-1 rounded-full text-xs bg-secondary/50 border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                  >
                    + {g}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 shadow-lg">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

function ToggleButton({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-semibold transition",
        on
          ? "bg-primary/15 border-primary/40 text-primary"
          : "bg-secondary border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full transition",
          on ? "bg-primary" : "bg-muted-foreground",
        )}
      />
      {label}
    </button>
  );
}
