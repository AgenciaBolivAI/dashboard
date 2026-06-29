"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, Loader2, RefreshCw, ExternalLink, Building2, Users, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { researchLeadAction, researchCustomerAction } from "@/lib/actions/prospect";
import type { ProspectResearchRow } from "@/lib/queries/prospect";

/** Minimal, injection-safe markdown: paragraphs, **bold**, and - bullets.
 * The brief uses bold lines as section headers + bullet talking points. */
function renderInline(text: string, keyBase: string) {
  // Split on **bold** spans.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{p}</Fragment>
    ),
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: string) => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${k}`} className="list-disc pl-5 space-y-0.5 my-1.5">
          {bullets.map((b, i) => (
            <li key={i}>{renderInline(b, `li-${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) {
      flush(`${idx}`);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flush(`${idx}`);
    // A line that is entirely bold reads as a section header.
    const isHeader = /^\*\*[^*]+\*\*:?$/.test(line);
    blocks.push(
      <p key={`p-${idx}`} className={isHeader ? "mt-3 mb-0.5 font-semibold text-foreground" : "my-1"}>
        {renderInline(line.replace(/^#+\s*/, ""), `p-${idx}`)}
      </p>,
    );
  });
  flush("end");
  return <div className="text-sm leading-relaxed text-muted-foreground">{blocks}</div>;
}

export function ResearchCard({
  tenantId,
  kind,
  subjectId,
  research,
  cost,
}: {
  tenantId: string;
  kind: "lead" | "customer";
  subjectId: string;
  research: ProspectResearchRow | null;
  cost: number;
}) {
  const t = useTranslations("prospect");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    startTransition(async () => {
      const res =
        kind === "lead"
          ? await researchLeadAction(tenantId, subjectId)
          : await researchCustomerAction(tenantId, subjectId);
      setBusy(false);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else {
        toast.success(t("done_toast"));
        router.refresh();
      }
    });
  }

  const working = busy || pending || research?.status === "queued" || research?.status === "running";
  const s = research?.structured ?? null;
  const done = research?.status === "done" && !!research.summary;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          {t("title")}
        </p>
        {done ? (
          <Button size="sm" variant="ghost" disabled={working} onClick={run} className="h-7 px-2 text-xs">
            {working ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t("rerun")}
          </Button>
        ) : null}
      </div>

      {done ? (
        <div className="space-y-3">
          {s?.headline ? <p className="text-sm font-medium">{s.headline}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {s?.industry ? (
              <Badge variant="muted" className="gap-1 text-[10px]">
                <Building2 className="size-3" />
                {s.industry}
              </Badge>
            ) : null}
            {s?.company_size ? (
              <Badge variant="muted" className="gap-1 text-[10px]">
                <Users className="size-3" />
                {s.company_size}
              </Badge>
            ) : null}
          </div>

          <Markdown text={research!.summary!} />

          {s?.talking_points?.length ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="size-3.5 text-primary" />
                {t("talking_points")}
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm text-muted-foreground">
                {s.talking_points.slice(0, 5).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {research?.sources?.length ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t("sources")}</p>
              <div className="flex flex-col gap-0.5">
                {research.sources.slice(0, 6).map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 truncate"
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{src.title || src.url}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {research?.generated_at ? (
            <p className="text-[10px] text-muted-foreground">
              {t("generated_at", {
                when: new Date(research.generated_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
              })}
            </p>
          ) : null}
        </div>
      ) : working ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("researching")}
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-sm text-muted-foreground mb-3">{t("cta_subtitle")}</p>
          <Button size="sm" onClick={run} disabled={working}>
            <Sparkles className="size-4" />
            {t("research_button", { cost })}
          </Button>
          {research?.status === "failed" && research.error !== "insufficient_credits" ? (
            <p className="text-[11px] text-muted-foreground mt-2">{t("retry_hint")}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
