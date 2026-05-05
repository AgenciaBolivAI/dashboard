"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createServiceAction,
  updateServiceAction,
  type ServiceState,
} from "@/lib/actions/services";

const initial: ServiceState = { error: null };

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price_amount: number | null;
  price_currency: string;
  duration_min: number;
  category: string | null;
  active: boolean;
};

export type StaffOption = { id: string; name: string; active: boolean };

export function ServiceFormDialog({
  open,
  onClose,
  tenantId,
  service,
  allStaff,
  linkedStaffIds,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  service: ServiceRow | null;
  allStaff: StaffOption[];
  linkedStaffIds: string[];
}) {
  const isEdit = !!service;
  const [state, action, pending] = useActionState(
    isEdit ? updateServiceAction : createServiceAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? "Servicio actualizado" : "Servicio creado");
      onClose();
    }
  }, [state, isEdit, onClose]);

  const linkedSet = new Set(linkedStaffIds);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar servicio" : "Nuevo servicio"}</DialogTitle>
          <DialogDescription>
            Esta info la usa el agente para responder y reservar citas.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          {service ? <input type="hidden" name="id" value={service.id} /> : null}

          <Field
            label="Nombre"
            name="name"
            defaultValue={service?.name ?? ""}
            required
            placeholder="Limpieza dental"
          />

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={service?.description ?? ""}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Revisión general + limpieza profunda con ultrasonido"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="price_amount">Precio</Label>
              <Input
                id="price_amount"
                name="price_amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={service?.price_amount ?? ""}
                placeholder="150.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_currency">Moneda</Label>
              <Input
                id="price_currency"
                name="price_currency"
                defaultValue={service?.price_currency ?? "BOB"}
                maxLength={8}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Duración (min)"
              name="duration_min"
              type="number"
              min="5"
              max="600"
              defaultValue={service?.duration_min ?? 30}
              required
            />
            <Field
              label="Categoría"
              name="category"
              defaultValue={service?.category ?? ""}
              placeholder="Higiene"
            />
          </div>

          <div className="space-y-2">
            <Label>Personal que ofrece este servicio</Label>
            {allStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no hay personal. Agrega personal en la sección Personal y
                vuelve para asignarlo.
              </p>
            ) : (
              <div className="rounded-md border border-input divide-y divide-border max-h-48 overflow-y-auto">
                {allStaff.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      name="staff_ids"
                      value={s.id}
                      defaultChecked={linkedSet.has(s.id)}
                      className="rounded border-input"
                    />
                    <span className={s.active ? "" : "text-muted-foreground"}>
                      {s.name}
                      {s.active ? "" : " (inactivo)"}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              El agente solo ofrecerá horarios del personal marcado.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={service?.active ?? true}
              className="rounded border-input"
            />
            Activo (el agente puede ofrecerlo)
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}
