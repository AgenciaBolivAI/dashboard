import { Brain, FileText, Lightbulb, HelpCircle, Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getBrainStats, listOpenUnknowns } from "@/lib/actions/company-brain";
import { BrainSearch } from "@/components/admin/brain-search";
import { DecisionForm } from "@/components/admin/decision-form";
import { UnknownsList } from "@/components/admin/unknowns-list";

export const dynamic = "force-dynamic";

export default async function AdminBrainPage() {
  const [stats, unknowns] = await Promise.all([
    getBrainStats(),
    listOpenUnknowns(),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Brain className="size-7 text-primary" />
          Company Brain
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Mapa vivo de cómo funciona BolivAI. Memoria, decisiones, esquemas, prompts
          y conocimiento operacional indexado y buscable. Hacé una pregunta abajo y
          el brain responde citando las fuentes.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          icon={FileText}
          label="Documentos"
          value={stats?.total_docs ?? 0}
          color="text-primary"
        />
        <StatTile
          icon={Lightbulb}
          label="Decisiones"
          value={stats?.total_decisions ?? 0}
          color="text-amber-500"
        />
        <StatTile
          icon={HelpCircle}
          label="Preguntas abiertas"
          value={stats?.open_unknowns ?? 0}
          color="text-rose-500"
        />
        <StatTile
          icon={Database}
          label="Última ingesta"
          value={
            stats?.last_indexed_at
              ? new Date(stats.last_indexed_at).toLocaleDateString("es-BO")
              : "—"
          }
          color="text-cyan-500"
          isText
        />
      </div>

      {stats?.docs_by_source && (
        <Card className="p-4 mb-6 bg-muted/30">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Documentos por origen
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(stats.docs_by_source as Record<string, number>)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .map(([source, count]) => (
                <span
                  key={source}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border"
                >
                  <span className="text-xs text-muted-foreground">{source}</span>
                  <span className="font-mono font-bold text-foreground">{String(count)}</span>
                </span>
              ))}
          </div>
        </Card>
      )}

      {/* Decision capture */}
      <div className="mb-6">
        <DecisionForm />
      </div>

      {/* Unknowns */}
      <div className="mb-6">
        <UnknownsList unknowns={unknowns} />
      </div>

      {/* Search interface */}
      <BrainSearch />

      {/* Re-ingest instructions */}
      <Card className="p-4 mt-8 border-dashed bg-muted/20">
        <p className="text-xs text-muted-foreground">
          <strong>Re-indexar</strong>: cuando edites memoria, docs, o agregues una
          migración nueva, corré{" "}
          <code className="bg-secondary px-1 py-0.5 rounded text-[11px]">
            npx tsx scripts/brain-ingest.ts
          </code>{" "}
          desde <code className="bg-secondary px-1 py-0.5 rounded text-[11px]">platform/dashboard</code>.
          Solo re-embebe archivos cuyo contenido cambió (dedup por hash sha256).
        </p>
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  color,
  isText,
}: {
  icon: typeof Brain;
  label: string;
  value: number | string;
  color: string;
  isText?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`size-4 ${color}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`mt-1 font-display ${isText ? "text-sm" : "text-2xl"} font-extrabold`}>
        {value}
      </p>
    </Card>
  );
}
