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
import { getRoleOnTenant, getUser } from "@/lib/auth";
import {
  roleSatisfies,
  LEGACY_ROLE_PERMISSIONS,
  FEATURES,
  type Permission,
  type Role,
  type PermissionSet,
} from "@/lib/permissions";
import { LEAD_STATUSES } from "@/lib/leads-types";
import { triggerCcavaiGenerationAction } from "@/lib/actions/ccavai";
import { triggerAimaScrapeAction } from "@/lib/actions/aima";
import { getReports, type ReportPeriod } from "@/lib/queries/reports";
import { getBolivBriefing } from "@/lib/queries/briefing";
import { loadTeam } from "@/lib/actions/team";
import { getMemberRoleIds, listRoles } from "@/lib/queries/roles";

// supabase-js is typed to known tables; several analytics helpers query by a
// dynamic table name, so we use a loosely-typed view of the same client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };
function svcAny(): AnyClient {
  return createServiceClient() as unknown as AnyClient;
}

// ── Team-management helpers (BOLIV team tools) ───────────────────────────────
/** How many owners the tenant has — for the last-owner guard. */
async function ownerCount(tenantId: string): Promise<number> {
  const { data } = await svcAny()
    .from("dashboard_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  return (data ?? []).length;
}

/** A member's email (for naming their personal custom role). */
async function memberEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await createServiceClient().auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * A member's current effective permission set: custom role's permissions if one
 * is assigned, else the legacy tier preset. Powers grant/revoke seeding.
 */
async function resolveMemberPermissions(
  tenantId: string,
  userId: string,
): Promise<{ role: string | null; roleId: string | null; perms: PermissionSet }> {
  const svc = svcAny();
  const { data } = await svc
    .from("dashboard_users")
    .select("role, role_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { role: string | null; role_id: string | null } | null;
  if (!row) return { role: null, roleId: null, perms: {} };
  if (row.role_id) {
    const { data: r } = await svc
      .from("roles")
      .select("permissions")
      .eq("id", row.role_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const p = (r as { permissions?: PermissionSet } | null)?.permissions;
    return { role: row.role, roleId: row.role_id, perms: p && typeof p === "object" ? p : {} };
  }
  return { role: row.role, roleId: null, perms: { ...(LEGACY_ROLE_PERMISSIONS[row.role as Role] ?? {}) } };
}

/** Apply a per-feature permission delta to a member via a personal custom role. */
async function applyMemberPermission(
  tenantId: string,
  userId: string,
  nextPerms: PermissionSet,
  existingRoleId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const svc = svcAny();
  if (existingRoleId) {
    const { error } = await svc
      .from("roles")
      .update({ permissions: nextPerms, updated_at: new Date().toISOString() })
      .eq("id", existingRoleId)
      .eq("tenant_id", tenantId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const email = await memberEmail(userId);
  const name = `Personalizado – ${email ?? userId.slice(0, 8)}`;
  const { data: created, error } = await svc
    .from("roles")
    .insert({ tenant_id: tenantId, name, permissions: nextPerms })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const roleId = (created as { id: string }).id;
  const { error: aErr } = await svc
    .from("dashboard_users")
    .update({ role_id: roleId })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  return aErr ? { ok: false, error: aErr.message } : { ok: true };
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

// ── General-purpose query engine (answers anything in the platform) ──────
// Allowlisted tenant-owned tables the generic query tool may read. Settings/
// secret tables (aima_settings, ccavai_settings, tenant_integrations, tenants)
// are intentionally excluded.
const QUERYABLE_TABLES = [
  "reservations", "leads", "users", "conversations", "voice_conversations",
  "invoices", "services", "staff", "ccavai_drafts", "ccavai_runs",
  "vira_jobs", "vira_clips", "documents", "aima_scrape_runs",
  "sandra_call_queue", "credit_transactions", "subscriptions",
] as const;
// Default time column per table (most use created_at). These don't have one.
const TIME_COL: Record<string, string> = {
  voice_conversations: "started_at",
  aima_scrape_runs: "started_at",
  ccavai_drafts: "generated_at",
  ccavai_runs: "started_at",
  sandra_call_queue: "queued_at",
};
const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is"];
// Columns never exposed to the model: secrets, our internal cost/margin, vectors,
// large blobs, and customer memory internals.
const SENSITIVE_RE =
  /token|secret|password|api_key|access_|refresh_|_micros|cost_cents|vendor_|embedding|zep_session|facts|gateway_config|image_url|subject_image|proxy|stripe_account/i;

function sanitizeRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (SENSITIVE_RE.test(k)) continue;
    out[k] = typeof v === "string" && v.length > 500 ? v.slice(0, 500) + "…" : v;
  }
  return out;
}

type Handler = (args: Record<string, unknown>, tenantId: string) => Promise<unknown>;
type Tool = {
  description: string;
  parameters: Record<string, unknown>;
  /**
   * The (feature, level) a user must hold to be OFFERED and to RUN this tool.
   * Enforced centrally in dispatchTool against the caller's role — the model is
   * never offered, and can never execute, a tool the acting user couldn't run
   * by hand. Read tools use level "read"; write tools use "edit".
   */
  permission: Permission;
  /** Write tool: previews + requires an explicit confirm before it executes. */
  mutates?: boolean;
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
  get_briefing: {
    permission: { feature: "analytics", level: "read" },
    description:
      "BOLIV's operating snapshot RIGHT NOW: conversations handled in the last 24h, leads waiting (new/uncontacted), open tasks, today's events, and pending recommendations. Use to answer 'what's my status', 'what needs my attention', 'what happened overnight', 'where do I start'.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => getBolivBriefing(tenantId, null),
  },

  get_overview: {
    permission: { feature: "analytics", level: "read" },
    description:
      "Month-to-date headline counters for the business: conversations, leads, confirmed reservations, and WhatsApp messages.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => getTenantOverviewMetrics(tenantId),
  },

  get_credit_balance: {
    permission: { feature: "billing", level: "read" },
    description:
      "Current credit balance: available, reserved, lifetime spent, and whether the account is low or at zero.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => (await getBalanceWithService(tenantId)) ?? { balance_credits: 0 },
  },

  get_pricing: {
    permission: { feature: "billing", level: "read" },
    description:
      "The CURRENT price list (credits charged per action) — LIVE from the billing system, always up to date. Use this for ANY question about how much something costs / qué cuesta / precio / tarifa. Quote prices in CREDITS ONLY (never dollars/USD). NEVER quote prices from memory or the guide — they may be outdated.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      // Platform-wide pricing (same for every tenant). Only the customer-facing
      // columns — never cost_per_unit_micros / vendor_cost (our margin).
      const svc = createServiceClient();
      const { data } = await svc
        .from("credit_pricing")
        .select("action_key, credits_per_unit, unit_label, description")
        .order("action_key");
      return { currency_note: "Prices are in credits. Quote in credits only — do not convert to USD.", prices: data ?? [] };
    },
  },

  get_spend_by_action: {
    permission: { feature: "billing", level: "read" },
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
    permission: { feature: "calendar", level: "read" },
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
    permission: { feature: "leads", level: "read" },
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
    permission: { feature: "conversations", level: "read" },
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

  get_pipeline_report: {
    permission: { feature: "reports", level: "read" },
    description:
      "Sales PIPELINE snapshot over a window (7d/30d/90d/all): total leads, conversion rate (%), the funnel by stage, current OPEN pipeline value, WEIGHTED forecast (Σ value×win-probability) and WON value. Use for 'how's my pipeline', 'what's my forecast', 'conversion rate', 'how much could I close'.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["7d", "30d", "90d", "all"], description: "Time window. Default 30d." },
      },
    },
    run: async (args, tenantId) => {
      const svc = createServiceClient();
      const { data: tRow } = await svc
        .from("tenants")
        .select("invoice_default_currency")
        .eq("id", tenantId)
        .maybeSingle();
      const currency = (tRow as { invoice_default_currency?: string } | null)?.invoice_default_currency ?? "USD";
      const period = (["7d", "30d", "90d", "all"].includes(String(args.period))
        ? String(args.period)
        : "30d") as ReportPeriod;
      const r = await getReports(tenantId, period, currency);
      // Trim the daily revenue series — keep the headline figures for the model.
      return {
        period: r.period,
        currency: r.currency,
        total_leads: r.totalLeads,
        conversion_rate_pct: r.conversionRatePct,
        funnel: r.funnel,
        open_pipeline_cents: r.openPipelineCents,
        weighted_forecast_cents: r.weightedForecastCents,
        won_value_cents: r.wonValueCents,
        pipeline_by_stage: r.pipelineByStage,
        revenue_total_cents: r.revenueTotalCents,
      };
    },
  },

  get_marketing_stats: {
    permission: { feature: "marketing", level: "read" },
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
    permission: { feature: "analytics", level: "read" },
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
        table === "credit_transactions" ? "created_at, type, credits_delta, metadata" : "created_at";
      const { data } = await svcAny()
        .from(table)
        .select(sel)
        .eq("tenant_id", tenantId)
        .gte(tsCol, priorStart.toISOString());
      const rows = (data ?? []) as Record<string, unknown>[];

      const value = (r: Record<string, unknown>): number => {
        if (metric === "spend_credits")
          return r.type === "usage" || r.type === "release" ? -(r.credits_delta as number) : 0;
        if (metric === "revenue_cents")
          // Real revenue = metadata.paid_cents; credits_delta is a credit count.
          return r.type === "top_up"
            ? Number((r.metadata as Record<string, unknown> | null | undefined)?.paid_cents) || 0
            : 0;
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

  list_conversations: {
    permission: { feature: "conversations", level: "read" },
    description:
      "List recent conversations WITH the customer's name + phone, status and last activity. Use for 'with whom', 'who did I talk to', 'which conversations' — anything needing names, not just a count.",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        limit: { type: "integer", minimum: 1, maximum: 25, description: "How many (default 15)." },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window, "30d");
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 15));
      const { data: convos } = await svcAny()
        .from("conversations")
        .select("user_id, status, last_message_at, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOf(w).toISOString())
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      const rows = (convos ?? []) as {
        user_id: string | null;
        status: string | null;
        last_message_at: string | null;
        created_at: string | null;
      }[];
      const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
      const umap = new Map<string, { name: string | null; whatsapp_number: string | null }>();
      if (ids.length) {
        const { data: users } = await svcAny()
          .from("users")
          .select("id, name, whatsapp_number")
          .eq("tenant_id", tenantId)
          .in("id", ids);
        for (const u of (users ?? []) as { id: string; name: string | null; whatsapp_number: string | null }[]) {
          umap.set(u.id, { name: u.name, whatsapp_number: u.whatsapp_number });
        }
      }
      return {
        window: w,
        count: rows.length,
        conversations: rows.map((r) => ({
          user_id: r.user_id, // needed to act on the customer (e.g. mark VIP)
          contact: (r.user_id && umap.get(r.user_id)?.name) || "—",
          phone: (r.user_id && umap.get(r.user_id)?.whatsapp_number) || null,
          status: r.status,
          last_activity: r.last_message_at,
        })),
      };
    },
  },

  list_customers: {
    permission: { feature: "customers", level: "read" },
    description:
      "List customers (contacts) with name, phone and email. Optionally filter to those acquired within a window. Use for 'who are my customers', 'list my clients'.",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many (default 20)." },
      },
    },
    run: async (args, tenantId) => {
      const w = win(args.window, "all");
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const { data } = await svcAny()
        .from("users")
        .select("id, name, whatsapp_number, email, is_vip, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOf(w).toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);
      return { window: w, count: (data ?? []).length, customers: data ?? [] };
    },
  },

  list_leads_detail: {
    permission: { feature: "leads", level: "read" },
    description:
      "List individual leads with name, phone, status, intent and source over a window. Use for 'which leads', 'who are my new leads', not just counts.",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        status: { type: "string", description: "Optional status filter (new, contacted, converted, lost)." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many (default 20)." },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window, "30d");
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      let q = svcAny()
        .from("leads")
        .select("id, name, whatsapp_number, email, status, intent, source, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOf(w).toISOString());
      if (args.status) q = q.eq("status", args.status);
      const { data } = await q.order("created_at", { ascending: false }).limit(limit);
      return { window: w, count: (data ?? []).length, leads: data ?? [] };
    },
  },

  list_reservations_detail: {
    permission: { feature: "calendar", level: "read" },
    description:
      "List individual reservations with customer name, phone, status and time over a window. Use for 'which appointments', 'who has a booking', not just counts.",
    parameters: {
      type: "object",
      properties: {
        window: windowParam,
        date_field: { type: "string", enum: ["created_at", "start_at"], description: "created_at = made in period (default); start_at = happening in period." },
        status: { type: "string", enum: ["confirmed", "cancelled", "completed", "no_show"], description: "Optional status filter." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many (default 20)." },
      },
      required: ["window"],
    },
    run: async (args, tenantId) => {
      const w = win(args.window, "30d");
      const tsCol = args.date_field === "start_at" ? "start_at" : "created_at";
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      let q = svcAny()
        .from("reservations")
        .select("id, customer_name, customer_phone, status, start_at, service_id, created_at")
        .eq("tenant_id", tenantId)
        .gte(tsCol, startOf(w).toISOString());
      if (args.status) q = q.eq("status", args.status);
      const { data } = await q.order(tsCol, { ascending: false }).limit(limit);
      return { window: w, date_field: tsCol, count: (data ?? []).length, reservations: data ?? [] };
    },
  },

  get_recent_transactions: {
    permission: { feature: "billing", level: "read" },
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

  query_business_data: {
    permission: { feature: "analytics", level: "read" },
    description:
      "General-purpose READ-ONLY query over the business's own data — the fallback for ANY data question no specific tool covers. " +
      "Tables: reservations, leads, users (customers), conversations, voice_conversations, invoices, services, staff, " +
      "ccavai_drafts (social content), ccavai_runs, vira_jobs (video shorts), vira_clips, documents (knowledge base), " +
      "aima_scrape_runs, sandra_call_queue, credit_transactions, subscriptions. " +
      "mode 'count' returns a number; 'list' returns rows. Optionally filter (column/op/value), restrict to a time " +
      "window, group_by a column for a breakdown, or order_by. To discover a table's columns, call it with mode:list limit:1.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", enum: [...QUERYABLE_TABLES] },
        mode: { type: "string", enum: ["count", "list"], description: "count = how many; list = the rows. Default list." },
        filters: {
          type: "array",
          description: "Optional filters, all ANDed together.",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: FILTER_OPS },
              value: {},
            },
            required: ["column", "op", "value"],
          },
        },
        window: windowParam,
        group_by: { type: "string", description: "Optional column to group counts by (returns {value: count})." },
        order_by: { type: "string", description: "Optional column to sort by, descending." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Rows for list mode (default 20)." },
      },
      required: ["table"],
    },
    run: async (args, tenantId) => {
      const table = String(args.table);
      if (!(QUERYABLE_TABLES as readonly string[]).includes(table)) {
        return { error: `table not allowed: ${table}` };
      }
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const timeCol = TIME_COL[table] ?? "created_at";
      const wantCount = args.mode === "count";
      const groupBy =
        typeof args.group_by === "string" && !SENSITIVE_RE.test(args.group_by) ? args.group_by : null;

      // tenant_id is forced below — a model-supplied tenant_id filter could only
      // narrow (AND), never widen to another tenant.
      let q = svcAny()
        .from(table)
        .select(groupBy ?? "*", wantCount && !groupBy ? { count: "exact", head: true } : undefined)
        .eq("tenant_id", tenantId);
      if (args.window) q = q.gte(timeCol, startOf(win(args.window, "all")).toISOString());
      const filters = (Array.isArray(args.filters) ? args.filters : []) as {
        column?: string;
        op?: string;
        value?: unknown;
      }[];
      for (const f of filters) {
        if (!f || typeof f.column !== "string" || !FILTER_OPS.includes(String(f.op)) || SENSITIVE_RE.test(f.column))
          continue;
        const c = f.column, v = f.value;
        switch (f.op) {
          case "eq": q = q.eq(c, v); break;
          case "neq": q = q.neq(c, v); break;
          case "gt": q = q.gt(c, v); break;
          case "gte": q = q.gte(c, v); break;
          case "lt": q = q.lt(c, v); break;
          case "lte": q = q.lte(c, v); break;
          case "like": q = q.like(c, String(v)); break;
          case "ilike": q = q.ilike(c, String(v)); break;
          case "is": q = q.is(c, v); break;
        }
      }

      if (groupBy) {
        const { data } = await q.limit(5000);
        const rows = (data ?? []) as Record<string, unknown>[];
        const by: Record<string, number> = {};
        for (const r of rows) {
          const k = String(r[groupBy] ?? "null");
          by[k] = (by[k] ?? 0) + 1;
        }
        return { table, group_by: groupBy, total: rows.length, by, capped: rows.length >= 5000 };
      }
      if (wantCount) {
        const { count } = await q;
        return { table, count: count ?? 0 };
      }
      const orderBy =
        typeof args.order_by === "string" && !SENSITIVE_RE.test(args.order_by) ? args.order_by : timeCol;
      const { data } = await q.order(orderBy, { ascending: false, nullsFirst: false }).limit(limit);
      const rows = ((data ?? []) as Record<string, unknown>[]).map(sanitizeRow);
      return { table, count: rows.length, rows };
    },
  },

  search_available_slots: {
    permission: { feature: "calendar", level: "read" },
    description:
      "Find open appointment slots for a date + service (read-only). Needed before rescheduling: get the reservation's service_id + duration_minutes (via query_business_data on reservations), then call this for the desired date to pick a new_slot_id.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date YYYY-MM-DD (in the business timezone)." },
        duration_minutes: { type: "integer", minimum: 5, maximum: 480 },
        service_id: { type: "string", description: "Service UUID (from the reservation)." },
      },
      required: ["date", "duration_minutes", "service_id"],
    },
    run: async (args, tenantId) => {
      const svc = createServiceClient();
      const { data, error } = await svc.rpc("search_slots_day", {
        p_tenant_id: tenantId,
        p_date: String(args.date),
        p_duration_min: Number(args.duration_minutes),
        p_service_id: String(args.service_id),
      });
      if (error) return { error: error.message };
      const rows = (data ?? []) as { slot_id: string; start_time: string; staff_name: string }[];
      return { date: args.date, count: rows.length, slots: rows.slice(0, 20) };
    },
  },

  // ── Write actions ───────────────────────────────────────────────────────
  // Each declares permission level "edit" + mutates:true. The permission gate
  // is enforced ONCE in dispatchTool against the caller's role (the model never
  // supplies the role); on top of that, confirm:true is required to execute —
  // with confirm absent/false they only return a preview (no mutation), the
  // hard safety gate. The model must identify the exact target + get the user's
  // explicit confirmation before passing confirm:true.

  cancel_reservation: {
    permission: { feature: "calendar", level: "edit" },
    mutates: true,
    description:
      "Cancel a booking/reservation by id. DESTRUCTIVE: it notifies the customer by email. First identify the exact reservation (list_reservations_detail / query_business_data), show it to the user, and get their explicit confirmation; only then call again with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "The reservation UUID." },
        reason: { type: "string", description: "Optional cancellation reason." },
        confirm: { type: "boolean", description: "Set true ONLY after the user has explicitly confirmed this exact cancellation." },
      },
      required: ["reservation_id"],
    },
    run: async (args, tenantId) => {
      const rid = String(args.reservation_id || "");
      const svc = createServiceClient();
      const { data: own } = await svc
        .from("reservations")
        .select("id, customer_name, start_at, status")
        .eq("id", rid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { customer_name: string | null; start_at: string | null; status: string | null } | null;
      if (!row) return { error: "Reserva no encontrada para este negocio." };
      if (row.status === "cancelled") return { error: "Esa reserva ya está cancelada." };
      if (args.confirm !== true) {
        return {
          requires_confirmation: true,
          summary: `Cancelar la reserva de ${row.customer_name ?? "—"} (${row.start_at}). Esto NOTIFICA al cliente por email. Pide confirmación antes de ejecutar.`,
        };
      }
      const { error } = await svc.rpc("cancel_reservation", {
        p_reservation_id: rid,
        p_reason: typeof args.reason === "string" && args.reason ? args.reason : undefined,
      });
      if (error) return { error: error.message };
      return { ok: true, cancelled: rid, customer: row.customer_name };
    },
  },

  update_lead_status: {
    permission: { feature: "leads", level: "edit" },
    mutates: true,
    description:
      `Change a lead's status (one of: ${LEAD_STATUSES.join(", ")}). Identify the lead and confirm with the user, then call with confirm:true.`,
    parameters: {
      type: "object",
      properties: {
        lead_id: { type: "string", description: "The lead UUID." },
        status: { type: "string", enum: [...LEAD_STATUSES] },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["lead_id", "status"],
    },
    run: async (args, tenantId) => {
      const lid = String(args.lead_id || "");
      const status = String(args.status || "");
      if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
        return { error: `Estado inválido. Opciones: ${LEAD_STATUSES.join(", ")}` };
      }
      const svc = createServiceClient();
      const { data: own } = await svc
        .from("leads")
        .select("id, name, status")
        .eq("id", lid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { name: string | null; status: string | null } | null;
      if (!row) return { error: "Lead no encontrado para este negocio." };
      if (args.confirm !== true) {
        return {
          requires_confirmation: true,
          summary: `Cambiar el estado de ${row.name ?? "el lead"} de "${row.status}" a "${status}". Pide confirmación.`,
        };
      }
      const { error } = await svc.from("leads").update({ status }).eq("id", lid).eq("tenant_id", tenantId);
      if (error) return { error: error.message };
      return { ok: true, lead_id: lid, status };
    },
  },

  trigger_content_generation: {
    permission: { feature: "content", level: "edit" },
    mutates: true,
    description:
      "Start a CCAVAI content-generation run now (social drafts). mode: mixed | news | brand. Non-destructive. Confirm with the user, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["mixed", "news", "brand"], description: "Content source. Default mixed." },
        confirm: { type: "boolean" },
      },
    },
    run: async (args, tenantId) => {
      const mode = ["mixed", "news", "brand"].includes(String(args.mode)) ? String(args.mode) : "mixed";
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Generar contenido nuevo (modo: ${mode}). Pide confirmación.` };
      }
      const res = await triggerCcavaiGenerationAction(tenantId, mode as "mixed" | "news" | "brand");
      if (res.error) return { error: res.error };
      return { ok: true, message: "Generación de contenido iniciada. Aparecerá en Contenido en ~1 minuto." };
    },
  },

  trigger_lead_search: {
    permission: { feature: "marketing", level: "edit" },
    mutates: true,
    description:
      "Start an AIMA lead-search run now (scrapes Google Maps for leads in the configured verticals/cities). Non-destructive. Confirm with the user, then confirm:true.",
    parameters: {
      type: "object",
      properties: { confirm: { type: "boolean" } },
    },
    run: async (args, tenantId) => {
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: "Iniciar una búsqueda de leads con AIMA ahora. Pide confirmación." };
      }
      const res = await triggerAimaScrapeAction(tenantId);
      if (res.error) return { error: res.error };
      return { ok: true, message: "Búsqueda de leads iniciada. Revisa Marketing → Corridas recientes." };
    },
  },

  reschedule_reservation: {
    permission: { feature: "calendar", level: "edit" },
    mutates: true,
    description:
      "Move a booking to a new time slot. First get the reservation (query_business_data → id, service_id, duration_minutes, start_at), then search_available_slots to pick a new_slot_id, show the new time to the user, get confirmation, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        reservation_id: { type: "string", description: "The reservation UUID." },
        new_slot_id: { type: "string", description: "The chosen slot UUID from search_available_slots." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed the new time." },
      },
      required: ["reservation_id", "new_slot_id"],
    },
    run: async (args, tenantId) => {
      const rid = String(args.reservation_id || "");
      const svc = createServiceClient();
      const { data: own } = await svc
        .from("reservations")
        .select("id, customer_name, start_at, status")
        .eq("id", rid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { customer_name: string | null; start_at: string | null; status: string | null } | null;
      if (!row) return { error: "Reserva no encontrada para este negocio." };
      if (args.confirm !== true) {
        return {
          requires_confirmation: true,
          summary: `Reagendar la reserva de ${row.customer_name ?? "—"} (actual: ${row.start_at}) al nuevo horario seleccionado. Esto notifica al cliente. Pide confirmación.`,
        };
      }
      const { error } = await svc.rpc("reschedule_reservation", {
        p_reservation_id: rid,
        p_new_slot_id: String(args.new_slot_id || ""),
        p_duration_min: undefined,
      });
      if (error) return { error: error.message };
      return { ok: true, rescheduled: rid, customer: row.customer_name };
    },
  },

  set_customer_vip: {
    permission: { feature: "customers", level: "edit" },
    mutates: true,
    description:
      "Mark a customer as VIP or remove VIP. Identify the customer (list_customers / query_business_data on users) and confirm, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "The customer (users) UUID." },
        is_vip: { type: "boolean", description: "true = VIP, false = remove VIP." },
        confirm: { type: "boolean" },
      },
      required: ["user_id", "is_vip"],
    },
    run: async (args, tenantId) => {
      const uid = String(args.user_id || "");
      const isVip = args.is_vip === true;
      const svc = createServiceClient();
      const { data: own } = await svc
        .from("users")
        .select("id, name")
        .eq("id", uid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { name: string | null } | null;
      if (!row) return { error: "Cliente no encontrado para este negocio." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Marcar a ${row.name ?? "el cliente"} como ${isVip ? "VIP" : "no VIP"}. Pide confirmación.` };
      }
      const { error } = await svc.from("users").update({ is_vip: isVip } as never).eq("id", uid).eq("tenant_id", tenantId);
      if (error) return { error: error.message };
      return { ok: true, user_id: uid, is_vip: isVip };
    },
  },

  add_customer_note: {
    permission: { feature: "customers", level: "edit" },
    mutates: true,
    description:
      "Append a private note to a customer's profile (not visible to the customer, not used by the agent). Identify the customer and confirm, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "The customer (users) UUID." },
        note: { type: "string", description: "The note text." },
        confirm: { type: "boolean" },
      },
      required: ["user_id", "note"],
    },
    run: async (args, tenantId) => {
      const uid = String(args.user_id || "");
      const note = String(args.note || "").slice(0, 1000).trim();
      if (!note) return { error: "La nota está vacía." };
      const svc = createServiceClient();
      const { data: own } = await svc
        .from("users")
        .select("id, name, tenant_notes")
        .eq("id", uid)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { name: string | null; tenant_notes: string | null } | null;
      if (!row) return { error: "Cliente no encontrado para este negocio." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Agregar nota a ${row.name ?? "el cliente"}: "${note}". Pide confirmación.` };
      }
      const merged = (row.tenant_notes ? row.tenant_notes.trim() + "\n" : "") + note;
      const { error } = await svc.from("users").update({ tenant_notes: merged } as never).eq("id", uid).eq("tenant_id", tenantId);
      if (error) return { error: error.message };
      return { ok: true, user_id: uid };
    },
  },

  remember_fact: {
    permission: { feature: "knowledge", level: "edit" },
    mutates: true,
    description:
      "Save a DURABLE fact about this business to long-term memory (tenant_facts) so you recall it in future conversations — e.g. 'the owner takes no Sunday bookings', 'prefers WhatsApp over email', 'high season is December'. Use ONLY for stable business facts worth remembering, not one-off data. Confirm with the user, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The fact to remember, one concise sentence." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["fact"],
    },
    run: async (args, tenantId) => {
      const fact = String(args.fact || "").slice(0, 500).trim();
      if (!fact) return { error: "El hecho está vacío." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Recordar este hecho del negocio: "${fact}". Pide confirmación.` };
      }
      const { error } = await svcAny()
        .from("tenant_facts")
        .insert({ tenant_id: tenantId, fact, source: "assistant" });
      if (error) return { error: error.message };
      return { ok: true, message: "Hecho guardado en la memoria del negocio." };
    },
  },

  list_tasks: {
    permission: { feature: "tasks", level: "read" },
    description:
      "List the team's tasks (open by default). Use for 'what tasks are open', 'my to-dos', 'pending work'. Returns title, status, priority, due date.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "done"], description: "Default open." },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    run: async (args, tenantId) => {
      const status = args.status === "done" ? "done" : "open";
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const { data } = await svcAny()
        .from("tasks")
        .select("id, title, status, priority, due_at, assignee_user_id")
        .eq("tenant_id", tenantId)
        .eq("status", status)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(limit);
      return { status, count: (data ?? []).length, tasks: data ?? [] };
    },
  },

  create_task: {
    permission: { feature: "tasks", level: "edit" },
    mutates: true,
    description:
      "Create a task / to-do for the business, optionally with a priority and due date. Use for 'remind me to…', 'create a task to call X tomorrow', 'add a follow-up'. Confirm with the user, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What needs doing (one line)." },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD (optional)." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["title"],
    },
    run: async (args, tenantId) => {
      const title = String(args.title || "").trim().slice(0, 300);
      if (!title) return { error: "El título está vacío." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Crear la tarea: "${title}". Pide confirmación.` };
      }
      const priority = ["low", "medium", "high"].includes(String(args.priority))
        ? String(args.priority)
        : "medium";
      const due =
        typeof args.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date)
          ? new Date(`${args.due_date}T12:00:00Z`).toISOString()
          : null;
      const { error } = await svcAny()
        .from("tasks")
        .insert({ tenant_id: tenantId, title, priority, due_at: due });
      if (error) return { error: error.message };
      return { ok: true, message: "Tarea creada." };
    },
  },

  complete_task: {
    permission: { feature: "tasks", level: "edit" },
    mutates: true,
    description:
      "Mark a task as done. First identify the task (list_tasks for its id), confirm with the user, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task UUID." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["task_id"],
    },
    run: async (args, tenantId) => {
      const id = String(args.task_id || "");
      const { data: own } = await svcAny()
        .from("tasks")
        .select("id, title, status")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = own as { title: string | null; status: string | null } | null;
      if (!row) return { error: "Tarea no encontrada para este negocio." };
      if (row.status === "done") return { error: "Esa tarea ya está hecha." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Marcar como hecha la tarea "${row.title ?? ""}". Pide confirmación.` };
      }
      const { error } = await svcAny()
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) return { error: error.message };
      return { ok: true, message: "Tarea completada." };
    },
  },

  // ── BOLIV configuration tools (Stage 2: configure via conversation) ───────
  // Admin-level config (settings:edit) — write to the same DB state the
  // settings UIs do; the agents' n8n ticks read these flags. Confirm-gated.

  set_voice_greeting: {
    permission: { feature: "settings", level: "edit" },
    mutates: true,
    description:
      "Change the GREETING / opening line the VOICE agents (Sandra outbound, Rebecca inbound) say when a call starts. Use for 'change Sandra's greeting', 'update the opening line'. Confirm with the user, then call with confirm:true.",
    parameters: {
      type: "object",
      properties: {
        greeting: { type: "string", description: "The new opening line the voice agent will say." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["greeting"],
    },
    run: async (args, tenantId) => {
      const greeting = String(args.greeting || "").trim().slice(0, 500);
      if (!greeting) return { error: "El saludo está vacío." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Cambiar el saludo de los agentes de voz a: "${greeting}". Pide confirmación.` };
      }
      const { error } = await svcAny().from("tenants").update({ voice_greeting: greeting }).eq("id", tenantId);
      if (error) return { error: error.message };
      return { ok: true, message: "Saludo de voz actualizado." };
    },
  },

  set_agent_enabled: {
    permission: { feature: "settings", level: "edit" },
    mutates: true,
    description:
      "PAUSE or RESUME an agent. agent: 'voice' (Sandra + Rebecca), 'aima' (lead prospecting), 'ccavai' (content), 'vira' (video shorts). enabled=false pauses it, true resumes it. Use for 'pause Sandra', 'stop the content agent', 'turn lead hunting back on'. Confirm, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", enum: ["voice", "aima", "ccavai", "vira"] },
        enabled: { type: "boolean", description: "false = pause, true = resume." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["agent", "enabled"],
    },
    run: async (args, tenantId) => {
      const agent = String(args.agent);
      const enabled = args.enabled === true;
      const MAP: Record<string, { table: string; col: string }> = {
        voice: { table: "tenants", col: "voice_enabled" },
        aima: { table: "aima_settings", col: "scraper_enabled" },
        ccavai: { table: "ccavai_settings", col: "enabled" },
        vira: { table: "vira_settings", col: "enabled" },
      };
      const m = MAP[agent];
      if (!m) return { error: "Agente desconocido (voice | aima | ccavai | vira)." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `${enabled ? "Reanudar" : "Pausar"} el agente "${agent}". Pide confirmación.` };
      }
      if (m.table === "tenants") {
        const { error } = await svcAny().from("tenants").update({ [m.col]: enabled }).eq("id", tenantId);
        if (error) return { error: error.message };
      } else {
        const { error } = await svcAny()
          .from(m.table)
          .upsert({ tenant_id: tenantId, [m.col]: enabled, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
        if (error) return { error: error.message };
      }
      return { ok: true, message: `Agente ${agent} ${enabled ? "reanudado" : "pausado"}.` };
    },
  },

  set_lead_campaign_filters: {
    permission: { feature: "settings", level: "edit" },
    mutates: true,
    description:
      "Set what AIMA's lead-prospecting campaign targets: the VERTICALS (business types, e.g. 'dental clinic') and/or GEOGRAPHIES (cities/regions, e.g. 'Cochabamba'). Each list REPLACES the current one. Use for 'have AIMA target dental clinics in Cochabamba', 'change the lead campaign filters'. Confirm, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        verticals: { type: "array", items: { type: "string" }, description: "Business types to target (replaces the list)." },
        geographies: { type: "array", items: { type: "string" }, description: "Cities/regions to target (replaces the list)." },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
    },
    run: async (args, tenantId) => {
      const verticals = Array.isArray(args.verticals)
        ? args.verticals.map(String).map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20)
        : undefined;
      const geographies = Array.isArray(args.geographies)
        ? args.geographies.map(String).map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 120)
        : undefined;
      if (!verticals && !geographies) return { error: "Indica verticales y/o geografías a targetear." };
      const parts: string[] = [];
      if (verticals) parts.push(`verticales: ${verticals.join(", ") || "(ninguna)"}`);
      if (geographies) parts.push(`zonas: ${geographies.join(", ") || "(ninguna)"}`);
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Actualizar el campaign de leads (AIMA) — ${parts.join(" · ")}. Pide confirmación.` };
      }
      const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
      if (verticals) patch.target_verticals = verticals;
      if (geographies) patch.target_geographies = geographies;
      const { error } = await svcAny().from("aima_settings").upsert(patch, { onConflict: "tenant_id" });
      if (error) return { error: error.message };
      return { ok: true, message: "Filtros del campaign de leads actualizados." };
    },
  },

  // ── BOLIV autonomous campaigns (Stage 3: plan → approve → execute) ────────
  get_campaigns: {
    permission: { feature: "marketing", level: "read" },
    description:
      "List autonomous CAMPAIGNS and their status (draft/approved/running/paused/done/cancelled) with budget spend. Use for 'what campaigns are running', 'how's the Cochabamba campaign'.",
    parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 25 } } },
    run: async (args, tenantId) => {
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
      const { data } = await svcAny()
        .from("campaigns")
        .select("id, title, status, budget_credits, spent_credits, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { count: (data ?? []).length, campaigns: data ?? [] };
    },
  },

  propose_campaign: {
    permission: { feature: "marketing", level: "edit" },
    mutates: true,
    description:
      "Plan and launch a multi-step autonomous CAMPAIGN. Decompose the goal into ordered steps, each a kind: 'aima_scrape' (find leads — params {verticals:[], geographies:[], max?}), 'sandra_calls' (queue Sandra to call the new leads — params {lead_status?:'new', source?:'aima', limit?, priority?}), 'report' (summarize results — params {about?}), or 'wait'. Set scheduled_at (ISO-8601 datetime) per step to time it ('Tuesday morning' → that date 09:00 in the business timezone); omit for ASAP. Optionally budget_credits caps how many leads Sandra will call. CONFIRMING ACTIVATES the campaign — it then runs automatically. Example: 'find dental clinics in Cochabamba, have Sandra call them Tuesday morning, report Wednesday'. Confirm with the user, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short campaign name." },
        goal: { type: "string", description: "The plain-language goal." },
        budget_credits: { type: "integer", description: "Optional cap on leads Sandra will call." },
        steps: {
          type: "array",
          description: "Ordered steps to execute.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["aima_scrape", "sandra_calls", "report", "wait"] },
              params: { type: "object", description: "Step parameters (see the tool description)." },
              scheduled_at: { type: "string", description: "ISO-8601 datetime; omit for ASAP." },
            },
            required: ["kind"],
          },
        },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed the plan." },
      },
      required: ["title", "steps"],
    },
    run: async (args, tenantId) => {
      const title = String(args.title || "").trim().slice(0, 200);
      const KINDS = ["aima_scrape", "sandra_calls", "report", "wait"];
      const raw = Array.isArray(args.steps) ? (args.steps as Array<Record<string, unknown>>) : [];
      const steps = raw.filter((s) => s && KINDS.includes(String(s.kind))).slice(0, 25);
      if (!title) return { error: "Falta el título de la campaña." };
      if (steps.length === 0) return { error: "La campaña no tiene pasos válidos." };

      const arr = (v: unknown): string[] =>
        Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
      const label = (s: Record<string, unknown>): string => {
        const k = String(s.kind);
        const pp = (s.params && typeof s.params === "object" ? s.params : {}) as Record<string, unknown>;
        const when = typeof s.scheduled_at === "string" && s.scheduled_at ? ` (${s.scheduled_at})` : "";
        if (k === "aima_scrape") {
          const v = arr(pp.verticals);
          const g = arr(pp.geographies);
          return `Buscar leads${v.length ? ` [${v.join(", ")}]` : ""}${g.length ? ` en ${g.join(", ")}` : ""}${when}`;
        }
        if (k === "sandra_calls") return `Sandra llama a los leads${when}`;
        if (k === "report") return `Reporte de resultados${when}`;
        return `Esperar${when}`;
      };

      if (args.confirm !== true) {
        const planText = steps.map((s, i) => `${i + 1}) ${label(s)}`).join("; ");
        const budget = typeof args.budget_credits === "number" ? ` · Tope: ${args.budget_credits} leads` : "";
        return {
          requires_confirmation: true,
          summary: `Campaña "${title}": ${planText}${budget}. Confirmar la ACTIVA y se ejecuta automáticamente.`,
        };
      }

      const svc = svcAny();
      const { data: camp, error } = await svc
        .from("campaigns")
        .insert({
          tenant_id: tenantId,
          title,
          goal: typeof args.goal === "string" ? args.goal.slice(0, 2000) : null,
          budget_credits: typeof args.budget_credits === "number" ? Math.max(0, Math.round(args.budget_credits)) : null,
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      const cid = (camp as { id: string }).id;

      const rows = steps.map((s, i) => ({
        campaign_id: cid,
        tenant_id: tenantId,
        seq: i + 1,
        kind: String(s.kind),
        params: s.params && typeof s.params === "object" ? s.params : {},
        scheduled_at: typeof s.scheduled_at === "string" && s.scheduled_at ? s.scheduled_at : null,
        status: "pending",
      }));
      const { error: sErr } = await svc.from("campaign_steps").insert(rows);
      if (sErr) {
        await svc.from("campaigns").delete().eq("id", cid);
        return { error: sErr.message };
      }
      return {
        ok: true,
        message: `Campaña "${title}" activada con ${rows.length} pasos. Se ejecutará automáticamente.`,
        campaign_id: cid,
      };
    },
  },

  // ── BOLIV team management (grant/revoke permissions, roles, invite/remove) ─
  list_team: {
    permission: { feature: "team", level: "read" },
    description:
      "List the team members of this business with email, role tier, and assigned custom role. Returns each member's user_id — REQUIRED by the team write-tools to identify WHO to grant/revoke/change/remove. Also lists pending invitations.",
    parameters: { type: "object", properties: {} },
    run: async (_args, tenantId) => {
      const [team, roleIds, roles] = await Promise.all([
        loadTeam(tenantId),
        getMemberRoleIds(tenantId),
        listRoles(tenantId),
      ]);
      const nameById = new Map(roles.map((r) => [r.id, r.name]));
      return {
        members: team.members.map((m) => ({
          user_id: m.user_id,
          email: m.email,
          role: m.role,
          custom_role: roleIds[m.user_id] ? (nameById.get(roleIds[m.user_id]!) ?? null) : null,
          is_self: m.is_self,
        })),
        invitations: team.invitations.map((i) => ({ email: i.email, role: i.role })),
      };
    },
  },

  set_member_role: {
    permission: { feature: "team", level: "edit" },
    mutates: true,
    description:
      "Set a team member's built-in ROLE tier: owner | admin | operator | viewer | member. This CLEARS any custom per-feature permissions they had (the tier takes over). Get user_id from list_team. Confirm with the user, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        role: { type: "string", enum: ["owner", "admin", "operator", "viewer", "member"] },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["user_id", "role"],
    },
    run: async (args, tenantId) => {
      const userId = String(args.user_id || "");
      const role = String(args.role || "");
      if (!["owner", "admin", "operator", "viewer", "member"].includes(role)) return { error: "Rol inválido." };
      const { data: cur } = await svcAny()
        .from("dashboard_users")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      const curRow = cur as { role?: string } | null;
      if (!curRow) return { error: "Miembro no encontrado." };
      if (curRow.role === "owner" && role !== "owner" && (await ownerCount(tenantId)) <= 1) {
        return { error: "No puedes quitar al último propietario del negocio." };
      }
      const email = await memberEmail(userId);
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Cambiar el rol de ${email ?? "el miembro"} a "${role}". Pide confirmación.` };
      }
      const { error } = await svcAny()
        .from("dashboard_users")
        .update({ role, role_id: null })
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      if (error) return { error: error.message };
      return { ok: true, message: `Rol actualizado a ${role}.` };
    },
  },

  grant_member_permission: {
    permission: { feature: "team", level: "edit" },
    mutates: true,
    description:
      "GRANT a team member access to a FEATURE at a LEVEL (read | edit | admin). Features: leads, deals, customers, conversations, tickets, tasks, calendar, invoices, knowledge, marketing, content, shorts, reports, analytics, billing, team, settings. Creates/updates a personal custom role seeded from their current access. Get user_id from list_team. Confirm, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        feature: { type: "string", enum: [...FEATURES] },
        level: { type: "string", enum: ["read", "edit", "admin"] },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["user_id", "feature", "level"],
    },
    run: async (args, tenantId) => {
      const userId = String(args.user_id || "");
      const feature = String(args.feature || "");
      const level = String(args.level || "");
      if (!(FEATURES as readonly string[]).includes(feature)) return { error: "Función inválida." };
      if (!["read", "edit", "admin"].includes(level)) return { error: "Nivel inválido." };
      const member = await resolveMemberPermissions(tenantId, userId);
      if (member.role === null) return { error: "Miembro no encontrado." };
      const email = await memberEmail(userId);
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Otorgar a ${email ?? "el miembro"} el permiso "${feature}: ${level}". Pide confirmación.` };
      }
      const nextPerms: PermissionSet = { ...member.perms };
      (nextPerms as Record<string, string>)[feature] = level;
      const res = await applyMemberPermission(tenantId, userId, nextPerms, member.roleId);
      if (!res.ok) return { error: res.error };
      return { ok: true, message: `Permiso otorgado: ${feature} ${level}.` };
    },
  },

  revoke_member_permission: {
    permission: { feature: "team", level: "edit" },
    mutates: true,
    description:
      "REVOKE a team member's access to a FEATURE (set it to none). Creates/updates their personal custom role. Get user_id from list_team. Confirm, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        feature: { type: "string", enum: [...FEATURES] },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["user_id", "feature"],
    },
    run: async (args, tenantId) => {
      const userId = String(args.user_id || "");
      const feature = String(args.feature || "");
      if (!(FEATURES as readonly string[]).includes(feature)) return { error: "Función inválida." };
      const member = await resolveMemberPermissions(tenantId, userId);
      if (member.role === null) return { error: "Miembro no encontrado." };
      const email = await memberEmail(userId);
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Revocar a ${email ?? "el miembro"} el acceso a "${feature}". Pide confirmación.` };
      }
      const nextPerms: PermissionSet = { ...member.perms };
      delete nextPerms[feature as keyof PermissionSet];
      const res = await applyMemberPermission(tenantId, userId, nextPerms, member.roleId);
      if (!res.ok) return { error: res.error };
      return { ok: true, message: `Acceso revocado: ${feature}.` };
    },
  },

  invite_member: {
    permission: { feature: "team", level: "edit" },
    mutates: true,
    description:
      "Invite a new member by email with a role (owner|admin|operator|viewer|member). Creates an invitation link to share. Confirm with the user, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string" },
        role: { type: "string", enum: ["owner", "admin", "operator", "viewer", "member"] },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["email", "role"],
    },
    run: async (args, tenantId) => {
      const email = String(args.email || "").trim().toLowerCase();
      const role = String(args.role || "member");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Email inválido." };
      if (!["owner", "admin", "operator", "viewer", "member"].includes(role)) return { error: "Rol inválido." };
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Invitar a ${email} como ${role}. Pide confirmación.` };
      }
      const me = await getUser();
      const { data, error } = await svcAny()
        .from("invitations")
        .insert({ tenant_id: tenantId, email, role, invited_by: me?.id ?? null })
        .select("token")
        .single();
      if (error) return { error: error.message };
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const url = `${base}/invitations/${(data as { token: string }).token}`;
      return { ok: true, message: `Invitación creada para ${email} (${role}). Enlace: ${url}` };
    },
  },

  remove_member: {
    permission: { feature: "team", level: "edit" },
    mutates: true,
    description:
      "Remove a team member from this business. Cannot remove yourself or the last owner. Get user_id from list_team. Confirm, then confirm:true.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string" },
        confirm: { type: "boolean", description: "Set true ONLY after the user confirmed." },
      },
      required: ["user_id"],
    },
    run: async (args, tenantId) => {
      const userId = String(args.user_id || "");
      const { data: cur } = await svcAny()
        .from("dashboard_users")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      const curRow = cur as { role?: string } | null;
      if (!curRow) return { error: "Miembro no encontrado." };
      const me = await getUser();
      if (me && me.id === userId) return { error: "No puedes quitarte a ti mismo." };
      if (curRow.role === "owner" && (await ownerCount(tenantId)) <= 1) {
        return { error: "No puedes quitar al último propietario del negocio." };
      }
      const email = await memberEmail(userId);
      if (args.confirm !== true) {
        return { requires_confirmation: true, summary: `Quitar a ${email ?? "el miembro"} del negocio. Pide confirmación.` };
      }
      const { error } = await svcAny()
        .from("dashboard_users")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      if (error) return { error: error.message };
      return { ok: true, message: "Miembro removido." };
    },
  },
};

/**
 * Tools that mutate data — gated behind the UI confirm card (zero-trust).
 * Derived from each tool's `mutates` flag so this stays in sync automatically
 * as tools are added (single source of truth).
 */
export const WRITE_TOOL_NAMES = new Set<string>(
  Object.entries(TOOLS)
    .filter(([, t]) => t.mutates)
    .map(([name]) => name),
);

/**
 * OpenAI-compatible function-calling specs. When `role` is provided, only the
 * tools that role is permitted to use are offered — the model is never even
 * shown a capability the acting user couldn't perform by hand. Omit `role` to
 * get the full set (e.g. for documentation/introspection).
 */
export function toolSpecs(role?: Role | null) {
  return Object.entries(TOOLS)
    .filter(([, t]) => role === undefined || roleSatisfies(role, t.permission.feature, t.permission.level))
    .map(([name, t]) => ({
      type: "function" as const,
      function: { name, description: t.description, parameters: t.parameters },
    }));
}

/**
 * Dispatch one tool call. tenantId comes from the session, never the model.
 * Enforces the tool's required permission against the caller's role HERE — the
 * single choke point both the assistant loop and the UI confirm path go
 * through, so a model can never run a capability the user lacks. Pass `role`
 * to avoid re-resolving it per call; omit it and dispatchTool resolves it from
 * the session.
 */
export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  tenantId: string,
  role?: Role | null,
): Promise<unknown> {
  const tool = TOOLS[name];
  if (!tool) return { error: `unknown tool: ${name}` };
  const effectiveRole = role !== undefined ? role : await getRoleOnTenant(tenantId);
  if (!roleSatisfies(effectiveRole, tool.permission.feature, tool.permission.level)) {
    return {
      error: `No tienes permiso para esta acción (requiere ${tool.permission.feature}: ${tool.permission.level}).`,
    };
  }
  try {
    return await tool.run(args, tenantId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "tool failed" };
  }
}
