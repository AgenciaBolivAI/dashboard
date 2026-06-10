import Link from "next/link";
import { Sparkles, Clock, CheckCircle2, Send, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import {
  listCcavaiDrafts,
  listCcavaiRuns,
  getCcavaiStats,
  type CcavaiDraft,
} from "@/lib/queries/ccavai";
import { DraftCard } from "@/components/content/draft-card";
import { GenerateContentButton } from "@/components/content/generate-button";
import { cn } from "@/lib/utils";

// Drafts change throughout the day (new generations, edits, approvals,
// publishes). Caching would mean Celiel sees stale state until the next
// deploy; force a fresh render on every request.
export const dynamic = "force-dynamic";

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobados" },
  { id: "posted", label: "Publicados" },
  { id: "rejected", label: "Rechazados" },
  { id: "archived", label: "Archivados" },
  { id: "all", label: "Todos" },
];

const ALLOWED_TENANT_SLUG = "bolivai";

export default async function ContentPage({
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
          Contenido IA
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La generación de contenido (CCAVAI) está activa solo para el tenant{" "}
          <code className="px-1.5 py-0.5 rounded bg-secondary text-xs">bolivai</code>{" "}
          por ahora.
        </p>
      </div>
    );
  }

  const [drafts, runs, statsToday, statsWeek] = await Promise.all([
    listCcavaiDrafts({
      status:
        statusFilter === "all"
          ? undefined
          : (statusFilter as CcavaiDraft["status"]),
      limit: 300,
    }),
    listCcavaiRuns(10),
    getCcavaiStats("today"),
    getCcavaiStats("7d"),
  ]);

  // Group drafts by run so each generation batch displays together.
  const byRun = new Map<string, CcavaiDraft[]>();
  for (const d of drafts) {
    const list = byRun.get(d.run_id);
    if (list) list.push(d);
    else byRun.set(d.run_id, [d]);
  }
  // Within a run, group by story (so the 3 platform variants of a story
  // sit together — they share an image too).
  const groupsByRun = [...byRun.entries()].map(([runId, runDrafts]) => {
    const byStory = new Map<string, CcavaiDraft[]>();
    for (const d of runDrafts) {
      const list = byStory.get(d.story_title);
      if (list) list.push(d);
      else byStory.set(d.story_title, [d]);
    }
    const stories = [...byStory.values()];
    // Within a story, sort linkedin → instagram → facebook
    const platformOrder: Record<CcavaiDraft["platform"], number> = {
      linkedin: 0,
      instagram: 1,
      facebook: 2,
      x: 3,
    };
    stories.forEach((s) => s.sort((a, b) => platformOrder[a.platform] - platformOrder[b.platform]));
    return {
      runId,
      generatedAt: runDrafts[0]?.generated_at ?? null,
      stories,
    };
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Sparkles className="size-7 text-amber-500" />
            Contenido IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drafts generados por CCAVAI para LinkedIn, Instagram y Facebook.
            Revisa, aprueba y copia para publicar.
          </p>
        </div>
        <GenerateContentButton tenantId={tenant.id} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={Clock}
          label="Pendientes hoy"
          value={statsToday?.pending_review ?? 0}
          color="text-amber-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Aprobados hoy"
          value={statsToday?.approved ?? 0}
          color="text-green-600"
        />
        <StatCard
          icon={Send}
          label="Publicados hoy"
          value={statsToday?.posted ?? 0}
          color="text-purple-600"
        />
        <StatCard
          icon={Sparkles}
          label="Generados (7d)"
          value={statsWeek?.drafts_generated ?? 0}
          color="text-primary"
        />
        <StatCard
          icon={XCircle}
          label="Rechazados (7d)"
          value={statsWeek?.rejected ?? 0}
          color="text-muted-foreground"
        />
      </div>

      {/* Status filter */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">
          Estado:
        </span>
        {STATUS_FILTERS.map((f) => {
          const active = (statusFilter ?? "pending") === f.id;
          const href = `/dashboard/${tenantSlug}/content${
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

      {groupsByRun.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Sparkles className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">No hay drafts {statusFilter !== "all" && statusFilter !== "pending" ? STATUS_FILTERS.find((f) => f.id === statusFilter)?.label.toLowerCase() : "pendientes"}</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Toca <strong>Generar contenido</strong> arriba para que CCAVAI cree drafts a partir de las noticias de hoy.
          </p>
        </Card>
      ) : (
        <div className="space-y-10">
          {groupsByRun.map(({ runId, generatedAt, stories }) => (
            <div key={runId}>
              <div className="mb-4 flex items-end justify-between flex-wrap gap-2">
                <h2 className="text-lg font-display font-semibold">
                  Generación del{" "}
                  {generatedAt
                    ? new Date(generatedAt).toLocaleString("es-BO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : ""}
                </h2>
                <Badge variant="outline" className="text-xs">
                  {stories.length} historia{stories.length !== 1 ? "s" : ""} · {stories.reduce((n, s) => n + s.length, 0)} drafts
                </Badge>
              </div>

              <div className="space-y-8">
                {stories.map((variants) => {
                  const head = variants[0];
                  if (!head) return null;
                  return (
                    <div key={head.story_title}>
                      <div className="mb-3">
                        <h3 className="font-display font-semibold text-base">
                          {head.story_title}
                        </h3>
                        {head.story_summary && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {head.story_summary}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {variants.map((d) => (
                          <DraftCard key={d.id} tenantId={tenant.id} draft={d} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Run history strip at the bottom for context */}
      {runs.length > 0 && (
        <div className="mt-12 pt-6 border-t border-border">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Historial de generaciones
          </h3>
          <div className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <Badge
                key={r.id}
                variant="outline"
                className={cn(
                  "gap-2 text-xs",
                  r.status === "success" && "border-green-500/30 text-green-600",
                  r.status === "failed" && "border-destructive/30 text-destructive",
                  r.status === "running" && "border-amber-500/30 text-amber-600",
                )}
                title={`${r.drafts_created} drafts, ${r.stories_picked} historias`}
              >
                {new Date(r.started_at).toLocaleString("es-BO", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {r.drafts_created}d
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Sparkles;
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
