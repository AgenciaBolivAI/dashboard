import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureUserByPhone } from "./_helpers";
import type { ToolDef } from "./index";

const schema = z.object({
  slot_id: z.string().uuid(),
  service_id: z.string().uuid(),
  duration_minutes: z.coerce.number().int().min(5).max(480),
  customer_name: z.string().trim().min(1).max(200),
  customer_email: z.string().trim().email().max(200),
  customer_phone: z.string().trim().min(7).max(40),
});

export const bookAppointment: ToolDef<z.infer<typeof schema>> = {
  name: "book_appointment",
  description:
    "Confirm a reservation for the customer. Call this ONLY after you have the slot_id (from search_slots), the service_id, AND the customer's name, email, and phone number. Don't call until you've collected all five — ask for them if missing.",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["slot_id", "service_id", "duration_minutes", "customer_name", "customer_email", "customer_phone"],
    properties: {
      slot_id: { type: "string", description: "UUID returned by search_slots." },
      service_id: { type: "string", description: "UUID of the service being booked." },
      duration_minutes: { type: "integer", description: "Duration matching the service." },
      customer_name: { type: "string", description: "Full name as the customer says it." },
      customer_email: { type: "string", description: "Email to send confirmation + video link." },
      customer_phone: { type: "string", description: "Phone in E.164 (e.g. +15551234567)." },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();
    const userId = await ensureUserByPhone(ctx.tenantId, input.customer_phone, input.customer_name);

    const { data, error } = await supabase.rpc("book_slot", {
      p_tenant_id: ctx.tenantId,
      p_user_id: userId,
      p_slot_id: input.slot_id,
      p_duration_min: input.duration_minutes,
      p_customer_name: input.customer_name,
      p_customer_email: input.customer_email,
      p_customer_phone: input.customer_phone,
      p_service_id: input.service_id,
    });
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "The slot may have just been taken. Try a different time." };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { reservation_id: string; start_local: string; end_local: string; start_date_local: string }
      | undefined;
    if (!row) {
      return { ok: false, error: "no booking returned", user_facing_error: "I couldn't confirm the booking. Try once more." };
    }
    return {
      ok: true,
      data: {
        reservation_id: row.reservation_id,
        confirmed_for: `${row.start_date_local} at ${row.start_local}`,
        end_time: row.end_local,
        message: "Booked. Customer will get an email confirmation with the video meeting link shortly.",
      },
    };
  },
};
