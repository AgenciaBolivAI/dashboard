import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ToolDef } from "./index";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  service_id: z.string().uuid(),
});

export const searchSlots: ToolDef<z.infer<typeof schema>> = {
  name: "search_slots",
  description:
    "Look up available appointment time slots for a specific date and service. Returns a list of available times. Call this AFTER you know which service the customer wants (use get_business_info if you don't know the services_catalog yet).",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["date", "duration_minutes", "service_id"],
    properties: {
      date: {
        type: "string",
        description: "Date to search in YYYY-MM-DD format. Convert natural language like 'tomorrow' to an explicit date in the tenant's timezone before calling.",
      },
      duration_minutes: {
        type: "integer",
        description: "Duration of the appointment in minutes (matches the service's duration).",
      },
      service_id: {
        type: "string",
        description: "UUID of the service from the services_catalog. Get this via get_business_info.",
      },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("search_slots_day", {
      p_tenant_id: ctx.tenantId,
      p_date: input.date,
      p_duration_min: input.duration_minutes,
      p_service_id: input.service_id,
    });
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "I had a problem checking the calendar." };
    }
    const rows = (data ?? []) as Array<{
      slot_id: string;
      start_time: string;
      end_time: string;
      staff_name: string;
    }>;
    if (rows.length === 0) {
      return {
        ok: true,
        data: {
          slots: [],
          message: "No availability on that day. Try a different date.",
        },
      };
    }
    return {
      ok: true,
      data: {
        slots: rows.map((r) => ({
          slot_id: r.slot_id,
          start_time: r.start_time,
          end_time: r.end_time,
          with: r.staff_name,
        })),
      },
    };
  },
};
