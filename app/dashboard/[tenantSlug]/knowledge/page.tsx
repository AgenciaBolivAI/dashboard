import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import {
  listKnowledge,
  listSources,
  getKnowledgeStats,
  type KnowledgeType,
} from "@/lib/queries/knowledge";
import { KnowledgeManager } from "@/components/knowledge/knowledge-manager";
import { VoiceSyncStatus } from "@/components/knowledge/voice-sync-status";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { cn } from "@/lib/utils";

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const { tenantSlug } = await params;
  const { type: typeParam, q } = await searchParams;
  const type: KnowledgeType = typeParam === "pain" ? "pain" : "documents";
  const search = q?.trim() || undefined;

  const t = await getTranslations("knowledge");
  const locale = await getLocale();

  const TABS: { id: KnowledgeType; label: string; sub: string }[] = [
    { id: "documents", label: t("tab_faq_label"), sub: t("tab_faq_sub") },
    { id: "pain", label: t("tab_clinical_label"), sub: t("tab_clinical_sub") },
  ];

  const tenant = await getTenantBySlug(tenantSlug);
  const [chunks, sources, stats] = await Promise.all([
    listKnowledge(tenant.id, type, { search }),
    listSources(tenant.id, type),
    getKnowledgeStats(tenant.id),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">
          {t("page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page_description")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label={t("stat_faq_chunks")} value={stats.documentsCount} locale={locale} />
        <StatCard label={t("stat_clinical_chunks")} value={stats.painCount} locale={locale} />
        <StatCard
          label={t("stat_unique_sources")}
          value={stats.sourcesCount}
          href="#sources"
          locale={locale}
        />
      </div>

      <VoiceSyncStatus
        tenantId={tenant.id}
        voiceEnabled={tenant.voice_enabled}
        lastSyncedAt={tenant.voice_kb_synced_at}
      />

      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.id === type;
          return (
            <Link
              key={tab.id}
              href={`/dashboard/${tenantSlug}/knowledge?type=${tab.id}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={cn(
                "px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {tab.sub}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mb-4">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      <KnowledgeManager
        tenantId={tenant.id}
        type={type}
        chunks={chunks}
        sources={sources}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  locale,
}: {
  label: string;
  value: number;
  href?: string;
  locale: string;
}) {
  const inner = (
    <Card
      className={cn(
        "transition",
        href && "hover:border-border-bright hover:bg-secondary/30 cursor-pointer",
      )}
    >
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-display text-2xl font-extrabold">
          {value.toLocaleString(locale)}
        </p>
      </CardContent>
    </Card>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}
