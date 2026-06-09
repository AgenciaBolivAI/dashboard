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

function getVoiceTools(tenantId: string) {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
  const bearer = process.env.VOICE_TOOL_SECRET ?? "";
  return buildToolsConfig({ baseUrl, tenantId, bearerToken: bearer });
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

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, elevenlabs_agent_id, voice_phone_elevenlabs_id, voice_phone_number")
    .eq("id", tenant_id)
    .maybeSingle();
  if (!tenant) return { error: "Tenant no encontrado" };
  const t = tenant as {
    name: string;
    elevenlabs_agent_id: string | null;
    voice_phone_elevenlabs_id: string | null;
    voice_phone_number: string | null;
  };
  if (!t.elevenlabs_agent_id) {
    return { error: "Activa la voz primero — el agente no existe todavía." };
  }
  if (t.voice_phone_elevenlabs_id) {
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

  // Step 3 + 4: import + assign
  let phoneNumberId: string;
  try {
    const imported = await importTwilioNumber({
      phone_number,
      label: `${t.name} (BolivAI Voice)`,
      sid: account_sid,
      token: auth_token,
    });
    phoneNumberId = imported.phone_number_id;
    await assignPhoneNumberToAgent(phoneNumberId, t.elevenlabs_agent_id);
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
      voice_phone_elevenlabs_id: phoneNumberId,
    })
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
    .select("voice_phone_elevenlabs_id")
    .eq("id", tenantId)
    .maybeSingle();
  const phoneNumberId = (tenant as { voice_phone_elevenlabs_id?: string } | null)
    ?.voice_phone_elevenlabs_id;

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
      voice_phone_elevenlabs_id: null,
    })
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
