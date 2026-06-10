import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureUserByPhone } from "./_helpers";
import type { ToolDef } from "./index";

/**
 * book_demo — for BolivAI's OWN voice agents (Sandra outbound, Rebecca
 * inbound) when a prospect agrees to a discovery call with Celiel.
 *
 * Distinct from book_appointment (which is for tenant voice agents
 * booking their customers into THEIR calendar via the slot system).
 * This one bypasses the slot infrastructure and inserts directly into
 * `reservations` for BolivAI's tenant, with a server-side conflict
 * check against Celiel's other reservations.
 *
 * The notify_reservation_changed trigger fires on insert → n8n auto-
 * creates the Daily.co room, persists meeting_url, and sends the
 * confirmation emails (founder + customer). Nothing else to do here.
 */

const schema = z.object({
  customer_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(200),
  customer_phone: z.string().trim().min(7).max(40),
  start_iso: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/,
      "ISO 8601 with timezone (e.g. 2026-06-15T14:00:00-04:00 or 2026-06-15T18:00:00Z)",
    ),
  duration_min: z.coerce.number().int().min(15).max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const DEMO_SERVICE_NAME_PATTERN = /demo/i;
const CELIEL_STAFF_NAME_PATTERN = /^celiel$/i;

export const bookDemo: ToolDef<z.infer<typeof schema>> = {
  name: "book_demo",
  description:
    "Lock a 15-minute discovery demo with Celiel directly on his calendar. Call ONLY after the prospect has agreed to a specific date and time AND given you their full name, email, and phone. Pass start_iso as ISO 8601 WITH a timezone (their local time + offset, or UTC). If the slot is taken, the tool returns an error — ask for an alternative time.",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["customer_name", "customer_email", "customer_phone", "start_iso"],
    properties: {
      customer_name: { type: "string", description: "Full name as the prospect says it." },
      customer_email: { type: "string", description: "Email for the calendar invite + video link." },
      customer_phone: { type: "string", description: "Phone in E.164 (e.g. +14155551234)." },
      start_iso: {
        type: "string",
        description:
          "Start time in ISO 8601 WITH timezone (e.g. 2026-06-15T14:00:00-04:00 for 2pm Bolivia, or 2026-06-15T18:00:00Z for the same in UTC). Convert any natural-language time ('next Thursday at 2pm their time') to this format before calling.",
      },
      duration_min: {
        type: "integer",
        description: "Demo duration in minutes. Default 15. Only override if the prospect explicitly asks for longer.",
      },
      notes: {
        type: "string",
        description:
          "Brief: business name, vertical, key pain point, anything Celiel should know before opening the call.",
      },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();

    // 1. Resolve the BolivAI "Demo" service and Celiel staff record.
    //    Cached implicitly because the dashboard is mostly idle; one
    //    extra query per booking is fine.
    const [{ data: serviceRows }, { data: staffRows }] = await Promise.all([
      supabase
        .from("services")
        .select("id, duration_min, name")
        .eq("tenant_id", ctx.tenantId)
        .eq("active", true),
      supabase
        .from("staff")
        .select("id, name, email")
        .eq("tenant_id", ctx.tenantId)
        .eq("active", true),
    ]);

    const demoService = (serviceRows ?? []).find((s) =>
      DEMO_SERVICE_NAME_PATTERN.test(s.name as string),
    );
    const celiel = (staffRows ?? []).find((s) =>
      CELIEL_STAFF_NAME_PATTERN.test(s.name as string),
    );

    if (!demoService) {
      return {
        ok: false,
        error: "No demo service configured for BolivAI tenant",
        user_facing_error: "I'm having a calendar setup issue. Let me have Celiel reach out to confirm the time.",
      };
    }
    if (!celiel) {
      return {
        ok: false,
        error: "Celiel staff record not found",
        user_facing_error: "I'm having a calendar setup issue. Let me have Celiel reach out to confirm the time.",
      };
    }

    // 2. Compute the window. Validation already ensured start_iso parses.
    const startAt = new Date(input.start_iso);
    if (Number.isNaN(startAt.getTime())) {
      return {
        ok: false,
        error: "Invalid start_iso",
        user_facing_error: "I couldn't parse that time. Could you give it to me again with the date?",
      };
    }
    const durationMin = input.duration_min ?? (demoService.duration_min as number) ?? 15;
    const endAt = new Date(startAt.getTime() + durationMin * 60_000);

    // 3. Reject anything in the past with a small grace window for clock skew.
    const now = Date.now();
    if (startAt.getTime() < now - 5 * 60_000) {
      return {
        ok: false,
        error: "start_iso is in the past",
        user_facing_error: "That time is already past. Suggest a future date and time.",
      };
    }

    // 4. Conflict check: any active reservation for Celiel that overlaps?
    //    (start_a < end_b) AND (end_a > start_b) is the standard overlap test.
    const { data: conflictRows, error: conflictError } = await supabase
      .from("reservations")
      .select("id, start_at, end_at, customer_name")
      .eq("tenant_id", ctx.tenantId)
      .eq("staff_id", celiel.id as string)
      .not("status", "in", "(cancelled,no_show)")
      .lt("start_at", endAt.toISOString())
      .gt("end_at", startAt.toISOString())
      .limit(1);

    if (conflictError) {
      return {
        ok: false,
        error: conflictError.message,
        user_facing_error: "I had a problem checking the calendar. Can you suggest another time?",
      };
    }
    if (conflictRows && conflictRows.length > 0) {
      return {
        ok: false,
        error: "slot conflict",
        user_facing_error:
          "That time is already taken on Celiel's calendar. Try a different time — earlier the same day, or another day.",
      };
    }

    // 5. Ensure a user row (re-used across leads/reservations).
    const userId = await ensureUserByPhone(
      ctx.tenantId,
      input.customer_phone,
      input.customer_name,
    );

    // 6. Direct INSERT. The notify trigger handles Daily.co + email.
    const { data: created, error: insertError } = await supabase
      .from("reservations")
      .insert({
        tenant_id: ctx.tenantId,
        user_id: userId,
        staff_id: celiel.id as string,
        service_id: demoService.id as string,
        slot_id: null,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        duration_minutes: durationMin,
        status: "confirmed",
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        customer_phone: input.customer_phone,
        notes: input.notes ?? null,
      })
      .select("id, start_at, end_at, meeting_url")
      .single();

    if (insertError || !created) {
      return {
        ok: false,
        error: insertError?.message ?? "insert failed",
        user_facing_error: "I couldn't lock that on Celiel's calendar. Try once more or pick a different time.",
      };
    }

    return {
      ok: true,
      data: {
        reservation_id: created.id as string,
        confirmed_for: input.start_iso,
        duration_min: durationMin,
        meeting_url: (created.meeting_url as string | null) ?? null,
        message:
          "Booked. They'll get a calendar invite and a video meeting link by email shortly. Celiel will see this on his dashboard.",
      },
    };
  },
};
