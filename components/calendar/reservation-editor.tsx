"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarClock, Mail, Phone, Trash2, User, Briefcase, UserCircle2, Video, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  updateReservationNotesAction,
  cancelReservationAction,
  rescheduleReservationAction,
  type CalendarState,
} from "@/lib/actions/calendar";
import { createInvoiceFromReservationAction } from "@/lib/actions/invoices";
import type { Reservation, Slot, Staffer } from "@/lib/queries/calendar";

const initial: CalendarState = { error: null };

export function ReservationCard({
  reservation,
  tenantId,
  tenantSlug,
  tenantTimezone,
  staff,
  availableSlots,
}: {
  reservation: Reservation;
  tenantId: string;
  tenantSlug: string;
  tenantTimezone: string;
  staff: Staffer[];
  availableSlots: Slot[];
}) {
  const t = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const assignedStaff = reservation.staff_id ? staffById.get(reservation.staff_id) : null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-md bg-primary/10 border border-primary/30 px-2 py-1.5 text-xs hover:bg-primary/15 hover:border-primary/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium truncate">
              {reservation.customer_name ?? t("reservation")}
            </span>
            <Badge variant="success" className="shrink-0 text-[9px] px-1 py-0">
              {reservation.duration_minutes}m
            </Badge>
          </div>
          {reservation.service_name ? (
            <div className="text-foreground/80 mt-0.5 truncate">
              {reservation.service_name}
            </div>
          ) : null}
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1">
            <span>{formatTime(reservation.start_at, tenantTimezone)}</span>
            {assignedStaff ? <span>· {assignedStaff.name.split(" ")[0]}</span> : null}
          </div>
        </button>
        {reservation.meeting_url ? (
          <a
            href={reservation.meeting_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={t("join_video_call")}
            className="absolute top-1.5 right-1.5 rounded-md bg-primary text-primary-foreground p-1 hover:opacity-90 shadow"
          >
            <Video className="size-3" />
          </a>
        ) : null}
      </div>

      {open ? (
        <ReservationDialog
          open={open}
          onClose={() => setOpen(false)}
          reservation={reservation}
          tenantId={tenantId}
          tenantSlug={tenantSlug}
          tenantTimezone={tenantTimezone}
          staff={staff}
          availableSlots={availableSlots}
        />
      ) : null}
    </>
  );
}

function ReservationDialog({
  open,
  onClose,
  reservation,
  tenantId,
  tenantSlug,
  tenantTimezone,
  staff,
  availableSlots,
}: {
  open: boolean;
  onClose: () => void;
  reservation: Reservation;
  tenantId: string;
  tenantSlug: string;
  tenantTimezone: string;
  staff: Staffer[];
  availableSlots: Slot[];
}) {
  const t = useTranslations("calendar");
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const assignedStaff = reservation.staff_id ? staffById.get(reservation.staff_id) : null;

  const [notesState, notesAction, notesPending] = useActionState(
    updateReservationNotesAction,
    initial,
  );
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(
    rescheduleReservationAction,
    initial,
  );
  const [cancelling, startCancel] = useTransition();
  const [mode, setMode] = useState<"view" | "reschedule">("view");

  useEffect(() => {
    if (notesState.error) toast.error(notesState.error);
    if (notesState.success) {
      toast.success(t("notes_saved"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesState, onClose]);

  useEffect(() => {
    if (rescheduleState.error) toast.error(rescheduleState.error);
    if (rescheduleState.success) {
      toast.success(t("reservation_rescheduled"));
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rescheduleState, onClose]);

  function handleCancel() {
    const reason = window.prompt(
      t("cancel_reason_prompt"),
      "",
    );
    // Treat clicking Cancel in the prompt as "abort"; empty string proceeds with no reason.
    if (reason === null) return;
    if (!confirm(t("cancel_confirm"))) return;

    startCancel(async () => {
      const res = await cancelReservationAction(
        tenantId,
        reservation.id,
        reason.trim() || null,
      );
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("reservation_cancelled"));
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "reschedule" ? t("reschedule_title") : t("reservation_detail_title")}
          </DialogTitle>
          <DialogDescription>
            {mode === "reschedule"
              ? t("reschedule_desc")
              : t("reservation_detail_desc")}
          </DialogDescription>
        </DialogHeader>

        {mode === "view" ? (
          <ViewMode
            reservation={reservation}
            tenantTimezone={tenantTimezone}
            assignedStaffName={assignedStaff?.name ?? null}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            notesAction={notesAction}
            notesPending={notesPending}
            cancelling={cancelling}
            onCancel={handleCancel}
            onReschedule={() => setMode("reschedule")}
            onClose={onClose}
          />
        ) : (
          <RescheduleMode
            reservation={reservation}
            tenantId={tenantId}
            tenantTimezone={tenantTimezone}
            availableSlots={availableSlots}
            staffById={staffById}
            action={rescheduleAction}
            pending={reschedulePending}
            onBack={() => setMode("view")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewMode({
  reservation,
  tenantTimezone,
  assignedStaffName,
  tenantId,
  tenantSlug,
  notesAction,
  notesPending,
  cancelling,
  onCancel,
  onReschedule,
  onClose,
}: {
  reservation: Reservation;
  tenantTimezone: string;
  assignedStaffName: string | null;
  tenantId: string;
  tenantSlug: string;
  notesAction: (formData: FormData) => void;
  notesPending: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onReschedule: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const startDateLabel = formatDateLong(reservation.start_at, tenantTimezone, locale);
  const startTimeLabel = formatTime(reservation.start_at, tenantTimezone);
  const endTimeLabel = formatTime(reservation.end_at, tenantTimezone);

  return (
    <form action={notesAction} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="reservation_id" value={reservation.id} />

      <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2 text-sm">
        <Row icon={<CalendarClock className="size-4" />}>
          <span className="font-medium">{startDateLabel}</span>
          <span className="text-muted-foreground">
            {" "}
            · {startTimeLabel} – {endTimeLabel} ({reservation.duration_minutes}m)
          </span>
        </Row>
        {reservation.service_name ? (
          <Row icon={<Briefcase className="size-4" />}>{reservation.service_name}</Row>
        ) : null}
        {assignedStaffName ? (
          <Row icon={<UserCircle2 className="size-4" />}>{assignedStaffName}</Row>
        ) : null}
      </div>

      {reservation.meeting_url ? (
        <a
          href={reservation.meeting_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2.5 text-sm font-medium hover:opacity-90"
        >
          <Video className="size-4" />
          {t("join_video_call")}
        </a>
      ) : null}

      <div className="space-y-2 text-sm">
        <Row icon={<User className="size-4" />}>
          {reservation.customer_name ? (
            reservation.customer_user_id ? (
              <Link
                href={`/dashboard/${tenantSlug}/customers/${reservation.customer_user_id}`}
                className="hover:text-primary hover:underline"
              >
                {reservation.customer_name}
              </Link>
            ) : (
              reservation.customer_name
            )
          ) : (
            <span className="text-muted-foreground">{t("no_name")}</span>
          )}
        </Row>
        <Row icon={<Mail className="size-4" />}>
          {reservation.customer_email ? (
            <a href={`mailto:${reservation.customer_email}`} className="hover:underline">
              {reservation.customer_email}
            </a>
          ) : (
            <span className="text-muted-foreground">{t("no_email")}</span>
          )}
        </Row>
        <Row icon={<Phone className="size-4" />}>
          {reservation.customer_phone ? (
            <a
              href={`https://wa.me/${reservation.customer_phone.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {reservation.customer_phone}
            </a>
          ) : (
            <span className="text-muted-foreground">{t("no_phone")}</span>
          )}
        </Row>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t("internal_notes")}</Label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={reservation.notes ?? ""}
          rows={4}
          placeholder={t("notes_placeholder")}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          )}
        />
      </div>

      <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
        <div className="flex gap-1 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={cancelling || notesPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
            {cancelling ? t("cancelling") : t("cancel_reservation")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onReschedule}
            disabled={cancelling || notesPending}
          >
            <CalendarClock className="size-4" />
            {t("reschedule")}
          </Button>
          <CreateInvoiceButton
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            reservationId={reservation.id}
            disabled={cancelling || notesPending}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={cancelling || notesPending}
          >
            {t("close")}
          </Button>
          <Button type="submit" disabled={cancelling || notesPending}>
            {notesPending ? t("saving") : t("save_notes")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function RescheduleMode({
  reservation,
  tenantId,
  tenantTimezone,
  availableSlots,
  staffById,
  action,
  pending,
  onBack,
}: {
  reservation: Reservation;
  tenantId: string;
  tenantTimezone: string;
  availableSlots: Slot[];
  staffById: Map<string, Staffer>;
  action: (formData: FormData) => void;
  pending: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  // Group slots by tenant-tz date so the day picker shows real local dates.
  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of availableSlots) {
      const key = formatDateKey(s.start_at, tenantTimezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [availableSlots, tenantTimezone]);

  const dateOptions = useMemo(
    () => Array.from(slotsByDate.keys()).sort(),
    [slotsByDate],
  );
  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0] ?? "");
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  const slotsForDate = selectedDate ? slotsByDate.get(selectedDate) ?? [] : [];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="reservation_id" value={reservation.id} />
      <input type="hidden" name="new_slot_id" value={selectedSlotId} />
      <input
        type="hidden"
        name="duration_min"
        value={String(reservation.duration_minutes)}
      />

      <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        {t("current_reservation")}: <span className="text-foreground font-medium">{formatDateLong(reservation.start_at, tenantTimezone, locale)}</span>{" "}
        · {formatTime(reservation.start_at, tenantTimezone)} ({reservation.duration_minutes}m)
      </div>

      {dateOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("no_slots_available")}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="reschedule_date">{t("new_day")}</Label>
            <select
              id="reschedule_date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedSlotId("");
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {formatDateLongFromKey(d, tenantTimezone, locale)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>{t("new_time")}</Label>
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {slotsForDate.map((s) => {
                const staffer = s.staff_id ? staffById.get(s.staff_id) : null;
                const active = selectedSlotId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSlotId(s.id)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs text-left transition-colors",
                      active
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background hover:bg-secondary/50",
                    )}
                  >
                    <div className="font-medium">
                      {formatTime(s.start_at, tenantTimezone)} – {formatTime(s.end_at, tenantTimezone)}
                    </div>
                    {staffer ? (
                      <div className="text-muted-foreground truncate">
                        {staffer.name.split(" ")[0]}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <DialogFooter className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          ← {t("back")}
        </Button>
        <Button type="submit" disabled={pending || !selectedSlotId}>
          {pending ? t("rescheduling") : t("confirm_new_time")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreateInvoiceButton({
  tenantId,
  tenantSlug,
  reservationId,
  disabled,
}: {
  tenantId: string;
  tenantSlug: string;
  reservationId: string;
  disabled: boolean;
}) {
  // Programmatic call instead of <form> wrap — the parent ViewMode is
  // already a <form>, and HTML disallows nested forms. Calling the action
  // directly with a manually-built FormData works the same and avoids the
  // hydration error.
  const t = useTranslations("calendar");
  const [pending, startTransition] = useTransition();
  function fire(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tenant_id", tenantId);
      fd.set("tenant_slug", tenantSlug);
      fd.set("reservation_id", reservationId);
      await createInvoiceFromReservationAction(fd);
    });
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={fire}
      disabled={disabled || pending}
    >
      <FileText className="size-4" />
      {t("create_invoice")}
    </Button>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
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

function formatDateLong(iso: string, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date(iso));
}

function formatDateKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

function formatDateLongFromKey(key: string, tz: string, locale: string): string {
  // Treat key as noon UTC to avoid TZ boundary issues, then format in tenant tz.
  const probe = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(probe);
}
