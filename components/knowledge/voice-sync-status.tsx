"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Mic, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncKnowledgeToVoiceAction } from "@/lib/actions/voice";

export function VoiceSyncStatus({
  tenantId,
  voiceEnabled,
  lastSyncedAt,
}: {
  tenantId: string;
  voiceEnabled: boolean;
  lastSyncedAt: string | null;
}) {
  const [pending, start] = useTransition();

  if (!voiceEnabled) return null;

  function handleSync() {
    start(async () => {
      const res = await syncKnowledgeToVoiceAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success("Conocimiento sincronizado con el agente de voz");
    });
  }

  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3 flex items-center justify-between gap-3 mb-6 flex-wrap">
      <div className="flex items-center gap-2 text-sm">
        <Mic className="size-4 text-muted-foreground" />
        <span className="font-medium">Sincronización con voz</span>
        {lastSyncedAt ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="size-3 text-primary" />
            Última sincronización: {formatRelative(lastSyncedAt)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Aún no sincronizado — pulsa para enviar tu conocimiento al agente
            de voz.
          </span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={pending}
      >
        <RefreshCw className={pending ? "size-3 animate-spin" : "size-3"} />
        {pending ? "Sincronizando…" : "Sincronizar con voz"}
      </Button>
    </div>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `hace ${diffSec}s`;
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
