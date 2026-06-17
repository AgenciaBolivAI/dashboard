/**
 * OpenAI tool-calling loop for the tenant analytics assistant.
 *
 * gpt-4o-mini with function-calling: the model picks analytics tools, we run
 * them server-side (tenant id injected, never from the model), feed results
 * back, and loop until it produces a final natural-language answer.
 */
import { toolSpecs, dispatchTool, WRITE_TOOL_NAMES } from "./index";
import { PLATFORM_GUIDE } from "./platform-guide";

export type PendingAction = { name: string; args: Record<string, unknown>; summary: string };

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_TURNS = 5;

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type AssistantResult = {
  answer: string;
  toolsUsed: string[];
  error?: string;
  pendingAction?: PendingAction | null;
};

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
    `Eres el asistente de "${opts.tenantName}" en BolivAI: respondes (1) preguntas sobre los DATOS de este negocio y (2) preguntas de CÓMO USAR la plataforma.`,
    `Hoy es ${today} (zona horaria del negocio: ${opts.timezone}).`,
    "",
    "Cómo decidir:",
    "- Pregunta sobre DATOS del negocio (cifras, clientes, reservas, leads, créditos gastados, tendencias) → usa las HERRAMIENTAS. Llama SIEMPRE a una herramienta para cifras reales; NUNCA inventes números. Si no hay una herramienta específica, usa query_business_data. Para 'con quién/cuáles/quiénes' usa las list_*. Para 'por qué subió/bajó' usa compare_period. No digas que no puedes sin intentar una herramienta primero.",
    "- Pregunta de PRECIOS / cuánto cuesta algo / tarifas → SIEMPRE llama a get_pricing (precios EN VIVO). NUNCA cites cifras de precios de la guía ni de memoria. Cita los precios SOLO en créditos (p. ej. '5 créditos por respuesta') — NUNCA en dólares, USD ni ninguna otra moneda.",
    "- Pregunta de CÓMO FUNCIONA o CÓMO HACER algo en la plataforma (empezar, conectar WhatsApp, activar AIMA, crear contenido, facturar, '¿el agente no responde?', qué hace una función) → responde con la GUÍA DE PLATAFORMA de abajo (sin cifras de precio — esas vienen de get_pricing).",
    "- Pedido de EJECUTAR una acción (cancelar una reserva, cambiar el estado de un lead, generar contenido, buscar leads) → usa las herramientas de acción.",
    "",
    "REGLAS DE ACCIONES (importantísimo):",
    "- 1) IDENTIFICA primero el objetivo con una herramienta de lectura para obtener su id (busca el cliente/reserva/lead por nombre o fecha).",
    "- 2) Luego LLAMA la herramienta de acción de INMEDIATO, SIN el parámetro confirm. Esto NO ejecuta nada: genera una TARJETA de confirmación con botones Confirmar/Cancelar para el usuario.",
    "- 3) NUNCA pidas la confirmación solo con texto ni esperes un 'sí' para volver a llamar. La TARJETA se encarga de confirmar. TÚ NUNCA uses confirm:true — el sistema lo hace cuando el usuario pulsa Confirmar.",
    "- Tu mensaje de texto debe ser breve (ej.: 'Encontré la reserva de Juan — confírmalo abajo para cancelarla 👇').",
    "- Si hay varios objetivos posibles (p. ej. dos reservas de 'Juan'), muéstralos y pide que elija ANTES de llamar la acción; no adivines.",
    "- Si no tienes permiso, la herramienta te lo dirá: explícalo amablemente.",
    "",
    "Reglas:",
    "- Si una herramienta devuelve vacío o cero, dilo claramente.",
    "- Sé conciso y accionable: empieza por la cifra o el paso concreto (incluye dónde tocar en el panel: p. ej. 'Ajustes → Integraciones'). Los precios se expresan SOLO en créditos, nunca en dólares.",
    "- Si algo no es autoservicio todavía (reembolsos, publicación nativa, varios números de WhatsApp), dilo con franqueza y sugiere contactar a soporte. Nunca prometas lo que no existe.",
    "- Responde en el idioma del usuario.",
    "",
    "=== GUÍA DE PLATAFORMA ===",
    PLATFORM_GUIDE,
  ].join("\n");

  // OpenAI message list (system + prior turns). `msg` objects from tool turns
  // are pushed back verbatim, so the type is loose on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "system", content: system }, ...opts.history];
  const tools = toolSpecs();
  const toolsUsed: string[] = [];
  let pendingAction: PendingAction | null = null;

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
        // Write tools can NEVER execute from the model loop — force a preview.
        // Real execution only happens via the UI confirm card (executeAssistantAction).
        const isWrite = WRITE_TOOL_NAMES.has(tc.function.name);
        const callArgs = isWrite ? { ...args, confirm: false } : args;
        const result = await dispatchTool(tc.function.name, callArgs, opts.tenantId);
        if (
          isWrite &&
          result &&
          typeof result === "object" &&
          (result as { requires_confirmation?: boolean }).requires_confirmation
        ) {
          const { confirm: _omit, ...rest } = callArgs;
          void _omit;
          pendingAction = {
            name: tc.function.name,
            args: rest,
            summary: String((result as { summary?: string }).summary ?? ""),
          };
        }
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue; // let the model read tool results next turn
    }

    return { answer: msg.content ?? "", toolsUsed, pendingAction };
  }

  return {
    answer: "No pude completar la consulta con los datos disponibles. Intenta reformularla.",
    toolsUsed,
    pendingAction,
  };
}
