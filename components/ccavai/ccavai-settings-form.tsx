"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  Play,
  Wand2,
  Mail,
  Globe,
  Sparkles,
  X,
  Plus,
  Rss,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateCcavaiSettingsAction,
  triggerCcavaiRunAction,
} from "@/lib/actions/ccavai";
import type { CcavaiSettings } from "@/lib/queries/ccavai";
import { cn } from "@/lib/utils";

const PLATFORM_OPTIONS = [
  { id: "linkedin",  emoji: "💼", label: "LinkedIn" },
  { id: "instagram", emoji: "📸", label: "Instagram" },
  { id: "facebook",  emoji: "👥", label: "Facebook" },
  { id: "x",         emoji: "𝕏",  label: "X / Twitter" },
] as const;

const TONE_OPTIONS = [
  { id: "professional_warm", emoji: "🤝", label: "Profesional cálido", desc: "Autoridad amistosa, ideal para LinkedIn." },
  { id: "casual_friendly",   emoji: "💬", label: "Casual amigable",    desc: "Comunidad, conversacional, IG / FB." },
  { id: "bold_punchy",       emoji: "⚡", label: "Audaz y punzante",   desc: "Hooks virales, frases cortas, alto impacto." },
  { id: "educational",       emoji: "🎓", label: "Educativo",          desc: "Explica un concepto por post, dejá takeaway." },
  { id: "industry_voice",    emoji: "🏢", label: "Voz de tu industria", desc: "Espeja el tono de tu vertical específico." },
] as const;

const IMAGE_STYLE_OPTIONS = [
  { id: "branded_modern", label: "Branded moderno" },
  { id: "editorial",      label: "Editorial" },
  { id: "photographic",   label: "Fotográfico" },
  { id: "illustration",   label: "Ilustración" },
] as const;

export function CcavaiSettingsForm({
  tenantId,
  settings,
}: {
  tenantId: string;
  settings: CcavaiSettings;
}) {
  const router = useRouter();
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
      toast.error("Ese feed ya está en la lista");
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
      toast.error("Selecciona al menos una plataforma");
      return;
    }
    startSave(async () => {
      const res = await updateCcavaiSettingsAction(tenantId, {
        // enabled is always true — credit-based billing makes the toggle
        // meaningless. If the user doesn't want CCAVAI, they just don't trigger it.
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
      toast.success("Ajustes guardados");
      router.refresh();
    });
  }

  function handleTrigger() {
    if (rssSources.length === 0) {
      toast.error("Agrega al menos un feed RSS para que CCAVAI tenga material");
      return;
    }
    startAct(async () => {
      const res = await triggerCcavaiRunAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("CCAVAI arrancando — los drafts aparecerán en pocos minutos.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Manual trigger */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Wand2 className="size-5 text-purple-500" />
              CCAVAI — Generador de contenido
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Lee los feeds que le des, elige las historias relevantes para tu
              negocio, y genera borradores listos para LinkedIn, Instagram, Facebook
              y X — con imágenes brandeadas si lo activás.
            </p>
          </div>
          <Button size="sm" onClick={handleTrigger} disabled={acting} className="gap-1.5">
            {acting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Generar ahora
          </Button>
        </div>
      </Card>

      {/* Platforms + tone */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          Plataformas y tono
        </h3>

        <div className="space-y-2">
          <Label className="text-xs">Plataformas ({platforms.length})</Label>
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
          <Label className="text-xs">Tono — guía a CCAVAI cómo escribir</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {TONE_OPTIONS.map((t) => {
              const on = tone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={cn(
                    "text-left rounded-lg border-2 p-3 transition",
                    on
                      ? "border-purple-500 bg-purple-500/5"
                      : "border-border hover:border-purple-500/30",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{t.emoji}</span>
                    <span className="font-medium">{t.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* RSS sources */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Rss className="size-4 text-orange-500" />
            Fuentes RSS ({rssSources.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            CCAVAI lee estas fuentes en cada corrida y elige las historias más
            relevantes. Agrega blogs de tu industria, sitios de noticias, podcasts
            con feed, lo que quieras.
          </p>
        </div>

        {rssSources.length > 0 && (
          <div className="space-y-1.5">
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
                  aria-label="Eliminar feed"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">URL del feed</Label>
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
            <Label className="text-xs">Nombre (opcional)</Label>
            <Input
              value={newRssName}
              onChange={(e) => setNewRssName(e.target.value)}
              placeholder="Mi blog favorito"
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
            Agregar
          </Button>
        </div>
      </Card>

      {/* Volume + images */}
      <Card className="p-6 space-y-5">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          Volumen e imágenes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Borradores por corrida</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={draftsPerRun}
              onChange={(e) => setDraftsPerRun(parseInt(e.target.value || "0", 10))}
            />
            <p className="text-xs text-muted-foreground">
              Cada borrador genera 1 post por plataforma. Con {platforms.length}{" "}
              plataformas × {draftsPerRun} borradores = {platforms.length * draftsPerRun}{" "}
              posts por corrida (~{platforms.length * draftsPerRun * 5} cr ={" "}
              ${(platforms.length * draftsPerRun * 0.05).toFixed(2)}).
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Generar imágenes brandeadas</Label>
              <ToggleButton
                on={generateImages}
                onChange={setGenerateImages}
                label={generateImages ? "Sí" : "No"}
              />
            </div>
            {generateImages && (
              <>
                <Label className="text-xs mt-2 block">Estilo</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {IMAGE_STYLE_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setImageStyle(s.id)}
                      className={cn(
                        "text-xs px-2 py-1.5 rounded-md border transition",
                        imageStyle === s.id
                          ? "bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  +25 cr por imagen × {draftsPerRun} borradores = +{draftsPerRun * 25} cr
                  por corrida.
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Brand voice */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          Voz de marca
        </h3>

        <div className="space-y-1">
          <Label className="text-xs">Vocabulario propio</Label>
          <textarea
            value={brandVocab}
            onChange={(e) => setBrandVocab(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ej: decimos 'clientes' no 'usuarios'. Decimos 'plataforma' no 'producto'. Hablamos de 'agentes IA' no 'chatbots'."
            className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
          />
          <p className="text-xs text-muted-foreground">
            CCAVAI lo lee antes de cada draft y respeta tus elecciones de palabras.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">No decir ({doNotSay.length})</Label>
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
                    aria-label={`Eliminar ${d}`}
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
              placeholder="Ej: revolucionario, disruptivo, único"
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
          <p className="text-xs text-muted-foreground">
            Frases o palabras que CCAVAI debe evitar. Buzzwords sobreutilizados,
            términos que no encajan con tu marca, etc.
          </p>
        </div>
      </Card>

      {/* Auto-post placeholder */}
      <Card className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm">Auto-publicar borradores aprobados</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Cuando esté disponible, los borradores aprobados se publicarán
              automáticamente. Por ahora se mantienen como "aprobados" para que
              los copies y pegues manualmente.
            </p>
          </div>
          <ToggleButton on={autoPost} onChange={setAutoPost} label={autoPost ? "Sí" : "No"} />
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 shadow-lg">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar cambios
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
          ? "bg-purple-500/15 border-purple-500/40 text-purple-600 dark:text-purple-400"
          : "bg-secondary border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full transition",
          on ? "bg-purple-500" : "bg-muted-foreground",
        )}
      />
      {label}
    </button>
  );
}
