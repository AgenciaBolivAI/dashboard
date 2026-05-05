import { createClient } from "@/lib/supabase/server";

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
  service_id: string | null;
  service_name: string | null;
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
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);

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
        "id, staff_id, start_at, end_at, status, duration_minutes, customer_name, customer_email, customer_phone, service_id, services ( name )",
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

  const reservations: Reservation[] = (
    (reservationsRes.data ?? []) as RawReservationJoin[]
  ).map((r) => ({
    id: r.id,
    staff_id: r.staff_id,
    start_at: r.start_at,
    end_at: r.end_at,
    status: r.status,
    duration_minutes: r.duration_minutes,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone,
    service_id: r.service_id,
    service_name: r.services?.name ?? null,
  }));

  return {
    slots: (slotsRes.data ?? []) as Slot[],
    reservations,
    staff: (staffRes.data ?? []) as Staffer[],
  };
}
