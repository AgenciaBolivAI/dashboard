"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  ShieldCheck,
  ShieldAlert,
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
  attestColdOutreachAction,
} from "@/lib/actions/aima";
import type { AimaSettings } from "@/lib/queries/aima";
import { cn } from "@/lib/utils";

// Labels resolved at render via t("source_<id>") / t("vertical_<id>").
const SOURCE_OPTIONS = [
  { id: "google_maps" },
  { id: "yellow_pages" },
  { id: "web_directory" },
  { id: "apollo" },
] as const;

const VERTICAL_PRESETS = [
  // Health & medical
  { id: "dental_clinic",        emoji: "🦷" },
  { id: "physiotherapy_clinic", emoji: "🩺" },
  { id: "medical_clinic",       emoji: "🏥" },
  { id: "dermatology_clinic",   emoji: "🧴" },
  { id: "optometry",            emoji: "👓" },
  { id: "psychology_practice",  emoji: "🧠" },
  { id: "nutritionist",         emoji: "🥗" },
  { id: "chiropractor",         emoji: "🦴" },
  { id: "veterinary_clinic",    emoji: "🐶" },
  { id: "pharmacy",             emoji: "💊" },
  // Beauty & wellness
  { id: "aesthetic_clinic",     emoji: "✨" },
  { id: "beauty_salon",         emoji: "💇" },
  { id: "barber_shop",          emoji: "💈" },
  { id: "nail_salon",           emoji: "💅" },
  { id: "spa_wellness",         emoji: "🧖" },
  { id: "massage_therapy",      emoji: "💆" },
  { id: "tattoo_studio",        emoji: "🎨" },
  // Fitness
  { id: "fitness_studio",       emoji: "💪" },
  { id: "yoga_studio",          emoji: "🧘" },
  { id: "martial_arts",         emoji: "🥋" },
  // Food & hospitality
  { id: "restaurant",           emoji: "🍽️" },
  { id: "cafe",                 emoji: "☕" },
  { id: "bakery",               emoji: "🥐" },
  { id: "catering",             emoji: "🍱" },
  { id: "hotel",                emoji: "🏨" },
  // Professional services
  { id: "real_estate",          emoji: "🏠" },
  { id: "law_firm",             emoji: "⚖️" },
  { id: "accounting_firm",      emoji: "📊" },
  { id: "insurance_agency",     emoji: "🛡️" },
  { id: "marketing_agency",     emoji: "📣" },
  { id: "travel_agency",        emoji: "✈️" },
  { id: "photography_studio",   emoji: "📷" },
  { id: "event_planning",       emoji: "🎉" },
  // Home & auto services
  { id: "cleaning_service",     emoji: "🧹" },
  { id: "plumbing",             emoji: "🔧" },
  { id: "electrician",          emoji: "⚡" },
  { id: "hvac",                 emoji: "❄️" },
  { id: "landscaping",          emoji: "🌿" },
  { id: "auto_repair",          emoji: "🚗" },
  // Retail
  { id: "florist",              emoji: "🌸" },
  { id: "jewelry_store",        emoji: "💍" },
  { id: "pet_store",            emoji: "🐾" },
  // Education
  { id: "tutoring_center",      emoji: "📚" },
  { id: "language_school",      emoji: "🗣️" },
  { id: "driving_school",       emoji: "🚙" },
  { id: "daycare",              emoji: "🧸" },
  { id: "music_school",         emoji: "🎵" },
] as const;

// Leading business cities worldwide. Grouped by region for readability,
// flattened into one suggestion list. Google Maps coverage is reliable in
// every one of these. ~95 cities; user can still add custom ones below.
const GEO_PRESETS = [
  // LatAm
  "Ciudad de México", "Guadalajara", "Monterrey", "Tijuana", "Puebla",
  "Bogotá", "Medellín", "Cali",
  "Lima Perú", "Arequipa",
  "Santiago Chile", "Valparaíso",
  "Buenos Aires", "Córdoba Argentina", "Rosario",
  "La Paz Bolivia", "Santa Cruz Bolivia", "Cochabamba",
  "Caracas", "Maracaibo",
  "Quito", "Guayaquil",
  "São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Porto Alegre",
  "Asunción", "Montevideo", "Panamá", "San José Costa Rica", "San Salvador",
  "Tegucigalpa", "Managua", "Guatemala", "Santo Domingo", "San Juan PR",
  // United States
  "New York", "Los Angeles", "Chicago", "Houston TX", "Phoenix",
  "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose CA",
  "Austin", "Jacksonville FL", "Miami FL", "Orlando FL", "Tampa FL",
  "Atlanta", "Boston", "Seattle", "Denver", "Washington DC",
  "Las Vegas", "Portland OR", "Charlotte NC", "Nashville",
  // Canada
  "Toronto", "Vancouver", "Montreal", "Calgary",
  // Europe
  "Madrid", "Barcelona", "Sevilla", "Valencia ES",
  "Lisboa", "Porto Portugal",
  "London", "Manchester", "Dublin",
  "Paris", "Lyon", "Marseille",
  "Berlin", "Munich", "Hamburg",
  "Amsterdam", "Rotterdam", "Brussels",
  "Rome", "Milan", "Naples",
  "Vienna", "Zurich", "Geneva",
  "Stockholm", "Copenhagen", "Oslo", "Helsinki",
  "Warsaw", "Prague", "Budapest", "Athens",
  // Middle East & Asia
  "Dubai", "Abu Dhabi", "Riyadh", "Doha", "Tel Aviv", "Istanbul",
  "Singapore", "Hong Kong", "Tokyo", "Seoul", "Bangkok",
  "Kuala Lumpur", "Jakarta", "Manila", "Ho Chi Minh City",
  "Mumbai", "Delhi", "Bangalore",
  // Africa
  "Cairo", "Lagos", "Johannesburg", "Cape Town", "Nairobi", "Casablanca",
  // Oceania
  "Sydney", "Melbourne", "Brisbane", "Auckland",
];

export function AimaSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: AimaSettings;
}) {
  const router = useRouter();
  const t = useTranslations("aima");
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();

  const [scraperEnabled, setScraperEnabled] = useState(settings.scraper_enabled);
  const [scraperSources, setScraperSources] = useState(settings.scraper_sources);
  const [scraperMax, setScraperMax] = useState(settings.scraper_max_per_run);
  const [scraperProxy, setScraperProxy] = useState(settings.scraper_proxy_url ?? "");
  const [scraperProxyToken, setScraperProxyToken] = useState(settings.scraper_proxy_token ?? "");
  // google_maps_api_key intentionally not surfaced to tenants. AIMA uses
  // BolivAI's master key by default and we eat the Google Places cost out
  // of the 5cr/lead charge. The column still exists in aima_settings as a
  // hidden override knob for support — but the tenant UI never asks for it.

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

  // Cold-outreach lawful-basis attestation. Until set, the "Start now" trigger
  // and the campaign engine refuse AIMA scraping + Sandra cold calls.
  const [attested, setAttested] = useState(Boolean(settings.cold_outreach_attested_at));
  const [consenting, startConsent] = useTransition();

  function handleAttest(next: boolean) {
    startConsent(async () => {
      const res = await attestColdOutreachAction(tenantId, next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setAttested(next);
      toast.success(next ? t("toast_consent_on") : t("toast_consent_off"));
      router.refresh();
    });
  }

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
        // Preserve any existing override; never let the tenant UI clear or set it.
        google_maps_api_key: settings.google_maps_api_key ?? null,
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
      toast.success(t("toast_saved"));
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
      toast.success(t("toast_started"));
      router.refresh();
    });
  }

  function handleStop() {
    if (!confirm(t("confirm_stop"))) return;
    startAct(async () => {
      const res = await abortAimaScrapeAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("toast_stopped"));
      setScraperEnabled(false);
      router.refresh();
    });
  }


  return (
    <div className="space-y-6">
      {/* Cold-outreach lawful-basis attestation — required before any prospecting */}
      <Card
        className={cn(
          "p-6 space-y-3 border-2",
          attested ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/50 bg-amber-500/5",
        )}
      >
        <div className="flex items-start gap-3">
          {attested ? (
            <ShieldCheck className="size-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="size-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-display font-semibold">{t("consent_title")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("consent_desc")}</p>
          </div>
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={attested}
            disabled={consenting}
            onChange={(e) => handleAttest(e.target.checked)}
            className="mt-0.5 size-4 rounded border-input accent-emerald-600"
          />
          <span className="text-sm">{t("consent_checkbox")}</span>
        </label>
        {attested && settings.cold_outreach_attested_by ? (
          <p className="text-xs text-muted-foreground pl-7">
            {t("consent_attested_by", { email: settings.cold_outreach_attested_by })}
          </p>
        ) : null}
        {!attested ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {t("consent_required_hint")}
          </p>
        ) : null}
      </Card>

      {/* Big controls */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Globe className="size-5 text-violet-500" />
              {t("finder_title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("finder_desc")}
            </p>
          </div>
          <ToggleButton
            on={scraperEnabled}
            onChange={setScraperEnabled}
            label={scraperEnabled ? "ON" : "OFF"}
          />
        </div>

        {/* The Google Maps Places API key field is intentionally NOT shown
            to tenants — they pay us per lead, we handle every external API
            for them. AIMA uses BolivAI's master key on the n8n VPS. */}
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
                {t(`source_${s.id}`)}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("max_per_run")}</Label>
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
            <Label className="text-xs">{t("proxy_url")}</Label>
            <Input
              type="url"
              value={scraperProxy}
              onChange={(e) => setScraperProxy(e.target.value)}
              placeholder={t("proxy_url_placeholder")}
            />
          </div>
          <div className="flex-1 space-y-1 min-w-[200px]">
            <Label className="text-xs">{t("proxy_token")}</Label>
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
            disabled={acting || !scraperEnabled || !attested}
            title={!attested ? t("consent_required_hint") : undefined}
            className="gap-1.5"
          >
            {acting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {t("start_now")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStop}
            disabled={acting}
            className="gap-1.5"
          >
            <StopCircle className="size-4" />
            {t("stop")}
          </Button>
        </div>
      </Card>

      {/* Apollo fallback */}
      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              {t("apollo_title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("apollo_desc")}
            </p>
          </div>
          <ToggleButton on={apolloEnabled} onChange={setApolloEnabled} label={apolloEnabled ? "ON" : "OFF"} />
        </div>
        <div className="space-y-1 pt-2">
          <Label className="text-xs">{t("apollo_api_key")}</Label>
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
              {t("cold_email_title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("cold_email_desc")}
            </p>
          </div>
          <ToggleButton on={coldEmailEnabled} onChange={setColdEmailEnabled} label={coldEmailEnabled ? "ON" : "OFF"} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("instantly_api_key")}</Label>
            <Input
              type="password"
              value={instantlyKey}
              onChange={(e) => setInstantlyKey(e.target.value)}
              placeholder="•••"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("campaign_id")}</Label>
            <Input
              value={instantlyCampaign}
              onChange={(e) => setInstantlyCampaign(e.target.value)}
              placeholder="cmp_…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("daily_cap")}</Label>
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
          {t("targeting_title")}
        </h2>

        {/* Verticals as chip multi-select from preset list */}
        <div className="space-y-2">
          <Label className="text-xs">{t("verticals_label", { count: verticals.length })}</Label>
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
                  {t(`vertical_${v.id}`)}
                </button>
              );
            })}
          </div>
          {verticals.filter((v) => !VERTICAL_PRESETS.some((p) => p.id === v)).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("custom_verticals")}:{" "}
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
          <Label className="text-xs">{t("geographies_label", { count: geographies.length })}</Label>
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
                    aria-label={t("remove_city", { city: c })}
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
              placeholder={t("new_city_placeholder")}
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
              <p className="text-xs text-muted-foreground mb-1.5">{t("suggested")}</p>
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
          {t("save_changes")}
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
