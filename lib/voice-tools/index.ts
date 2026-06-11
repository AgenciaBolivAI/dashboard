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
  /**
   * If set, the dispatcher debits credits from the tenant BEFORE invoking
   * the handler. Insufficient balance → handler not called; agent sees an
   * ok:false with a polite "service paused" user_facing_error so the
   * tenant's caller hears something sensible.
   */
  credit_action_key?: string;
  credit_units?: number;
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
 *
 * Each tool URL has the tenant_id baked in, AND each tool carries a
 * per-tenant bearer derived via HMAC-SHA256(tenant_id, VOICE_TOOL_SECRET).
 * The root secret never reaches ElevenLabs — only the derived bearer does.
 *
 * Compromise model:
 *  - Stolen per-tenant bearer → impersonate only that tenant
 *  - Stolen root secret (server env breach) → mint bearers for any tenant
 *  - Stolen agent config / log line → only the per-tenant bearer is visible
 *
 * Caller responsibility: pass the root secret (process.env.VOICE_TOOL_SECRET).
 * Build is server-only — `computeTenantBearer` uses node:crypto.
 */
import { computeTenantBearer } from "@/lib/security/voice-bearer";

export function buildToolsConfig(opts: {
  baseUrl: string;     // e.g. https://bolivai.cloud
  tenantId: string;
  /**
   * Root secret used to derive the per-tenant bearer. NEVER leaves the
   * dashboard server — we hand ElevenLabs only the derived bearer.
   */
  rootSecret: string;
}) {
  const tenantBearer = computeTenantBearer(opts.tenantId, opts.rootSecret);
  return Object.values(TOOLS).map((t) => ({
    type: "webhook" as const,
    name: t.name,
    description: t.description,
    api_schema: {
      url: `${opts.baseUrl}/api/voice/tool/${t.name}?tenant=${opts.tenantId}`,
      method: "POST" as const,
      request_headers: {
        Authorization: `Bearer ${tenantBearer}`,
        "Content-Type": "application/json",
      },
      request_body_schema: t.parametersJsonSchema,
    },
  }));
}
