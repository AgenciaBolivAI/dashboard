"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Save,
  Play,
  Wand2,
  X,
  Plus,
  Rss,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateCcavaiSettingsAction,
  triggerCcavaiRunAction,
} from "@/lib/actions/ccavai";
import type { CcavaiSettings } from "@/lib/queries/ccavai";
import { cn } from "@/lib/utils";

const PLATFORM_OPTIONS = [
  { id: "linkedin", emoji: "💼", label: "LinkedIn" },
  { id: "instagram", emoji: "📸", label: "Instagram" },
  { id: "facebook", emoji: "👥", label: "Facebook" },
  { id: "x", emoji: "𝕏", label: "X / Twitter" },
] as const;

const TONE_IDS = [
  "professional_warm",
  "casual_friendly",
  "bold_punchy",
  "educational",
  "industry_voice",
] as const;

const TONE_EMOJI: Record<string, string> = {
  professional_warm: "🤝",
  casual_friendly: "💬",
  bold_punchy: "⚡",
  educational: "🎓",
  industry_voice: "🏢",
};

const IMAGE_STYLE_IDS = [
  "branded_modern",
  "editorial",
  "photographic",
  "illustration",
] as const;

export function CcavaiSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: CcavaiSettings;
}) {
  const router = useRouter();
  const t = useTranslations("content");
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();

  const [platforms, setPlatforms] = useState<string[]>(settings.platforms);
  const [tone, setTone] = useState(settings.tone);
  const [rssSources, setRssSources] = useState(settings.rss_sources);
  const [newRssUrl, setNewRssUrl] = useState("");
  const [newRssName, setNewRssName] = useState("");
  const [draftsPerRun, setDraftsPerRun] = useState(settings.drafts_per_run);
  const [generateImages, setGenerateImages] = useState(settings.generate_images);
  const [imageStyle, setImageStyle] = useState(settings.image_style);
  const [autoPost, setAutoPost] = useState(settings.auto_post);
  const [brandVocab, setBrandVocab] = useState(settings.brand_vocabulary ?? "");
  const [doNotSay, setDoNotSay] = useState<string[]>(settings.do_not_say);
  const [newDontSay, setNewDontSay] = useState("");

  function togglePlatform(id: string) {
    setPlatforms((cur) =>
      cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id],
    );
  }

  function addRss() {
    const url = newRssUrl.trim();
    if (!url) return;
    if (rssSources.some((s) => s.url === url)) {
      toast.error(t("cf_feed_exists"));
      return;
    }
    setRssSources((cur) => [...cur, { url, name: newRssName.trim() || undefined }]);
    setNewRssUrl("");
    setNewRssName("");
  }

  function addDontSay() {
    const v = newDontSay.trim();
    if (!v) return;
    if (doNotSay.includes(v)) return;
    setDoNotSay((cur) => [...cur, v]);
    setNewDontSay("");
  }

  function handleSave() {
    if (platforms.length === 0) {
      toast.error(t("cf_platform_required"));
      return;
    }
    startSave(async () => {
      const res = await updateCcavaiSettingsAction(tenantId, {
        enabled: true,
        platforms: platforms as ("linkedin" | "instagram" | "facebook" | "x")[],
        tone,
        rss_sources: rssSources,
        drafts_per_run: draftsPerRun,
        generate_images: generateImages,
        image_style: imageStyle,
        auto_post: autoPost,
        brand_vocabulary: brandVocab.trim() || null,
        do_not_say: doNotSay,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("cf_settings_saved"));
      router.refresh();
    });
  }

  function handleTrigger(mode: "mixed" | "news" | "brand") {
    // No RSS requirement: CCAVAI always has curated sources to work with;
    // custom feeds are additive. mode picks the content source.
    startAct(async () => {
      const res = await triggerCcavaiRunAction(tenantId, mode);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("cf_starting"));
      router.refresh();
    });
  }

  const MODE_BTNS: { id: "news" | "brand" | "mixed"; label: string }[] = [
    { id: "mixed", label: t("cf_mode_mixed") },
    { id: "news", label: t("cf_mode_news") },
    { id: "brand", label: t("cf_mode_brand") },
  ];

  return (
    <div className="space-y-6">
      {/* Manual trigger */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Wand2 className="size-5 text-purple-500" />
              {t("cf_gen_title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              {t("cf_gen_desc")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("cf_generate_now")}
            </span>
            <div className="flex gap-1.5 flex-wrap justify-end">
              {MODE_BTNS.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={m.id === "mixed" ? "default" : "outline"}
                  onClick={() => handleTrigger(m.id)}
                  disabled={acting}
                  className="gap-1.5"
                >
                  {acting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Platforms + tone */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("cf_section_platforms_tone")}
        </h3>

        <div className="space-y-2">
          <Label className="text-xs">
            {t("cf_platforms")} ({platforms.length})
          </Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PLATFORM_OPTIONS.map((p) => {
              const on = platforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    "text-left rounded-lg border-2 p-3 transition",
                    on
                      ? "border-purple-500 bg-purple-500/5"
                      : "border-border hover:border-purple-500/30",
                  )}
                >
                  <div className="text-2xl mb-1">{p.emoji}</div>
                  <div className="text-sm font-medium">{p.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">{t("cf_tone_label")}</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {TONE_IDS.map((id) => {
              const on = tone === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTone(id)}
                  className={cn(
                    "text-left rounded-lg border-2 p-3 transition",
                    on
                      ? "border-purple-500 bg-purple-500/5"
                      : "border-border hover:border-purple-500/30",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{TONE_EMOJI[id]}</span>
                    <span className="font-medium">{t(`cf_tone_${id}` as `cf_tone_${typeof id}`)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(`cf_tone_${id}_desc` as `cf_tone_${typeof id}_desc`)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* News sources */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Rss className="size-4 text-orange-500" />
            {t("cf_section_sources")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("cf_sources_desc")}
          </p>
        </div>

        {rssSources.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("cf_custom_feeds")} ({rssSources.length})
            </Label>
            {rssSources.map((s, i) => (
              <div
                key={s.url}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50 border border-border"
              >
                <Rss className="size-3.5 text-orange-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  {s.name && <div className="text-sm font-medium truncate">{s.name}</div>}
                  <div className="text-xs text-muted-foreground truncate">{s.url}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setRssSources((cur) => cur.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive transition shrink-0"
                  aria-label={t("cf_remove_feed")}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t("cf_feed_url")}</Label>
            <Input
              type="url"
              value={newRssUrl}
              onChange={(e) => setNewRssUrl(e.target.value)}
              placeholder="https://blog.example.com/feed/"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRss();
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("cf_feed_name")}</Label>
            <Input
              value={newRssName}
              onChange={(e) => setNewRssName(e.target.value)}
              placeholder={t("cf_feed_name_ph")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRss();
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={addRss}>
            <Plus className="size-4" />
            {t("cf_add")}
          </Button>
        </div>
      </Card>

      {/* Volume + images */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("cf_section_volume")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">{t("cf_drafts_per_run")}</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={draftsPerRun}
              onChange={(e) => setDraftsPerRun(parseInt(e.target.value || "0", 10))}
            />
            <p className="text-xs text-muted-foreground">
              {t("cf_drafts_cost", {
                platforms: platforms.length,
                drafts: draftsPerRun,
                posts: platforms.length * draftsPerRun,
                credits: platforms.length * draftsPerRun * 5,
                usd: (platforms.length * draftsPerRun * 0.05).toFixed(2),
              })}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t("cf_generate_images")}</Label>
              <ToggleButton
                on={generateImages}
                onChange={setGenerateImages}
                label={generateImages ? t("cf_yes") : t("cf_no")}
              />
            </div>
            {generateImages && (
              <>
                <Label className="text-xs mt-2 block">{t("cf_style")}</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {IMAGE_STYLE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setImageStyle(id)}
                      className={cn(
                        "text-xs px-2 py-1.5 rounded-md border transition",
                        imageStyle === id
                          ? "bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t(`cf_style_${id}` as `cf_style_${typeof id}`)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("cf_image_cost", {
                    drafts: draftsPerRun,
                    credits: draftsPerRun * 25,
                  })}
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Brand voice */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          {t("cf_section_brand_voice")}
        </h3>

        <div className="space-y-1">
          <Label className="text-xs">{t("cf_vocab")}</Label>
          <textarea
            value={brandVocab}
            onChange={(e) => setBrandVocab(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("cf_vocab_ph")}
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <p className="text-xs text-muted-foreground">{t("cf_vocab_help")}</p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">
            {t("cf_dont_say")} ({doNotSay.length})
          </Label>
          {doNotSay.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {doNotSay.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-secondary border border-border"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => setDoNotSay((cur) => cur.filter((x) => x !== d))}
                    className="text-muted-foreground hover:text-destructive transition"
                    aria-label={`${t("cf_remove")} ${d}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newDontSay}
              onChange={(e) => setNewDontSay(e.target.value)}
              placeholder={t("cf_dont_say_ph")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDontSay();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addDontSay}>
              <Plus className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("cf_dont_say_help")}</p>
        </div>
      </Card>

      {/* Auto-post placeholder */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm">{t("cf_autopost")}</Label>
            <p className="text-xs text-muted-foreground mt-1">{t("cf_autopost_help")}</p>
          </div>
          <ToggleButton
            on={autoPost}
            onChange={setAutoPost}
            label={autoPost ? t("cf_yes") : t("cf_no")}
          />
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 shadow-lg">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("cf_save_changes")}
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
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          : "bg-secondary border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
