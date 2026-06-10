import { createClient } from "@/lib/supabase/server";

export type AimaSettings = {
  tenant_id: string;
  scraper_enabled: boolean;
  scraper_sources: string[];
  scraper_concurrency: number;
  scraper_max_per_run: number;
  scraper_proxy_url: string | null;
  scraper_proxy_token: string | null;
  google_maps_api_key: string | null;
  apollo_enabled: boolean;
  apollo_api_key: string | null;
  apollo_search_params: Record<string, unknown>;
  cold_email_enabled: boolean;
  instantly_api_key: string | null;
  instantly_campaign_id: string | null;
  cold_email_daily_cap: number;
  target_verticals: string[];
  target_geographies: string[];
  updated_at: string;
};

export type AimaScrapeRun = {
  id: string;
  tenant_id: string;
  started_at: string;
  finished_at: string | null;
  source: string;
  status: "running" | "success" | "failed" | "aborted";
  leads_found: number;
  leads_new: number;
  error: string | null;
};

export type AimaStats = {
  leads_sourced: number;
  emails_sent: number;
  emails_opened: number;
  emails_replied: number;
  in_sandra_queue: number;
  demos_booked: number;
  scraper_enabled: boolean;
  cold_email_enabled: boolean;
  last_scrape_at: string | null;
  window_start: string;
};

export async function getAimaSettings(tenantId: string): Promise<AimaSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aima_settings")
    .select(
      "tenant_id, scraper_enabled, scraper_sources, scraper_concurrency, scraper_max_per_run, scraper_proxy_url, scraper_proxy_token, google_maps_api_key, apollo_enabled, apollo_api_key, apollo_search_params, cold_email_enabled, instantly_api_key, instantly_campaign_id, cold_email_daily_cap, target_verticals, target_geographies, updated_at",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  // Normalise jsonb columns into the AimaSettings shape.
  const row = data as unknown as Omit<AimaSettings, "scraper_sources"> & {
    scraper_sources: unknown;
    apollo_search_params: unknown;
  };
  const scraperSources = Array.isArray(row.scraper_sources)
    ? (row.scraper_sources as string[])
    : [];
  const apolloParams =
    row.apollo_search_params && typeof row.apollo_search_params === "object"
      ? (row.apollo_search_params as Record<string, unknown>)
      : {};
  return {
    ...row,
    scraper_sources: scraperSources,
    apollo_search_params: apolloParams,
  };
}

export async function listAimaScrapeRuns(
  tenantId: string,
  limit = 20,
): Promise<AimaScrapeRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("aima_scrape_runs")
    .select("id, tenant_id, started_at, finished_at, source, status, leads_found, leads_new, error")
    .eq("tenant_id", tenantId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AimaScrapeRun[];
}

export async function getAimaStats(
  window: "today" | "week" | "month" | "7d" | "30d" = "7d",
): Promise<AimaStats | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("aima_stats", { p_window: window });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as AimaStats | null;
}
