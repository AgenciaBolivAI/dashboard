import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Network, Calendar, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { getDocFull } from "@/lib/queries/brain-graph";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

const SOURCE_META: Record<string, { label: string; cls: string }> = {
  memory:        { label: "Memory",        cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  platform_doc:  { label: "Platform doc",  cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  schema:        { label: "Schema",        cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  worker_doc:    { label: "Worker",        cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  workflow_meta: { label: "n8n workflow",  cls: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30" },
  code_doc:      { label: "Code",          cls: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30" },
  voice_call:    { label: "Voice call",    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30" },
  manual:        { label: "Manual",        cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30" },
};

export default async function BrainDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  await requireBolivAIAdmin();

  const { id } = await params;
  const data = await getDocFull(id);
  if (!data?.doc) notFound();

  const { doc, entities } = data;
  const meta = SOURCE_META[doc.source_type] ?? { label: doc.source_type, cls: "" };
  const isCode = ["schema", "workflow_meta", "code_doc"].includes(doc.source_type);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin/brain">
          <ArrowLeft className="size-4" />
          Volver al brain
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <FileText className="size-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight">
            {doc.title}
          </h1>
          <Badge variant="outline" className={cn("text-xs", meta.cls)}>
            {meta.label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{doc.source_path}</span>
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            Indexado {new Date(doc.indexed_at).toLocaleDateString("es-BO")}
          </span>
          <span>{doc.content.length.toLocaleString()} chars</span>
        </div>
      </div>

      {/* Two-column: content + entities sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Content */}
        <Card>
          <div className="p-4 border-b">
            <p className="text-sm font-semibold">Contenido</p>
          </div>
          {isCode ? (
            <pre className="p-4 text-xs overflow-x-auto bg-secondary/30 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {doc.content}
            </pre>
          ) : (
            <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap break-words font-sans">
              {doc.content}
            </div>
          )}
        </Card>

        {/* Entities extracted from this doc */}
        <div className="space-y-3">
          <Card>
            <div className="p-4 border-b">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Network className="size-4 text-primary" />
                Entidades ({entities.length})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Extraídas automáticamente. Click para ver detalle.
              </p>
            </div>
            {entities.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                Sin entidades extraídas todavía.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {entities.map((e) => {
                  const color = TYPE_COLORS[e.type] ?? "#888888";
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/admin/brain/entity/${e.id}`}
                        className="flex items-start gap-2 p-2.5 hover:bg-secondary/50 transition group"
                      >
                        <span
                          className="size-2 rounded-full mt-1.5 shrink-0"
                          style={{ background: color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium truncate group-hover:text-primary transition">
                              {e.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0"
                              style={{ borderColor: color, color }}
                            >
                              {e.type}
                            </Badge>
                          </div>
                          {e.summary && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {e.summary}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {e.mention_count} {e.mention_count === 1 ? "mención" : "menciones"}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {doc.metadata && Object.keys(doc.metadata).length > 0 && (
            <Card className="p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tag className="size-3" />
                Metadata
              </p>
              <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(doc.metadata, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
