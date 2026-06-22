/**
 * Push a reservation to the tenant's Google Calendar (create/update).
 *
 * Reservations are created by the n8n book_slot workflow, so the create-side
 * sync lives here: book_slot POSTs the reservation id after booking and this
 * mirrors it to Google Calendar (the dashboard handles the cancel side in
 * cancelReservationAction). No-op + 200 when the tenant hasn't connected Google.
 *
 * Auth: Authorization: Bearer ${CCAVAI_WEBHOOK_SECRET} (shared internal secret).
 *
 * POST { "tenant_id": "...", "reservation_id": "..." }
 */
import { NextResponse } from "next/server";
import { checkBearer } from "@/lib/security/bearer";
import { createServiceClient } from "@/lib/supabase/service";
import { pushReservationEvent, deleteReservationEvent } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!checkBearer(req, process.env.CCAVAI_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tenant_id?: string; reservation_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const tenantId = body.tenant_id?.trim();
  const reservationId = body.reservation_id?.trim();
  if (!tenantId || !reservationId) {
    return NextResponse.json({ error: "tenant_id and reservation_id required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as unknown as { from: (t: string) => any };
  const { data: r } = await svc
    .from("reservations")
    .select("id, customer_name, start_at, end_at, notes, status, google_event_id, services:service_id ( name )")
    .eq("id", reservationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "reservation not found" }, { status: 404 });

  // Cancelled reservation → remove the mirrored Google Calendar event instead of
  // pushing. Lets the n8n notify workflow call this endpoint on ANY event
  // (created / rescheduled / cancelled) and have the calendar stay correct,
  // including cancels initiated from WhatsApp (not just the dashboard).
  const status = (r as { status?: string | null }).status ?? "";
  const existingEventId = (r as { google_event_id: string | null }).google_event_id;
  if (status === "cancelled") {
    let removed = false;
    if (existingEventId) {
      removed = await deleteReservationEvent(tenantId, existingEventId);
      if (removed) {
        await svc
          .from("reservations")
          .update({ google_event_id: null, google_calendar_synced_at: new Date().toISOString() })
          .eq("id", reservationId)
          .eq("tenant_id", tenantId);
      }
    }
    return NextResponse.json({ ok: true, synced: removed, action: "deleted" });
  }

  const { data: t } = await svc.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  const timezone = (t as { timezone?: string } | null)?.timezone || "UTC";

  const svcRel = (r as { services?: { name?: string } | { name?: string }[] | null }).services;
  const serviceName = (Array.isArray(svcRel) ? svcRel[0]?.name : svcRel?.name) ?? "";
  const customer = (r as { customer_name?: string | null }).customer_name ?? "Cliente";

  const eventId = await pushReservationEvent(tenantId, {
    id: (r as { id: string }).id,
    google_event_id: (r as { google_event_id: string | null }).google_event_id,
    summary: serviceName ? `${customer} — ${serviceName}` : customer,
    description: (r as { notes?: string | null }).notes ?? null,
    start_at: (r as { start_at: string }).start_at,
    end_at: (r as { end_at: string | null }).end_at,
    timezone,
  });

  // synced=false simply means Google isn't connected / sync is off — not an error.
  return NextResponse.json({ ok: true, synced: Boolean(eventId), event_id: eventId });
}
