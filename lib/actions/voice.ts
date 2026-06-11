"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import {
  buildAgentPayload,
  createAgent,
  deleteAgent,
  updateAgent,
  importTwilioNumber,
  assignPhoneNumberToAgent,
  deletePhoneNumber,
  ElevenLabsError,
} from "@/lib/elevenlabs";
import { CURATED_VOICES, DEFAULT_VOICE_ID, getVoiceById } from "@/lib/voices";
import { buildToolsConfig } from "@/lib/voice-tools";
import { validateTwilioCreds, verifyOwnsNumber } from "@/lib/twilio";
import { performVoiceKbSync } from "@/lib/voice-kb";
import {
  buildSandraOverride,
  buildRebeccaOverride,
  type VoicePersona,
} from "@/lib/voice/persona";

function getVoiceTools(tenantId: string) {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  const rootSecret = process.env.VOICE_TOOL_SECRET ?? "";
  // buildToolsConfig derives a per-tenant HMAC bearer from this root secret;
  // only the derived bearer reaches ElevenLabs.
  return buildToolsConfig({ baseUrl, tenantId, rootSecret });
}

export type VoiceActionState = {
  error: string | null;
  success?: boolean;
};

const updateVoiceSchema = z.object({
  tenant_id: z.string().uuid(),
  voice_id: z
    .string()
    .min(1)
    .refine((v) => CURATED_VOICES.some((x) => x.id === v), "Voz no disponible"),
  voice_greeting: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || null),
});

/**
 * Toggle voice ON for a tenant. Provisions an ElevenLabs agent using
 * the tenant's prompt_template + language + default voice. Stores the
 * resulting agent_id on the tenants row.
 *
 * Idempotent: if an agent already exists, we leave it alone and just
 * flip voice_enabled to true.
 */
export async function enableVoiceAction(
  tenantId: string,
): Promise<VoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "id, name, language, prompt_template, elevenlabs_agent_id, voice_id, voice_greeting",
    )
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return { error: "Tenant no encontrado" };

  const t = tenant as {
    id: string;
    name: string;
    language: string;
    prompt_template: string | null;
    elevenlabs_agent_id: string | null;
    voice_id: string | null;
    voice_greeting: string | null;
  };

  // If we already have an agent, just flip the flag — don't double-provision.
  if (t.elevenlabs_agent_id) {
    const { error } = await supabase
      .from("tenants")
      .update({ voice_enabled: true })
      .eq("id", tenantId);
    if (error) return { error: error.message };
    revalidatePath("/dashboard", "layout");
    return { error: null, success: true };
  }

  try {
    const payload = buildAgentPayload({
      tenantName: t.name,
      prompt: t.prompt_template ?? "You are a helpful assistant.",
      language: (t.language || "en").slice(0, 2),
      voiceId: t.voice_id || DEFAULT_VOICE_ID,
      firstMessage: t.voice_greeting,
      tools: getVoiceTools(tenantId),
    });
    const agent = await createAgent(payload);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tenants")
      .update({
        elevenlabs_agent_id: agent.agent_id,
        voice_enabled: true,
        voice_id: t.voice_id || DEFAULT_VOICE_ID,
        voice_agent_created_at: now,
        voice_agent_updated_at: now,
      })
      .eq("id", tenantId);
    if (error) {
      // Roll back the agent we just created so we don't leak it
      await deleteAgent(agent.agent_id).catch(() => {});
      return { error: `No se pudo guardar el agente: ${error.message}` };
    }
  } catch (e) {
    if (e instanceof ElevenLabsError) {
      return { error: `ElevenLabs rechazó el agente: ${e.detail.slice(0, 200)}` };
    }
    return { error: e instanceof Error ? e.message : "Error desconocido" };
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Turn voice off. The agent stays on ElevenLabs for fast re-enable, but
 * voice_enabled flips false so BolivAI doesn't route calls to it.
 */
export async function disableVoiceAction(
  tenantId: string,
): Promise<VoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ voice_enabled: false })
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Permanently destroy the tenant's voice agent on ElevenLabs and clear
 * the row. Use this only if a tenant truly wants to start over with a
 * fresh agent — usually disableVoiceAction is what you want.
 */
export async function deleteVoiceAgentAction(
  tenantId: string,
): Promise<VoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("elevenlabs_agent_id")
    .eq("id", tenantId)
    .maybeSingle();
  const agentId = (tenant as { elevenlabs_agent_id?: string } | null)
    ?.elevenlabs_agent_id;

  if (agentId) {
    try {
      await deleteAgent(agentId);
    } catch (e) {
      if (e instanceof ElevenLabsError && e.status !== 404) {
        return { error: `ElevenLabs rechazó la eliminación: ${e.detail.slice(0, 200)}` };
      }
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      elevenlabs_agent_id: null,
      voice_enabled: false,
      voice_agent_created_at: null,
      voice_agent_updated_at: null,
    })
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ── Twilio phone number attach / detach ───────────────────────────────

const attachPhoneSchema = z.object({
  tenant_id: z.string().uuid(),
  account_sid: z.string().trim().regex(/^AC[a-f0-9]{32}$/i, "Account SID inválido (debe empezar con AC)"),
  auth_token: z.string().trim().min(16, "Auth Token demasiado corto"),
  phone_number: z
    .string()
    .trim()
    .regex(/^\+\d{8,15}$/, "Número en formato E.164, ej. +15551234567"),
});

/**
 * Bring-your-own Twilio number → attach to the tenant's voice agent.
 *
 * Flow:
 *   1. Validate Twilio creds (HTTP 200 from Twilio's account endpoint)
 *   2. Confirm the tenant actually owns the phone number on that account
 *   3. Import the number into ElevenLabs (gives us a phone_number_id)
 *   4. Patch the import to assign it to this tenant's agent
 *   5. Persist Twilio creds + number + ElevenLabs phone_number_id on tenants
 *
 * Failure modes are bubbled up as user-facing errors. If we fail
 * mid-step (e.g. Twilio OK but ElevenLabs rejected), we leave nothing
 * persisted so the tenant can retry cleanly.
 */
export async function attachTwilioNumberAction(
  _prev: VoiceActionState,
  formData: FormData,
): Promise<VoiceActionState> {
  const parsed = attachPhoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { tenant_id, account_sid, auth_token, phone_number } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "admin" });

  // Master Rebecca handles inbound for every tenant. Assigning the
  // tenant's Twilio number to her means when a customer dials in,
  // ElevenLabs routes the call to Rebecca, who reads the tenant's
  // persona from our conversation_initiation_data_webhook (TODO).
  const rebeccaAgentId = process.env.MASTER_REBECCA_AGENT_ID;
  if (!rebeccaAgentId) {
    return { error: "MASTER_REBECCA_AGENT_ID not configured" };
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, voice_elevenlabs_outbound_phone_id, voice_phone_number" as never)
    .eq("id", tenant_id)
    .maybeSingle();
  if (!tenant) return { error: "Tenant no encontrado" };
  const t = tenant as unknown as {
    name: string;
    voice_elevenlabs_outbound_phone_id: string | null;
    voice_phone_number: string | null;
  };
  if (t.voice_elevenlabs_outbound_phone_id) {
    return { error: "Ya tienes un número conectado. Desconéctalo antes de cambiar." };
  }

  // Step 1: Twilio creds OK?
  try {
    await validateTwilioCreds(account_sid, auth_token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Twilio rechazó las credenciales" };
  }

  // Step 2: tenant owns the number?
  try {
    await verifyOwnsNumber(account_sid, auth_token, phone_number);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pudimos confirmar la propiedad del número" };
  }

  // Step 3 + 4: import the number into ElevenLabs, assign to master Rebecca
  // so inbound calls route to her with the tenant's persona override.
  let phoneNumberId: string;
  try {
    const imported = await importTwilioNumber({
      phone_number,
      label: `${t.name} (BolivAI Voice)`,
      sid: account_sid,
      token: auth_token,
    });
    phoneNumberId = imported.phone_number_id;
    await assignPhoneNumberToAgent(phoneNumberId, rebeccaAgentId);
  } catch (e) {
    const msg = e instanceof ElevenLabsError ? e.detail : e instanceof Error ? e.message : String(e);
    return { error: `ElevenLabs rechazó el número: ${msg.slice(0, 200)}` };
  }

  // Step 5: persist
  const { error: dbErr } = await supabase
    .from("tenants")
    .update({
      voice_phone_provider: "twilio",
      voice_phone_number: phone_number,
      voice_phone_account_sid: account_sid,
      voice_phone_auth_token: auth_token,
      voice_elevenlabs_outbound_phone_id: phoneNumberId,
    } as never)
    .eq("id", tenant_id);
  if (dbErr) {
    // Roll back the ElevenLabs side so we don't leak the number
    await deletePhoneNumber(phoneNumberId).catch(() => {});
    return { error: `No se pudo guardar la configuración: ${dbErr.message}` };
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/** User-initiated KB sync — drives the "Sincronizar con voz" button. */
export async function syncKnowledgeToVoiceAction(
  tenantId: string,
): Promise<VoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const result = await performVoiceKbSync(tenantId);
  if (!result.ok) {
    return { error: result.error ?? "Error al sincronizar conocimiento" };
  }
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/** Detach the tenant's phone number and clear creds. */
export async function detachPhoneNumberAction(
  tenantId: string,
): Promise<VoiceActionState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("voice_elevenlabs_outbound_phone_id" as never)
    .eq("id", tenantId)
    .maybeSingle();
  const phoneNumberId = (tenant as { voice_elevenlabs_outbound_phone_id?: string } | null)
    ?.voice_elevenlabs_outbound_phone_id;

  if (phoneNumberId) {
    try {
      await deletePhoneNumber(phoneNumberId);
    } catch (e) {
      if (e instanceof ElevenLabsError && e.status !== 404) {
        return { error: `ElevenLabs rechazó la desconexión: ${e.detail.slice(0, 200)}` };
      }
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      voice_phone_provider: null,
      voice_phone_number: null,
      voice_phone_account_sid: null,
      voice_phone_auth_token: null,
      voice_elevenlabs_outbound_phone_id: null,
    } as never)
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Change the voice / greeting on an existing agent. PATCHes ElevenLabs
 * so the agent immediately starts using the new voice.
 */
export async function updateVoiceSettingsAction(
  _prev: VoiceActionState,
  formData: FormData,
): Promise<VoiceActionState> {
  const parsed = updateVoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { tenant_id, voice_id, voice_greeting } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, language, prompt_template, elevenlabs_agent_id")
    .eq("id", tenant_id)
    .maybeSingle();
  if (!tenant) return { error: "Tenant no encontrado" };
  const t = tenant as {
    name: string;
    language: string;
    prompt_template: string | null;
    elevenlabs_agent_id: string | null;
  };

  const voice = getVoiceById(voice_id);
  if (!voice) return { error: "Voz no disponible" };

  // Update locally first — this works even if voice isn't enabled yet
  const { error: dbErr } = await supabase
    .from("tenants")
    .update({
      voice_id,
      voice_greeting,
      voice_agent_updated_at: new Date().toISOString(),
    })
    .eq("id", tenant_id);
  if (dbErr) return { error: dbErr.message };

  // If an agent exists, PATCH it on ElevenLabs so the change takes effect immediately
  if (t.elevenlabs_agent_id) {
    try {
      const payload = buildAgentPayload({
        tenantName: t.name,
        prompt: t.prompt_template ?? "You are a helpful assistant.",
        language: (t.language || "en").slice(0, 2),
        voiceId: voice_id,
        firstMessage: voice_greeting,
        tools: getVoiceTools(tenant_id),
      });
      await updateAgent(t.elevenlabs_agent_id, payload);
    } catch (e) {
      if (e instanceof ElevenLabsError) {
        return { error: `ElevenLabs rechazó la actualización: ${e.detail.slice(0, 200)}` };
      }
      return { error: e instanceof Error ? e.message : "Error desconocido" };
    }
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ────────────────────────────────────────────────────────────────────
// "Call now" — trigger Sandra (via ElevenLabs Twilio integration) to
// dial an external phone number, optionally with lead context as
// dynamic variables for the conversation.
// ────────────────────────────────────────────────────────────────────

export type VoiceCallState = {
  error: string | null;
  success?: boolean;
  conversation_id?: string;
};

const callSchema = z.object({
  tenant_id: z.string().uuid(),
  to_number: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, "Phone must be E.164 format (e.g. +5491134567890)"),
  // lead_id is what lets the Sandra Tick workflow map this conversation back
  // to the originating lead and auto-update its status after the call.
  lead_id: z.string().uuid().optional(),
  context: z
    .object({
      lead_name: z.string().trim().max(120).optional(),
      lead_company: z.string().trim().max(160).optional(),
      lead_role: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .optional(),
});

export async function initiateSandraCallAction(
  input: z.infer<typeof callSchema>,
): Promise<VoiceCallState> {
  const parsed = callSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) return { error: "ELEVENLABS_API_KEY not configured" };

  const supabase = await createClient();
  // We use the MASTER Sandra agent for every tenant and override its
  // persona per call via conversation_config_override. Tenants never
  // touch ElevenLabs — they edit their voice_persona JSONB.
  const sandraAgentId = process.env.MASTER_SANDRA_AGENT_ID;
  if (!sandraAgentId) return { error: "MASTER_SANDRA_AGENT_ID not configured" };

  const { data: row, error: tErr } = await supabase
    .from("tenants")
    .select("name, voice_phone_number, voice_elevenlabs_outbound_phone_id, voice_persona" as never)
    .eq("id", parsed.data.tenant_id)
    .single();

  if (tErr || !row) return { error: tErr?.message ?? "Tenant not found" };
  const tenant = row as unknown as {
    name: string;
    voice_phone_number: string | null;
    voice_elevenlabs_outbound_phone_id: string | null;
    voice_persona: VoicePersona | null;
  };

  if (!tenant.voice_phone_number || !tenant.voice_elevenlabs_outbound_phone_id) {
    return { error: "Voice number not configured for this tenant." };
  }

  const override = buildSandraOverride({
    tenantName: tenant.name,
    persona: tenant.voice_persona ?? {},
  });

  const body: Record<string, unknown> = {
    agent_id: sandraAgentId,
    agent_phone_number_id: tenant.voice_elevenlabs_outbound_phone_id,
    to_number: parsed.data.to_number,
    conversation_initiation_client_data: {
      dynamic_variables: {
        tenant_id: parsed.data.tenant_id,
        // lead_id is the join key the Sandra Tick uses to auto-update the
        // lead's status after the call ends — empty string means "manually-
        // dialed call, no status auto-update".
        lead_id: parsed.data.lead_id ?? "",
        lead_name: parsed.data.context?.lead_name ?? "",
        lead_company: parsed.data.context?.lead_company ?? "",
        lead_role: parsed.data.context?.lead_role ?? "",
        notes: parsed.data.context?.notes ?? "",
      },
      conversation_config_override: override,
    },
  };

  let conversationId: string | null = null;
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      return { error: `ElevenLabs ${res.status}: ${errBody.slice(0, 300)}` };
    }
    const json = (await res.json()) as {
      conversation_id?: string;
      callSid?: string;
      success?: boolean;
    };
    conversationId = json.conversation_id ?? null;
  } catch (e) {
    return {
      error: `Call failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Audit log — best-effort, non-fatal if table doesn't accept all columns
  try {
    await supabase.from("sandra_call_queue" as never).insert({
      tenant_id: parsed.data.tenant_id,
      to_number: parsed.data.to_number,
      status: "initiated",
      elevenlabs_conversation_id: conversationId,
      context: parsed.data.context ?? {},
    } as never);
  } catch {
    /* non-fatal */
  }

  return {
    error: null,
    success: true,
    conversation_id: conversationId ?? undefined,
  };
}

// ────────────────────────────────────────────────────────────────────
// Batch call — submit N leads to ElevenLabs's batch-calling endpoint.
// ElevenLabs handles pacing, retry, and per-recipient state on their
// side; we just hand them the list + per-recipient context. The batch
// fires immediately (scheduled_time_unix = now).
// ────────────────────────────────────────────────────────────────────

export type BatchCallState = {
  error: string | null;
  success?: boolean;
  batch_id?: string;
  queued: number;
  skipped_dnc: number;
  skipped_no_phone: number;
};

const batchCallSchema = z.object({
  tenant_id: z.string().uuid(),
  lead_ids: z.array(z.string().uuid()).min(1).max(200),
  batch_name: z.string().trim().max(100).optional(),
});

export async function initiateBatchSandraCallAction(
  input: z.infer<typeof batchCallSchema>,
): Promise<BatchCallState> {
  const parsed = batchCallSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) {
    return {
      error: "ELEVENLABS_API_KEY not configured",
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }

  const sandraAgentId = process.env.MASTER_SANDRA_AGENT_ID;
  if (!sandraAgentId) {
    return {
      error: "MASTER_SANDRA_AGENT_ID not configured",
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }

  const supabase = await createClient();

  // Mark the rebecca-side as referenced (silences unused-import warnings
  // when the file is built standalone). Will be wired into a real inbound
  // workflow once Rebecca's master config lands.
  void buildRebeccaOverride;

  // 1. Load tenant voice config + persona (we override the master agent's
  // behavior per call with the tenant's persona JSON)
  const { data: tRow, error: tErr } = await supabase
    .from("tenants")
    .select("name, voice_elevenlabs_outbound_phone_id, voice_persona" as never)
    .eq("id", parsed.data.tenant_id)
    .single();
  if (tErr || !tRow) {
    return {
      error: tErr?.message ?? "Tenant not found",
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }
  const tenant = tRow as unknown as {
    name: string;
    voice_elevenlabs_outbound_phone_id: string | null;
    voice_persona: VoicePersona | null;
  };
  if (!tenant.voice_elevenlabs_outbound_phone_id) {
    return {
      error: "Phone number not configured for this tenant.",
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }

  const override = buildSandraOverride({
    tenantName: tenant.name,
    persona: tenant.voice_persona ?? {},
  });

  // 2. Load the leads + their metadata
  const { data: leadRows, error: lErr } = await supabase
    .from("leads")
    .select("id, name, whatsapp_number, status, notes, metadata")
    .eq("tenant_id", parsed.data.tenant_id)
    .in("id", parsed.data.lead_ids);
  if (lErr) {
    return {
      error: lErr.message,
      queued: 0,
      skipped_dnc: 0,
      skipped_no_phone: 0,
    };
  }

  type LeadShape = {
    id: string;
    name: string | null;
    whatsapp_number: string | null;
    status: string | null;
    notes: string | null;
    metadata: Record<string, unknown> | null;
  };

  let skippedDnc = 0;
  let skippedNoPhone = 0;
  const recipients: Array<{
    phone_number: string;
    conversation_initiation_client_data: {
      dynamic_variables: Record<string, string>;
      conversation_config_override: ReturnType<typeof buildSandraOverride>;
    };
  }> = [];

  for (const r of (leadRows ?? []) as LeadShape[]) {
    if (r.status === "do_not_contact") {
      skippedDnc++;
      continue;
    }
    const raw = r.whatsapp_number?.trim();
    if (!raw) {
      skippedNoPhone++;
      continue;
    }
    const e164 = raw.startsWith("+") ? raw : `+${raw}`;
    if (!/^\+[1-9]\d{1,14}$/.test(e164)) {
      skippedNoPhone++;
      continue;
    }
    const meta = r.metadata ?? {};
    const vertical = typeof meta.vertical === "string" ? meta.vertical : "";
    recipients.push({
      phone_number: e164,
      conversation_initiation_client_data: {
        dynamic_variables: {
          tenant_id: parsed.data.tenant_id,
          lead_id: r.id,
          lead_name: r.name ?? "",
          lead_company: vertical,
          lead_role: "",
          notes: r.notes ?? "",
        },
        conversation_config_override: override,
      },
    });
  }

  if (recipients.length === 0) {
    return {
      error:
        skippedDnc > 0
          ? `Todos los leads seleccionados están marcados como "no contactar" o no tienen teléfono.`
          : "Ninguno de los leads tiene teléfono válido.",
      queued: 0,
      skipped_dnc: skippedDnc,
      skipped_no_phone: skippedNoPhone,
    };
  }

  // 3. Submit the batch to ElevenLabs
  const body = {
    call_name: parsed.data.batch_name ?? `Lote ${new Date().toISOString().slice(0, 16)}`,
    agent_id: sandraAgentId,
    agent_phone_number_id: tenant.voice_elevenlabs_outbound_phone_id,
    scheduled_time_unix: Math.floor(Date.now() / 1000),
    recipients,
  };

  let batchId: string | undefined;
  try {
    const res = await fetch(
      "https://api.elevenlabs.io/v1/convai/batch-calling/submit",
      {
        method: "POST",
        headers: { "xi-api-key": elKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      return {
        error: `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`,
        queued: 0,
        skipped_dnc: skippedDnc,
        skipped_no_phone: skippedNoPhone,
      };
    }
    const json = (await res.json()) as { id?: string; batch_id?: string };
    batchId = json.id ?? json.batch_id ?? undefined;
  } catch (e) {
    return {
      error: `Batch failed: ${e instanceof Error ? e.message : String(e)}`,
      queued: 0,
      skipped_dnc: skippedDnc,
      skipped_no_phone: skippedNoPhone,
    };
  }

  // 4. Mirror into sandra_call_queue for audit (best-effort, non-fatal)
  try {
    const rows = recipients.map((r) => ({
      tenant_id: parsed.data.tenant_id,
      lead_id: r.conversation_initiation_client_data.dynamic_variables.lead_id,
      to_number: r.phone_number,
      status: "initiated",
      elevenlabs_batch_id: batchId ?? null,
      context: r.conversation_initiation_client_data.dynamic_variables,
    }));
    await supabase.from("sandra_call_queue" as never).insert(rows as never);
  } catch {
    /* non-fatal */
  }

  return {
    error: null,
    success: true,
    batch_id: batchId,
    queued: recipients.length,
    skipped_dnc: skippedDnc,
    skipped_no_phone: skippedNoPhone,
  };
}

// ────────────────────────────────────────────────────────────────────
// Voice persona — what the tenant edits to customize Sandra and Rebecca.
// Stored in tenants.voice_persona JSONB and applied at call time via
// conversation_config_override (see lib/voice/persona.ts).
// ────────────────────────────────────────────────────────────────────

const personaSchema = z.object({
  tenant_id: z.string().uuid(),
  persona: z.object({
    business_name: z.string().trim().max(160).optional(),
    business_description: z.string().trim().max(1000).optional(),
    voice_id: z.string().trim().max(80).optional(),
    language: z.string().trim().max(8).optional(),
    sandra: z
      .object({
        first_message: z.string().trim().max(400).optional(),
        value_prop: z.string().trim().max(800).optional(),
        forbidden_topics: z.string().trim().max(800).optional(),
      })
      .optional(),
    rebecca: z
      .object({
        first_message: z.string().trim().max(400).optional(),
        faq: z.string().trim().max(2000).optional(),
        forbidden_topics: z.string().trim().max(800).optional(),
      })
      .optional(),
  }),
});

export async function updateVoicePersonaAction(
  input: z.infer<typeof personaSchema>,
): Promise<VoiceActionState> {
  const parsed = personaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid persona" };
  }
  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ voice_persona: parsed.data.persona } as never)
    .eq("id", parsed.data.tenant_id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
