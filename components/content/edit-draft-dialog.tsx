"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Sparkles, Wand2, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateCcavaiDraftAction,
  replaceCcavaiSubjectAction,
} from "@/lib/actions/ccavai";
import type { CcavaiDraft } from "@/lib/queries/ccavai";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB before base64 overhead

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lectura del archivo falló"));
    reader.readAsDataURL(file);
  });
}

export function EditDraftDialog({
  tenantId,
  draft,
  open,
  onOpenChange,
}: {
  tenantId: string;
  draft: CcavaiDraft;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [savingText, startSaveText] = useTransition();
  const [savingSubject, startSaveSubject] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text editing state (initialized from draft on mount).
  const [draftTitle, setDraftTitle] = useState(draft.draft_title ?? "");
  const [draftBody, setDraftBody] = useState(draft.draft_body);
  const [draftHashtags, setDraftHashtags] = useState(
    (draft.draft_hashtags ?? []).join(" "),
  );
  const [brandedHeadline, setBrandedHeadline] = useState(draft.branded_headline ?? "");
  const [accentPhrases, setAccentPhrases] = useState(
    (draft.accent_phrases ?? []).join(", "),
  );

  // Image-source UI state.
  const [imagePrompt, setImagePrompt] = useState(draft.image_prompt ?? "");
  const [uploadDataUri, setUploadDataUri] = useState<string | null>(null);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);

  function reset() {
    setUploadDataUri(null);
    setUploadFilename(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `Archivo muy grande (${Math.round(file.size / 1024 / 1024)} MB). Máximo 8 MB.`,
      );
      e.target.value = "";
      return;
    }
    try {
      const dataUri = await fileToDataUri(file);
      setUploadDataUri(dataUri);
      setUploadFilename(file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer archivo");
    }
  }

  function handleSaveText() {
    const hashtagList = draftHashtags
      .split(/[,\s]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    const accentList = accentPhrases
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    startSaveText(async () => {
      const res = await updateCcavaiDraftAction(tenantId, draft.id, {
        draft_title: draftTitle.trim() || null,
        draft_body: draftBody,
        draft_hashtags: hashtagList,
        branded_headline: brandedHeadline.trim() || null,
        accent_phrases: accentList,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Cambios guardados");
      router.refresh();
      onOpenChange(false);
    });
  }

  function handleUploadAndBrand() {
    if (!uploadDataUri) {
      toast.error("Primero elige un archivo");
      return;
    }
    startSaveSubject(async () => {
      const res = await replaceCcavaiSubjectAction(tenantId, draft.id, {
        mode: "upload",
        subject_data_uri: uploadDataUri,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Imagen subida y brandeada — actualizando…");
      reset();
      // Close the dialog so the user re-opens against the new image. Keeping
      // the dialog open would show the STALE preview from initial mount.
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleRegenerate() {
    if (!imagePrompt.trim()) {
      toast.error("Describe la imagen que quieres");
      return;
    }
    startSaveSubject(async () => {
      const res = await replaceCcavaiSubjectAction(tenantId, draft.id, {
        mode: "ai_regen",
        image_prompt: imagePrompt.trim(),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Imagen regenerada con IA y brandeada — actualizando…");
      onOpenChange(false);
      router.refresh();
    });
  }

  const subjectBusy = savingSubject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar draft — {draft.platform}</DialogTitle>
          <DialogDescription className="line-clamp-1">
            {draft.story_title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Current image preview */}
          {draft.image_url && (
            <div className="rounded-md border bg-secondary/30 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.image_url}
                alt="Imagen actual"
                className="w-full max-h-[320px] object-contain"
              />
            </div>
          )}

          {/* Image source tabs */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Cambiar imagen
            </Label>
            <Tabs defaultValue="upload">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="upload" className="gap-1.5">
                  <Upload className="size-3.5" />
                  Subir foto
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="size-3.5" />
                  Regenerar con IA
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-3 pt-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm hover:file:bg-secondary/80"
                />
                {uploadFilename && (
                  <p className="text-xs text-muted-foreground">
                    Listo: <span className="text-foreground">{uploadFilename}</span> — al
                    guardar se brandea automáticamente con el overlay actual.
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={handleUploadAndBrand}
                  disabled={!uploadDataUri || subjectBusy}
                  className="gap-1.5"
                >
                  {subjectBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="size-3.5" />
                  )}
                  Subir y brandear
                </Button>
              </TabsContent>

              <TabsContent value="ai" className="space-y-3 pt-3">
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe la foto que quieres que genere la IA…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  La IA genera solo el fondo fotográfico. El headline y el logo se aplican
                  automáticamente encima.
                </p>
                <Button
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={!imagePrompt.trim() || subjectBusy}
                  className="gap-1.5"
                >
                  {subjectBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Regenerar con IA
                </Button>
              </TabsContent>
            </Tabs>
          </div>

          {/* Text editing */}
          <div className="space-y-3 pt-2 border-t">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Texto del post
              </Label>
            </div>

            {draftTitle !== null && (
              <div className="space-y-1">
                <Label htmlFor="draft_title" className="text-xs">
                  Hook / Titular
                </Label>
                <Input
                  id="draft_title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Primera línea del post (LinkedIn)"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="draft_body" className="text-xs">
                Cuerpo
              </Label>
              <textarea
                id="draft_body"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={6}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="draft_hashtags" className="text-xs">
                Hashtags
              </Label>
              <Input
                id="draft_hashtags"
                value={draftHashtags}
                onChange={(e) => setDraftHashtags(e.target.value)}
                placeholder="#AI #SmallBusiness"
              />
              <p className="text-xs text-muted-foreground">
                Separados por espacios o comas.
              </p>
            </div>
          </div>

          {/* Headline overlay editing */}
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Imagen — overlay
            </Label>
            <div className="space-y-1">
              <Label htmlFor="branded_headline" className="text-xs">
                Headline (8 palabras máx)
              </Label>
              <Input
                id="branded_headline"
                value={brandedHeadline}
                onChange={(e) => setBrandedHeadline(e.target.value)}
                placeholder="GOOGLE JUST CUT AI PRICES"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="accent_phrases" className="text-xs">
                Palabras a destacar (verde)
              </Label>
              <Input
                id="accent_phrases"
                value={accentPhrases}
                onChange={(e) => setAccentPhrases(e.target.value)}
                placeholder="GOOGLE, CUT"
              />
              <p className="text-xs text-muted-foreground">
                Separadas por coma. Al guardar, la imagen se re-renderiza con el overlay
                nuevo (mantiene el mismo fondo).
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-3 border-t mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={savingText || subjectBusy}
            className="gap-1.5"
          >
            <X className="size-4" />
            Cerrar
          </Button>
          <Button
            onClick={handleSaveText}
            disabled={savingText || subjectBusy}
            className={cn("gap-1.5", savingText && "opacity-70")}
          >
            {savingText ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
