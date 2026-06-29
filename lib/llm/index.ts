/**
 * LLM client factory — the single interface every LLM call in the platform
 * goes through. Provider-agnostic over the OpenAI-compatible REST surface
 * (`/chat/completions` + `/embeddings`), which Ollama and vLLM also expose.
 *
 * Today we run OpenAI. Going self-hosted is a CONFIG FLIP, not a refactor:
 * point `LLM_CHAT_*` at a local OpenAI-compatible endpoint (e.g. Ollama
 * http://localhost:11434/v1 with a function-calling model like llama3.3 / qwen).
 * No feature imports the `openai` SDK directly — they all call `chatCompletion`
 * / `embed` here, so swapping the brain touches nothing downstream.
 *
 * CHAT and EMBEDDINGS are configured SEPARATELY on purpose: embeddings are
 * dimension-locked to the pgvector columns (text-embedding-3-small = 1536), so
 * you can self-host the chat model while keeping OpenAI embeddings (a common,
 * safe mixed setup). Changing the embed model means re-ingesting every vector.
 */

// ─── Config (env-driven, OpenAI defaults) ────────────────────────────────
type Endpoint = { baseUrl: string; model: string; apiKey: string };

function chatEndpoint(): Endpoint {
  return {
    baseUrl: (process.env.LLM_CHAT_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.LLM_CHAT_MODEL ?? "gpt-4o-mini",
    apiKey: process.env.LLM_CHAT_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  };
}

/** The web-search-capable chat model (OpenAI's gpt-4o-search-preview by default).
 * Swappable via LLM_SEARCH_MODEL. Used for prospect research (grounded answers). */
export function searchModel(): string {
  return process.env.LLM_SEARCH_MODEL ?? "gpt-4o-search-preview";
}

function embedEndpoint(): Endpoint {
  return {
    baseUrl: (process.env.LLM_EMBED_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.LLM_EMBED_MODEL ?? "text-embedding-3-small",
    apiKey: process.env.LLM_EMBED_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  };
}

// ─── Chat types (OpenAI-compatible) ──────────────────────────────────────
export type LlmRole = "system" | "user" | "assistant" | "tool";
export type LlmToolCall = {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
};
export type LlmMessage = {
  role: LlmRole;
  content?: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
  // Web-search models (gpt-4o-search-preview) attach citations here.
  annotations?: Array<{ type?: string; url_citation?: { url?: string; title?: string } }>;
};
export type LlmTool = {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
};

export type ChatCompletionResult =
  // The returned message keeps the OpenAI shape so callers can push it back
  // into the message list verbatim during a tool-calling loop.
  | { ok: true; message: LlmMessage }
  | { ok: false; error: string };

/**
 * One chat completion (optionally with tools / function-calling). Returns the
 * assistant message (content + any tool_calls). Errors are returned, not
 * thrown, so the agentic loops can surface them cleanly.
 */
export async function chatCompletion(opts: {
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: "auto" | "none" | "required";
  // number → that temperature; undefined → default 0.2; null → omit entirely
  // (web-search models like gpt-4o-search-preview REJECT the temperature param).
  temperature?: number | null;
  maxTokens?: number;
  model?: string; // per-call override; defaults to LLM_CHAT_MODEL
  responseFormat?: { type: "json_object" } | { type: "text" };
  // For gpt-4o-search-preview: { search_context_size: "low"|"medium"|"high", ... }
  webSearchOptions?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<ChatCompletionResult> {
  const cfg = chatEndpoint();
  if (!cfg.apiKey) {
    return { ok: false, error: "LLM no configurado (LLM_CHAT_API_KEY / OPENAI_API_KEY)" };
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? cfg.model,
    messages: opts.messages,
  };
  if (opts.temperature !== null) body.temperature = opts.temperature ?? 0.2;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? "auto";
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  if (opts.webSearchOptions) body.web_search_options = opts.webSearchOptions;

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LLM inaccesible" };
  }
  if (!res.ok) {
    return { ok: false, error: `LLM ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    choices?: { message?: LlmMessage }[];
  };
  const message = json.choices?.[0]?.message;
  if (!message) return { ok: false, error: "respuesta vacía del modelo" };
  return { ok: true, message };
}

// ─── Embeddings ──────────────────────────────────────────────────────────
/** Embed one or many strings. Returns a vector per input (order preserved). */
export async function embed(
  input: string | string[],
  opts?: { model?: string; timeoutMs?: number },
): Promise<number[][]> {
  const cfg = embedEndpoint();
  if (!cfg.apiKey) {
    throw new Error("Embeddings no configuradas (LLM_EMBED_API_KEY / OPENAI_API_KEY)");
  }
  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts?.model ?? cfg.model, input }),
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    throw new Error(`Embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  return (json.data ?? []).map((d) => d.embedding);
}

/** Convenience: embed a single string → one vector. */
export async function embedOne(
  text: string,
  opts?: { model?: string; timeoutMs?: number },
): Promise<number[]> {
  const [vec] = await embed(text, opts);
  if (!vec) throw new Error("el modelo no devolvió un embedding");
  return vec;
}
