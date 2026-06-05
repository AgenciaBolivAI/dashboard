"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectStripeAction } from "@/lib/actions/billing";

export function DisconnectStripeButton({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();

  function handleClick() {
    if (
      !confirm(
        "¿Desconectar tu cuenta de Stripe? Dejarás de poder cobrar facturas hasta que vuelvas a conectar. Las facturas ya emitidas siguen activas en Stripe.",
      )
    ) {
      return;
    }
    start(async () => {
      const res = await disconnectStripeAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success("Stripe desconectado");
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleClick}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      <Unlink className="size-4" />
      {pending ? "Desconectando…" : "Desconectar Stripe"}
    </Button>
  );
}
