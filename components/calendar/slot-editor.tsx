"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
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
  updateSlotAction,
  deleteSlotAction,
  type CalendarState,
} from "@/lib/actions/calendar";

const initial: CalendarState = { error: null };

export type SlotChipData = {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  is_available: boolean;
};

export type StaffOption = { id: string; name: string };

/**
 * Renders a single slot in the calendar grid as a clickable chip.
 * Clicking opens an edit dialog with start/end/staff/availability +
 * a delete button.
 */
export function SlotChip({
  slot,
  tenantId,
  tenantTimezone,
  staff,
}: {
  slot: SlotChipData;
  tenantId: string;
  tenantTimezone: string;
  staff: StaffOption[];
}) {
  const [open, setOpen] = useState(false);

  const startLabel = formatTime(slot.start_at, tenantTimezone);
  const endLabel = formatTime(slot.end_at, tenantTimezone);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-md bg-secondary/40 border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/70 hover:border-foreground/20 transition-colors"
      >
        {startLabel} – {endLabel}
      </button>

      {open ? (
        <SlotEditDialog
          open={open}
          onClose={() => setOpen(false)}
          slot={slot}
          tenantId={tenantId}
          tenantTimezone={tenantTimezone}
          staff={staff}
        />
      ) : null}
    </>
  );
}

function SlotEditDialog({
  open,
  onClose,
  slot,
  tenantId,
  tenantTimezone,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  slot: SlotChipData;
  tenantId: string;
  tenantTimezone: string;
  staff: StaffOption[];
}) {
  const t = useTranslations("calendar");
  const [state, action, pending] = useActionState(updateSlotAction, initial);
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(t("slot_updated"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, onClose]);

  function handleDelete() {
    if (!confirm(t("delete_slot_confirm"))) return;
    startDelete(async () => {
      const res = await deleteSlotAction(tenantId, slot.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("slot_deleted"));
        onClose();
      }
    });
  }

  const initialDate = formatDateInTz(slot.start_at, tenantTimezone);
  const initialStart = formatTime(slot.start_at, tenantTimezone);
  const initialEnd = formatTime(slot.end_at, tenantTimezone);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("edit_slot_title")}</DialogTitle>
          <DialogDescription>
            {t("edit_slot_desc")}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <input type="hidden" name="slot_id" value={slot.id} />

          <div className="space-y-2">
            <Label htmlFor="staff_id">{t("assigned_staff")}</Label>
            <select
              id="staff_id"
              name="staff_id"
              defaultValue={slot.staff_id}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">{t("date")}</Label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={initialDate}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start_time">{t("start")}</Label>
              <Input
                id="start_time"
                name="start_time"
                type="time"
                defaultValue={initialStart}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_time">{t("end")}</Label>
              <Input
                id="end_time"
                name="end_time"
                type="time"
                defaultValue={initialEnd}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_available"
              defaultChecked={slot.is_available}
              className="rounded border-input"
            />
            {t("available_for_booking")}
          </label>

          <DialogFooter className="flex justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting || pending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {deleting ? t("deleting") : t("delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={pending || deleting}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending || deleting}>
                {pending ? t("saving") : t("save")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function formatDateInTz(iso: string, tz: string): string {
  // Returns YYYY-MM-DD in the given timezone (suitable for <input type="date">)
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}
