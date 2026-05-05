"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  type StaffState,
} from "@/lib/actions/staff";

const initial: StaffState = { error: null };

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean;
};

export type ServiceOption = {
  id: string;
  name: string;
  duration_min: number;
  active: boolean;
};

export function StaffManager({
  tenantId,
  staff,
  allServices,
  servicesByStaff,
}: {
  tenantId: string;
  staff: StaffRow[];
  allServices: ServiceOption[];
  servicesByStaff: Record<string, string[]>;
}) {
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(s: StaffRow) {
    setEditing(s);
    setOpen(true);
  }
  function handleDelete(s: StaffRow) {
    if (!confirm(`¿Eliminar a ${s.name}? Las reservas existentes se conservan sin asignar.`)) return;
    startTransition(async () => {
      const res = await deleteStaffAction(tenantId, s.id);
      if (res.error) toast.error(res.error);
      else toast.success("Persona eliminada");
    });
  }

  function serviceCountFor(staffId: string): number {
    return (servicesByStaff[staffId] ?? []).length;
  }

  const linkedForEditing = editing ? servicesByStaff[editing.id] ?? [] : [];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          Añadir persona
        </Button>
      </div>

      {staff.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <p className="font-medium">Aún no hay personal</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Agrega al menos una persona para que el agente pueda asignar
            reservas y mostrar disponibilidad.
          </p>
          <Button onClick={openNew} className="mt-4">
            <Plus className="size-4" />
            Añadir
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Servicios</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((s) => {
                const count = serviceCountFor(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.role ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {count > 0 ? (
                        `${count} servicio${count === 1 ? "" : "s"}`
                      ) : (
                        <span className="text-muted-foreground">ninguno</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.active ? (
                        <Badge variant="success">Activo</Badge>
                      ) : (
                        <Badge variant="muted">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(s)}
                          disabled={pending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <StaffFormDialog
        open={open}
        onClose={() => setOpen(false)}
        tenantId={tenantId}
        staff={editing}
        allServices={allServices}
        linkedServiceIds={linkedForEditing}
      />
    </>
  );
}

function StaffFormDialog({
  open,
  onClose,
  tenantId,
  staff,
  allServices,
  linkedServiceIds,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  staff: StaffRow | null;
  allServices: ServiceOption[];
  linkedServiceIds: string[];
}) {
  const isEdit = !!staff;
  const [state, action, pending] = useActionState(
    isEdit ? updateStaffAction : createStaffAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? "Persona actualizada" : "Persona creada");
      onClose();
    }
  }, [state, isEdit, onClose]);

  const linkedSet = new Set(linkedServiceIds);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar persona" : "Añadir persona"}</DialogTitle>
          <DialogDescription>
            El personal aparece en el calendario y puede recibir reservas.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          {staff ? <input type="hidden" name="id" value={staff.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="name">Nombre completo</Label>
            <Input id="name" name="name" defaultValue={staff?.name ?? ""} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={staff?.email ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Input
              id="role"
              name="role"
              placeholder="fisioterapeuta, dentista, doctor…"
              defaultValue={staff?.role ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label>Servicios que ofrece</Label>
            {allServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aún no hay servicios. Crea servicios y vuelve para asignarlos.
              </p>
            ) : (
              <div className="rounded-md border border-input divide-y divide-border max-h-48 overflow-y-auto">
                {allServices.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      name="service_ids"
                      value={s.id}
                      defaultChecked={linkedSet.has(s.id)}
                      className="rounded border-input"
                    />
                    <span className={s.active ? "" : "text-muted-foreground"}>
                      {s.name} · {s.duration_min} min
                      {s.active ? "" : " (inactivo)"}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              El agente solo asignará reservas de los servicios marcados.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={staff?.active ?? true}
              className="rounded border-input"
            />
            Activo (puede recibir reservas)
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
