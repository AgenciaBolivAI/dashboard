"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { deleteReservationEvent } from "@/lib/google-calendar";

export type CalendarState = {
  error: string | null;
  success?: boolean;
  created?: number;
  skipped?: number;
};

const dayBits = z.array(z.number().int().min(0).max(6));

const generateSchema = z.object({
  tenant_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  slot_minutes: z.coerce.number().int().min(5).max(240),
  weekdays: z.string().transform((v) => {
    const arr = JSON.parse(v) as number[];
    return dayBits.parse(arr);
  }),
  skip_existing: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true" || v === undefined),
});

function buildLocalISO(dateStr: string, timeStr: string, tz: string): Date {
  // Build a Date interpreted as if `dateStr timeStr` were in `tz`. We use the
  // standard "format then parse offset" trick because the runtime can't
  // construct a Date in an arbitrary timezone directly.
  const probe = new Date(`${dateStr}T${timeStr}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(probe);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return probe;
  const sign = m[1] === "+" ? 1 : -1;
  const hours = parseInt(m[2], 10);
  const mins = parseInt(m[3] ?? "0", 10);
  const totalMin = sign * (hours * 60 + mins);
  return new Date(probe.getTime() - totalMin * 60_000);
}

export async function generateSlotsAction(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  let parsed;
  try {
    parsed = generateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { error: et("invalid_data") };
    }
  } catch {
    return { error: et("weekdays_invalid") };
  }

  const data = parsed.data;
  if (data.start_date > data.end_date) {
    return { error: et("end_date_after_start") };
  }
  if (data.start_time >= data.end_time) {
    return { error: et("end_time_after_start") };
  }
  if (data.weekdays.length === 0) {
    return { error: et("select_at_least_one_weekday") };
  }

  await requireUser();
  await requireTenantAccess(data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", data.tenant_id)
    .single();
  const tz = (tenantRow as { timezone?: string } | null)?.timezone ?? "UTC";

  const slots: { start_at: string; end_at: string }[] = [];
  const startDate = new Date(data.start_date + "T00:00:00Z");
  const endDate = new Date(data.end_date + "T00:00:00Z");

  for (
    let d = new Date(startDate);
    d.getTime() <= endDate.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dayOfWeek = d.getUTCDay();
    if (!data.weekdays.includes(dayOfWeek)) continue;
    const dateStr = d.toISOString().slice(0, 10);

    const dayStart = buildLocalISO(dateStr, data.start_time, tz);
    const dayEnd = buildLocalISO(dateStr, data.end_time, tz);

    for (
      let cursor = dayStart.getTime();
      cursor + data.slot_minutes * 60_000 <= dayEnd.getTime();
      cursor += data.slot_minutes * 60_000
    ) {
      slots.push({
        start_at: new Date(cursor).toISOString(),
        end_at: new Date(cursor + data.slot_minutes * 60_000).toISOString(),
      });
    }
  }

  if (slots.length === 0) {
    return { error: et("no_slots_generated") };
  }

  let skipped = 0;
  let toInsert = slots;
  if (data.skip_existing) {
    // Fetch every existing slot whose time range could overlap any new
    // slot. We then skip any new slot that overlaps an existing one,
    // not just exact start_at matches — this prevents the
    // "9:00-9:30, 9:00-10:00, 9:30-10:00" pile-up when the generator
    // is run twice with different durations.
    const minStart = slots[0].start_at;
    const maxEnd = slots[slots.length - 1].end_at;
    const { data: existing } = await supabase
      .from("calendar_slots")
      .select("start_at, end_at")
      .eq("tenant_id", data.tenant_id)
      .eq("staff_id", data.staff_id)
      .lt("start_at", maxEnd)
      .gt("end_at", minStart);

    const existingRanges = ((existing ?? []) as {
      start_at: string;
      end_at: string;
    }[]).map((r) => [
      new Date(r.start_at).getTime(),
      new Date(r.end_at).getTime(),
    ]);

    toInsert = slots.filter((s) => {
      const sStart = new Date(s.start_at).getTime();
      const sEnd = new Date(s.end_at).getTime();
      const overlaps = existingRanges.some(
        ([eStart, eEnd]) => eStart < sEnd && eEnd > sStart,
      );
      if (overlaps) {
        skipped++;
        return false;
      }
      return true;
    });
  }

  if (toInsert.length === 0) {
    return {
      error: null,
      success: true,
      created: 0,
      skipped,
    };
  }

  const { error: insertErr, count } = await supabase
    .from("calendar_slots")
    .insert(
      toInsert.map((s) => ({
        tenant_id: data.tenant_id,
        staff_id: data.staff_id,
        start_at: s.start_at,
        end_at: s.end_at,
      })),
      { count: "exact" },
    );

  if (insertErr) return { error: insertErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, created: count ?? toInsert.length, skipped };
}

export async function deleteSlotAction(
  tenantId: string,
  slotId: string,
): Promise<CalendarState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_slots")
    .delete()
    .eq("id", slotId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Edit a single slot (start/end/availability/staff) ──────────────
const updateSchema = z.object({
  tenant_id: z.string().uuid(),
  slot_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  // Local-time strings — converted to UTC using tenant timezone
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_available: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function updateSlotAction(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: et("invalid_data") };
  }

  const data = parsed.data;
  if (data.start_time >= data.end_time) {
    return { error: et("end_time_after_start") };
  }

  await requireUser();
  await requireTenantAccess(data.tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", data.tenant_id)
    .single();
  const tz = (tenantRow as { timezone?: string } | null)?.timezone ?? "UTC";

  const startUtc = buildLocalISO(data.date, data.start_time, tz);
  const endUtc = buildLocalISO(data.date, data.end_time, tz);

  const { error } = await supabase
    .from("calendar_slots")
    .update({
      staff_id: data.staff_id,
      start_at: startUtc.toISOString(),
      end_at: endUtc.toISOString(),
      is_available: data.is_available ?? true,
    })
    .eq("id", data.slot_id)
    .eq("tenant_id", data.tenant_id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Reservation actions ────────────────────────────────────────────

const updateNotesSchema = z.object({
  tenant_id: z.string().uuid(),
  reservation_id: z.string().uuid(),
  notes: z.string().max(2000),
});

export async function updateReservationNotesAction(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  const parsed = updateNotesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: et("invalid_data") };
  }
  const { tenant_id, reservation_id, notes } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ notes: notes || null })
    .eq("id", reservation_id)
    .eq("tenant_id", tenant_id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function cancelReservationAction(
  tenantId: string,
  reservationId: string,
  reason: string | null,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  // Defense in depth: scope by tenant before invoking the RPC.
  const { data: own } = await supabase
    .from("reservations")
    .select("id, google_event_id")
    .eq("id", reservationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!own) return { error: et("reservation_not_found") };

  const { error } = await supabase.rpc("cancel_reservation", {
    p_reservation_id: reservationId,
    p_reason: reason ?? undefined,
  });
  if (error) return { error: error.message };

  // Mirror the cancellation to Google Calendar (best-effort; no-op when the
  // tenant hasn't connected Google). Awaited so it runs on Vercel serverless.
  const googleEventId = (own as { google_event_id?: string | null }).google_event_id;
  if (googleEventId) await deleteReservationEvent(tenantId, googleEventId);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Manual booking (owner books a slot themselves) ─────────────────
// FREE: credits are only charged on the agent tool path (credit_action_key).
// This calls book_slot directly, so no debit happens. The reservations INSERT
// trigger fires the notify workflow (owner + customer confirmation email +
// Daily room + Google Calendar) exactly like an agent booking.

/** Resolve (or create) the customer's users row. Phone is optional; we dedupe
 *  by phone when present, else by email, else create a fresh row. */
async function resolveCustomerUser(
  svc: ReturnType<typeof createServiceClient>,
  tenantId: string,
  c: { name: string; email: string; phone?: string | null },
): Promise<string> {
  const norm = c.phone ? c.phone.replace(/^\+/, "") : null;
  if (norm) {
    const { data: ex } = await svc
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("whatsapp_number", norm)
      .maybeSingle();
    if (ex) return (ex as { id: string }).id;
  } else {
    const { data: byEmail } = await svc
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", c.email)
      .maybeSingle();
    if (byEmail) return (byEmail as { id: string }).id;
  }
  // whatsapp_number is NOT NULL + unique per tenant — synthesize one when the
  // owner didn't give a phone, so the row is still creatable + dedup-safe.
  const wa = norm ?? `manual-${Math.random().toString(36).slice(2, 10)}`;
  const { data: created, error } = await svc
    .from("users")
    .insert({ tenant_id: tenantId, whatsapp_number: wa, name: c.name, email: c.email } as never)
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "user create failed");
  return (created as { id: string }).id;
}

const manualBookSchema = z.object({
  tenant_id: z.string().uuid(),
  slot_id: z.string().uuid(),
  service_id: z.string().uuid().optional().or(z.literal("")),
  customer_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(200),
  customer_phone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function bookSlotManuallyAction(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  const parsed = manualBookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: et("invalid_data") };
  const d = parsed.data;

  await requireUser();
  await requireTenantAccess(d.tenant_id, { minRole: "operator" });

  const svc = createServiceClient();

  // Confirm the slot is real, this tenant's, and still free.
  const { data: slotRow } = await svc
    .from("calendar_slots")
    .select("id, start_at, end_at, is_available")
    .eq("id", d.slot_id)
    .eq("tenant_id", d.tenant_id)
    .maybeSingle();
  const slot = slotRow as { start_at: string; end_at: string; is_available: boolean } | null;
  if (!slot) return { error: et("reservation_not_found") };
  if (!slot.is_available) return { error: et("slot_unavailable") };

  const durationMin = Math.max(
    5,
    Math.round((new Date(slot.end_at).getTime() - new Date(slot.start_at).getTime()) / 60_000),
  );

  let userId: string;
  try {
    userId = await resolveCustomerUser(svc, d.tenant_id, {
      name: d.customer_name,
      email: d.customer_email,
      phone: d.customer_phone || null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "user create failed" };
  }

  const { error } = await svc.rpc("book_slot", {
    p_tenant_id: d.tenant_id,
    p_user_id: userId,
    p_slot_id: d.slot_id,
    p_duration_min: durationMin,
    p_customer_name: d.customer_name,
    p_customer_email: d.customer_email,
    p_customer_phone: d.customer_phone || null,
    p_notes: d.notes || null,
    p_service_id: d.service_id || null,
  } as never);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

const rescheduleSchema = z.object({
  tenant_id: z.string().uuid(),
  reservation_id: z.string().uuid(),
  new_slot_id: z.string().uuid(),
  duration_min: z.coerce.number().int().min(5).max(480).optional(),
});

export async function rescheduleReservationAction(
  _prev: CalendarState,
  formData: FormData,
): Promise<CalendarState> {
  const et = await getTranslations("action_errors");
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: et("invalid_data") };
  }
  const { tenant_id, reservation_id, new_slot_id, duration_min } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { data: own } = await supabase
    .from("reservations")
    .select("id")
    .eq("id", reservation_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (!own) return { error: et("reservation_not_found") };

  const { error } = await supabase.rpc("reschedule_reservation", {
    p_reservation_id: reservation_id,
    p_new_slot_id: new_slot_id,
    p_duration_min: duration_min ?? undefined,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
