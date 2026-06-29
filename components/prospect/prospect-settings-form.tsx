"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Save, Search, Gauge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProspectSettingsAction } from "@/lib/actions/prospect";
import type { ProspectSettings } from "@/lib/queries/prospect";
import { cn } from "@/lib/utils";

const SOURCE_BUCKETS = ["form", "whatsapp", "voice", "meta"] as const;
type Bucket = (typeof SOURCE_BUCKETS)[number];

export function ProspectSettingsForm({
  tenantId,
  settings,
  researchCost,
}: {
  tenantId: string;
  settings: ProspectSettings;
  researchCost: number;
}) {
  const t = useTranslations("prospect");
  const router = useRouter();
  const [saving, startSave] = useTransition();

  const [autoEnabled, setAutoEnabled] = useState(settings.auto_research_enabled);
  const [sources, setSources] = useState<string[]>(settings.auto_sources);
  const [dailyCap, setDailyCap] = useState(settings.daily_cap);
  const [sentimentAuto, setSentimentAuto] = useState(settings.sentiment_auto_on_handoff);

  function toggleSource(b: Bucket) {
    setSources((cur) => (cur.includes(b) ? cur.filter((s) => s !== b) : [...cur, b]));
  }

  function handleSave() {
    startSave(async () => {
      const res = await updateProspectSettingsAction(tenantId, {
        auto_research_enabled: autoEnabled,
        auto_sources: sources.filter((s): s is Bucket => SOURCE_BUCKETS.includes(s as Bucket)),
        daily_cap: dailyCap,
        sentiment_auto_on_handoff: sentimentAuto,
      });
      if (!res.ok) {
        toast.error(res.error ?? t("settings_save_failed"));
        return;
      }
      toast.success(t("settings_saved"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Auto research */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-start gap-2.5">
            <Search className="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{t("settings_auto_title")}</p>
              <p className="text-sm text-muted-foreground">{t("settings_auto_desc", { cost: researchCost })}</p>
            </div>
          </div>
          <ToggleButton on={autoEnabled} onChange={setAutoEnabled} />
        </div>

        <div className={cn("space-y-4 pl-7 transition", !autoEnabled && "opacity-40 pointer-events-none")}>
          <div className="space-y-2">
            <Label className="text-xs">{t("settings_sources_label")}</Label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_BUCKETS.map((b) => {
                const active = sources.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleSource(b)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground",
                    )}
                  >
                    {t(`settings_source_${b}`)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings_sources_hint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="daily_cap" className="text-xs">{t("settings_cap_label")}</Label>
            <Input
              id="daily_cap"
              type="number"
              min={0}
              max={500}
              value={dailyCap}
              onChange={(e) => setDailyCap(parseInt(e.target.value || "0", 10))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">{t("settings_cap_hint")}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Sentiment on handoff */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-start gap-2.5">
          <Gauge className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{t("settings_sentiment_title")}</p>
            <p className="text-sm text-muted-foreground">{t("settings_sentiment_desc")}</p>
          </div>
        </div>
        <ToggleButton on={sentimentAuto} onChange={setSentimentAuto} />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("settings_save")}
        </Button>
      </div>
    </div>
  );
}

function ToggleButton({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-semibold transition",
        on ? "bg-primary/15 border-primary/40 text-primary" : "bg-secondary border-border text-muted-foreground",
      )}
    >
      <span className={cn("size-2.5 rounded-full transition", on ? "bg-primary" : "bg-muted-foreground")} />
      {on ? "ON" : "OFF"}
    </button>
  );
}
