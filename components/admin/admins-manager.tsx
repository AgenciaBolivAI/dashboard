"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Trash2, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  promoteAdminAction,
  demoteAdminAction,
  type AdminState,
  type StaffRow,
} from "@/lib/actions/admin";
import { formatDate } from "@/lib/utils";

const initial: AdminState = { error: null };

export function AdminsManager({ staff }: { staff: StaffRow[] }) {
  const [state, action, pending] = useActionState(promoteAdminAction, initial);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Promovido");
  }, [state]);

  function handleDemote(s: StaffRow) {
    if (!confirm(`¿Quitar permisos de admin a ${s.email}?`)) return;
    startBusy(async () => {
      const res = await demoteAdminAction(s.user_id);
      if (res.error) toast.error(res.error);
      else toast.success("Permisos retirados");
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-display font-semibold mb-3">Promover a alguien</h3>
        <form action={action} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="promote-email" className="sr-only">
                Email
              </Label>
              <Input
                id="promote-email"
                name="email"
                type="email"
                placeholder="staff@bolivai.com"
                required
              />
            </div>
            <select
              name="role"
              defaultValue="admin"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <Button type="submit" disabled={pending}>
              <ShieldPlus className="size-4" />
              {pending ? "Promoviendo…" : "Promover"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La cuenta del email debe existir. Créala en Supabase → Auth → Users,
            o invita a la persona a cualquier tenant primero.
          </p>
        </form>
      </section>

      <Separator />

      <section>
        <h3 className="font-display font-semibold mb-3">
          Equipo actual ({staff.length})
        </h3>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay nadie con acceso.</p>
        ) : (
          <div className="space-y-2">
            {staff.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {formatDate(s.created_at)}
                  </p>
                </div>
                <Badge variant={s.role === "superadmin" ? "default" : "outline"}>
                  {s.role}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDemote(s)}
                  disabled={busy}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
