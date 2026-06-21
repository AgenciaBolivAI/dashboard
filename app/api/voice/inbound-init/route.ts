import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildRebeccaOverride, type VoicePersona } from "@/lib/voice/persona";
import { timingSafeEqualStr } from "@/lib/security/voice-bearer";

/**
 * ElevenLabs conversation_initiation_data_webhook for master Rebecca.
 *
 * Every tenant's Twilio number is assigned to MASTER_REBECCA_AGENT_ID in
 * ElevenLabs (see attachTwilioNumberAction). When a customer dials in,
 * ElevenLabs POSTs to this URL with the called phone_number_id BEFORE
 * starting the conversation. We:
 *
 *  1. Look up which tenant owns that ElevenLabs phone_number_id
 *  2. Load their voice_persona JSON
 *  3. Return conversation_config_override (with the tenant's persona) +
 *     dynamic_variables (with tenant_id + caller info)
 *
 * ElevenLabs then runs the call with Rebecca speaking as the tenant's
 * business, not as BolivAI.
 *
 * Auth: ElevenLabs supports a single static header per agent webhook.
 * We use VOICE_INBOUND_WEBHOOK_SECRET (distinct from VOICE_TOOL_SECRET
 * so compromise of one surface doesn't leak the other). Constant-time
 * compare against the incoming Authorization: Bearer <secret>.
 *
 * Falls back to a generic Rebecca persona if anything fails, so calls
 * never drop — they just sound generic.
 */
export async function POST(req: NextRequest) {
  // Static bearer — ElevenLabs sends the same value on every inbound call
  const expected = process.env.VOICE_INBOUND_WEBHOOK_SECRET ?? "";
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !timingSafeEqualStr(got, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    agent_id?: string;
    called_number?: string;
    caller_id?: string;
    agent_phone_number_id?: string;
    conversation_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(genericFallback(), { status: 200 });
  }

  // ElevenLabs varies field naming across API versions — try both.
  const phoneNumberId = body.agent_phone_number_id;
  const callerNumber = body.caller_id ?? "";
  const calledNumber = body.called_number ?? "";

  // Look up the tenant by ElevenLabs phone_number_id. Falls back by called
  // number. Service client: this is a machine-to-machine webhook with no
  // user session — the RLS-bound client would see zero rows. The static
  // bearer check above is the auth for this surface.
  const supabase = createServiceClient();
  type TenantRow = {
    id: string;
    name: string;
    voice_persona: VoicePersona | null;
  };
  let row: TenantRow | null = null;

  if (phoneNumberId) {
    const { data } = await supabase
      .from("tenants")
      .select("id, name, voice_persona" as never)
      .eq("voice_elevenlabs_outbound_phone_id" as never, phoneNumberId)
      .maybeSingle();
    row = data as unknown as TenantRow | null;
  }
  if (!row && calledNumber) {
    // Keep digits only — strips the leading + and any PostgREST filter-grammar
    // chars (, ) * so the value can't alter the .or() filter.
    const normalized = calledNumber.replace(/[^0-9]/g, "");
    if (normalized) {
      const { data } = await supabase
        .from("tenants")
        .select("id, name, voice_persona" as never)
        .or(`voice_phone_number.eq.+${normalized},voice_phone_number.eq.${normalized}`)
        .maybeSingle();
      row = data as unknown as TenantRow | null;
    }
  }

  if (!row) {
    // Unknown number — most likely a misconfigured assignment. Return a
    // generic persona so the call still works rather than dropping.
    return NextResponse.json(genericFallback(), { status: 200 });
  }

  const override = buildRebeccaOverride({
    tenantName: row.name,
    persona: row.voice_persona ?? {},
  });

  return NextResponse.json(
    {
      // Dynamic variables Rebecca's prompt can interpolate at runtime
      dynamic_variables: {
        tenant_id: row.id,
        tenant_name: row.name,
        caller_number: callerNumber,
      },
      // Per-call config override — replaces Rebecca's baseline prompt
      // with the tenant's persona-rendered version for this conversation.
      conversation_config_override: override,
    },
    { status: 200 },
  );
}

function genericFallback() {
  return {
    dynamic_variables: { tenant_id: "", tenant_name: "" },
    conversation_config_override: {
      agent: {
        first_message: "Hola, gracias por llamar. ¿En qué puedo ayudarte?",
        language: "es",
      },
    },
  };
}
