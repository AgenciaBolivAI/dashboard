import { createClient } from "@/lib/supabase/server";
import { lookupUserIdsByPhones } from "@/lib/queries/user-lookup";

export type Slot = {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  is_available: boolean;
};

export type Reservation = {
  id: string;
  staff_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  duration_minutes: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  /** Resolved at query time by matching customer_phone to users.whatsapp_number. */
  customer_user_id: string | null;
  service_id: string | null;
  service_name: string | null;
  notes: string | null;
  meeting_url: string | null;
};

export type Staffer = {
  id: string;
  name: string;
  role: string | null;
};

type RawReservationJoin = {
  id: string;
  staff_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  duration_minutes: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_id: string | null;
  notes: string | null;
  meeting_url: string | null;
  services: { name: string } | null;
};

export async function getWeekCalendar(
  tenantId: string,
  weekStart: Date,
): Promise<{
  slots: Slot[];
  reservations: Reservation[];
  staff: Staffer[];
}> {
  const supabase = await createClient();
  // weekStart is NOON UTC (Monday). Fetch a UTC-day-aligned window padded ±1 day
  // so no slot in the visible (tenant-tz) week is dropped at any UTC offset — the
  // page buckets rows by tenant-tz dayKey, so out-of-week rows are harmlessly
  // discarded. (A noon-UTC window start silently dropped early-Monday-local
  // slots and leaked next-Monday slots for Americas / UTC-negative tenants.)
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(weekStart);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 8);

  const [slotsRes, reservationsRes, staffRes] = await Promise.all([
    supabase
      .from("calendar_slots")
      .select("id, staff_id, start_at, end_at, is_available")
      .eq("tenant_id", tenantId)
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString())
      .order("start_at"),
    supabase
      .from("reservations")
      .select(
        "id, staff_id, start_at, end_at, status, duration_minutes, customer_name, customer_email, customer_phone, service_id, notes, meeting_url, services ( name )",
      )
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .gte("start_at", start.toISOString())
      .lt("start_at", end.toISOString())
      .order("start_at"),
    supabase
      .from("staff")
      .select("id, name, role")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name"),
  ]);

  // Resolve user_id for each reservation's customer_phone in a single batch
  // query, so the calendar can link customer names to /customers/[user_id]
  // without N+1 round-trips.
  const rawReservations = (reservationsRes.data ?? []) as RawReservationJoin[];
  const userIdByPhone = await lookupUserIdsByPhones(
    tenantId,
    rawReservations.map((r) => r.customer_phone),
  );

  const reservations: Reservation[] = rawReservations.map((r) => ({
    id: r.id,
    staff_id: r.staff_id,
    start_at: r.start_at,
    end_at: r.end_at,
    status: r.status,
    duration_minutes: r.duration_minutes,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone,
    customer_user_id: r.customer_phone
      ? userIdByPhone[r.customer_phone.replace(/\D/g, "")] ?? null
      : null,
    service_id: r.service_id,
    service_name: r.services?.name ?? null,
    notes: r.notes,
    meeting_url: r.meeting_url,
  }));

  return {
    slots: (slotsRes.data ?? []) as Slot[],
    reservations,
    staff: (staffRes.data ?? []) as Staffer[],
  };
}

/**
 * Available future slots for the reschedule picker. Pulls the next 30 days
 * of slots that are still available, regardless of week being viewed.
 */
export async function getAvailableFutureSlots(
  tenantId: string,
  fromDate: Date = new Date(),
  daysAhead = 30,
): Promise<Slot[]> {
  const supabase = await createClient();
  const start = new Date(fromDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + daysAhead);

  const { data } = await supabase
    .from("calendar_slots")
    .select("id, staff_id, start_at, end_at, is_available")
    .eq("tenant_id", tenantId)
    .eq("is_available", true)
    .gte("start_at", start.toISOString())
    .lt("start_at", end.toISOString())
    .order("start_at");

  return (data ?? []) as Slot[];
}
