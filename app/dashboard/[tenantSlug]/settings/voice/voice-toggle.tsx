"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enableVoiceAction,
  disableVoiceAction,
  deleteVoiceAgentAction,
} from "@/lib/actions/voice";

export function VoiceToggle({
  tenantId,
  enabled,
  hasAgent,
}: {
  tenantId: string;
  enabled: boolean;
  hasAgent: boolean;
}) {
  const [pending, start] = useTransition();

  function handleEnable() {
    start(async () => {
      const res = await enableVoiceAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(hasAgent ? "Voz reactivada" : "Agente de voz creado");
    });
  }

  function handleDisable() {
    start(async () => {
      const res = await disableVoiceAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success("Voz desactivada");
    });
  }

  function handleDelete() {
    if (
      !confirm(
        "Esto elimina permanentemente el agente de voz en ElevenLabs. Tendrás que volver a configurarlo desde cero. ¿Continuar?",
      )
    )
      return;
    start(async () => {
      const res = await deleteVoiceAgentAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success("Agente eliminado");
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleDisable}
          disabled={pending}
          className="text-muted-foreground"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MicOff className="size-4" />}
          Desactivar voz
        </Button>
      ) : (
        <Button type="button" onClick={handleEnable} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
          {hasAgent ? "Reactivar voz" : "Activar voz"}
        </Button>
      )}
      {hasAgent ? (
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive"
        >
          Eliminar agente
        </Button>
      ) : null}
    </div>
  );
}
