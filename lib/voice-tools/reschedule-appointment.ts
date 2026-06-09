import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ToolDef } from "./index";

const schema = z.object({
  reservation_id: z.string().uuid(),
  new_slot_id: z.string().uuid(),
  duration_minutes: z.coerce.number().int().min(5).max(480),
});

export const rescheduleAppointment: ToolDef<z.infer<typeof schema>> = {
  name: "reschedule_appointment",
  description:
    "Move an existing reservation to a new time slot. Use lookup_customer_reservations first to find the reservation_id, then search_slots to find the new_slot_id.",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["reservation_id", "new_slot_id", "duration_minutes"],
    properties: {
      reservation_id: { type: "string", description: "UUID from lookup_customer_reservations." },
      new_slot_id: { type: "string", description: "UUID from search_slots." },
      duration_minutes: { type: "integer", description: "Usually unchanged from the original reservation." },
    },
  },
  async handler(input, _ctx) {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("reschedule_reservation", {
      p_reservation_id: input.reservation_id,
      p_new_slot_id: input.new_slot_id,
      p_duration_min: input.duration_minutes,
    });
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "I couldn't move the appointment. The new slot may have just been taken." };
    }
    return {
      ok: true,
      data: {
        message: "Rescheduled. Customer will get a new confirmation email.",
      },
    };
  },
};
