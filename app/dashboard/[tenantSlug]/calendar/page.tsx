import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import {
  getWeekCalendar,
  getAvailableFutureSlots,
  type Reservation,
  type Slot,
} from "@/lib/queries/calendar";
import { SlotGenerator } from "@/components/calendar/slot-generator";
import { SlotChip } from "@/components/calendar/slot-editor";
import { ReservationCard } from "@/components/calendar/reservation-editor";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  // Noon UTC, not midnight, so the day-key formatted in tenant tz always
  // lands on the intended date even for negative-UTC-offset timezones.
  // Midnight UTC = previous evening in America/La_Paz, which pushes every
  // column's dayKey back by one day.
  date.setUTCHours(12, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start of week
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function dayKey(iso: string, tz: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(d);
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { tenantSlug } = await params;
  const { start: startParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  const baseDate = startParam ? new Date(startParam) : new Date();
  const weekStart = startOfWeek(baseDate);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });

  const [{ slots, reservations, staff }, availableFutureSlots] = await Promise.all([
    getWeekCalendar(tenant.id, weekStart),
    getAvailableFutureSlots(tenant.id),
  ]);

  const tz = tenant.timezone;
  const slotsByDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dayKey(s.start_at, tz);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k)!.push(s);
  }

  const reservationsByDay = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const k = dayKey(r.start_at, tz);
    if (!reservationsByDay.has(k)) reservationsByDay.set(k, []);
    reservationsByDay.get(k)!.push(r);
  }

  const staffOptions = staff.map((s) => ({ id: s.id, name: s.name }));

  const prevWeek = new Date(weekStart);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  const weekLabel = `${weekStart.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  })} – ${days[6].toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Calendario
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <SlotGenerator
            tenantId={tenant.id}
            staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          />
          <Button asChild variant="outline" size="icon">
            <Link href={`/dashboard/${tenantSlug}/calendar?start=${prevWeek.toISOString().slice(0, 10)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/${tenantSlug}/calendar`}>Hoy</Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link href={`/dashboard/${tenantSlug}/calendar?start=${nextWeek.toISOString().slice(0, 10)}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>

      {staff.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <CalendarDays className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">Aún no hay personal configurado</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Agrega al menos una persona en{" "}
            <Link
              href={`/dashboard/${tenantSlug}/staff`}
              className="text-foreground hover:underline"
            >
              Personal
            </Link>{" "}
            para poder ver y reservar slots.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((d, idx) => {
            const k = new Intl.DateTimeFormat("en-CA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              timeZone: tz,
            }).format(d);
            const daySlots = (slotsByDay.get(k) ?? []).filter((s) => s.is_available);
            const dayReservations = reservationsByDay.get(k) ?? [];
            const isToday = k === dayKey(new Date().toISOString(), tz);

            return (
              <Card key={idx} className="flex flex-col">
                <div
                  className={cn(
                    "border-b border-border px-3 py-2 text-center",
                    isToday && "bg-primary/5",
                  )}
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {DAY_LABELS[idx]}
                  </p>
                  <p
                    className={cn(
                      "text-xl font-display font-extrabold leading-tight",
                      isToday ? "text-primary" : "text-foreground",
                    )}
                  >
                    {parseInt(k.slice(8, 10), 10)}
                  </p>
                </div>

                <div className="p-2 flex-1 space-y-1.5 min-h-[160px]">
                  {dayReservations.map((r) => (
                    <ReservationCard
                      key={r.id}
                      reservation={r}
                      tenantId={tenant.id}
                      tenantTimezone={tz}
                      staff={staff}
                      availableSlots={availableFutureSlots}
                    />
                  ))}

                  {daySlots.slice(0, 8).map((s) => (
                    <SlotChip
                      key={s.id}
                      slot={s}
                      tenantId={tenant.id}
                      tenantTimezone={tz}
                      staff={staffOptions}
                    />
                  ))}
                  {daySlots.length > 8 ? (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{daySlots.length - 8} más
                    </p>
                  ) : null}

                  {dayReservations.length === 0 && daySlots.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/60 text-center py-4">
                      Sin disponibilidad
                    </p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {staff.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Personal:</span>
          {staff.map((s) => (
            <Badge key={s.id} variant="outline">
              {s.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
