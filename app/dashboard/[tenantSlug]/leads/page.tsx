import Link from "next/link";
import { UserPlus, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { listLeads, getLeadIntents, getLeadFacets } from "@/lib/queries/leads";
import { LeadsTable, type LeadFromQuery } from "@/components/leads/leads-table";
import { intentLabel } from "@/lib/leads-intents";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "contacted", label: "Contactados" },
  { id: "converted", label: "Convertidos" },
  { id: "lost", label: "Perdidos" },
];

const SOURCE_LABELS: Record<string, string> = {
  aima: "AIMA",
  whatsapp: "WhatsApp",
  manual: "Manual",
  voice: "Voz",
  webform: "Formulario",
};

const VERTICAL_LABELS: Record<string, string> = {
  dental_clinic: "Dental",
  physiotherapy_clinic: "Fisio",
  real_estate: "Inmobiliaria",
  fitness_studio: "Fitness",
  aesthetic_clinic: "Estética",
  chiropractor: "Quiropráctico",
  veterinary_clinic: "Veterinaria",
  restaurant: "Restaurante",
};

type LeadsSearchParams = {
  status?: string;
  intent?: string;
  source?: string;
  city?: string;
  vertical?: string;
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

  const [leads, intents, facets] = await Promise.all([
    listLeads(tenant.id, {
      status: filters.status && filters.status !== "all" ? filters.status : undefined,
      intent: filters.intent && filters.intent !== "all" ? filters.intent : undefined,
      source: filters.source && filters.source !== "all" ? filters.source : undefined,
      city: filters.city && filters.city !== "all" ? filters.city : undefined,
      vertical: filters.vertical && filters.vertical !== "all" ? filters.vertical : undefined,
    }),
    getLeadIntents(tenant.id),
    getLeadFacets(tenant.id),
  ]);

  // Reflect ALL active filters in the export URL so the CSV matches the visible table
  const exportQs = new URLSearchParams();
  for (const key of ["status", "intent", "source", "city", "vertical"] as const) {
    const v = filters[key];
    if (v && v !== "all") exportQs.set(key, v);
  }

  function hrefFor(swap: Partial<LeadsSearchParams>): string {
    const params = new URLSearchParams();
    const next = { ...filters, ...swap } as LeadsSearchParams;
    for (const k of ["status", "intent", "source", "city", "vertical"] as const) {
      const v = next[k];
      if (v && v !== "all") params.set(k, v);
    }
    const qs = params.toString();
    return `/dashboard/${tenantSlug}/leads${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} {leads.length === 1 ? "lead" : "leads"}
            {(filters.city || filters.vertical || filters.source) && " (filtrado)"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/leads/export?tenantSlug=${tenantSlug}&${exportQs.toString()}`}
            download
          >
            <Download className="size-4" />
            Exportar CSV
          </a>
        </Button>
      </div>

      <div className="mb-4 space-y-3">
        <FilterRow
          label="Estado"
          options={STATUS_FILTERS}
          current={filters.status ?? "all"}
          hrefFor={(id) => hrefFor({ status: id })}
        />
        {facets.sources.length > 1 ? (
          <FilterRow
            label="Origen"
            options={[
              { id: "all", label: "Todos" },
              ...facets.sources.map((s) => ({ id: s, label: SOURCE_LABELS[s] ?? s })),
            ]}
            current={filters.source ?? "all"}
            hrefFor={(id) => hrefFor({ source: id })}
          />
        ) : null}
        {facets.verticals.length > 0 ? (
          <FilterRow
            label="Vertical"
            options={[
              { id: "all", label: "Todas" },
              ...facets.verticals.map((v) => ({
                id: v,
                label: VERTICAL_LABELS[v] ?? v.replace(/_/g, " "),
              })),
            ]}
            current={filters.vertical ?? "all"}
            hrefFor={(id) => hrefFor({ vertical: id })}
          />
        ) : null}
        {facets.cities.length > 0 ? (
          <FilterRow
            label="Ciudad"
            options={[
              { id: "all", label: "Todas" },
              ...facets.cities.map((c) => ({ id: c, label: c })),
            ]}
            current={filters.city ?? "all"}
            hrefFor={(id) => hrefFor({ city: id })}
          />
        ) : null}
        {intents.length > 0 ? (
          <FilterRow
            label="Intención"
            options={[
              { id: "all", label: "Todas" },
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
          <p className="font-medium">Sin leads que coincidan</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Cuando AIMA encuentre nuevos negocios o el agente capture datos de un cliente,
            aparecerán aquí.
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
