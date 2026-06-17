/**
 * OpenAI tool-calling loop for the tenant analytics assistant.
 *
 * gpt-4o-mini with function-calling: the model picks analytics tools, we run
 * them server-side (tenant id injected, never from the model), feed results
 * back, and loop until it produces a final natural-language answer.
 */
import { toolSpecs, dispatchTool } from "./index";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_TURNS = 5;

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type AssistantResult = { answer: string; toolsUsed: string[]; error?: string };

export async function runAssistant(opts: {
  tenantId: string;
  tenantName: string;
  timezone: string;
  history: ChatMsg[];
}): Promise<AssistantResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { answer: "", toolsUsed: [], error: "OPENAI_API_KEY no configurado" };

  const today = new Date().toISOString().slice(0, 10);
  const system = [
    `Eres el asistente de analítica del negocio "${opts.tenantName}" en BolivAI.`,
    `Hoy es ${today} (zona horaria del negocio: ${opts.timezone}).`,
    "Respondes preguntas sobre los datos de ESTE negocio únicamente, usando las herramientas disponibles.",
    "Reglas:",
    "- Llama SIEMPRE a una herramienta para obtener cifras reales. NUNCA inventes ni estimes números.",
    "- Si una herramienta devuelve vacío o cero, dilo claramente.",
    "- Sé conciso: empieza por la cifra. Los créditos se miden en créditos (1 USD = 100 créditos).",
    "- Para explicar por qué algo subió o bajó, usa compare_period y cita los deltas y días reales.",
    "- Responde en el idioma del usuario.",
  ].join("\n");

  // OpenAI message list (system + prior turns). `msg` objects from tool turns
  // are pushed back verbatim, so the type is loose on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "system", content: system }, ...opts.history];
  const tools = toolSpecs();
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", temperature: 0.2 }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      return { answer: "", toolsUsed, error: e instanceof Error ? e.message : "openai unreachable" };
    }
    if (!res.ok) {
      return { answer: "", toolsUsed, error: `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) return { answer: "", toolsUsed, error: "respuesta vacía de OpenAI" };
    messages.push(msg);

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        toolsUsed.push(tc.function.name);
        const result = await dispatchTool(tc.function.name, args, opts.tenantId);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue; // let the model read tool results next turn
    }

    return { answer: msg.content ?? "", toolsUsed };
  }

  return {
    answer: "No pude completar la consulta con los datos disponibles. Intenta reformularla.",
    toolsUsed,
  };
}
