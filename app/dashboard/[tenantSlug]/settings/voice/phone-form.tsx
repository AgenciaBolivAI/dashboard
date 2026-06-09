"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Phone, Loader2, Unlink, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  attachTwilioNumberAction,
  detachPhoneNumberAction,
  type VoiceActionState,
} from "@/lib/actions/voice";

const initial: VoiceActionState = { error: null };

export function PhoneAttachForm({
  tenantId,
}: {
  tenantId: string;
}) {
  const [state, action, pending] = useActionState(attachTwilioNumberAction, initial);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Número conectado. Pruébalo llamando.");
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />

      <div className="space-y-2">
        <Label htmlFor="phone_number">Número de Twilio (E.164)</Label>
        <Input
          id="phone_number"
          name="phone_number"
          placeholder="+15551234567"
          required
        />
        <p className="text-xs text-muted-foreground">
          Cómpralo primero en{" "}
          <a
            href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground inline-flex items-center gap-1"
          >
            Twilio Console
            <ExternalLink className="size-3" />
          </a>{" "}
          (sección Phone Numbers → Buy a number). Asegúrate que tenga capacidad
          de voz.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_sid">Twilio Account SID</Label>
        <Input
          id="account_sid"
          name="account_sid"
          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          required
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="auth_token">Twilio Auth Token</Label>
        <Input
          id="auth_token"
          name="auth_token"
          type="password"
          placeholder="••••••••••••••••••••••••••••••••"
          required
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <ShieldCheck className="size-3" />
          Tu token se guarda solo en nuestra base. Recomendado: usa un Auth
          Token específico para esta integración y rótalo cuando ya no la uses.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Phone className="size-4" />
        )}
        {pending ? "Conectando…" : "Conectar número"}
      </Button>
    </form>
  );
}

export function PhoneDetachedView({
  tenantId,
  phoneNumber,
}: {
  tenantId: string;
  phoneNumber: string;
}) {
  const [pending, start] = useTransition();

  function handleDetach() {
    if (
      !confirm(
        "¿Desconectar este número? Tu agente dejará de recibir llamadas hasta que conectes otro.",
      )
    )
      return;
    start(async () => {
      const res = await detachPhoneNumberAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success("Número desconectado");
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleDetach}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Unlink className="size-4" />
      )}
      Desconectar {phoneNumber}
    </Button>
  );
}
