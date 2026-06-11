import Link from "next/link";
import { UserPlus, Download } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { listLeads, getLeadIntents, getLeadFacets } from "@/lib/queries/leads";
import { COUNTRY_BY_CODE } from "@/lib/leads-geo";
import { LeadsTable, type LeadFromQuery } from "@/components/leads/leads-table";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { intentLabel } from "@/lib/leads-intents";
import { cn } from "@/lib/utils";

type LeadsSearchParams = {
  status?: string;
  intent?: string;
  source?: string;
  city?: string;
  vertical?: string;
  country?: string;   // ISO alpha-2 (e.g. "US")
  state?: string;     // e.g. "Florida"
  q?: string;         // realtime search — name / phone / email
};

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<LeadsSearchParams>;
}) {
  const { tenantSlug } = await params;
  const filters = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("leads");

  const STATUS_FILTERS = [
    { id: "all", label: t("status_all") },
    { id: "new", label: t("status_new") },
    { id: "contacted", label: t("status_contacted") },
    { id: "warm", label: t("status_warm") },
    { id: "converted", label: t("status_converted") },
    { id: "not_interested", label: t("status_not_interested") },
    { id: "do_not_contact", label: t("status_do_not_contact") },
    { id: "lost", label: t("status_lost") },
  ];

  const SOURCE_LABELS: Record<string, string> = {
    aima: "AIMA",
    whatsapp: "WhatsApp",
    manual: t("source_manual"),
    voice: t("source_voice"),
    webform: t("source_webform"),
  };

  const VERTICAL_LABELS: Record<string, string> = {
    dental_clinic: t("vertical_dental"),
    physiotherapy_clinic: t("vertical_physio"),
    real_estate: t("vertical_real_estate"),
    fitness_studio: t("vertical_fitness"),
    aesthetic_clinic: t("vertical_aesthetic"),
    chiropractor: t("vertical_chiropractor"),
    veterinary_clinic: t("vertical_veterinary"),
    restaurant: t("vertical_restaurant"),
  };

  const [leads, intents, facets] = await Promise.all([
    listLeads(tenant.id, {
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
      intent: filters.intent && filters.intent !== "all" ? filters.intent : undefined,
      source: filters.source && filters.source !== "all" ? filters.source : undefined,
      city: filters.city && filters.city !== "all" ? filters.city : undefined,
      vertical: filters.vertical && filters.vertical !== "all" ? filters.vertical : undefined,
      country: filters.country && filters.country !== "all" ? filters.country : undefined,
      state: filters.state && filters.state !== "all" ? filters.state : undefined,
      search: filters.q?.trim() || undefined,
    }),
    getLeadIntents(tenant.id),
    getLeadFacets(tenant.id),
  ]);

  // Reflect ALL active filters in the export URL so the CSV matches the visible table
  const exportQs = new URLSearchParams();
  for (const key of ["status", "intent", "source", "city", "vertical", "country", "state", "q"] as const) {
    const v = filters[key];
    if (v && v !== "all") exportQs.set(key, v);
  }

  function hrefFor(swap: Partial<LeadsSearchParams>): string {
    const params = new URLSearchParams();
    const next = { ...filters, ...swap } as LeadsSearchParams;
    // Changing country clears the state filter — they don't mix.
    if ("country" in swap) delete next.state;
    for (const k of ["status", "intent", "source", "city", "vertical", "country", "state", "q"] as const) {
      const v = next[k];
      if (v && v !== "all") params.set(k, v);
    }
    const qs = params.toString();
    return `/dashboard/${tenantSlug}/leads${qs ? "?" + qs : ""}`;
  }

  const filtered = Boolean(
    filters.city || filters.vertical || filters.source || filters.country || filters.state,
  );

  // Available states for the currently-selected country (or all if no country selected)
  const statesForCountry: string[] =
    filters.country && filters.country !== "all"
      ? (facets.states[filters.country] ?? [])
      : Object.values(facets.states).flat().slice(0, 200);
  const countText = leads.length === 1 ? t("count_one", { count: leads.length }) : t("count_other", { count: leads.length });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {countText}
            {filtered && " " + t("filtered_suffix")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/leads/export?tenantSlug=${tenantSlug}&${exportQs.toString()}`}
            download
          >
            <Download className="size-4" />
            {t("export_csv")}
          </a>
        </Button>
      </div>

      <div className="mb-4">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <div className="mb-4 space-y-3">
        <FilterRow
          label={t("filter_status")}
          options={STATUS_FILTERS}
          current={filters.status ?? "all"}
          hrefFor={(id) => hrefFor({ status: id })}
        />
        {facets.sources.length > 1 ? (
          <FilterRow
            label={t("filter_source")}
            options={[
              { id: "all", label: t("status_all") },
              ...facets.sources.map((s) => ({ id: s, label: SOURCE_LABELS[s] ?? s })),
            ]}
            current={filters.source ?? "all"}
            hrefFor={(id) => hrefFor({ source: id })}
          />
        ) : null}
        {facets.verticals.length > 0 ? (
          <FilterRow
            label={t("filter_vertical")}
            options={[
              { id: "all", label: t("all_feminine") },
              ...facets.verticals.map((v) => ({
                id: v,
                label: VERTICAL_LABELS[v] ?? v.replace(/_/g, " "),
              })),
            ]}
            current={filters.vertical ?? "all"}
            hrefFor={(id) => hrefFor({ vertical: id })}
          />
        ) : null}
        {facets.countries.length > 1 ? (
          <FilterRow
            label={t("filter_country")}
            options={[
              { id: "all", label: t("all_masculine_plural") },
              ...facets.countries.map((code) => {
                const c = COUNTRY_BY_CODE[code];
                return {
                  id: code,
                  label: c ? `${c.flag} ${c.name}` : code,
                };
              }),
            ]}
            current={filters.country ?? "all"}
            hrefFor={(id) => hrefFor({ country: id })}
          />
        ) : null}
        {statesForCountry.length > 0 ? (
          <FilterRow
            label={t("filter_state")}
            options={[
              { id: "all", label: t("all_masculine_plural") },
              ...statesForCountry.map((s) => ({ id: s, label: s })),
            ]}
            current={filters.state ?? "all"}
            hrefFor={(id) => hrefFor({ state: id })}
          />
        ) : null}
        {facets.cities.length > 0 ? (
          <FilterRow
            label={t("filter_city")}
            options={[
              { id: "all", label: t("all_feminine") },
              ...facets.cities.map((c) => ({ id: c, label: c })),
            ]}
            current={filters.city ?? "all"}
            hrefFor={(id) => hrefFor({ city: id })}
          />
        ) : null}
        {intents.length > 0 ? (
          <FilterRow
            label={t("filter_intent")}
            options={[
              { id: "all", label: t("all_feminine") },
              ...intents.map((i) => ({ id: i, label: intentLabel(i) })),
            ]}
            current={filters.intent ?? "all"}
            hrefFor={(id) => hrefFor({ intent: id })}
          />
        ) : null}
      </div>

      {leads.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <UserPlus className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_description")}
          </p>
        </Card>
      ) : (
        <LeadsTable tenantId={tenant.id} leads={leads as unknown as LeadFromQuery[]} />
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  current,
  hrefFor,
}: {
  label: string;
  options: { id: string; label: string }[];
  current: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1 min-w-[68px]">
        {label}:
      </span>
      {options.map((o) => {
        const active = current === o.id;
        return (
          <Link
            key={o.id}
            href={hrefFor(o.id)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
