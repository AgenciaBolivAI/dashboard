import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { PhoneIncoming, PhoneOutgoing, Phone, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess, isBolivAIAdmin } from "@/lib/auth";
import { listVoiceConversations } from "@/lib/queries/voice-conversations";
import { RecordingPlayer } from "@/components/voice/recording-player";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { Pagination } from "@/components/ui/pagination";
import { clampPageSize } from "@/lib/pagination";

export const dynamic = "force-dynamic";

// Voice calls come from brain.episodes (JSONB metadata + post-fetch lead-name
// resolution), so we page over a bounded working set rather than a SQL range.
// 500 is a generous window for a read-only call log; beyond it, refine by search.
const CALLS_WINDOW = 500;

const OUTCOME_CLASS: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  failure: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default async function CallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const { tenantSlug } = await params;
  const { q, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);
  const t = await getTranslations("sandra");
  const locale = await getLocale();
  // The provider history link is internal — staff only (tenants play recordings
  // in-dashboard and never need the voice vendor's console).
  const isStaff = await isBolivAIAdmin();

  const pageSize = clampPageSize(Number(pageSizeParam), 50);
  const page = Math.max(1, Number(pageParam) || 1);

  // Fetch the working window, filter server-side in JS (name + phone), then
  // page over the filtered set so total/range stay accurate to what's shown.
  const all = await listVoiceConversations(tenant.id, CALLS_WINDOW);
  const needle = q?.trim().toLowerCase() ?? "";
  const digits = needle.replace(/\D/g, "");
  const filtered = needle
    ? all.filter((c) => {
        const name = (c.lead_name ?? "").toLowerCase();
        const phone = `${c.caller_phone ?? ""}${c.lead_phone ?? ""}`;
        return (
          name.includes(needle) ||
          (digits.length >= 3 && phone.replace(/\D/g, "").includes(digits))
        );
      })
    : all;
  const total = filtered.length;
  const calls = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
          <Phone className="size-7 text-primary" />
          {t("calls_page_title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {t("calls_page_subtitle")}
        </p>
      </div>

      <div className="mb-4">
        <RealtimeSearch placeholder={t("calls_search_placeholder")} />
      </div>

      {calls.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <Phone className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{q ? t("calls_no_results") : t("calls_empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("calls_empty_description")}
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 w-28">{t("calls_col_direction")}</th>
                  <th className="text-left px-4 py-3">{t("calls_col_customer_lead")}</th>
                  <th className="text-left px-4 py-3">{t("calls_col_when")}</th>
                  <th className="text-left px-4 py-3 w-32">{t("calls_col_outcome")}</th>
                  <th className="text-left px-4 py-3 w-44">{t("calls_col_recording")}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      {c.direction === "inbound" ? (
                        <span className="inline-flex items-center gap-1 text-cyan-600">
                          <PhoneIncoming className="size-3.5" />
                          {t("calls_direction_inbound")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600">
                          <PhoneOutgoing className="size-3.5" />
                          {t("calls_direction_outbound")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.lead_id && c.lead_name ? (
                        <Link
                          href={`/dashboard/${tenantSlug}/leads/${c.lead_id}`}
                          className="hover:text-primary hover:underline font-medium"
                        >
                          {c.lead_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{c.lead_name ?? "—"}</span>
                      )}
                      <div className="text-xs text-muted-foreground font-mono">
                        {c.lead_phone ? `+${c.lead_phone}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.started_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: tenant.timezone,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {c.call_outcome ? (
                        <Badge
                          variant="outline"
                          className={OUTCOME_CLASS[c.call_outcome] ?? OUTCOME_CLASS.unknown}
                        >
                          {c.call_outcome}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RecordingPlayer
                          conversationId={c.conversation_id}
                          durationSeconds={c.duration_seconds}
                        />
                        {isStaff ? (
                          <a
                            href={`https://elevenlabs.io/app/conversational-ai/history/${c.conversation_id}`}
                            target="_blank"
                            rel="noopener"
                            title={t("open_in_elevenlabs")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {total > 0 ? <Pagination total={total} defaultPageSize={50} className="mt-4" /> : null}
    </div>
  );
}
