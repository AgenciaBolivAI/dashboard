"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteTenantAction, type AdminState } from "@/lib/actions/admin";

const initial: AdminState = { error: null };

export function TenantDangerZone({ id, slug }: { id: string; slug: string }) {
  const [state, action, pending] = useActionState(deleteTenantAction, initial);
  const [confirmText, setConfirmText] = useState("");
  const matches = confirmText === slug;

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="space-y-2">
        <Label htmlFor="confirm_slug">
          Escribe <code className="font-mono text-foreground">{slug}</code>{" "}
          para confirmar:
        </Label>
        <Input
          id="confirm_slug"
          name="confirm_slug"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={slug}
          className="font-mono"
        />
      </div>
      <Button
        type="submit"
        variant="destructive"
        disabled={!matches || pending}
      >
        <Trash2 className="size-4" />
        {pending ? "Eliminando…" : "Eliminar tenant permanentemente"}
      </Button>
    </form>
  );
}
