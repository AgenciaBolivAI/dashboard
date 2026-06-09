"use server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  createKnowledgeTextDoc,
  deleteKnowledgeDoc,
  attachKnowledgeDocToAgent,
  ElevenLabsError,
} from "@/lib/elevenlabs";

/**
 * Build a single aggregated knowledge text doc from a tenant's
 * documents + pain rows. The format is designed to read well to an LLM:
 * one section per source, Q&A on top.
 */
async function buildKnowledgeText(tenantId: string): Promise<string> {
  const supabase = createServiceClient();
  const [docsRes, painRes, tenantRes] = await Promise.all([
    supabase
      .from("documents")
      .select("question, answer, response_template, content, source")
      .eq("tenant_id", tenantId)
      .order("id"),
    supabase
      .from("pain")
      .select("symptom, diagnosis, recommendation, content, source")
      .eq("tenant_id", tenantId)
      .order("id"),
    supabase
      .from("tenants")
      .select("name, industry")
      .eq("id", tenantId)
      .maybeSingle(),
  ]);

  const tenant = tenantRes.data as { name: string; industry: string | null } | null;
  const docs = (docsRes.data ?? []) as Array<{
    question: string | null;
    answer: string | null;
    response_template: string | null;
    content: string;
    source: string | null;
  }>;
  const pain = (painRes.data ?? []) as Array<{
    symptom: string | null;
    diagnosis: string | null;
    recommendation: string | null;
    content: string;
    source: string | null;
  }>;

  const lines: string[] = [];
  lines.push(`# Knowledge base for ${tenant?.name ?? "this business"}`);
  if (tenant?.industry) lines.push(`Industry: ${tenant.industry}`);
  lines.push("");

  if (docs.length > 0) {
    lines.push("## Frequently asked questions");
    for (const d of docs) {
      if (d.question || d.answer) {
        if (d.question) lines.push(`Q: ${d.question}`);
        if (d.answer) lines.push(`A: ${d.answer}`);
        if (d.response_template) lines.push(`Suggested phrasing: ${d.response_template}`);
      } else {
        lines.push(d.content);
      }
      if (d.source) lines.push(`(source: ${d.source})`);
      lines.push("");
    }
  }

  if (pain.length > 0) {
    lines.push("## Customer pain points and resolutions");
    for (const p of pain) {
      if (p.symptom) lines.push(`Symptom: ${p.symptom}`);
      if (p.diagnosis) lines.push(`Likely cause: ${p.diagnosis}`);
      if (p.recommendation) lines.push(`Recommendation: ${p.recommendation}`);
      if (!p.symptom && !p.diagnosis && !p.recommendation) lines.push(p.content);
      if (p.source) lines.push(`(source: ${p.source})`);
      lines.push("");
    }
  }

  if (docs.length === 0 && pain.length === 0) {
    lines.push("No knowledge entries yet. Tenant should add FAQs and customer pain points.");
  }

  return lines.join("\n").trim();
}

export type KbSyncResult = {
  ok: boolean;
  error?: string;
  doc_id?: string;
  text_length?: number;
};

/**
 * Sync a tenant's BolivAI knowledge → ElevenLabs KB → agent attachment.
 *
 * Internal: not a "use server" action that takes FormData — this is
 * called by both the manual sync action AND the auto-sync hook fired
 * after every knowledge mutation.
 *
 * Strategy: create-new-then-delete-old. Brief window of overlap is
 * acceptable; the alternative (delete-then-create) would leave the
 * agent with no KB if the create fails.
 */
export async function performVoiceKbSync(tenantId: string): Promise<KbSyncResult> {
  const supabase = createServiceClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, elevenlabs_agent_id, voice_enabled, voice_kb_doc_id")
    .eq("id", tenantId)
    .maybeSingle();
  const t = tenant as
    | {
        name: string;
        elevenlabs_agent_id: string | null;
        voice_enabled: boolean;
        voice_kb_doc_id: string | null;
      }
    | null;

  if (!t || !t.elevenlabs_agent_id) {
    return { ok: false, error: "Voice agent not provisioned" };
  }

  const text = await buildKnowledgeText(tenantId);
  if (text.length === 0) {
    return { ok: false, error: "Empty knowledge text — nothing to sync" };
  }

  let newDoc;
  try {
    newDoc = await createKnowledgeTextDoc(
      `${t.name} — Knowledge`,
      text,
    );
  } catch (e) {
    const msg = e instanceof ElevenLabsError ? e.detail : e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ElevenLabs createKnowledgeTextDoc failed: ${msg.slice(0, 200)}` };
  }

  try {
    await attachKnowledgeDocToAgent(t.elevenlabs_agent_id, newDoc);
  } catch (e) {
    // Roll back the new doc — we don't want orphans on ElevenLabs
    await deleteKnowledgeDoc(newDoc.id).catch(() => {});
    const msg = e instanceof ElevenLabsError ? e.detail : e instanceof Error ? e.message : String(e);
    return { ok: false, error: `ElevenLabs attach failed: ${msg.slice(0, 200)}` };
  }

  // Delete the old doc now that the agent points at the new one
  if (t.voice_kb_doc_id) {
    await deleteKnowledgeDoc(t.voice_kb_doc_id).catch((e) => {
      console.warn("[voice-kb] old doc cleanup failed", e);
    });
  }

  const { error: dbErr } = await supabase
    .from("tenants")
    .update({
      voice_kb_doc_id: newDoc.id,
      voice_kb_synced_at: new Date().toISOString(),
    })
    .eq("id", tenantId);
  if (dbErr) {
    // The agent is fine, the DB just didn't update — log and surface
    console.error("[voice-kb] DB update after sync failed", dbErr);
    return { ok: false, error: `Sync succeeded but DB write failed: ${dbErr.message}` };
  }

  return { ok: true, doc_id: newDoc.id, text_length: text.length };
}

/**
 * Fire-and-forget helper for use after a knowledge insert/update/delete.
 * Returns immediately; the sync happens in the background.
 *
 * Errors are logged but not surfaced — knowledge mutations should never
 * fail because the voice sync is flaky.
 */
export function fireAndForgetVoiceKbSync(tenantId: string): void {
  void (async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("tenants")
      .select("voice_enabled, elevenlabs_agent_id")
      .eq("id", tenantId)
      .maybeSingle();
    const t = data as { voice_enabled: boolean; elevenlabs_agent_id: string | null } | null;
    if (!t || !t.voice_enabled || !t.elevenlabs_agent_id) return;
    try {
      const result = await performVoiceKbSync(tenantId);
      if (!result.ok) {
        console.warn(`[voice-kb auto-sync] ${tenantId}: ${result.error}`);
      }
    } catch (e) {
      console.error("[voice-kb auto-sync] threw", e);
    }
  })();
}
