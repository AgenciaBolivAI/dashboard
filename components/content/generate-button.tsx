"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Loader2, Newspaper, Building2, Blend, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  triggerCcavaiGenerationAction,
  type CcavaiMode,
} from "@/lib/actions/ccavai";
import { cn } from "@/lib/utils";

export function GenerateContentButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const t = useTranslations("content");
  const [pending, startTransition] = useTransition();
  const [polling, setPolling] = useState(false);
  const [open, setOpen] = useState(false);

  const MODES: {
    id: CcavaiMode;
    label: string;
    desc: string;
    icon: typeof Sparkles;
  }[] = [
    {
      id: "mixed",
      label: t("cf_mode_mixed"),
      desc: t("gen_mode_mixed_desc"),
      icon: Blend,
    },
    {
      id: "news",
      label: t("cf_mode_news"),
      desc: t("gen_mode_news_desc"),
      icon: Newspaper,
    },
    {
      id: "brand",
      label: t("cf_mode_brand"),
      desc: t("gen_mode_brand_desc"),
      icon: Building2,
    },
  ];

  function generate(mode: CcavaiMode) {
    setOpen(false);
    startTransition(async () => {
      const res = await triggerCcavaiGenerationAction(tenantId, mode);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const modeLabel = MODES.find((m) => m.id === mode)?.label ?? "";
      toast.success(t("gen_started_toast", { mode: modeLabel }));
      setPolling(true);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        router.refresh();
        if (attempts >= 8) {
          clearInterval(interval);
          setPolling(false);
        }
      }, 15_000);
    });
  }

  const busy = pending || polling;

  return (
    <div className="relative">
      <div className="inline-flex">
        {/* Primary = mixed (the default). The caret opens the mode menu. */}
        <Button
          onClick={() => generate("mixed")}
          disabled={busy}
          size="sm"
          className="gap-2 rounded-r-none"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? t("gen_generating") : t("gen_generate_content")}
        </Button>
        <Button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          size="sm"
          className="rounded-l-none border-l border-primary-foreground/20 px-2"
          aria-label={t("gen_choose_type")}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {open && !busy ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 mt-1 w-72 z-20 rounded-lg border border-border bg-popover shadow-lg p-1.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => generate(m.id)}
                className={cn(
                  "w-full text-left rounded-md p-2.5 flex items-start gap-2.5 transition",
                  "hover:bg-secondary",
                )}
              >
                <m.icon className="size-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {m.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
