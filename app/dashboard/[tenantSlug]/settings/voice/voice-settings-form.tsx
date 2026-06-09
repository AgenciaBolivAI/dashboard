"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateVoiceSettingsAction,
  type VoiceActionState,
} from "@/lib/actions/voice";
import type { CuratedVoice } from "@/lib/voices";

const initial: VoiceActionState = { error: null };

export function VoiceSettingsForm({
  tenantId,
  currentVoiceId,
  currentGreeting,
  voices,
}: {
  tenantId: string;
  currentVoiceId: string;
  currentGreeting: string;
  voices: CuratedVoice[];
}) {
  const [state, action, pending] = useActionState(
    updateVoiceSettingsAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Cambios guardados");
  }, [state]);

  const grouped = {
    female: voices.filter((v) => v.gender === "female"),
    male: voices.filter((v) => v.gender === "male"),
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-2">
        <Label htmlFor="voice_id">Voz del agente</Label>
        <select
          id="voice_id"
          name="voice_id"
          defaultValue={currentVoiceId}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <optgroup label="Voces femeninas">
            {grouped.female.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.description}
              </option>
            ))}
          </optgroup>
          <optgroup label="Voces masculinas">
            {grouped.male.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.description}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs text-muted-foreground">
          Todas las voces soportan español e inglés (modelo multilingüe v2).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="voice_greeting">Saludo inicial (opcional)</Label>
        <textarea
          id="voice_greeting"
          name="voice_greeting"
          defaultValue={currentGreeting}
          rows={2}
          placeholder="Hola, gracias por llamar. ¿En qué puedo ayudarte hoy?"
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
          )}
        />
        <p className="text-xs text-muted-foreground">
          Lo que escucha el cliente apenas se conecta. Si lo dejas vacío, el
          agente usa un saludo genérico en el idioma de tu tenant.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
