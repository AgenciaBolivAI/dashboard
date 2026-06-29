"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Gauge, Loader2, RefreshCw, AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeConversationAction } from "@/lib/actions/prospect";
import type { ConversationAnalysisRow } from "@/lib/queries/prospect";
import { cn } from "@/lib/utils";

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  neutral: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  negative: "bg-red-500/10 text-red-600 border-red-500/30",
};

export function SentimentCard({
  tenantId,
  conversationId,
  analysis,
  cost,
}: {
  tenantId: string;
  conversationId: string;
  analysis: ConversationAnalysisRow | null;
  cost: number;
}) {
  const t = useTranslations("prospect");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    startTransition(async () => {
      const res = await analyzeConversationAction(tenantId, conversationId);
      setBusy(false);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else {
        toast.success(t("analyzed_toast"));
        router.refresh();
      }
    });
  }

  const working = busy || pending || analysis?.status === "queued" || analysis?.status === "running";
  const done = analysis?.status === "done" && !!analysis.sentiment;
  const sig = analysis?.signals ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          {t("sentiment_title")}
        </h3>
        {done ? (
          <Button size="sm" variant="ghost" disabled={working} onClick={run} className="h-6 px-1.5 text-[11px]">
            {working ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </Button>
        ) : null}
      </div>

      {done ? (
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[11px]", SENTIMENT_CLASS[analysis!.sentiment!])}>
              {t(`sentiment_${analysis!.sentiment}`)}
            </Badge>
            {typeof analysis!.score === "number" ? (
              <span className="text-xs text-muted-foreground tabular-nums">{analysis!.score > 0 ? "+" : ""}{analysis!.score}</span>
            ) : null}
            {sig?.at_risk ? (
              <Badge variant="outline" className="text-[10px] gap-1 bg-red-500/10 text-red-600 border-red-500/30">
                <AlertTriangle className="size-3" />
                {t("at_risk")}
              </Badge>
            ) : null}
          </div>
          {analysis!.summary ? <p className="text-muted-foreground">{analysis!.summary}</p> : null}
          {sig?.buying_intent && sig.buying_intent !== "none" ? (
            <p className="text-xs flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="size-3.5" /> {t("buying_intent")}: <span className="font-medium text-foreground">{sig.buying_intent}</span>
            </p>
          ) : null}
          {sig?.objections?.length ? (
            <div className="text-xs">
              <p className="text-muted-foreground mb-0.5">{t("objections")}</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {sig.objections.slice(0, 4).map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          ) : null}
          {sig?.next_best_action ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <p className="font-semibold flex items-center gap-1.5 mb-0.5"><Lightbulb className="size-3.5 text-primary" />{t("next_action")}</p>
              <p className="text-muted-foreground">{sig.next_best_action}</p>
            </div>
          ) : null}
        </div>
      ) : working ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          {t("analyzing")}
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={run} disabled={working} className="w-full">
          <Gauge className="size-4" />
          {t("analyze_button", { cost })}
        </Button>
      )}
    </div>
  );
}
