import { createClient } from "@/lib/supabase/server";

export type ConversationListItem = {
  id: string;
  status: string;
  channel: string; // "whatsapp" | "instagram" | "facebook_messenger"
  hitl_taken_over: boolean;
  last_message_at: string;
  user: {
    id: string;
    name: string | null;
    whatsapp_number: string | null;
    channel_user_id: string | null;
  };
  last_message: {
    role: string;
    content: string;
    created_at: string;
  } | null;
};

export async function listConversations(
  tenantId: string,
  opts: { status?: string; channel?: string; limit?: number; offset?: number } = {},
): Promise<ConversationListItem[]> {
  const supabase = await createClient();

  let q = supabase
    .from("conversations")
    .select(
      `id, status, channel, hitl_taken_over, last_message_at,
       users:user_id ( id, name, whatsapp_number, channel_user_id )`,
    )
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false })
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);

  if (opts.status === "active") q = q.eq("status", "active").eq("hitl_taken_over", false);
  else if (opts.status === "hitl") q = q.eq("hitl_taken_over", true);
  else if (opts.status === "closed") q = q.eq("status", "closed");

  // Channel filter (orthogonal to status) — lets the inbox be sorted per channel.
  if (opts.channel) q = q.eq("channel", opts.channel);

  const { data: rows } = await q;
  if (!rows || rows.length === 0) return [];

  // Fetch latest message per conversation
  const ids = rows.map((r: { id: string }) => r.id);
  const { data: msgs } = await supabase
    .from("chat_history")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });

  const latestByConv = new Map<string, { role: string; content: string; created_at: string }>();
  for (const m of (msgs ?? []) as Array<{
    conversation_id: string;
    role: string;
    content: string;
    created_at: string;
  }>) {
    if (!latestByConv.has(m.conversation_id)) {
      latestByConv.set(m.conversation_id, {
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      });
    }
  }

  return rows.map((r) => {
    const row = r as unknown as {
      id: string;
      status: string;
      channel: string;
      hitl_taken_over: boolean;
      last_message_at: string;
      users: {
        id: string;
        name: string | null;
        whatsapp_number: string | null;
        channel_user_id: string | null;
      };
    };
    return {
      id: row.id,
      status: row.status,
      channel: row.channel,
      hitl_taken_over: row.hitl_taken_over,
      last_message_at: row.last_message_at,
      user: row.users,
      last_message: latestByConv.get(row.id) ?? null,
    };
  });
}

export type ConversationDetail = {
  id: string;
  status: string;
  channel: string;
  hitl_taken_over: boolean;
  hitl_operator_id: string | null;
  last_message_at: string;
  created_at: string;
  user: {
    id: string;
    name: string | null;
    whatsapp_number: string | null;
    channel_user_id: string | null;
    email: string | null;
  };
  messages: Array<{
    id: number;
    role: string;
    content: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
};

export async function getConversationDetail(
  tenantId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data: convo } = await supabase
    .from("conversations")
    .select(
      `id, status, channel, hitl_taken_over, hitl_operator_id, last_message_at, created_at,
       users:user_id ( id, name, whatsapp_number, channel_user_id, email )`,
    )
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!convo) return null;

  const { data: messages } = await supabase
    .from("chat_history")
    .select("id, role, content, created_at, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const c = convo as unknown as {
    id: string;
    status: string;
    channel: string;
    hitl_taken_over: boolean;
    hitl_operator_id: string | null;
    last_message_at: string;
    created_at: string;
    users: {
      id: string;
      name: string | null;
      whatsapp_number: string | null;
      channel_user_id: string | null;
      email: string | null;
    };
  };

  return {
    id: c.id,
    status: c.status,
    channel: c.channel,
    hitl_taken_over: c.hitl_taken_over,
    hitl_operator_id: c.hitl_operator_id,
    last_message_at: c.last_message_at,
    created_at: c.created_at,
    user: c.users,
    messages: (messages ?? []) as ConversationDetail["messages"],
  };
}
