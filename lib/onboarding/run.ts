/**
 * Pre-tenant onboarding chat loop. BOLIV interviews the new user and, when it
 * has enough, emits a single `provision_business` tool call carrying the
 * extracted profile. The loop only EXTRACTS the profile — it never provisions
 * (the server action does, after re-validation), mirroring the write-tool guard
 * in the main assistant. No tenant, no tools beyond provision_business.
 */
import { chatCompletion, type LlmTool, type LlmMessage } from "@/lib/llm";
import { ONBOARDING_SYSTEM } from "./prompt";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type OnboardingProfile = {
  company_name: string;
  industry: string;
  country: string;
  timezone?: string;
  language: "es" | "en" | "pt";
  whatsapp_number: string;
  primary_color?: string;
  accent_color?: string;
  logo_url?: string;
  target_verticals?: string[];
  target_geographies?: string[];
  voice_greeting?: string;
  services?: Array<{
    name: string;
    description?: string;
    price_amount?: number;
    price_currency?: string;
    duration_min?: number;
    category?: string;
  }>;
};

export type OnboardingRunResult =
  | { kind: "answer"; answer: string }
  | { kind: "provision"; profile: OnboardingProfile }
  | { kind: "error"; error: string };

const PROVISION_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "provision_business",
    description:
      "Create the tenant's BolivAI workspace once you have the minimum business info (company_name, industry, country, language, whatsapp_number). Map free-text city/country to a 2-letter ISO 3166-1 alpha-2 code and a matching IANA timezone yourself. Do not ask for colors or logo. Capture verticals/geographies/services/greeting only if they came up naturally.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["company_name", "industry", "country", "language", "whatsapp_number"],
      properties: {
        company_name: { type: "string", minLength: 2, maxLength: 80 },
        industry: { type: "string", description: "Short industry label inferred from the conversation." },
        country: { type: "string", minLength: 2, maxLength: 2, description: "ISO 3166-1 alpha-2, uppercase." },
        timezone: { type: "string", description: "IANA timezone consistent with the country/city; default America/La_Paz if unsure." },
        language: { type: "string", enum: ["es", "en", "pt"], description: "Language the WhatsApp agent speaks to customers." },
        whatsapp_number: { type: "string", description: "Business WhatsApp with country code, 8–16 digits." },
        primary_color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        accent_color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
        logo_url: { type: "string" },
        target_verticals: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 } },
        target_geographies: { type: "array", maxItems: 120, items: { type: "string", maxLength: 120 } },
        voice_greeting: { type: "string", maxLength: 300 },
        services: {
          type: "array",
          maxItems: 25,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", maxLength: 120 },
              description: { type: "string" },
              price_amount: { type: "number", minimum: 0 },
              price_currency: { type: "string", maxLength: 8 },
              duration_min: { type: "number", minimum: 1, maximum: 600 },
              category: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export async function runOnboardingChat(history: ChatMsg[]): Promise<OnboardingRunResult> {
  const messages: LlmMessage[] = [
    { role: "system", content: ONBOARDING_SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content }) as LlmMessage),
  ];

  const completion = await chatCompletion({
    messages,
    tools: [PROVISION_TOOL],
    toolChoice: "auto",
    temperature: 0.3,
    timeoutMs: 60_000,
  });
  if (!completion.ok) return { kind: "error", error: completion.error };

  const msg = completion.message;
  const call = msg.tool_calls?.find((tc) => tc.function.name === "provision_business");
  if (call) {
    try {
      const profile = JSON.parse(call.function.arguments || "{}") as OnboardingProfile;
      return { kind: "provision", profile };
    } catch {
      return { kind: "error", error: "No pude leer los datos del negocio. Intenta de nuevo." };
    }
  }

  return { kind: "answer", answer: msg.content?.trim() || "" };
}
