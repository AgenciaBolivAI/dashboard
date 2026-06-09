/**
 * ElevenLabs Conversational AI client.
 *
 * Per-tenant agent provisioning — Phase 1 of the voice agents plan.
 * One agent per BolivAI tenant; agent_id stored on tenants.elevenlabs_agent_id.
 *
 * Server-only — never call from a client component. The workspace API
 * key has scopes for creating + updating agents and must not leak.
 */

const API_BASE = "https://api.elevenlabs.io/v1";

function getKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

async function call<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  } = { method: "GET" },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      "xi-api-key": getKey(),
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Voice provisioning is server-side; never cache
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ElevenLabsError(res.status, text || res.statusText);
  }
  // DELETE / 204 may have no body
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ElevenLabsError extends Error {
  constructor(public status: number, public detail: string) {
    super(`ElevenLabs API ${status}: ${detail.slice(0, 300)}`);
    this.name = "ElevenLabsError";
  }
}

// ── Agent shape ───────────────────────────────────────────────────────

export type AgentConversationConfig = {
  agent: {
    prompt: {
      prompt: string;
      llm?: string;       // e.g. "gpt-4o-mini"
      temperature?: number;
      tools?: AgentTool[];
    };
    first_message?: string;
    language?: string;    // ISO 639-1
  };
  tts: {
    voice_id: string;
    model_id?: string;    // e.g. "eleven_turbo_v2" (English) or "eleven_multilingual_v2"
  };
  asr?: {
    quality?: "high" | "low";
    provider?: "elevenlabs";
  };
};

export type AgentTool = {
  type: "webhook";
  name: string;
  description: string;
  api_schema: {
    url: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    request_headers?: Record<string, string>;
    request_body_schema?: Record<string, unknown>;
  };
};

export type CreateAgentInput = {
  name: string;
  conversation_config: AgentConversationConfig;
};

export type AgentRecord = {
  agent_id: string;
  name: string;
  conversation_config?: AgentConversationConfig;
};

// ── Operations ────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput): Promise<AgentRecord> {
  return call<AgentRecord>("/convai/agents/create", {
    method: "POST",
    body: input,
  });
}

export async function getAgent(agentId: string): Promise<AgentRecord> {
  return call<AgentRecord>(`/convai/agents/${agentId}`, { method: "GET" });
}

export async function updateAgent(
  agentId: string,
  patch: Partial<CreateAgentInput>,
): Promise<AgentRecord> {
  return call<AgentRecord>(`/convai/agents/${agentId}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await call<void>(`/convai/agents/${agentId}`, { method: "DELETE" });
}

// ── Higher-level: build a tenant agent from its BolivAI config ────────

export type TenantAgentConfig = {
  tenantName: string;
  prompt: string;       // interpolated system prompt (Build Prompt-equivalent, voice variant)
  language: string;     // 'es' | 'en' | ...
  voiceId: string;      // from CURATED_VOICES
  firstMessage: string | null;
  tools?: AgentTool[];  // optional — passed at create/update time
};

/**
 * Translate a BolivAI tenant's config into an ElevenLabs agent payload.
 * Used by both create and update flows.
 */
export function buildAgentPayload(cfg: TenantAgentConfig): CreateAgentInput {
  // English-only tenants get turbo_v2 (lowest latency, ~150ms TTFB).
  // Anyone else gets multilingual_v2 (slightly higher latency but speaks
  // ~30 languages correctly). turbo_v2_5 / flash_v2_5 are English-only
  // AND rejected here as of 2026-06 ("English Agents must use turbo or
  // flash v2") — don't use them.
  const lang = cfg.language.toLowerCase();
  const ttsModel = lang === "en" ? "eleven_turbo_v2" : "eleven_multilingual_v2";

  return {
    name: `BolivAI — ${cfg.tenantName} (Voice)`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: cfg.prompt,
          llm: "gpt-4o-mini",
          temperature: 0.4,
          ...(cfg.tools && cfg.tools.length ? { tools: cfg.tools } : {}),
        },
        first_message: cfg.firstMessage ?? defaultFirstMessage(cfg.language),
        language: lang,
      },
      tts: {
        voice_id: cfg.voiceId,
        model_id: ttsModel,
      },
      asr: { quality: "high", provider: "elevenlabs" },
    },
  };
}

function defaultFirstMessage(language: string): string {
  if (language.startsWith("es")) {
    return "Hola, gracias por llamar. ¿En qué puedo ayudarte hoy?";
  }
  return "Hi, thanks for calling. How can I help you today?";
}

// ── Phone numbers (Twilio integration) ────────────────────────────────

export type ImportTwilioNumberInput = {
  phone_number: string;  // E.164, e.g. "+15551234567"
  label: string;         // friendly name shown in ElevenLabs UI
  sid: string;           // Twilio Account SID
  token: string;         // Twilio Auth Token
};

export type PhoneNumberRecord = {
  phone_number_id: string;
  phone_number: string;
  label?: string;
  assigned_agent?: { agent_id: string } | null;
};

/** Register a Twilio number with ElevenLabs. Returns the phone_number_id. */
export async function importTwilioNumber(
  input: ImportTwilioNumberInput,
): Promise<PhoneNumberRecord> {
  return call<PhoneNumberRecord>("/convai/phone-numbers/create", {
    method: "POST",
    body: input,
  });
}

/** Attach (or re-attach) a phone number to an agent. */
export async function assignPhoneNumberToAgent(
  phoneNumberId: string,
  agentId: string,
): Promise<PhoneNumberRecord> {
  return call<PhoneNumberRecord>(`/convai/phone-numbers/${phoneNumberId}`, {
    method: "PATCH",
    body: { agent_id: agentId },
  });
}

export async function deletePhoneNumber(phoneNumberId: string): Promise<void> {
  await call<void>(`/convai/phone-numbers/${phoneNumberId}`, { method: "DELETE" });
}

// ── Knowledge base ────────────────────────────────────────────────────

export type KnowledgeDoc = {
  id: string;
  name: string;
  folder_path?: unknown[];
};

/**
 * Create a text knowledge-base document at the workspace level.
 * Returns the doc id, which can then be attached to an agent.
 */
export async function createKnowledgeTextDoc(
  name: string,
  text: string,
): Promise<KnowledgeDoc> {
  return call<KnowledgeDoc>("/convai/knowledge-base/text", {
    method: "POST",
    body: { name, text },
  });
}

/**
 * Delete a knowledge-base doc. Uses `?force=true` so docs that are
 * still attached to an agent get released cleanly — we always
 * re-attach the new doc to the same agent immediately after, so
 * a brief moment of "no KB attached" is the safe trade.
 */
export async function deleteKnowledgeDoc(docId: string): Promise<void> {
  await call<void>(`/convai/knowledge-base/${docId}?force=true`, {
    method: "DELETE",
  });
}

/** Replace the agent's knowledge_base attachment with a single doc. */
export async function attachKnowledgeDocToAgent(
  agentId: string,
  doc: KnowledgeDoc,
): Promise<void> {
  // ElevenLabs PATCH does deep-merge: we only need to send the field we're
  // changing. Use a raw call to bypass the strict CreateAgentInput type
  // (which would require the full prompt + tts blocks).
  await call<unknown>(`/convai/agents/${agentId}`, {
    method: "PATCH",
    body: {
      conversation_config: {
        agent: {
          prompt: {
            knowledge_base: [{ id: doc.id, type: "text", name: doc.name }],
          },
        },
      },
    },
  });
}

/** Remove all knowledge_base attachments from an agent. */
export async function clearAgentKnowledgeBase(agentId: string): Promise<void> {
  await call<unknown>(`/convai/agents/${agentId}`, {
    method: "PATCH",
    body: {
      conversation_config: { agent: { prompt: { knowledge_base: [] } } },
    },
  });
}
