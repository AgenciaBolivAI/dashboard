"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerCcavaiGenerationAction } from "@/lib/actions/ccavai";

export function GenerateContentButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [polling, setPolling] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const res = await triggerCcavaiGenerationAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("CCAVAI está generando contenido. Aparecerán en ~1 minuto.");
      setPolling(true);
      // Refresh the page a few times so drafts appear as they land
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
    <Button
      onClick={handleClick}
      disabled={busy}
      size="sm"
      className="gap-2"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {busy ? "Generando..." : "Generar contenido"}
    </Button>
  );
}
