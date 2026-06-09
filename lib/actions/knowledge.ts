"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import {
  extractText,
  hashContent,
  chunkText,
  embedTexts,
} from "@/lib/ingestion";
import { fireAndForgetVoiceKbSync } from "@/lib/voice-kb";

export type KnowledgeType = "documents" | "pain";

export type IngestState = {
  error: string | null;
  success?: boolean;
  chunksAdded?: number;
  duplicateSkipped?: boolean;
};

// ─── File upload (multi-chunk ingestion) ─────────────────────────────
export async function uploadKnowledgeAction(
  formData: FormData,
): Promise<IngestState> {
  const tenantId = formData.get("tenant_id");
  const type = formData.get("type");
  const file = formData.get("file");

  if (typeof tenantId !== "string" || !tenantId) {
    return { error: "tenant_id requerido" };
  }
  if (type !== "documents" && type !== "pain") {
    return { error: "Tipo de conocimiento inválido" };
  }
  if (!file || !(file instanceof File)) {
    return { error: "Archivo requerido" };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: "Archivo demasiado grande (máx 25 MB)" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  let text: string;
  try {
    text = await extractText(file);
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "No se pudo leer el archivo",
    };
  }

  if (!text.trim()) {
    return { error: "El archivo parece estar vacío o no se pudo extraer texto" };
  }

  const hash = hashContent(text);
  const supabase = await createClient();

  // Dedup
  const { data: existing } = await supabase
    .from("record_manager")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("hash", hash)
    .maybeSingle();

  if (existing) {
    return {
      error: null,
      success: true,
      chunksAdded: 0,
      duplicateSkipped: true,
    };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { error: "No se pudieron generar chunks del documento" };
  }

  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks.map((c) => c.content));
  } catch (e) {
    console.error("[uploadKnowledge] embeddings failed:", e);
    return {
      error: "Error al generar embeddings con OpenAI. Revisa OPENAI_API_KEY.",
    };
  }

  const rows = chunks.map((chunk, i) => {
    const base = {
      tenant_id: tenantId,
      source: file.name,
      content: chunk.content,
      embedding: embeddings[i] as unknown as string, // pgvector accepts JSON array
    };
    // Auto-fill the section header into the type-specific "title" field so
    // the dashboard table shows real titles instead of "(sin título)".
    if (type === "documents") {
      return { ...base, question: chunk.section ?? null };
    }
    return { ...base, symptom: chunk.section ?? null };
  });

  const { error: insertErr } =
    type === "documents"
      ? await supabase.from("documents").insert(rows)
      : await supabase.from("pain").insert(rows);

  if (insertErr) {
    console.error("[uploadKnowledge] insert failed:", insertErr);
    return { error: insertErr.message };
  }

  await supabase.from("record_manager").insert({
    tenant_id: tenantId,
    source: file.name,
    hash,
  });

  fireAndForgetVoiceKbSync(tenantId);
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, chunksAdded: chunks.length };
}

// ─── Manual chunk add/edit ───────────────────────────────────────────
const manualSchema = z.object({
  tenant_id: z.string().uuid(),
  type: z.enum(["documents", "pain"]),
  source: z.string().optional(),
  content: z.string().trim().min(1, "Contenido requerido").max(8000),
  // FAQ fields
  question: z.string().optional(),
  answer: z.string().optional(),
  response_template: z.string().optional(),
  // Pain fields
  symptom: z.string().optional(),
  diagnosis: z.string().optional(),
  recommendation: z.string().optional(),
});

export async function addManualChunkAction(
  _prev: IngestState,
  formData: FormData,
): Promise<IngestState> {
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  let embedding: number[];
  try {
    [embedding] = await embedTexts([parsed.data.content]);
  } catch (e) {
    console.error("[addManualChunk] embed failed:", e);
    return { error: "No se pudo generar el embedding" };
  }

  const supabase = await createClient();
  const base = {
    tenant_id: parsed.data.tenant_id,
    source: parsed.data.source || "manual",
    content: parsed.data.content,
    embedding: embedding as unknown as string,
  };

  const { error } =
    parsed.data.type === "documents"
      ? await supabase.from("documents").insert({
          ...base,
          question: parsed.data.question || null,
          answer: parsed.data.answer || null,
          response_template: parsed.data.response_template || null,
        })
      : await supabase.from("pain").insert({
          ...base,
          symptom: parsed.data.symptom || null,
          diagnosis: parsed.data.diagnosis || null,
          recommendation: parsed.data.recommendation || null,
        });

  if (error) return { error: error.message };

  fireAndForgetVoiceKbSync(parsed.data.tenant_id);
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, chunksAdded: 1 };
}

const updateSchema = manualSchema.extend({ id: z.coerce.number() });

export async function updateChunkAction(
  _prev: IngestState,
  formData: FormData,
): Promise<IngestState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  // Re-embed when content changes
  let embedding: number[];
  try {
    [embedding] = await embedTexts([parsed.data.content]);
  } catch (e) {
    console.error("[updateChunk] embed failed:", e);
    return { error: "No se pudo regenerar el embedding" };
  }

  const supabase = await createClient();
  const base = {
    content: parsed.data.content,
    source: parsed.data.source || "manual",
    embedding: embedding as unknown as string,
  };

  const { error } =
    parsed.data.type === "documents"
      ? await supabase
          .from("documents")
          .update({
            ...base,
            question: parsed.data.question || null,
            answer: parsed.data.answer || null,
            response_template: parsed.data.response_template || null,
          })
          .eq("id", parsed.data.id)
          .eq("tenant_id", parsed.data.tenant_id)
      : await supabase
          .from("pain")
          .update({
            ...base,
            symptom: parsed.data.symptom || null,
            diagnosis: parsed.data.diagnosis || null,
            recommendation: parsed.data.recommendation || null,
          })
          .eq("id", parsed.data.id)
          .eq("tenant_id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  fireAndForgetVoiceKbSync(parsed.data.tenant_id);
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteChunkAction(
  tenantId: string,
  type: KnowledgeType,
  id: number,
): Promise<IngestState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } =
    type === "documents"
      ? await supabase.from("documents").delete().eq("id", id).eq("tenant_id", tenantId)
      : await supabase.from("pain").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  fireAndForgetVoiceKbSync(tenantId);
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteSourceAction(
  tenantId: string,
  type: KnowledgeType,
  source: string,
): Promise<IngestState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const table = type === "documents" ? "documents" : "pain";

  const { error: delErr } =
    type === "documents"
      ? await supabase.from("documents").delete().eq("source", source).eq("tenant_id", tenantId)
      : await supabase.from("pain").delete().eq("source", source).eq("tenant_id", tenantId);

  if (delErr) return { error: delErr.message };

  // Also remove from record_manager so the same file can be re-ingested
  await supabase
    .from("record_manager")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source", source);

  // Suppress unused warning in non-strict modes
  void table;

  fireAndForgetVoiceKbSync(tenantId);
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
