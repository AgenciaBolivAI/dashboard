import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
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

  const t = await getTranslations("admin_brain");
  const locale = await getLocale();

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
          {t("back_to_map")}
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
            {t.rich("mentioned_n_times", {
              count: entity.mention_count,
              strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
            })}
          </span>
          <span>{t("first_seen", { date: new Date(entity.first_seen).toLocaleDateString(locale) })}</span>
          <span>{t("last_seen", { date: new Date(entity.last_seen).toLocaleDateString(locale) })}</span>
          <span>
            {t("relations_summary", {
              outgoing: outgoing.length,
              incoming: incoming.length,
              docs: docs.length,
            })}
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
              {t("outgoing_relations", { count: outgoing.length })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.rich("outgoing_caption", {
                name: entity.name,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
          <EdgeList
            edges={outgoing}
            direction="outgoing"
            entityName={entity.name}
            emptyLabel={t("no_outgoing")}
            tooltipFor={(type, count) => t("entity_tooltip", { type, count })}
          />
        </Card>

        {/* Incoming edges */}
        <Card>
          <div className="p-4 border-b">
            <p className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownToLine className="size-4 text-cyan-500" />
              {t("incoming_relations", { count: incoming.length })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.rich("incoming_caption", {
                name: entity.name,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
          <EdgeList
            edges={incoming}
            direction="incoming"
            entityName={entity.name}
            emptyLabel={t("no_incoming")}
            tooltipFor={(type, count) => t("entity_tooltip", { type, count })}
          />
        </Card>
      </div>

      {/* Source documents */}
      <Card className="mt-4">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            {t("docs_mentioning", { name: entity.name, count: docs.length })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("docs_mentioning_caption")}
          </p>
        </div>
        {docs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {t("docs_empty_legacy")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const label = SOURCE_LABELS[d.source_type] ?? d.source_type;
              return (
                <li key={d.doc_id}>
                  <Link
                    href={`/admin/brain/doc/${d.doc_id}`}
                    className="p-4 flex items-start gap-3 hover:bg-secondary/40 transition-colors group"
                  >
                    <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium truncate group-hover:text-primary group-hover:underline">
                          {d.title}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{label}</Badge>
                        {d.extraction_count > 1 && (
                          <Badge variant="muted" className="text-[10px]">
                            {t("extractions_count", { count: d.extraction_count })}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {d.source_path}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4 p-3 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          <Network className="size-3 inline mr-1.5" />
          {t("nav_tip")}
        </p>
      </Card>
    </div>
  );
}

function EdgeList({
  edges,
  direction,
  entityName,
  emptyLabel,
  tooltipFor,
}: {
  edges: Array<{
    edge_id: string;
    relation: string;
    weight: number;
    other: { id: string; name: string; type: string; mention_count: number };
  }>;
  direction: "outgoing" | "incoming";
  entityName: string;
  emptyLabel: string;
  tooltipFor: (type: string, count: number) => string;
}) {
  if (edges.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {emptyLabel}
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
                    title={tooltipFor(e.other.type, e.other.mention_count)}
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
