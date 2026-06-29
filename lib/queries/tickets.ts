import { createClient } from "@/lib/supabase/server";

export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type Ticket = {
  id: string;
  channel: string;
  status: string;
  ticket_status: TicketStatus | null;
  priority: TicketPriority | null;
  assignee_user_id: string | null;
  sla_due_at: string | null;
  last_message_at: string | null;
  created_at: string;
  customer_name: string | null;
  customer_contact: string | null;
};

export type TicketFilters = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeUserId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

function sanitize(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

/** Paginated tickets (conversations flagged is_ticket) + total for the filters. */
export async function listTickets(
  tenantId: string,
  opts: TicketFilters = {},
): Promise<{ rows: Ticket[]; total: number }> {
  const supabase = await createClient();
  const term = opts.search ? sanitize(opts.search) : "";
  const userJoin = term
    ? "users:user_id!inner ( name, whatsapp_number, channel_user_id )"
    : "users:user_id ( name, whatsapp_number, channel_user_id )";

  let q = supabase
    .from("conversations")
    .select(
      `id, channel, status, ticket_status, priority, assignee_user_id, sla_due_at, last_message_at, created_at, ${userJoin}`,
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .eq("is_ticket", true)
    // Most-recent activity first. In the "All" view this keeps stale resolved/
    // closed tickets from floating above active work (the prior sla_due_at-asc
    // primary surfaced long-overdue *terminal* tickets at the top). SLA is the
    // tiebreak so same-recency tickets still order by urgency.
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("sla_due_at", { ascending: true, nullsFirst: false });

  if (opts.status) q = q.eq("ticket_status", opts.status);
  if (opts.priority) q = q.eq("priority", opts.priority);
  if (opts.assigneeUserId) q = q.eq("assignee_user_id", opts.assigneeUserId);
  if (term) {
    q = q.or(
      `name.ilike.*${term}*,whatsapp_number.ilike.*${term}*,channel_user_id.ilike.*${term}*`,
      { referencedTable: "users" },
    );
  }
  if (opts.offset != null) q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  else q = q.limit(opts.limit ?? 100);

  const { data, count } = await q;
  const rows = ((data ?? []) as unknown as Array<{
    id: string;
    channel: string;
    status: string;
    ticket_status: TicketStatus | null;
    priority: TicketPriority | null;
    assignee_user_id: string | null;
    sla_due_at: string | null;
    last_message_at: string | null;
    created_at: string;
    users: { name: string | null; whatsapp_number: string | null; channel_user_id: string | null } | null;
  }>).map((r) => ({
    id: r.id,
    channel: r.channel,
    status: r.status,
    ticket_status: r.ticket_status,
    priority: r.priority,
    assignee_user_id: r.assignee_user_id,
    sla_due_at: r.sla_due_at,
    last_message_at: r.last_message_at,
    created_at: r.created_at,
    customer_name: r.users?.name ?? null,
    customer_contact: r.users?.whatsapp_number ?? r.users?.channel_user_id ?? null,
  }));
  return { rows, total: count ?? 0 };
}
