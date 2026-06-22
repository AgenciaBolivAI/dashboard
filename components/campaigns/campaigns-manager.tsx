"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Pause, Play, X, Search, PhoneOutgoing, FileText, Clock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  approveCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  cancelCampaignAction,
} from "@/lib/actions/campaigns";
import type { CampaignWithSteps, CampaignStatus, StepKind, StepStatus } from "@/lib/queries/campaigns";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<CampaignStatus, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  approved: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  running: "bg-primary/10 text-primary border-primary/30",
  paused: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  done: "bg-green-500/10 text-green-600 border-green-500/30",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/30",
};

const KIND_ICON: Record<StepKind, typeof Search> = {
  aima_scrape: Search,
  sandra_calls: PhoneOutgoing,
  report: FileText,
  wait: Clock,
};

const STEP_DOT: Record<StepStatus, string> = {
  pending: "bg-muted-foreground/40",
  running: "bg-primary animate-pulse",
  done: "bg-green-500",
  failed: "bg-red-500",
  skipped: "bg-muted-foreground/40",
};

export function CampaignsManager({
  tenantId,
  campaigns,
}: {
  tenantId: string;
  campaigns: CampaignWithSteps[];
}) {
  const t = useTranslations("campaigns");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(fn: (tid: string, id: string) => Promise<{ ok: boolean; error?: string }>, id: string) {
    startTransition(async () => {
      const res = await fn(tenantId, id);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : t("asap");

  return (
    <div className="space-y-3">
      {campaigns.map(({ campaign: c, steps }) => {
        const doneCount = steps.filter((s) => s.status === "done").length;
        return (
          <Card key={c.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display font-bold truncate">{c.title}</h2>
                    <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[c.status])}>
                      {t(`status_${c.status}`)}
                    </Badge>
                  </div>
                  {c.goal ? <p className="text-sm text-muted-foreground mt-0.5">{c.goal}</p> : null}
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("progress", { done: doneCount, total: steps.length })}
                    {c.budget_credits != null ? ` · ${t("budget", { spent: c.spent_credits, cap: c.budget_credits })}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.status === "draft" ? (
                    <Button size="sm" disabled={pending} onClick={() => act(approveCampaignAction, c.id)}>
                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      {t("approve")}
                    </Button>
                  ) : null}
                  {c.status === "approved" || c.status === "running" ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(pauseCampaignAction, c.id)}>
                      <Pause className="size-3.5" />
                      {t("pause")}
                    </Button>
                  ) : null}
                  {c.status === "paused" ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(resumeCampaignAction, c.id)}>
                      <Play className="size-3.5" />
                      {t("resume")}
                    </Button>
                  ) : null}
                  {c.status !== "done" && c.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => act(cancelCampaignAction, c.id)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X className="size-3.5" />
                      {t("cancel")}
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Steps */}
              <ol className="mt-3 space-y-1.5 border-t border-border pt-3">
                {steps.map((s) => {
                  const Icon = KIND_ICON[s.kind] ?? Clock;
                  return (
                    <li key={s.id} className="flex items-center gap-2.5 text-sm">
                      <span className={cn("size-1.5 rounded-full shrink-0", STEP_DOT[s.status])} />
                      <Icon className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{t(`kind_${s.kind}`)}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{fmt(s.scheduled_at)}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {t(`step_${s.status}`)}
                      </Badge>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
