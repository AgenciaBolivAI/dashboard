/**
 * Voice persona — tenant-editable knobs that customize Sandra (outbound
 * sales) and Rebecca (inbound support) without forking the agent.
 *
 * Stored as `tenants.voice_persona` JSONB. Applied at call time via
 * ElevenLabs's conversation_config_override + dynamic_variables — see
 * `buildSandraOverride` / `buildRebeccaOverride` below.
 *
 * All fields optional. Master prompts in `prompts.ts` fall back to sensible
 * generic phrasing when a field is empty, so a freshly-onboarded tenant
 * with an empty persona still gets a usable agent that introduces itself
 * as "AI Assistant from [tenant name resolved from tenants.name]".
 */
export type VoicePersona = {
  business_name?: string;
  business_description?: string;
  /** ElevenLabs voice_id. Falls back to MASTER_VOICE_ID env var. */
  voice_id?: string;
  /** ISO language code (es, en, pt, fr, it...). Falls back to "es". */
  language?: string;

  sandra?: {
    first_message?: string;
    value_prop?: string;
    forbidden_topics?: string;
  };
  rebecca?: {
    first_message?: string;
    faq?: string;
    forbidden_topics?: string;
  };
};

import { renderSandraPrompt, renderRebeccaPrompt } from "./prompts";

/**
 * Build the conversation_config_override block to send to ElevenLabs on a
 * Sandra outbound call. The master prompt is rendered with the tenant's
 * persona values, plus per-call context (lead_name, etc.) which the prompt
 * receives separately as dynamic_variables.
 */
export function buildSandraOverride(args: {
  tenantName: string;
  persona: VoicePersona;
}): {
  agent: {
    prompt: { prompt: string };
    first_message?: string;
    language?: string;
  };
  tts?: { voice_id?: string };
} {
  const { tenantName, persona } = args;
  const businessName = persona.business_name || tenantName;
  const lang = persona.language || "es";
  const voiceId = persona.voice_id || process.env.MASTER_SANDRA_VOICE_ID || undefined;

  return {
    agent: {
      prompt: {
        prompt: renderSandraPrompt({
          business_name: businessName,
          business_description: persona.business_description || "",
          value_prop: persona.sandra?.value_prop || "",
          forbidden_topics: persona.sandra?.forbidden_topics || "",
          language: lang,
        }),
      },
      first_message:
        persona.sandra?.first_message ||
        `Hola, te habla Sandra de ${businessName}.`,
      language: lang,
    },
    ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
  };
}

export function buildRebeccaOverride(args: {
  tenantName: string;
  persona: VoicePersona;
}): {
  agent: {
    prompt: { prompt: string };
    first_message?: string;
    language?: string;
  };
  tts?: { voice_id?: string };
} {
  const { tenantName, persona } = args;
  const businessName = persona.business_name || tenantName;
  const lang = persona.language || "es";
  const voiceId = persona.voice_id || process.env.MASTER_REBECCA_VOICE_ID || undefined;

  return {
    agent: {
      prompt: {
        prompt: renderRebeccaPrompt({
          business_name: businessName,
          business_description: persona.business_description || "",
          faq: persona.rebecca?.faq || "",
          forbidden_topics: persona.rebecca?.forbidden_topics || "",
          language: lang,
        }),
      },
      first_message:
        persona.rebecca?.first_message ||
        `Hola, gracias por llamar a ${businessName}. ¿En qué puedo ayudarte?`,
      language: lang,
    },
    ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
  };
}
