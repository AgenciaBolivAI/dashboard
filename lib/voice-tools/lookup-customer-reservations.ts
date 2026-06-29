import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ToolDef } from "./index";

const schema = z.object({
  customer_phone: z.string().trim().min(7).max(40),
});

export const lookupCustomerReservations: ToolDef<z.infer<typeof schema>> = {
  name: "lookup_customer_reservations",
  description:
    "Find all upcoming reservations for a customer by phone number. Use this when the customer wants to reschedule or cancel and you need to identify which reservation. Ask the customer for their phone number first.",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["customer_phone"],
    properties: {
      customer_phone: {
        type: "string",
        description: "Phone in E.164 format. If the customer says 'my number is 555-1234', normalize first.",
      },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();
    // Match both the +E.164 and bare-digits forms — reservations booked via
    // different paths (manual / WhatsApp) may store either. `digits` is digits-
    // only so it's safe to interpolate into the PostgREST .or() filter.
    const digits = input.customer_phone.replace(/\D/g, "");
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, start_at, end_at, duration_minutes, status, services(name)",
      )
      .eq("tenant_id", ctx.tenantId)
      .or(`customer_phone.eq.+${digits},customer_phone.eq.${digits}`)
      .eq("status", "confirmed")
      .gt("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(10);
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "I had a problem looking up reservations." };
    }
    const rows = (data ?? []) as Array<{
      id: string;
      start_at: string;
      duration_minutes: number;
      services: { name: string } | null;
    }>;
    if (rows.length === 0) {
      return {
        ok: true,
        data: {
          reservations: [],
          message: "No upcoming reservations found for that number.",
        },
      };
    }
    return {
      ok: true,
      data: {
        reservations: rows.map((r) => ({
          reservation_id: r.id,
          when_iso: r.start_at,
          duration_minutes: r.duration_minutes,
          service: r.services?.name ?? "Appointment",
        })),
      },
    };
  },
};
