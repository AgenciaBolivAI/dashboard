/**
 * Analytics tools for the tenant "Ask your business" assistant.
 *
 * Each tool is a small, READ-ONLY, tenant-scoped query. The tenant id is
 * always supplied by the server action from the authenticated session
 * (`runAssistant`) — it is NEVER a tool parameter, so the model cannot be
 * prompt-injected into another tenant's data. Mirrors the lib/voice-tools
 * registry shape but emits OpenAI function-calling specs.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { getTenantOverviewMetrics } from "@/lib/queries/metrics";
import { getTenantRecentTransactions } from "@/lib/queries/admin-tenant-pnl";
import { getAimaStats } from "@/lib/queries/aima";
import { getBalanceWithService } from "@/lib/billing/credits";

// supabase-js is typed to known tables; several analytics helpers query by a
// dynamic table name, so we use a loosely-typed view of the same client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };
function svcAny(): AnyClient {
  return createServiceClient() as unknown as AnyClient;
}

export type Win = "today" | "24h" | "7d" | "30d" | "90d" | "month" | "all";
const WINDOWS: Win[] = ["today", "24h", "7d", "30d", "90d", "month", "all"];
function win(v: unknown, fallback: Win = "7d"): Win {
  return WINDOWS.includes(v as Win) ? (v as Win) : fallback;
}

/** UTC start timestamp for a window. */
function startOf(w: Win): Date {
  const now = new Date();
  const d = new Date(now);
  switch (w) {
    case "today":
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case "24h":
      return new Date(now.getTime() - 24 * 3600_000);
    case "7d":
      return new Date(now.getTime() - 7 * 86400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86400_000);
    case "90d":
      return new Date(now.getTime() - 90 * 86400_000);
    case "month":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case "all":
      return new Date("1970-01-01T00:00:00Z");
  }
}

const windowParam = {
  type: "string",
  enum: WINDOWS,
  description: "Time window. today=since midnight UTC, 24h=last 24 hours, month=calendar month to date.",
};

type Handler = (args: Record<string, unknown>, tenantId: string) => Promise<unknown>;
type Tool = {
  description: string;
  parameters: Record<string, unknown>;
  run: Handler;
};

/** Count + group rows fetched from a tenant-scoped table over a time window. */
async function groupCount(
  table: string,
  tenantId: string,
  tsColumn: string,
  startTs: Date,
  groupCols: string[],
): Promise<{ total: number; rows: Record<string, unknown>[] }> {
  const { data } = await svcAny()
    .from(table)
    .select(groupCols.join(", "))
    .eq("tenant_id", tenantId)
    .gte(tsColumn, startTs.toISOString());
  const rows = (data ?? []) as Record<string, unknown>[];
  return { total: rows.length, rows };
}

function tally(rows: Record<string, unknown>[], col: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[col] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const TOOLS: Record<string, Tool> = {
  get_overview: {
    description:
      "Month-to-date headline counters for the business: conversations, leads, confirmed reservations, and WhatsApp messages.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => getTenantOverviewMetrics(tenantId),
  },

  get_credit_balance: {
    description:
      "Current credit balance: available, reserved, lifetime spent, and whether the account is low or at zero.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => (await getBalanceWithService(tenantId)) ?? { balance_credits: 0 },
  },

  get_spend_by_action: {
    description:
      "Credits spent broken down by what they were spent on (action_key), over a window. Use action_key 'whatsapp.agent_turn' for WhatsApp-only spend, 'voice.*' for calls, 'content.*' for CCAVAI, 'marketing.*' for AIMA/leads.",
    parameters: { type: "object", properties: { window: windowParam }, required: ["window"] },
    run: async (args, tenantId) => {
      const svc = createServiceClient();
      const startTs = startOf(win(args.window));
      const { data } = await svc
        .from("credit_transactions")
        .select("action_key, credits_delta")
        .eq("tenant_id", tenantId)
        .in("type", ["usage", "release"])
        .gte("created_at", startTs.toISOString())
        .not("action_key", "is", null);
      const byKey: Record<string, number> = {};
      let total = 0;
      for (const r of (data ?? []) as { action_key: string | null; credits_delta: number }[]) {
        if (!r.action_key) continue;
        const spent = -r.credits_delta;
        byKey[r.action_key] = (byKey[r.action_key] ?? 0) + spent;
        total += spent;
      }
      return { window: win(args.window), total_credits_spent: total, by_action_key: byKey };
    },
  },

  get_reservations: {
    description:
      "Reservation counts over a window, broken down by status (confirmed/cancelled/completed/no_show). Set date_field='created_at' for 'reservations MADE in period' (default) or 'start_at' for 'appointments HAPPENING in period' (use for no-shows).",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        date_field: { type: "string", enum: ["created_at", "start_at"], description: "Which timestamp to filter on." },
        status: {
          type: "string",
          enum: ["confirmed", "cancelled", "completed", "no_show"],
          description: "Optional: restrict to one status.",
        },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window);
      const tsCol = args.date_field === "start_at" ? "start_at" : "created_at";
      const { rows } = await groupCount("reservations", tenantId, tsCol, startOf(w), ["status", tsCol]);
      const filtered = args.status ? rows.filter((r) => r.status === args.status) : rows;
      return {
        window: w,
        date_field: tsCol,
        total: filtered.length,
        by_status: tally(filtered, "status"),
      };
    },
  },

  get_leads: {
    description: "Lead counts over a window (by when the lead was created), broken down by status and source.",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        status: { type: "string", description: "Optional status filter (e.g. new, contacted, converted, lost)." },
        source: { type: "string", description: "Optional source filter (e.g. aima, whatsapp, voice, manual)." },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window);
      const { rows } = await groupCount("leads", tenantId, "created_at", startOf(w), [
        "status",
        "source",
        "intent",
        "created_at",
      ]);
      let filtered = rows;
      if (args.status) filtered = filtered.filter((r) => r.status === args.status);
      if (args.source) filtered = filtered.filter((r) => r.source === args.source);
      return {
        window: w,
        total: filtered.length,
        by_status: tally(filtered, "status"),
        by_source: tally(filtered, "source"),
      };
    },
  },

  get_voice_summary: {
    description:
      "Voice call counts over a window by direction (inbound/outbound) and outcome (booked, voicemail, no_pickup, etc.), plus total minutes.",
    parameters: { type: "object", properties: { window: windowParam }, required: ["window"] },
    run: async (args, tenantId) => {
      const w = win(args.window);
      const svc = createServiceClient();
      const { data } = await svc
        .from("voice_conversations")
        .select("direction, call_outcome, duration_seconds")
        .eq("tenant_id", tenantId)
        .gte("started_at", startOf(w).toISOString());
      const rows = (data ?? []) as {
        direction: string | null;
        call_outcome: string | null;
        duration_seconds: number | null;
      }[];
      const totalMinutes = Math.round(rows.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / 60);
      return {
        window: w,
        total_calls: rows.length,
        by_direction: tally(rows as Record<string, unknown>[], "direction"),
        by_outcome: tally(rows as Record<string, unknown>[], "call_outcome"),
        total_minutes: totalMinutes,
      };
    },
  },

  get_marketing_stats: {
    description:
      "AIMA marketing/lead-generation stats over a window: leads sourced, emails sent/opened/replied, leads in Sandra's call queue, demos booked.",
    parameters: {
      type: "object",
      properties: {
        window: { type: "string", enum: ["today", "week", "month", "7d", "30d"], description: "Time window." },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const allowed = ["today", "week", "month", "7d", "30d"] as const;
      const w = (allowed.includes(args.window as never) ? args.window : "7d") as (typeof allowed)[number];
      return (await getAimaStats(tenantId, w)) ?? { note: "no marketing data" };
    },
  },

  compare_period: {
    description:
      "Compare a metric for the current window vs the immediately preceding window of equal length, with a per-day breakdown. Use this to explain WHY something went up or down (e.g. reservations last week). metric: reservations | leads | spend_credits | revenue_cents.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["reservations", "leads", "spend_credits", "revenue_cents"] },
        window: { type: "string", enum: ["today", "24h", "7d", "30d", "90d"], description: "Length of each period." },
      },
      required: ["metric", "window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window, "7d");
      const metric = String(args.metric ?? "reservations");
      const now = new Date();
      const start = startOf(w);
      const lenMs = now.getTime() - start.getTime();
      const priorStart = new Date(start.getTime() - lenMs);

      // Fetch the relevant rows once across both periods, then bucket.
      let table = "reservations", tsCol = "created_at";
      if (metric === "leads") { table = "leads"; tsCol = "created_at"; }
      if (metric === "spend_credits" || metric === "revenue_cents") { table = "credit_transactions"; tsCol = "created_at"; }

      const sel =
        table === "credit_transactions" ? "created_at, type, credits_delta" : "created_at";
      const { data } = await svcAny()
        .from(table)
        .select(sel)
        .eq("tenant_id", tenantId)
        .gte(tsCol, priorStart.toISOString());
      const rows = (data ?? []) as Record<string, unknown>[];

      const value = (r: Record<string, unknown>): number => {
        if (metric === "spend_credits")
          return r.type === "usage" || r.type === "release" ? -(r.credits_delta as number) : 0;
        if (metric === "revenue_cents") return r.type === "top_up" ? (r.credits_delta as number) : 0;
        return 1; // reservations / leads = count
      };

      let cur = 0, prior = 0;
      const daily: Record<string, number> = {};
      for (const r of rows) {
        const ts = new Date(String(r[tsCol]));
        const v = value(r);
        if (ts >= start) {
          cur += v;
          const day = ts.toISOString().slice(0, 10);
          daily[day] = (daily[day] ?? 0) + v;
        } else if (ts >= priorStart) {
          prior += v;
        }
      }
      const delta = cur - prior;
      const delta_pct = prior > 0 ? Math.round((delta / prior) * 1000) / 10 : null;
      return {
        metric,
        window: w,
        current_period: cur,
        prior_period: prior,
        delta,
        delta_pct,
        daily_current: daily,
      };
    },
  },

  get_recent_transactions: {
    description: "The most recent credit ledger entries (top-ups and usage), newest first.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many (default 10, max 30).", minimum: 1, maximum: 30 } },
    },
    run: async (args, tenantId) => {
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
      return getTenantRecentTransactions(tenantId, limit);
    },
  },
};

/** OpenAI function-calling specs for all tools. */
export function toolSpecs() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    type: "function" as const,
    function: { name, description: t.description, parameters: t.parameters },
  }));
}

/** Dispatch one tool call. tenantId comes from the session, never the model. */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  const tool = TOOLS[name];
  if (!tool) return { error: `unknown tool: ${name}` };
  try {
    return await tool.run(args, tenantId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "tool failed" };
  }
}
