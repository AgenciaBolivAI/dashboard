"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ticket, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createLifetimeCodeAction,
  deactivateLifetimeCodeAction,
  type CodeState,
} from "@/lib/actions/admin-codes";
import type { LifetimeCode } from "@/lib/billing/lifetime-codes";

const initial: CodeState = { error: null };

export function LifetimeCodesManager({ codes }: { codes: LifetimeCode[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createLifetimeCodeAction, initial);
  const [delPending, startDel] = useTransition();

  useEffect(() => {
    if (state.success) {
      toast.success("Código creado");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function deactivate(id: string) {
    startDel(async () => {
      const r = await deactivateLifetimeCodeAction(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Código desactivado");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Ticket className="size-4 text-primary" />
          <h2 className="font-display font-semibold">Crear código</h2>
        </div>
        <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Descuento % (1–100)">
            <Input name="percent_off" type="number" min={1} max={100} required defaultValue="50" />
          </Field>
          <Field label="Código (opcional)">
            <Input name="code" placeholder="FUNDADOR50" maxLength={40} />
          </Field>
          <Field label="Etiqueta (opcional)">
            <Input name="label" placeholder="Campaña LinkedIn" maxLength={60} />
          </Field>
          <Field label="Máx. usos (opcional)">
            <Input name="max_redemptions" type="number" min={1} placeholder="∞" />
          </Field>
          <Field label="Expira (opcional)">
            <Input name="expires_at" type="date" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creando…" : "Crear código"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Si dejas el código vacío, Stripe genera uno. 100% = acceso gratis. Los usuarios lo ingresan
          en el paywall o en la página de Stripe.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display font-semibold">Códigos</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay códigos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2">Código</th>
                  <th>Desc.</th>
                  <th>Usos</th>
                  <th>Expira</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-2 font-mono font-medium">
                      {c.code}
                      {c.label ? <span className="ml-2 text-xs text-muted-foreground">{c.label}</span> : null}
                    </td>
                    <td>{c.percentOff}%</td>
                    <td>
                      {c.timesRedeemed}
                      {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td>{c.expiresAt ? new Date(c.expiresAt * 1000).toLocaleDateString("es") : "—"}</td>
                    <td>
                      {c.active ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="muted">Inactivo</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      {c.active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivate(c.id)}
                          disabled={delPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
