import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Brain, FileText, Lightbulb, HelpCircle, Database, Network } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getBrainStats, listOpenUnknowns } from "@/lib/actions/company-brain";
import { BrainSearch } from "@/components/admin/brain-search";
import { DecisionForm } from "@/components/admin/decision-form";
import { UnknownsList } from "@/components/admin/unknowns-list";

export const dynamic = "force-dynamic";

export default async function AdminBrainPage() {
  const t = await getTranslations("admin_brain");
  const [stats, unknowns] = await Promise.all([
    getBrainStats(),
    listOpenUnknowns(),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Brain className="size-7 text-primary" />
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {t("page_intro")}
          </p>
        </div>
        <Button asChild variant="outline" className="gap-1.5">
          <Link href="/admin/brain/graph">
            <Network className="size-4" />
            {t("view_map")}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          icon={FileText}
          label={t("stat_docs")}
          value={stats?.total_docs ?? 0}
          color="text-primary"
        />
        <StatTile
          icon={Lightbulb}
          label={t("stat_decisions")}
          value={stats?.total_decisions ?? 0}
          color="text-amber-500"
        />
        <StatTile
          icon={HelpCircle}
          label={t("stat_open_questions")}
          value={stats?.open_unknowns ?? 0}
          color="text-rose-500"
        />
        <StatTile
          icon={Database}
          label={t("stat_last_ingest")}
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
            {t("docs_by_source")}
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
          <strong>{t("reindex_label")}</strong>: {t("reindex_intro")}{" "}
          <code className="bg-secondary px-1 py-0.5 rounded text-[11px]">
            npx tsx scripts/brain-ingest.ts
          </code>{" "}
          {t("reindex_from")} <code className="bg-secondary px-1 py-0.5 rounded text-[11px]">platform/dashboard</code>.
          {" "}{t("reindex_dedup")}
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
