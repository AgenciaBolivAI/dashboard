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

/** The most recent `limit` messages for a user's thread, oldest → newest. */
export async function getAssistantHistory(
  tenantId: string,
  userId: string,
  limit = 30,
): Promise<ChatMsg[]> {
  const svc = createServiceClient() as unknown as AnyClient;
  // Newest-first by the (tenant, user, created_at) index, then re-order to
  // chronological so the chat renders top→bottom.
  const { data, error } = await svc
    .from("assistant_messages")
    .select("role, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  const rows = (data as { role: string; content: string }[]).reverse();
  return rows
    .filter((r) => (r.role === "user" || r.role === "assistant") && typeof r.content === "string")
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

/**
 * Persist one Q→A exchange. Only the latest user turn + the produced answer are
 * stored each call (earlier turns were stored on their own calls), so the
 * client re-sending the full running history never creates duplicates.
 */
export async function persistAssistantTurn(opts: {
  tenantId: string;
  userId: string;
  question: string;
  answer: string;
  toolsUsed?: string[];
}): Promise<void> {
  const svc = createServiceClient() as unknown as AnyClient;
  await svc.from("assistant_messages").insert([
    {
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      role: "user",
      content: opts.question.slice(0, 4000),
      tools_used: [],
    },
    {
      tenant_id: opts.tenantId,
      user_id: opts.userId,
      role: "assistant",
      content: opts.answer.slice(0, 8000),
      tools_used: opts.toolsUsed ?? [],
    },
  ]);
}

/** Wipe a user's thread (the "new conversation" control). */
export async function clearAssistantHistory(tenantId: string, userId: string): Promise<void> {
  const svc = createServiceClient() as unknown as AnyClient;
  await svc.from("assistant_messages").delete().eq("tenant_id", tenantId).eq("user_id", userId);
}
