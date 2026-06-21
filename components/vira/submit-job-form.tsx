"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Send, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitViraJobAction } from "@/lib/actions/vira";

export function SubmitJobForm({
  tenantId,
}: {
  tenantId: string;
}) {
  const router = useRouter();
  const t = useTranslations("shorts");
  const [url, setUrl] = useState("");
  const [submitting, startSubmit] = useTransition();

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(t("submit_no_url"));
      return;
    }
    startSubmit(async () => {
      const res = await submitViraJobAction(tenantId, trimmed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("submit_queued"));
      setUrl("");
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <LinkIcon className="size-4 text-rose-500" />
            {t("submit_title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("submit_desc")}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vira-url" className="text-xs">
          {t("submit_url_label")}
        </Label>
        <div className="flex gap-2">
          <Input
            id="vira-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={submitting || !url.trim()}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {t("submit_process")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
