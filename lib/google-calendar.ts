import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { refreshAccessToken } from "@/lib/google";

/**
 * Google Calendar 2-way sync (Phase 4c). Mirrors a reservation as a Calendar
 * event using the tenant's connected Google account (tenant_integrations,
 * provider='google'). Every function FAILS SAFE: if Google isn't connected,
 * sync is disabled, or the API errors, it returns null and never throws into
 * the booking/cancel flow.
 *
 * Sync is opt-in per tenant via tenant_integrations.metadata:
 *   { calendar_id?: string (default "primary"), sync_enabled?: boolean }
 *
 * NOTE: reservation CREATION happens in the n8n book_slot workflow, so the
 * create-side push should call POST /api/calendar/sync (or replicate this
 * helper) there. The dashboard wires the cancel/reschedule side.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };

type GoogleConn = {
  accessToken: string;
  calendarId: string;
  syncEnabled: boolean;
};

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Resolve a usable access token for the tenant's Google integration, refreshing
 * (and persisting) when the stored one is within 60s of expiry. Returns null
 * when there is no integration.
 */
export async function getTenantGoogleAccess(tenantId: string): Promise<GoogleConn | null> {
  try {
    const svc = createServiceClient() as unknown as AnyClient;
    const { data } = await svc
      .from("tenant_integrations")
      .select("id, access_token, refresh_token, expires_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .maybeSingle();
    if (!data) return null;

    const row = data as {
      id: string;
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | null;
      metadata: { calendar_id?: string; sync_enabled?: boolean } | null;
    };
    const meta = row.metadata ?? {};
    const calendarId = meta.calendar_id || "primary";
    const syncEnabled = meta.sync_enabled !== false; // default on when connected

    let accessToken = row.access_token ?? "";
    const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const needsRefresh = !accessToken || expMs < Date.now() + 60_000;

    if (needsRefresh && row.refresh_token) {
      const tok = await refreshAccessToken(row.refresh_token);
      accessToken = tok.access_token;
      const newExpiry = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
      await svc
        .from("tenant_integrations")
        .update({ access_token: accessToken, expires_at: newExpiry })
        .eq("id", row.id);
    }
    if (!accessToken) return null;
    return { accessToken, calendarId, syncEnabled };
  } catch {
    return null;
  }
}

export type ReservationEvent = {
  id: string;
  google_event_id: string | null;
  summary: string;
  description?: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string;
};

/**
 * Create or update the Google Calendar event mirroring a reservation. Stamps
 * google_event_id + google_calendar_synced_at on success. Returns the event id
 * or null (not connected / disabled / error).
 */
export async function pushReservationEvent(
  tenantId: string,
  res: ReservationEvent,
): Promise<string | null> {
  const conn = await getTenantGoogleAccess(tenantId);
  if (!conn || !conn.syncEnabled) return null;

  const end = res.end_at ?? new Date(new Date(res.start_at).getTime() + 30 * 60_000).toISOString();
  const body = {
    summary: res.summary,
    description: res.description ?? undefined,
    start: { dateTime: res.start_at, timeZone: res.timezone },
    end: { dateTime: end, timeZone: res.timezone },
  };

  try {
    const isUpdate = Boolean(res.google_event_id);
    const url = isUpdate
      ? `${CAL_BASE}/calendars/${encodeURIComponent(conn.calendarId)}/events/${res.google_event_id}`
      : `${CAL_BASE}/calendars/${encodeURIComponent(conn.calendarId)}/events`;
    const apiRes = await fetch(url, {
      method: isUpdate ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!apiRes.ok) return null;
    const json = (await apiRes.json()) as { id?: string };
    const eventId = json.id ?? res.google_event_id ?? null;

    const svc = createServiceClient() as unknown as AnyClient;
    await svc
      .from("reservations")
      .update({ google_event_id: eventId, google_calendar_synced_at: new Date().toISOString() })
      .eq("id", res.id)
      .eq("tenant_id", tenantId);
    return eventId;
  } catch {
    return null;
  }
}

/** Delete the Google Calendar event for a cancelled reservation. Best-effort. */
export async function deleteReservationEvent(
  tenantId: string,
  eventId: string,
): Promise<boolean> {
  const conn = await getTenantGoogleAccess(tenantId);
  if (!conn) return false;
  try {
    const res = await fetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(conn.calendarId)}/events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${conn.accessToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    // 410 = already deleted; treat as success.
    return res.ok || res.status === 410;
  } catch {
    return false;
  }
}
