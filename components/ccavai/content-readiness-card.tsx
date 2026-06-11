import Link from "next/link";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import type { ContentReadiness } from "@/lib/queries/ccavai";

/**
 * Nudge card on the CCAVAI settings page. CCAVAI's business-pillar content is
 * only as good as the business context it can read (description, services,
 * FAQ, brand voice). This shows the tenant what's filled in and links them to
 * fix the gaps — higher completeness = more on-brand posts.
 *
 * Server component — uses getTranslations so it respects the selected locale.
 */
export async function ContentReadinessCard({
  tenantSlug,
  readiness,
}: {
  tenantSlug: string;
  readiness: ContentReadiness;
}) {
  const t = await getTranslations("content");

  const items: Array<{
    done: boolean;
    label: string;
    detail: string;
    href: string;
  }> = [
    {
      done: readiness.business_description,
      label: t("cr_business_description"),
      detail: t("cr_business_description_detail"),
      href: `/dashboard/${tenantSlug}/voice`,
    },
    {
      done: readiness.services_count > 0,
      label:
        readiness.services_count > 0
          ? `${t("cr_services")} (${readiness.services_count})`
          : t("cr_services"),
      detail: t("cr_services_detail"),
      href: `/dashboard/${tenantSlug}/services`,
    },
    {
      done: readiness.faq,
      label: t("cr_faq"),
      detail: t("cr_faq_detail"),
      href: `/dashboard/${tenantSlug}/voice`,
    },
    {
      done: readiness.brand_voice,
      label: t("cr_brand_voice"),
      detail: t("cr_brand_voice_detail"),
      href: `/dashboard/${tenantSlug}/content/settings`,
    },
  ];

  const allDone = readiness.score >= 100;
  const barColor =
    readiness.score >= 70
      ? "bg-emerald-500"
      : readiness.score >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-purple-500" />
            {allDone ? t("cr_title_done") : t("cr_title")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {allDone ? t("cr_subtitle_done") : t("cr_subtitle")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-2xl font-display font-extrabold tabular-nums">
            {readiness.score}%
          </span>
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2.5">
            {it.done ? (
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <Circle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{it.label}</span>
                {!it.done && (
                  <Link href={it.href} className="text-xs text-primary hover:underline">
                    {t("cr_complete")} →
                  </Link>
                )}
              </div>
              {!it.done && (
                <p className="text-xs text-muted-foreground mt-0.5">{it.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
