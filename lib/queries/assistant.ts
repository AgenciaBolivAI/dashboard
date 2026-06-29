import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ChatMsg } from "@/lib/analytics-tools/run";

/**
 * Conversation persistence for the "Ask your business" assistant (Phase 0c).
 * Threads are PER (tenant, user): each member has their own private history,
 * loaded on page mount so context carries across sessions. Writes go through
 * the service client from the server action (assistant_messages is RLS-locked
 * to per-user SELECT + service-role writes).
 */

// supabase-js types are generated from the live schema; assistant_messages may
// not be in the local types yet, so use a loosely-typed view of the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };

/** The most recent `limit` messages for ONE chat session, oldest → newest. */
export async function getAssistantHistory(
  tenantId: string,
  userId: string,
  sessionId: string,
  limit = 30,
): Promise<ChatMsg[]> {
  const svc = createServiceClient() as unknown as AnyClient;
  // Newest-first by the (tenant, user, session, created_at) index, then re-order
  // to chronological so the chat renders top→bottom.
  const { data, error } = await svc
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const rows = (data as { role: string; content: string }[]).reverse();
  return rows
    .filter((r) => (r.role === "user" || r.role === "assistant") && typeof r.content === "string")
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export type AssistantSession = {
  session_id: string;
  title: string;
  last_at: string;
  count: number;
};

/**
 * The user's chat sessions for the tenant (most recent first). Title = the
 * session's first user message. Aggregated in JS from a bounded recent window
 * (assistant_messages isn't in the generated types, so no SQL GROUP BY here).
 */
export async function listAssistantSessions(
  tenantId: string,
  userId: string,
): Promise<AssistantSession[]> {
  const svc = createServiceClient() as unknown as AnyClient;
  const { data, error } = await svc
    .from("assistant_messages")
    .select("session_id, role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error || !data) return [];
  const rows = data as { session_id: string; role: string; content: string; created_at: string }[];
  const map = new Map<string, AssistantSession>();
  for (const r of rows) {
    if (!r.session_id) continue;
    let s = map.get(r.session_id);
    if (!s) {
      // First row per session (DESC) is the most recent → its created_at is last_at.
      s = { session_id: r.session_id, title: "", last_at: r.created_at, count: 0 };
      map.set(r.session_id, s);
    }
    s.count += 1;
    // DESC iteration keeps overwriting → title ends as the EARLIEST user message.
    if (r.role === "user" && typeof r.content === "string" && r.content.trim()) {
      s.title = r.content.trim().slice(0, 80);
    }
  }
  return [...map.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
}

/**
 * Persist one Q→A exchange into a session. Only the latest user turn + the
 * produced answer are stored each call, so the client re-sending the full
 * running history never creates duplicates.
 */
export async function persistAssistantTurn(opts: {
  tenantId: string;
  userId: string;
  sessionId: string;
  question: string;
  answer: string;
  toolsUsed?: string[];
}): Promise<void> {
  const svc = createServiceClient() as unknown as AnyClient;
  await svc.from("assistant_messages").insert([
    {
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      session_id: opts.sessionId,
      role: "user",
      content: opts.question.slice(0, 4000),
      tools_used: [],
    },
    {
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      session_id: opts.sessionId,
      role: "assistant",
      content: opts.answer.slice(0, 8000),
      tools_used: opts.toolsUsed ?? [],
    },
  ]);
}

/** Delete ONE chat session (the per-row delete control). Per-user + tenant-scoped. */
export async function deleteAssistantSession(
  tenantId: string,
  userId: string,
  sessionId: string,
): Promise<void> {
  const svc = createServiceClient() as unknown as AnyClient;
  await svc
    .from("assistant_messages")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("session_id", sessionId);
}
