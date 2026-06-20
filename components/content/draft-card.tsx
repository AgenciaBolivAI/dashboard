"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  Copy,
  Trash2,
  Archive,
  ExternalLink,
  Linkedin,
  Instagram,
  Facebook,
  Pencil,
  Download,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateCcavaiDraftStatusAction, publishCcavaiDraftAction } from "@/lib/actions/ccavai";
import { EditDraftDialog } from "@/components/content/edit-draft-dialog";
import { cn } from "@/lib/utils";
import type { CcavaiDraft } from "@/lib/queries/ccavai";

const PLATFORM_META: Record<CcavaiDraft["platform"], { icon: typeof Linkedin; color: string; label: string }> = {
  linkedin: { icon: Linkedin, color: "bg-[#0077b5]/10 text-[#0077b5] border-[#0077b5]/30", label: "LinkedIn" },
  instagram: { icon: Instagram, color: "bg-pink-500/10 text-pink-600 border-pink-500/30", label: "Instagram" },
  facebook: { icon: Facebook, color: "bg-blue-600/10 text-blue-600 border-blue-600/30", label: "Facebook" },
  x: { icon: Linkedin, color: "bg-muted text-foreground border-border", label: "X" },
};

// Some CCAVAI generations put the hashtags inside draft_body AND in the
// draft_hashtags array. Return only the tags NOT already present in the body so
// the preview, Copy, and the published post don't show them twice. Mirrors the
// dedupe in lib/content/publish.ts.
function dedupeHashtags(body: string | null, tags: string[] | null): string[] {
  const b = body ?? "";
  return (tags ?? []).filter(
    (h) => !new RegExp(`(^|\\s)${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(b),
  );
}

export function DraftCard({
  tenantId,
  draft,
  connected,
}: {
  tenantId: string;
  draft: CcavaiDraft;
  connected?: { facebook: boolean; instagram: boolean };
}) {
  const t = useTranslations("content");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(draft.status);
  const [showPostedInput, setShowPostedInput] = useState(false);
  const [postedUrl, setPostedUrl] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const platform = PLATFORM_META[draft.platform] ?? PLATFORM_META.x;
  const Icon = platform.icon;

  // Native publishing exists only for Facebook Pages + Instagram, and only when
  // the tenant has connected that channel.
  const publishTarget =
    draft.platform === "facebook" ? "facebook" : draft.platform === "instagram" ? "instagram" : null;
  const isConnected = publishTarget !== null && (connected?.[publishTarget] ?? false);
  // Always show the Post button on FB/IG drafts so the feature is discoverable.
  // When the channel isn't connected yet, clicking it tells the user to connect
  // (the action returns a "not_connected" code we surface as a toast).
  const showPublish =
    publishTarget !== null && optimisticStatus !== "posted" && optimisticStatus !== "archived";

  const extraHashtags = dedupeHashtags(draft.draft_body, draft.draft_hashtags);
  const fullText = [
    draft.draft_title,
    draft.draft_body,
    extraHashtags.length > 0 ? extraHashtags.join(" ") : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  function copy() {
    navigator.clipboard.writeText(fullText);
    toast.success(t("toast_copied", { platform: platform.label }));
  }

  async function downloadImage() {
    if (!draft.image_url) {
      toast.error(t("toast_no_image"));
      return;
    }
    try {
      const res = await fetch(draft.image_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("toast_downloaded", { platform: platform.label }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      toast.error(t("toast_download_failed", { msg }));
    }
  }

  function filename(): string {
    const slug = (draft.story_title ?? "post")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return `bolivai-${draft.platform}-${slug}.png`;
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
          newStatus === "approved"
            ? t("toast_approved")
            : newStatus === "rejected"
              ? t("toast_rejected")
              : newStatus === "posted"
                ? t("toast_marked_posted")
                : newStatus === "archived"
                  ? t("toast_archived")
                  : t("toast_updated"),
        );
        router.refresh();
      }
    });
  }

  function publish() {
    if (!publishTarget) return;
    startTransition(async () => {
      const res = await publishCcavaiDraftAction(tenantId, draft.id, publishTarget);
      if (res.error) {
        const code = res.code ?? "";
        if (code.includes("not_connected") || code === "missing_token") {
          toast.error(t("err_not_connected", { platform: platform.label }));
        } else if (code.includes("needs_image")) {
          toast.error(t("err_needs_image"));
        } else if (code === "needs_publish_permission") {
          toast.error(t("err_needs_publish_permission", { platform: platform.label }));
        } else {
          toast.error(t("toast_publish_failed", { msg: res.error }));
        }
      } else {
        setOptimisticStatus("posted");
        toast.success(t("toast_published", { platform: platform.label }));
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
          <img src={draft.image_url} alt={draft.story_title} className="w-full max-h-[420px] object-cover" />
        </div>
      )}

      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge variant="outline" className={cn("gap-1.5", platform.color)}>
            <Icon className="size-3" />
            {platform.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{draft.story_source}</span>
        </div>

        {draft.draft_title && (
          <h4 className="font-display font-semibold text-base leading-snug">{draft.draft_title}</h4>
        )}

        <p className="text-sm whitespace-pre-wrap leading-relaxed">{draft.draft_body}</p>

        {extraHashtags.length > 0 && (
          <p className="text-sm text-primary">{extraHashtags.join(" ")}</p>
        )}

        {draft.story_url && (
          <a
            href={draft.story_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            {t("card_source")}
          </a>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5">
            <Copy className="size-3.5" />
            {t("card_copy")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Pencil className="size-3.5" />
            {t("card_edit")}
          </Button>
          <Button size="sm" variant="outline" onClick={downloadImage} disabled={!draft.image_url} className="gap-1.5">
            <Download className="size-3.5" />
            {t("card_download")}
          </Button>

          {/* Native publish (FB Page / Instagram). Filled when connected, outline
              when not (clicking prompts the user to connect). */}
          {showPublish && (
            <Button
              size="sm"
              variant={isConnected ? "default" : "outline"}
              onClick={publish}
              disabled={pending}
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              {pending
                ? t("publishing")
                : publishTarget === "facebook"
                  ? t("publish_fb")
                  : t("publish_ig")}
            </Button>
          )}

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
                {t("card_approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => changeStatus("rejected")}
                disabled={pending}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {t("card_reject")}
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
              {t("card_mark_posted")}
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
              {t("card_archive")}
            </Button>
          )}
        </div>

        {showPostedInput && (
          <div className="flex gap-2 pt-2">
            <input
              type="url"
              placeholder={t("card_posted_url_ph")}
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
              {t("card_confirm")}
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
            {t("card_view_post")}
          </a>
        )}
      </div>

      <EditDraftDialog tenantId={tenantId} draft={draft} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}
