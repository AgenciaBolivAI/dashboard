import { createClient } from "@/lib/supabase/server";

export type AiRecommendation = {
  id: string;
  kind: "insight" | "next_action" | "task_suggestion" | "risk" | "opportunity";
  title: string;
  body: string | null;
  action_type: string | null;
  action_payload: Record<string, unknown>;
  related_type: string | null;
  related_id: string | null;
  status: "new" | "done" | "dismissed";
  source: string;
  created_at: string;
};

/**
 * Active (status='new') AI recommendations for a tenant — rendered as the
 * insight / next-best-action cards on the personalized home. Any agent or the
 * assistant writes here (via the service role); this just reads the live ones.
 */
export async function listRecommendations(
  tenantId: string,
  limit = 6,
): Promise<AiRecommendation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_recommendations")
    .select(
      "id, kind, title, body, action_type, action_payload, related_type, related_id, status, source, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AiRecommendation[];
}
