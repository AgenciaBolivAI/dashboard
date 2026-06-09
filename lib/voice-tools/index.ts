/**
 * Voice tool registry — every Server Tool the voice agent can call.
 *
 * Each tool is a (name → {schema, handler, spec}) tuple. The route
 * dispatcher at /api/voice/tool/[name]/route.ts validates the body
 * against `schema` and invokes `handler` with a resolved tenant
 * context. `spec` is what we register on the ElevenLabs side at agent
 * creation time so the agent knows what tools exist and how to call them.
 *
 * The pattern intentionally keeps every tool small + self-contained so
 * Phase 6 (omnichannel memory) can add new ones without restructuring.
 */
import { z } from "zod";
import { searchSlots } from "./search-slots";
import { bookAppointment } from "./book-appointment";
import { rescheduleAppointment } from "./reschedule-appointment";
import { cancelAppointment } from "./cancel-appointment";
import { lookupCustomerReservations } from "./lookup-customer-reservations";
import { captureLead } from "./capture-lead";
import { bookDemo } from "./book-demo";
import { getBusinessInfo } from "./get-business-info";

export type ToolContext = {
  tenantId: string;
};

export type ToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; user_facing_error?: string };

export type ToolDef<TInput> = {
  /** Tool name as the agent calls it. Matches the URL segment. */
  name: string;
  /** Human-readable description the agent reads to decide when to use the tool. */
  description: string;
  /** Zod schema for the request body. */
  schema: z.ZodType<TInput>;
  /** The actual implementation. */
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;
  /** Parameters as JSON Schema, registered on ElevenLabs side. */
  parametersJsonSchema: Record<string, unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: Record<string, ToolDef<any>> = {
  search_slots: searchSlots,
  book_appointment: bookAppointment,
  reschedule_appointment: rescheduleAppointment,
  cancel_appointment: cancelAppointment,
  lookup_customer_reservations: lookupCustomerReservations,
  capture_lead: captureLead,
  book_demo: bookDemo,
  get_business_info: getBusinessInfo,
};

/**
 * Build the `tools` array for the ElevenLabs agent's conversation_config.
 * Bakes the tenant_id into the URL of every tool so the route dispatcher
 * knows which tenant the call is for, and adds the shared bearer token.
 */
export function buildToolsConfig(opts: {
  baseUrl: string;     // e.g. https://bolivai.cloud
  tenantId: string;
  bearerToken: string;
}) {
  return Object.values(TOOLS).map((t) => ({
    type: "webhook" as const,
    name: t.name,
    description: t.description,
    api_schema: {
      url: `${opts.baseUrl}/api/voice/tool/${t.name}?tenant=${opts.tenantId}`,
      method: "POST" as const,
      request_headers: {
        Authorization: `Bearer ${opts.bearerToken}`,
        "Content-Type": "application/json",
      },
      request_body_schema: t.parametersJsonSchema,
    },
  }));
}
