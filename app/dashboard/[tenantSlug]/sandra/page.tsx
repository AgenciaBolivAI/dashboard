import Link from "next/link";
import { PhoneCall, Clock, CheckCircle2, Voicemail, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import {
  listSandraQueue,
  countSandraQueueByStatus,
  type SandraQueueItem,
} from "@/lib/queries/sandra-queue";
import { QueueTable } from "@/components/sandra-queue/queue-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { id: SandraQueueItem["status"] | "all"; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "calling", label: "Llamando" },
  { id: "completed", label: "Completadas" },
  { id: "no_answer", label: "Sin respuesta" },
  { id: "failed", label: "Fallidas" },
  { id: "skipped", label: "Saltadas" },
  { id: "all", label: "Todas" },
];

const ALLOWED_TENANT_SLUG = "bolivai";

export default async function SandraQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status: statusFilter = "pending" } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  if (tenant.slug !== ALLOWED_TENANT_SLUG) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          Cola de Sandra
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La cola de llamadas salientes (Sandra) está activa solo para el tenant{" "}
          <code className="px-1.5 py-0.5 rounded bg-secondary text-xs">bolivai</code>{" "}
          por ahora.
        </p>
      </div>
    );
  }

  const [items, counts] = await Promise.all([
    listSandraQueue(tenant.id, {
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as SandraQueueItem["status"]),
      limit: 500,
    }),
    countSandraQueueByStatus(tenant.id),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <PhoneCall className="size-7 text-cyan-500" />
          Cola de Sandra
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Leads en cola para que Sandra llame saliente. Selecciona los que
          quieres que Sandra contacte ahora, exporta el CSV y súbelo a
          ElevenLabs Batch Calling. Cuando Sandra termine, marca el resultado
          aquí para mantener el pipeline limpio.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={Clock}
          label="Pendientes"
          value={counts.pending}
          color="text-primary"
        />
        <StatCard
          icon={PhoneCall}
          label="Llamando"
          value={counts.calling}
          color="text-amber-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completadas"
          value={counts.completed}
          color="text-green-600"
        />
        <StatCard
          icon={Voicemail}
          label="Sin respuesta"
          value={counts.no_answer}
          color="text-blue-600"
        />
        <StatCard
          icon={XCircle}
          label="Saltadas"
          value={counts.skipped + counts.failed}
          color="text-muted-foreground"
        />
      </div>

      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">
          Estado:
        </span>
        {STATUS_FILTERS.map((f) => {
          const active = (statusFilter ?? "pending") === f.id;
          const href = `/dashboard/${tenantSlug}/sandra${
            f.id === "pending" ? "" : `?status=${f.id}`
          }`;
          return (
            <Link
              key={f.id}
              href={href}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <QueueTable tenantId={tenant.id} items={items} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("size-3.5", color)} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-display font-bold", color)}>{value}</p>
    </Card>
  );
}
