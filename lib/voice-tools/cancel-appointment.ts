import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import type { ToolDef } from "./index";

const schema = z.object({
  reservation_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const cancelAppointment: ToolDef<z.infer<typeof schema>> = {
  name: "cancel_appointment",
  description:
    "Cancel a customer's reservation. Use lookup_customer_reservations first to identify which reservation. Always confirm with the customer before calling (don't cancel ambiguously).",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["reservation_id"],
    properties: {
      reservation_id: { type: "string", description: "UUID from lookup_customer_reservations." },
      reason: { type: "string", description: "Brief reason given by the customer (optional)." },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();
    // Tenant-scope guard: the RPC matches on reservation id alone, so verify the
    // reservation belongs to THIS tenant before mutating (prevents cross-tenant IDOR).
    const { data: owned } = await supabase
      .from("reservations")
      .select("id")
      .eq("id", input.reservation_id)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();
    if (!owned) {
      return { ok: false, error: "not found", user_facing_error: "I couldn't find that reservation." };
    }
    const { error } = await supabase.rpc("cancel_reservation", {
      p_reservation_id: input.reservation_id,
      p_reason: input.reason ?? undefined,
    });
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "I couldn't cancel the appointment." };
    }
    return {
      ok: true,
      data: { message: "Cancelled. The customer will receive a cancellation confirmation." },
    };
  },
};
