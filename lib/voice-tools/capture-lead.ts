import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureUserByPhone } from "./_helpers";
import type { ToolDef } from "./index";

const INTENT_VALUES = [
  "pricing_inquiry",
  "plan_comparison",
  "demo_consideration",
  "info_request",
  "white_label",
  "enterprise",
  "support_escalation",
] as const;

const schema = z.object({
  customer_name: z.string().trim().min(1).max(200),
  customer_phone: z.string().trim().min(7).max(40),
  intent: z.enum(INTENT_VALUES),
  notes: z.string().trim().max(1000).optional(),
});

export const captureLead: ToolDef<z.infer<typeof schema>> = {
  name: "capture_lead",
  description:
    "Save a prospect who showed interest but didn't book or buy. Use this when the call ends without a booking but the prospect is qualified. Always capture before ending an unsuccessful call.",
  schema,
  parametersJsonSchema: {
    type: "object",
    required: ["customer_name", "customer_phone", "intent"],
    properties: {
      customer_name: { type: "string" },
      customer_phone: { type: "string", description: "E.164 format." },
      intent: {
        type: "string",
        enum: [...INTENT_VALUES],
        description: "Closest matching intent for what they wanted.",
      },
      notes: { type: "string", description: "Free-form summary of the call's key signals." },
    },
  },
  async handler(input, ctx) {
    const supabase = createServiceClient();
    const userId = await ensureUserByPhone(ctx.tenantId, input.customer_phone, input.customer_name);
    const { error } = await supabase.from("leads").insert({
      tenant_id: ctx.tenantId,
      user_id: userId,
      name: input.customer_name,
      whatsapp_number: input.customer_phone.replace(/^\+/, ""),
      intent: input.intent,
      notes: input.notes ?? null,
    });
    if (error) {
      return { ok: false, error: error.message, user_facing_error: "I couldn't save the lead." };
    }
    return { ok: true, data: { message: "Lead captured." } };
  },
};
