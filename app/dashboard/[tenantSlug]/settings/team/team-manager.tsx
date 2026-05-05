"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  inviteUserAction,
  revokeInvitationAction,
  updateMemberRoleAction,
  removeMemberAction,
  type Member,
  type PendingInvitation,
  type TeamState,
} from "@/lib/actions/team";

const initial: TeamState = { error: null };

const ROLES = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Admin" },
  { id: "operator", label: "Operador" },
  { id: "viewer", label: "Lectura" },
] as const;

const ROLE_HINT: Record<string, string> = {
  owner: "Controla todo, incluyendo facturación",
  admin: "Configura el agente y gestiona equipo",
  operator: "Atiende conversaciones, gestiona reservas",
  viewer: "Solo lectura",
  member: "Acceso básico",
};

export function TeamManager({
  tenantId,
  members,
  invitations,
}: {
  tenantId: string;
  members: Member[];
  invitations: PendingInvitation[];
}) {
  const [state, action, pending] = useActionState(inviteUserAction, initial);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success && state.inviteUrl) {
      toast.success("Invitación creada");
      setLastInviteUrl(state.inviteUrl);
    }
  }, [state]);

  function handleRevoke(inv: PendingInvitation) {
    if (!confirm(`¿Revocar invitación a ${inv.email}?`)) return;
    startBusy(async () => {
      const res = await revokeInvitationAction(tenantId, inv.id);
      if (res.error) toast.error(res.error);
      else toast.success("Invitación revocada");
    });
  }

  function handleRoleChange(m: Member, role: (typeof ROLES)[number]["id"]) {
    startBusy(async () => {
      const res = await updateMemberRoleAction(tenantId, m.user_id, role);
      if (res.error) toast.error(res.error);
      else toast.success("Rol actualizado");
    });
  }

  function handleRemove(m: Member) {
    if (!confirm(`¿Quitar a ${m.email} de este agente?`)) return;
    startBusy(async () => {
      const res = await removeMemberAction(tenantId, m.user_id);
      if (res.error) toast.error(res.error);
      else toast.success("Persona eliminada");
    });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Enlace copiado");
  }

  return (
    <div className="space-y-8">
      {/* Invite form */}
      <section>
        <h3 className="font-display font-semibold mb-3">Invitar a alguien</h3>
        <form action={action} className="space-y-3">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email" className="sr-only">
                Email
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="colega@empresa.com"
                required
              />
            </div>
            <select
              name="role"
              defaultValue="operator"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={pending}>
              <UserPlus className="size-4" />
              {pending ? "Generando…" : "Invitar"}
            </Button>
          </div>
        </form>

        {lastInviteUrl ? (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="size-4 text-primary shrink-0" />
              <span className="font-medium">Comparte este enlace con la persona invitada:</span>
            </div>
            <div className="flex items-center gap-2">
              <Input value={lastInviteUrl} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyUrl(lastInviteUrl)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El enlace expira en 7 días. Cuando lo abran, podrán crear su cuenta y
              entrar directamente.
            </p>
          </div>
        ) : null}
      </section>

      <Separator />

      {/* Members */}
      <section>
        <h3 className="font-display font-semibold mb-3">
          Miembros ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay miembros.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.email}
                    {m.is_self ? (
                      <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_HINT[m.role] ?? m.role}
                  </p>
                </div>
                <select
                  value={m.role}
                  onChange={(e) =>
                    handleRoleChange(m, e.target.value as (typeof ROLES)[number]["id"])
                  }
                  disabled={busy || m.is_self}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(m)}
                  disabled={busy || m.is_self}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invitations */}
      {invitations.length > 0 ? (
        <>
          <Separator />
          <section>
            <h3 className="font-display font-semibold mb-3">
              Invitaciones pendientes ({invitations.length})
            </h3>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Rol: <Badge variant="outline">{inv.role}</Badge> · expira{" "}
                      {new Date(inv.expires_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const base = window.location.origin;
                      copyUrl(`${base}/invitations/${inv.token}`);
                    }}
                    title="Copiar enlace de invitación"
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevoke(inv)}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
