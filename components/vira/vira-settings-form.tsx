"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateViraSettingsAction } from "@/lib/actions/vira";
import type { ViraSettings } from "@/lib/queries/vira";
import { cn } from "@/lib/utils";

export function ViraSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: ViraSettings;
}) {
  const router = useRouter();
  const t = useTranslations("shorts");
  const [saving, startSave] = useTransition();

  const STYLE_OPTIONS = [
    { id: "high_energy", emoji: "⚡", label: t("settings_style_high_energy"), desc: t("settings_style_high_energy_desc") },
    { id: "educational", emoji: "🎓", label: t("settings_style_educational"), desc: t("settings_style_educational_desc") },
    { id: "storytelling", emoji: "📖", label: t("settings_style_storytelling"), desc: t("settings_style_storytelling_desc") },
    { id: "qa_highlights", emoji: "💬", label: t("settings_style_qa"), desc: t("settings_style_qa_desc") },
  ] as const;

  const FORMAT_OPTIONS = [
    { id: "9:16", emoji: "📱", label: t("settings_format_vertical") },
    { id: "1:1", emoji: "⬛", label: t("settings_format_square") },
    { id: "16:9", emoji: "🖥️", label: t("settings_format_horizontal") },
  ] as const;

  const SUBTITLE_OPTIONS = [
    { id: "bold_centered", label: t("settings_subtitle_bold_centered") },
    { id: "minimal_bottom", label: t("settings_subtitle_minimal_bottom") },
    { id: "word_pop", label: t("settings_subtitle_word_pop") },
  ] as const;

  const [minClip, setMinClip] = useState(settings.min_clip_seconds);
  const [maxClip, setMaxClip] = useState(settings.max_clip_seconds);
  const [perVideo, setPerVideo] = useState(settings.clips_per_video);
  const [format, setFormat] = useState(settings.output_format);
  const [style, setStyle] = useState(settings.clip_style);
  const [addSubs, setAddSubs] = useState(settings.add_subtitles);
  const [subStyle, setSubStyle] = useState(settings.subtitle_style);
  const [watermark, setWatermark] = useState(settings.add_watermark);
  const [watermarkText, setWatermarkText] = useState(settings.watermark_text ?? "");
  const [maxInputMin, setMaxInputMin] = useState(settings.max_input_minutes);
  const [autoPost, setAutoPost] = useState(settings.auto_post_drafts);

  function handleSave() {
    startSave(async () => {
      const res = await updateViraSettingsAction(tenantId, {
        // enabled is always true — credit-based billing makes the toggle
        // meaningless. If the user doesn't want to use VIRA, they just
        // don't submit videos.
        enabled: true,
        min_clip_seconds: minClip,
        max_clip_seconds: maxClip,
        clips_per_video: perVideo,
        output_format: format,
        clip_style: style,
        add_subtitles: addSubs,
        subtitle_style: subStyle,
        add_watermark: watermark,
        watermark_text: watermarkText.trim() || null,
        max_input_minutes: maxInputMin,
        auto_post_drafts: autoPost,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("settings_saved_toast"));
      router.refresh();
    });
  }

  // Quick economics preview
  const exampleClipSeconds = perVideo * Math.round((minClip + maxClip) / 2);
  const exampleInputMin = 10;
  const inputCost = exampleInputMin * 10;       // 10 cr/min
  const outputCost = exampleClipSeconds * 2;    // 2 cr/sec
  const totalCost = inputCost + outputCost;

  return (
    <div className="space-y-6">
      {/* Clip length + count */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("settings_length_count_heading")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("settings_min_duration")}</Label>
            <Input
              type="number"
              min={5}
              max={120}
              value={minClip}
              onChange={(e) => setMinClip(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("settings_max_duration")}</Label>
            <Input
              type="number"
              min={10}
              max={180}
              value={maxClip}
              onChange={(e) => setMaxClip(parseInt(e.target.value || "0", 10))}
            />
            {maxClip < minClip && (
              <p className="text-xs text-destructive">{t("settings_max_gt_min")}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("settings_clips_per_video")}</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={perVideo}
              onChange={(e) => setPerVideo(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("settings_max_input_minutes")}</Label>
          <Input
            type="number"
            min={1}
            max={240}
            value={maxInputMin}
            onChange={(e) => setMaxInputMin(parseInt(e.target.value || "0", 10))}
            className="max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">
            {t("settings_max_input_hint", { minutes: maxInputMin })}
          </p>
        </div>
      </Card>

      {/* Output format + style */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("settings_format_reasoning_heading")}
        </h3>

        <div className="space-y-2">
          <Label className="text-xs">{t("settings_output_format")}</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map((f) => {
              const on = format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "text-left rounded-lg border-2 p-3 transition",
                    on ? "border-rose-500 bg-rose-500/5" : "border-border hover:border-rose-500/30",
                  )}
                >
                  <div className="text-2xl mb-1">{f.emoji}</div>
                  <div className="text-sm font-medium">{f.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            {t("settings_clip_style_label")}
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STYLE_OPTIONS.map((s) => {
              const on = style === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "text-left rounded-lg border-2 p-3 transition",
                    on ? "border-rose-500 bg-rose-500/5" : "border-border hover:border-rose-500/30",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{s.emoji}</span>
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Subtitles + watermark */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">{t("settings_visuals_heading")}</h3>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t("settings_auto_subtitles")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings_auto_subtitles_desc")}
            </p>
          </div>
          <ToggleButton on={addSubs} onChange={setAddSubs} label={addSubs ? t("settings_yes") : t("settings_no")} />
        </div>

        {addSubs && (
          <div className="space-y-1">
            <Label className="text-xs">{t("settings_subtitle_style")}</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {SUBTITLE_OPTIONS.map((s) => {
                const on = subStyle === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSubStyle(s.id)}
                    className={cn(
                      "text-sm px-3 py-2 rounded-md border transition",
                      on
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <Label className="text-sm">{t("settings_watermark")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings_watermark_desc")}
            </p>
          </div>
          <ToggleButton on={watermark} onChange={setWatermark} label={watermark ? t("settings_yes") : t("settings_no")} />
        </div>
        {watermark && (
          <div className="space-y-1">
            <Label className="text-xs">{t("settings_watermark_text")}</Label>
            <Input
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder={t("settings_watermark_placeholder")}
              maxLength={120}
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <Label className="text-sm">{t("settings_autopost")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings_autopost_desc")}
            </p>
          </div>
          <ToggleButton on={autoPost} onChange={setAutoPost} label={autoPost ? t("settings_yes") : t("settings_no")} />
        </div>
      </Card>

      {/* Economics preview */}
      <Card className="p-5 bg-muted/30">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
          {t("settings_cost_estimate_heading")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t.rich("settings_cost_estimate_example", {
            minutes: exampleInputMin,
            clips: perVideo,
            seconds: Math.round((minClip + maxClip) / 2),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("settings_cost_processing")}</p>
            <p className="font-mono">
              {inputCost} cr <span className="text-muted-foreground">(${(inputCost / 100).toFixed(2)})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("settings_cost_rendering")}</p>
            <p className="font-mono">
              {outputCost} cr <span className="text-muted-foreground">(${(outputCost / 100).toFixed(2)})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("settings_cost_total")}</p>
            <p className="font-mono font-bold">
              {totalCost} cr <span className="text-primary">(${(totalCost / 100).toFixed(2)})</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 shadow-lg">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("settings_save_changes")}
        </Button>
      </div>
    </div>
  );
}

function ToggleButton({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-semibold transition",
        on
          ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400"
          : "bg-secondary border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full transition",
          on ? "bg-rose-500" : "bg-muted-foreground",
        )}
      />
      {label}
    </button>
  );
}
