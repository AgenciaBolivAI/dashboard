"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Trash2,
  Archive,
  ExternalLink,
  Linkedin,
  Instagram,
  Facebook,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateCcavaiDraftStatusAction } from "@/lib/actions/ccavai";
import { cn } from "@/lib/utils";
import type { CcavaiDraft } from "@/lib/queries/ccavai";

const PLATFORM_META: Record<CcavaiDraft["platform"], { icon: typeof Linkedin; color: string; label: string; composeUrl: (text: string) => string }> = {
  linkedin: {
    icon: Linkedin,
    color: "bg-[#0077b5]/10 text-[#0077b5] border-[#0077b5]/30",
    label: "LinkedIn",
    composeUrl: () => "https://www.linkedin.com/feed/?shareActive=true",
  },
  instagram: {
    icon: Instagram,
    color: "bg-pink-500/10 text-pink-600 border-pink-500/30",
    label: "Instagram",
    composeUrl: () => "https://www.instagram.com/",
  },
  facebook: {
    icon: Facebook,
    color: "bg-blue-600/10 text-blue-600 border-blue-600/30",
    label: "Facebook",
    composeUrl: () => "https://www.facebook.com/",
  },
  x: {
    icon: Linkedin, // fallback icon — not used in v1
    color: "bg-muted text-foreground border-border",
    label: "X",
    composeUrl: (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  },
};

export function DraftCard({
  tenantId,
  draft,
}: {
  tenantId: string;
  draft: CcavaiDraft;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(draft.status);
  const [showPostedInput, setShowPostedInput] = useState(false);
  const [postedUrl, setPostedUrl] = useState("");

  const platform = PLATFORM_META[draft.platform] ?? PLATFORM_META.x;
  const Icon = platform.icon;

  const fullText = [
    draft.draft_title,
    draft.draft_body,
    draft.draft_hashtags && draft.draft_hashtags.length > 0
      ? draft.draft_hashtags.join(" ")
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  function copy() {
    navigator.clipboard.writeText(fullText);
    toast.success(`Copiado para ${platform.label}`);
  }

  function changeStatus(newStatus: CcavaiDraft["status"], extra?: { postedUrl?: string }) {
    const previous = optimisticStatus;
    setOptimisticStatus(newStatus);
    startTransition(async () => {
      const res = await updateCcavaiDraftStatusAction(
        tenantId,
        draft.id,
        newStatus,
        undefined,
        extra?.postedUrl,
      );
      if (res.error) {
        toast.error(res.error);
        setOptimisticStatus(previous);
      } else {
        toast.success(
          newStatus === "approved" ? "Aprobado" :
          newStatus === "rejected" ? "Rechazado" :
          newStatus === "posted" ? "Marcado como publicado" :
          newStatus === "archived" ? "Archivado" :
          "Actualizado"
        );
        router.refresh();
      }
    });
  }

  return (
    <Card
      className={cn(
        "overflow-hidden",
        optimisticStatus === "approved" && "border-green-500/40",
        optimisticStatus === "rejected" && "opacity-50",
        optimisticStatus === "posted" && "border-purple-500/40 bg-purple-500/5",
        optimisticStatus === "archived" && "opacity-40",
      )}
    >
      {draft.image_url && (
        <div className="relative w-full bg-secondary/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.image_url}
            alt={draft.story_title}
            className="w-full max-h-[420px] object-cover"
          />
        </div>
      )}

      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="outline" className={cn("gap-1.5", platform.color)}>
            <Icon className="size-3" />
            {platform.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {draft.story_source}
          </span>
        </div>

        {draft.draft_title && (
          <h4 className="font-display font-semibold text-base leading-snug">
            {draft.draft_title}
          </h4>
        )}

        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {draft.draft_body}
        </p>

        {draft.draft_hashtags && draft.draft_hashtags.length > 0 && (
          <p className="text-sm text-primary">
            {draft.draft_hashtags.join(" ")}
          </p>
        )}

        {draft.story_url && (
          <a
            href={draft.story_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            Fuente original
          </a>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5">
            <Copy className="size-3.5" />
            Copiar
          </Button>

          {optimisticStatus === "pending" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changeStatus("approved")}
                disabled={pending}
                className="gap-1.5 border-green-500/40 text-green-600 hover:bg-green-500/10"
              >
                <Check className="size-3.5" />
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changeStatus("rejected")}
                disabled={pending}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Rechazar
              </Button>
            </>
          )}

          {(optimisticStatus === "approved" || optimisticStatus === "pending") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPostedInput((v) => !v)}
              disabled={pending}
              className="gap-1.5 border-purple-500/40 text-purple-600 hover:bg-purple-500/10"
            >
              Marcar publicado
            </Button>
          )}

          {optimisticStatus !== "archived" && optimisticStatus !== "pending" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => changeStatus("archived")}
              disabled={pending}
              className="gap-1.5 text-muted-foreground"
            >
              <Archive className="size-3.5" />
              Archivar
            </Button>
          )}
        </div>

        {showPostedInput && (
          <div className="flex gap-2 pt-2">
            <input
              type="url"
              placeholder="URL del post publicado (opcional)"
              value={postedUrl}
              onChange={(e) => setPostedUrl(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              onClick={() => {
                changeStatus("posted", { postedUrl: postedUrl.trim() || undefined });
                setShowPostedInput(false);
              }}
              disabled={pending}
            >
              Confirmar
            </Button>
          </div>
        )}

        {optimisticStatus === "posted" && draft.posted_url && (
          <a
            href={draft.posted_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-purple-600 hover:underline"
          >
            <ExternalLink className="size-3" />
            Ver publicación
          </a>
        )}
      </div>
    </Card>
  );
}
