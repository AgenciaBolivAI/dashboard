import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Brain,
  FileText,
  Network,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { getEntityFull } from "@/lib/queries/brain-graph";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Same palette as the graph viewer — kept inline so the entity page
// doesn't depend on a client-side constant file.
const TYPE_COLORS: Record<string, string> = {
  agent:       "#00e5a0",
  vendor:      "#f97316",
  table:       "#3b82f6",
  workflow:    "#a855f7",
  integration: "#06b6d4",
  tool:        "#94a3b8",
  concept:     "#f43f5e",
  project:     "#facc15",
  person:      "#ec4899",
  company:     "#84cc16",
  place:       "#22d3ee",
  task:        "#64748b",
  event:       "#c084fc",
};

const SOURCE_LABELS: Record<string, string> = {
  memory: "Memory",
  platform_doc: "Platform doc",
  schema: "Schema",
  worker_doc: "Worker",
  workflow_meta: "n8n workflow",
  code_doc: "Code",
  voice_call: "Voice call",
  manual: "Manual",
};

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  await requireBolivAIAdmin();

  const { id } = await params;
  const data = await getEntityFull(id);
  if (!data?.entity) notFound();

  const { entity, outgoing, incoming, docs } = data;
  const color = TYPE_COLORS[entity.type] ?? "#888888";

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin/brain/graph">
          <ArrowLeft className="size-4" />
          Volver al mapa
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <span
            className="size-3 rounded-full"
            style={{ background: color }}
          />
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {entity.name}
          </h1>
          <Badge
            variant="outline"
            style={{ borderColor: color, color }}
          >
            {entity.type}
          </Badge>
        </div>
        {entity.summary && (
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            {entity.summary}
          </p>
        )}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
          <span>
            Mencionada <strong className="text-foreground">{entity.mention_count}</strong>{" "}
            {entity.mention_count === 1 ? "vez" : "veces"}
          </span>
          <span>Primera vista: {new Date(entity.first_seen).toLocaleDateString("es-BO")}</span>
          <span>Última: {new Date(entity.last_seen).toLocaleDateString("es-BO")}</span>
          <span>
            {outgoing.length} relaciones salientes · {incoming.length} entrantes ·{" "}
            {docs.length} docs
          </span>
        </div>
      </div>

      {/* Three-column grid: outgoing edges | docs | incoming edges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outgoing edges */}
        <Card>
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ArrowUpFromLine className="size-4 text-primary" />
              Relaciones salientes ({outgoing.length})
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cosas que <strong>{entity.name}</strong> hace o referencia.
            </p>
          </div>
          <EdgeList
            edges={outgoing}
            direction="outgoing"
            entityName={entity.name}
          />
        </Card>

        {/* Incoming edges */}
        <Card>
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownToLine className="size-4 text-cyan-500" />
              Relaciones entrantes ({incoming.length})
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cosas que hacen referencia a <strong>{entity.name}</strong>.
            </p>
          </div>
          <EdgeList
            edges={incoming}
            direction="incoming"
            entityName={entity.name}
          />
        </Card>
      </div>

      {/* Source documents */}
      <Card className="mt-4">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Documentos que mencionan a {entity.name} ({docs.length})
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ordenado por cuántas veces apareció. Click para ir al archivo fuente.
          </p>
        </div>
        {docs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            (Esta entidad fue creada antes de que escribiéramos el join doc↔entity.
            Va a poblarse después del próximo re-extract.)
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const label = SOURCE_LABELS[d.source_type] ?? d.source_type;
              return (
                <li key={d.doc_id} className="p-4 flex items-start gap-3">
                  <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{d.title}</span>
                      <Badge variant="outline" className="text-[10px]">{label}</Badge>
                      {d.extraction_count > 1 && (
                        <Badge variant="muted" className="text-[10px]">
                          ×{d.extraction_count} extracciones
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {d.source_path}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4 p-3 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          <Network className="size-3 inline mr-1.5" />
          Tip: cada nombre azul es clickeable y te lleva a la página de esa entidad.
          Es como navegar Wikipedia, pero todo de BolivAI.
        </p>
      </Card>
    </div>
  );
}

function EdgeList({
  edges,
  direction,
  entityName,
}: {
  edges: Array<{
    edge_id: string;
    relation: string;
    weight: number;
    other: { id: string; name: string; type: string; mention_count: number };
  }>;
  direction: "outgoing" | "incoming";
  entityName: string;
}) {
  if (edges.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        Sin relaciones {direction === "outgoing" ? "salientes" : "entrantes"} todavía.
      </div>
    );
  }

  // Group by relation verb so big buckets ("uses") render together
  const grouped = new Map<string, typeof edges>();
  for (const e of edges) {
    const list = grouped.get(e.relation) ?? [];
    list.push(e);
    grouped.set(e.relation, list);
  }
  const sortedKeys = Array.from(grouped.keys()).sort(
    (a, b) => (grouped.get(b)!.length - grouped.get(a)!.length) || a.localeCompare(b),
  );

  return (
    <ul className="divide-y divide-border">
      {sortedKeys.map((relation) => {
        const items = grouped.get(relation)!;
        return (
          <li key={relation} className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-2">
              {direction === "outgoing" ? (
                <>
                  <span className="text-foreground">{entityName}</span>
                  <ArrowRight className="size-3" />
                  <span className="text-primary">{relation}</span>
                  <ArrowRight className="size-3" />
                  <span>…</span>
                </>
              ) : (
                <>
                  <span>…</span>
                  <ArrowRight className="size-3" />
                  <span className="text-cyan-500">{relation}</span>
                  <ArrowRight className="size-3" />
                  <span className="text-foreground">{entityName}</span>
                </>
              )}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                {items.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((e) => {
                const color = TYPE_COLORS[e.other.type] ?? "#888888";
                return (
                  <Link
                    key={e.edge_id}
                    href={`/admin/brain/entity/${e.other.id}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs",
                      "bg-secondary border border-border hover:border-primary/40 transition",
                    )}
                    title={`${e.other.type} · mencionada ${e.other.mention_count} veces`}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="truncate max-w-[180px]">{e.other.name}</span>
                  </Link>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
