import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, Globe, Tag, Calendar, ExternalLink } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getLeadById, getLeadCallHistory } from "@/lib/queries/leads";
import { getCountryFromPhone, getStateFromMetadata, COUNTRY_BY_CODE } from "@/lib/leads-geo";
import { intentLabel, intentBadgeClass } from "@/lib/leads-intents";
import { LeadNotesEditor } from "@/components/leads/lead-notes-editor";
import { CallSandraButton } from "@/components/leads/call-sandra-button";
import { LeadStatusSelect } from "@/components/leads/lead-status-select";
import { RecordingPlayer } from "@/components/voice/recording-player";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  aima: "AIMA",
  whatsapp: "WhatsApp",
  manual: "Manual",
  voice: "Voice",
  webform: "Web form",
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  const [lead, callHistory, t, locale] = await Promise.all([
    getLeadById(tenant.id, id),
    getLeadCallHistory(tenant.id, id, 10),
    getTranslations("leads"),
    getLocale(),
  ]);

  if (!lead) notFound();

  const country = getCountryFromPhone(lead.whatsapp_number);
  const state = getStateFromMetadata(lead.metadata);
  const meta = lead.metadata ?? {};
  const city = typeof meta.city === "string" ? meta.city : null;
  const vertical = typeof meta.vertical === "string" ? meta.vertical : null;
  const website = typeof meta.website === "string" ? meta.website : null;
  const sourceLabel = SOURCE_LABEL[lead.source ?? ""] ?? lead.source ?? "—";

  function fmtDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/dashboard/${tenantSlug}/leads`}>
          <ArrowLeft className="size-4" />
          {(() => {
            try { return t("back_to_leads"); } catch { return "Volver a leads"; }
          })()}
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            {country ? <span title={country.name}>{country.flag}</span> : null}
            {lead.name ?? "—"}
          </h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            {lead.whatsapp_number ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />+{lead.whatsapp_number}
              </span>
            ) : null}
            {lead.email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />{lead.email}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(lead.created_at).toLocaleDateString(locale, {
                timeZone: tenant.timezone,
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LeadStatusSelect
            tenantId={tenant.id}
            leadId={lead.id}
            currentStatus={lead.status}
          />
          {lead.whatsapp_number && lead.status !== "do_not_contact" ? (
            <CallSandraButton
              tenantId={tenant.id}
              leadId={lead.id}
              phone={`+${lead.whatsapp_number}`}
              leadName={lead.name}
              leadCompany={vertical}
              notes={lead.notes}
              size="default"
              variant="default"
            />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Notes (main content) */}
        <Card className="p-5">
          <div className="mb-3">
            <p className="font-semibold">
              {(() => {
                try { return t("notes_title"); } catch { return "Notas internas"; }
              })()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(() => {
                try { return t("notes_subtitle"); } catch { return "Solo vos las ves. Útil para recordar contexto en la próxima llamada."; }
              })()}
            </p>
          </div>
          <LeadNotesEditor
            tenantId={tenant.id}
            leadId={lead.id}
            initialNotes={lead.notes}
          />
        </Card>

        {/* Sidebar — facts */}
        <Card className="p-5 space-y-3 h-fit">
          <p className="font-semibold mb-1">
            {(() => {
              try { return t("detail_facts_title"); } catch { return "Información"; }
            })()}
          </p>

          {lead.intent ? (
            <Fact icon={Tag} label={(() => { try { return t("filter_intent"); } catch { return "Intent"; } })()}>
              <Badge variant="outline" className={intentBadgeClass(lead.intent)}>
                {intentLabel(lead.intent)}
              </Badge>
            </Fact>
          ) : null}

          {country ? (
            <Fact icon={Globe} label={(() => { try { return t("filter_country"); } catch { return "Country"; } })()}>
              <span>{country.flag} {COUNTRY_BY_CODE[country.code]?.name}</span>
            </Fact>
          ) : null}
          {state ? (
            <Fact label={(() => { try { return t("filter_state"); } catch { return "State"; } })()}>
              {state}
            </Fact>
          ) : null}
          {city ? (
            <Fact label={(() => { try { return t("filter_city"); } catch { return "City"; } })()}>
              {city}
            </Fact>
          ) : null}
          {vertical ? (
            <Fact label={(() => { try { return t("filter_vertical"); } catch { return "Vertical"; } })()}>
              {vertical.replace(/_/g, " ")}
            </Fact>
          ) : null}
          {website ? (
            <Fact label={(() => { try { return t("website"); } catch { return "Website"; } })()}>
              <a href={website} target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-1">
                {website.replace(/^https?:\/\//, "").slice(0, 30)}
                <ExternalLink className="size-3" />
              </a>
            </Fact>
          ) : null}
          <Fact label={(() => { try { return t("filter_source"); } catch { return "Source"; } })()}>
            {sourceLabel}
          </Fact>
        </Card>
      </div>

      {/* Call history */}
      <Card className="mt-6 p-5">
        <p className="font-semibold mb-3">
          {(() => {
            try { return t("call_history_title"); } catch { return "Historial de llamadas"; }
          })()}
        </p>
        {callHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {(() => {
              try { return t("call_history_empty"); } catch { return "Aún no se hicieron llamadas registradas con este lead."; }
            })()}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {callHistory.map((c) => (
              <li key={c.conversation_id} className="py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{c.title}</span>
                    {c.direction ? (
                      <Badge variant="outline" className="text-[10px]">
                        {c.direction}
                      </Badge>
                    ) : null}
                    {c.call_successful ? (
                      <Badge
                        variant="outline"
                        className={
                          c.call_successful === "success"
                            ? "text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : "text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30"
                        }
                      >
                        {c.call_successful}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(c.started_at).toLocaleString(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: tenant.timezone,
                    })}{" "}
                    · {fmtDuration(c.duration_secs)}
                  </p>
                </div>
                {c.conversation_id ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <RecordingPlayer
                      conversationId={c.conversation_id}
                      durationSeconds={c.duration_secs}
                    />
                    <a
                      href={`https://elevenlabs.io/app/conversational-ai/history/${c.conversation_id}`}
                      target="_blank"
                      rel="noopener"
                      title="ElevenLabs"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: typeof Phone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
