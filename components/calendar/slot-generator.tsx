"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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

// Day-label translation keys, ordered Mon→Sun.
const DAY_LABEL_KEYS = ["day_mon", "day_tue", "day_wed", "day_thu", "day_fri", "day_sat", "day_sun"] as const;
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
  const t = useTranslations("calendar");
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
        skipped
          ? t("slots_generated_with_skipped", { created, skipped })
          : t("slots_generated", { created }),
      );
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {t("generate_slots")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("generate_availability_title")}</DialogTitle>
          <DialogDescription>
            {t("generate_availability_desc")}
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
            <Label htmlFor="staff_id">{t("person")}</Label>
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
              <Label htmlFor="start_date">{t("from")}</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{t("until")}</Label>
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
              <Label htmlFor="start_time">{t("start_time")}</Label>
              <Input
                id="start_time"
                name="start_time"
                type="time"
                defaultValue="09:00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">{t("end_time")}</Label>
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
            <Label htmlFor="slot_minutes">{t("slot_duration_min")}</Label>
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
            <Label>{t("weekdays")}</Label>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABEL_KEYS.map((labelKey, i) => {
                const value = DAY_VALUES[i];
                const active = selectedDays.has(value);
                return (
                  <button
                    key={labelKey}
                    type="button"
                    onClick={() => toggleDay(value)}
                    className={
                      "px-3 py-1.5 rounded-md text-xs font-medium transition " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80")
                    }
                  >
                    {t(labelKey)}
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
            {t("skip_existing")}
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("generating") : t("generate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
