"use client";

import { useActionState, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { generateSlotsAction, type CalendarState } from "@/lib/actions/calendar";

const initial: CalendarState = { error: null };

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
// Day of week as returned by Date.getUTCDay(): 0=Sun, 1=Mon...6=Sat.
// We map our "Lun..Dom" order to those bits.
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

export type StaffOption = { id: string; name: string };

export function SlotGenerator({
  tenantId,
  staff,
}: {
  tenantId: string;
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(generateSlotsAction, initial);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5]), // Mon–Fri default
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      const created = state.created ?? 0;
      const skipped = state.skipped ?? 0;
      toast.success(
        `Generados ${created} slots${skipped ? ` (${skipped} omitidos)` : ""}`,
      );
      setOpen(false);
    }
  }, [state]);

  function toggleDay(d: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  if (staff.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="size-4" />
          Generar slots
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar disponibilidad</DialogTitle>
          <DialogDescription>
            Crea slots libres en bloque para una persona del equipo. Los días no
            seleccionados se omiten.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <input
            type="hidden"
            name="weekdays"
            value={JSON.stringify(Array.from(selectedDays))}
          />

          <div className="space-y-2">
            <Label htmlFor="staff_id">Persona</Label>
            <select
              id="staff_id"
              name="staff_id"
              required
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start_date">Desde</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Hasta</Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                defaultValue={inTwoWeeks}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start_time">Hora inicio</Label>
              <Input
                id="start_time"
                name="start_time"
                type="time"
                defaultValue="09:00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">Hora fin</Label>
              <Input
                id="end_time"
                name="end_time"
                type="time"
                defaultValue="18:00"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slot_minutes">Duración por slot (min)</Label>
            <Input
              id="slot_minutes"
              name="slot_minutes"
              type="number"
              min="5"
              max="240"
              defaultValue={30}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Días de la semana</Label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, i) => {
                const value = DAY_VALUES[i];
                const active = selectedDays.has(value);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={
                      "px-3 py-1.5 rounded-md text-xs font-medium transition " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80")
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="skip_existing"
              defaultChecked
              className="rounded border-input"
            />
            Omitir slots que ya existan en ese horario
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Generando…" : "Generar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
