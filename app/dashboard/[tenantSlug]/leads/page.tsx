import Link from "next/link";
import { UserPlus, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTenantBySlug } from "@/lib/tenant";
import { listLeads, getLeadIntents } from "@/lib/queries/leads";
import { LeadRow, type LeadRowData } from "@/components/leads/lead-row";
import { formatDate, cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Nuevos" },
  { id: "contacted", label: "Contactados" },
  { id: "converted", label: "Convertidos" },
  { id: "lost", label: "Perdidos" },
];

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string; intent?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status, intent } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  const [leads, intents] = await Promise.all([
    listLeads(tenant.id, {
      status: status && status !== "all" ? status : undefined,
      intent: intent && intent !== "all" ? intent : undefined,
    }),
    getLeadIntents(tenant.id),
  ]);

  const exportQs = new URLSearchParams();
  if (status && status !== "all") exportQs.set("status", status);
  if (intent && intent !== "all") exportQs.set("intent", intent);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} {leads.length === 1 ? "lead" : "leads"}
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
          current={status ?? "all"}
          paramName="status"
          tenantSlug={tenantSlug}
          otherParam={intent ? `intent=${intent}` : ""}
        />
        {intents.length > 0 ? (
          <FilterRow
            label="Intención"
            options={[
              { id: "all", label: "Todas" },
              ...intents.map((i) => ({ id: i, label: i })),
            ]}
            current={intent ?? "all"}
            paramName="intent"
            tenantSlug={tenantSlug}
            otherParam={status ? `status=${status}` : ""}
          />
        ) : null}
      </div>

      {leads.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <UserPlus className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">Sin leads todavía</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cuando el agente capture datos de un cliente, aparecerán aquí.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Intención</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32">Capturado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <LeadRow
                  key={l.id}
                  tenantId={tenant.id}
                  lead={l as LeadRowData}
                  capturedLabel={formatDate(l.created_at)}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  current,
  paramName,
  tenantSlug,
  otherParam,
}: {
  label: string;
  options: { id: string; label: string }[];
  current: string;
  paramName: string;
  tenantSlug: string;
  otherParam: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">
        {label}:
      </span>
      {options.map((o) => {
        const active = current === o.id;
        const params = new URLSearchParams();
        if (o.id !== "all") params.set(paramName, o.id);
        if (otherParam) {
          const [k, v] = otherParam.split("=");
          if (k && v && k !== paramName) params.set(k, v);
        }
        const qs = params.toString();
        const href = `/dashboard/${tenantSlug}/leads${qs ? "?" + qs : ""}`;
        return (
          <Link
            key={o.id}
            href={href}
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
