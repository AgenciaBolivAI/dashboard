"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitViraJobAction } from "@/lib/actions/vira";

export function SubmitJobForm({
  tenantId,
  enabled,
}: {
  tenantId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, startSubmit] = useTransition();

  function handleSubmit() {
    if (!enabled) {
      toast.error("VIRA está deshabilitado. Actívalo en Ajustes arriba.");
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Pega un link de video");
      return;
    }
    startSubmit(async () => {
      const res = await submitViraJobAction(tenantId, trimmed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Video encolado. VIRA empieza a procesarlo.");
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
            Nuevo video
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pega un link de YouTube, Vimeo, o un mp4 directo. VIRA lo descarga,
            lo transcribe, identifica los mejores momentos y los corta.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="vira-url" className="text-xs">
          URL del video
        </Label>
        <div className="flex gap-2">
          <Input
            id="vira-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            disabled={submitting || !enabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            onClick={handleSubmit}
            disabled={submitting || !enabled || !url.trim()}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Procesar
          </Button>
        </div>
        {!enabled && (
          <p className="text-xs text-amber-600">
            VIRA está apagado. Actívalo en los ajustes arriba antes de procesar
            videos.
          </p>
        )}
      </div>
    </Card>
  );
}
