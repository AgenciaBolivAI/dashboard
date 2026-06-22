"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, X, Check } from "lucide-react";
import { toast } from "sonner";
import { setRecommendationStatusAction } from "@/lib/actions/ai-recommendations";
import type { AiRecommendation } from "@/lib/queries/ai-recommendations";
import { cn } from "@/lib/utils";

const KIND_ACCENT: Record<string, string> = {
  risk: "border-l-red-500",
  opportunity: "border-l-green-500",
  next_action: "border-l-primary",
  task_suggestion: "border-l-blue-500",
  insight: "border-l-amber-500",
};

export function RecommendationCards({
  tenantId,
  recommendations,
}: {
  tenantId: string;
  recommendations: AiRecommendation[];
}) {
  const t = useTranslations("overview");
  const tc = useTranslations("common");
  const router = useRouter();
  const [items, setItems] = useState(recommendations);
  const [, startTransition] = useTransition();

  function act(id: string, status: "done" | "dismissed") {
    setItems((arr) => arr.filter((r) => r.id !== id));
    startTransition(async () => {
      const res = await setRecommendationStatusAction(tenantId, id, status);
      if (!res.ok) toast.error(res.error ?? tc("error"));
      else router.refresh();
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((r) => (
        <div
          key={r.id}
          className={cn(
            "rounded-lg border border-l-2 border-border bg-card p-3",
            KIND_ACCENT[r.kind] ?? "border-l-primary",
          )}
        >
          <div className="flex items-start gap-2">
            <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{r.title}</p>
              {r.body ? <p className="text-xs text-muted-foreground mt-0.5">{r.body}</p> : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => act(r.id, "done")}
                className="text-muted-foreground hover:text-green-600"
                aria-label={t("rec_done")}
              >
                <Check className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => act(r.id, "dismissed")}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("rec_dismiss")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
