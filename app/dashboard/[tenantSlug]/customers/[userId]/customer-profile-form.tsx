"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateCustomerProfileAction,
  type CustomerActionState,
} from "@/lib/actions/customers";

const initial: CustomerActionState = { error: null };

export function CustomerProfileForm({
  tenantId,
  userId,
  isVip,
  tenantNotes,
}: {
  tenantId: string;
  userId: string;
  isVip: boolean;
  tenantNotes: string | null;
}) {
  const [state, action, pending] = useActionState(
    updateCustomerProfileAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Perfil actualizado");
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="user_id" value={userId} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_vip"
          defaultChecked={isVip}
          className="h-4 w-4 rounded border-input"
        />
        <Star className="size-4 text-muted-foreground" />
        <span>Marcar como VIP</span>
      </label>

      <div className="space-y-2">
        <Label htmlFor="tenant_notes">Notas privadas</Label>
        <textarea
          id="tenant_notes"
          name="tenant_notes"
          defaultValue={tenantNotes ?? ""}
          rows={6}
          placeholder="Alergias, preferencias, historial, lo que sea útil para tu equipo…"
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
          )}
        />
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
